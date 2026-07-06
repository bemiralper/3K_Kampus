"""
Taksit Service
Taksit planı oluşturma, güncelleme, yeniden hesaplama

Integer-Only: Tüm parasal hesaplamalar tam sayı aritmetiğiyle yapılır.
Decimal KULLANILMAZ.
"""
from dateutil.relativedelta import relativedelta

from apps.odeme_takip.domain.models import Taksit, SozlesmeGecmisi
from apps.odeme_takip.domain.enums import TaksitDurum, TaksitPeriyodu, GecmisIslemTuru
from apps.odeme_takip.infrastructure.repositories.taksit_repository import TaksitRepository


class TaksitService:

    def __init__(self):
        self.repo = TaksitRepository()

    # ─── SORGULAR ────────────────────────
    def get_vadesi_gecenler(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        """Vadesi geçmiş taksitler — repository / overdue.py."""
        return self.repo.get_vadesi_gecenler(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
        )

    def get_vadesi_gelecekler(self, kurum_id=None, sube_id=None, egitim_yili_id=None, baslangic=None, bitis=None, arama=''):
        """Vadesi gelecek (yaklaşan) taksitler — Bugün/Yarın/Bu Hafta/Bu Ay."""
        return self.repo.get_vadesi_gelecekler(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            baslangic=baslangic,
            bitis=bitis,
            arama=arama,
        )

    def get_by_sozlesme(self, sozlesme_id):
        """Sözleşmeye ait tüm taksitleri getir"""
        return Taksit.objects.filter(
            sozlesme_id=sozlesme_id
        ).order_by('taksit_no')

    # ─── TAKSİT PLANI OLUŞTUR ────────────
    def create_plan(self, sozlesme, taksit_sayisi, ilk_odeme_tarihi, periyot='aylik', pesinat=0):
        """
        Taksit planı oluştur — Integer-Only.
        pesinat: İlk taksit olarak peşin alınacak tutar (TL).
        """
        # String tarihi date objesine çevir
        if isinstance(ilk_odeme_tarihi, str):
            from datetime import date as _date
            ilk_odeme_tarihi = _date.fromisoformat(ilk_odeme_tarihi)

        net = sozlesme.net_tutar
        pesinat = int(pesinat)

        # Eğer peşinat varsa ilk taksit olarak ekle
        taksit_no = 1
        if pesinat > 0:
            Taksit.objects.create(
                sozlesme=sozlesme,
                taksit_no=taksit_no,
                vade_tarihi=ilk_odeme_tarihi,
                tutar=pesinat,
                odenen_tutar=0,
                kalan_tutar=pesinat,
                durum=TaksitDurum.BEKLEMEDE,
            )
            taksit_no += 1
            net -= pesinat

        # Kalan tutarı eşit taksitlere böl (1000'e yuvarlama — frontend önizleme ile uyumlu)
        if taksit_sayisi <= 0:
            taksit_sayisi = 1
        # Taksit tutarını 1000'in katına yuvarla (aşağı); son taksit kalan farkı alır
        taksit_tutar = (net // taksit_sayisi // 1000) * 1000
        son_taksit_tutar = net - taksit_tutar * (taksit_sayisi - 1)

        for i in range(taksit_sayisi):
            tutar = son_taksit_tutar if i == taksit_sayisi - 1 else taksit_tutar

            vade = self._hesapla_vade(ilk_odeme_tarihi, i, periyot, has_pesinat=(pesinat > 0))

            Taksit.objects.create(
                sozlesme=sozlesme,
                taksit_no=taksit_no + i,
                vade_tarihi=vade,
                tutar=tutar,
                odenen_tutar=0,
                kalan_tutar=tutar,
                durum=TaksitDurum.BEKLEMEDE,
            )

    # ─── MANUEL TAKSİT PLANI ─────────────
    def create_manual_plan(self, sozlesme, taksitler):
        """
        Kullanıcının manuel belirlediği taksit planı.
        taksitler: [{'tutar': 1000, 'vade_tarihi': '2025-02-01'}, ...]
        """
        # Mevcut taksitleri temizle
        Taksit.objects.filter(sozlesme=sozlesme).delete()

        toplam = 0
        for i, t in enumerate(taksitler, 1):
            tutar = int(t['tutar'])
            toplam += tutar
            Taksit.objects.create(
                sozlesme=sozlesme,
                taksit_no=i,
                vade_tarihi=t['vade_tarihi'],
                tutar=tutar,
                odenen_tutar=0,
                kalan_tutar=tutar,
                durum=TaksitDurum.BEKLEMEDE,
                odeme_yontemi_id=t.get('odeme_yontemi_id') or None,
            )

        # Toplam kontrolü (±1 TL tolerans)
        net = sozlesme.net_tutar
        if abs(toplam - net) > 1:
            raise ValueError(
                f'Taksit toplamı ({toplam} TL) sözleşme net tutarıyla ({net} TL) uyuşmuyor'
            )

    # ─── YÜZDE BAZLI TAKSİT PLANI ────────
    def create_percentage_plan(self, sozlesme, yuzde_listesi, tarih_listesi):
        """
        Yüzde bazlı taksit planı.
        yuzde_listesi: [30, 30, 40]  — toplam %100 olmalı
        tarih_listesi: ['2025-02-01', '2025-03-01', '2025-04-01']
        """
        Taksit.objects.filter(sozlesme=sozlesme).delete()

        net = sozlesme.net_tutar
        toplam = 0

        for i, (yuzde, tarih) in enumerate(zip(yuzde_listesi, tarih_listesi), 1):
            if i < len(yuzde_listesi):
                tutar = round(net * yuzde / 100)
            else:
                tutar = net - toplam  # Son taksit: kalanı al
            toplam += tutar

            Taksit.objects.create(
                sozlesme=sozlesme,
                taksit_no=i,
                vade_tarihi=tarih,
                tutar=tutar,
                odenen_tutar=0,
                kalan_tutar=tutar,
                durum=TaksitDurum.BEKLEMEDE,
            )

    # ─── KALAN TUTAR İÇİN YENİ PLAN ─────
    def create_remaining_plan(self, sozlesme, taksit_sayisi, ilk_odeme_tarihi, periyot='aylik'):
        """
        Aktif sözleşmelerde: ödenmemiş kalan tutarı yeni taksitlere böl.
        Mevcut ödenmiş/kısmi taksitler korunur.
        """
        from apps.odeme_takip.domain.enums import TaksitDurum

        # Ödenmemiş taksitleri sil
        Taksit.objects.filter(
            sozlesme=sozlesme,
            durum=TaksitDurum.BEKLEMEDE,
        ).delete()

        # Kalan borcu hesapla
        kalan_borc = sozlesme.net_tutar
        odenmis_toplam = Taksit.objects.filter(
            sozlesme=sozlesme,
            durum__in=[TaksitDurum.ODENDI, TaksitDurum.KISMI_ODENDI],
        ).values_list('tutar', flat=True)

        for t in odenmis_toplam:
            kalan_borc -= int(t)

        if kalan_borc <= 0:
            return

        # Mevcut en yüksek taksit_no
        son_no = Taksit.objects.filter(
            sozlesme=sozlesme
        ).order_by('-taksit_no').values_list('taksit_no', flat=True).first() or 0

        # 1000'e yuvarlama — frontend önizleme ile uyumlu; son taksit kalan farkı alır
        taksit_tutar = (kalan_borc // taksit_sayisi // 1000) * 1000
        son_taksit_tutar = kalan_borc - taksit_tutar * (taksit_sayisi - 1)

        for i in range(taksit_sayisi):
            tutar = son_taksit_tutar if i == taksit_sayisi - 1 else taksit_tutar

            vade = self._hesapla_vade(ilk_odeme_tarihi, i, periyot)

            Taksit.objects.create(
                sozlesme=sozlesme,
                taksit_no=son_no + 1 + i,
                vade_tarihi=vade,
                tutar=tutar,
                odenen_tutar=0,
                kalan_tutar=tutar,
                durum=TaksitDurum.BEKLEMEDE,
            )

    # ─── TAKSİT PLANINI YENİDEN OLUŞTUR ──
    def recreate_plan(self, sozlesme, taksit_sayisi, ilk_odeme_tarihi, periyot='aylik', pesinat=0):
        """Mevcut planı sil, yeniden oluştur (sadece taslak sözleşmeler)"""
        Taksit.objects.filter(sozlesme=sozlesme).delete()
        self.create_plan(sozlesme, taksit_sayisi, ilk_odeme_tarihi, periyot, pesinat)

    # ─── AKILLI YENİDEN OLUŞTURMA ────────
    def smart_recreate(self, sozlesme, yontem='esit', taksit_sayisi=None,
                       ilk_odeme_tarihi=None, periyot='aylik', pesinat=0,
                       manuel_taksitler=None, yuzde_listesi=None,
                       taksit_odeme_yontemleri=None):
        """
        Yönteme göre farklı plan oluşturma stratejileri:
        - 'esit':    Eşit taksit
        - 'manuel':  Manuel tutar/tarih
        - 'yuzde':       Yüzde bazlı
        - 'kalani_bol':  Ödenmiş taksitleri koruyup kalan bakiyeyi böl
        Returns: (taksitler, None) veya (None, {'error': ...})
        """
        try:
            ilk_tarih = ilk_odeme_tarihi or sozlesme.ilk_odeme_tarihi or sozlesme.baslangic_tarihi

            if yontem == 'esit':
                self.recreate_plan(
                    sozlesme=sozlesme,
                    taksit_sayisi=taksit_sayisi or sozlesme.taksit_sayisi,
                    ilk_odeme_tarihi=ilk_tarih,
                    periyot=periyot or sozlesme.taksit_periyodu,
                    pesinat=pesinat,
                )
            elif yontem == 'manuel':
                if not manuel_taksitler:
                    return None, {'error': 'Manuel taksit listesi boş'}
                self.create_manual_plan(sozlesme, manuel_taksitler)
            elif yontem == 'yuzde':
                if not yuzde_listesi:
                    return None, {'error': 'Yüzde listesi boş'}
                # Yüzde bazlı: tarih listesini oluştur
                tarih_listesi = []
                for i in range(len(yuzde_listesi)):
                    vade = self._hesapla_vade(ilk_tarih, i, periyot)
                    tarih_listesi.append(vade)
                self.create_percentage_plan(sozlesme, yuzde_listesi, tarih_listesi)
            elif yontem == 'kalani_bol':
                if not ilk_tarih:
                    return None, {'error': 'İlk vade tarihi zorunludur'}
                self.create_remaining_plan(
                    sozlesme=sozlesme,
                    taksit_sayisi=taksit_sayisi or sozlesme.taksit_sayisi or 1,
                    ilk_odeme_tarihi=ilk_tarih,
                    periyot=periyot or sozlesme.taksit_periyodu,
                )
            else:
                return None, {'error': f'Geçersiz taksit yöntemi: {yontem}'}

            taksitler = list(Taksit.objects.filter(sozlesme=sozlesme).order_by('taksit_no'))
            from apps.odeme_takip.domain.enums import OdemeTuru
            if sozlesme.odeme_turu == OdemeTuru.CEK_SENET:
                self._apply_taksit_odeme_yontemleri(
                    sozlesme, yontem, manuel_taksitler, taksit_odeme_yontemleri,
                )
            else:
                self._apply_contract_odeme_yontemi_to_taksits(sozlesme)
            self._sync_cek_senet_plan(sozlesme)
            return taksitler, None

        except ValueError as e:
            return None, {'error': str(e)}
        except Exception as e:
            return None, {'error': f'Taksit planı oluşturulamadı: {str(e)}'}

    # ─── TEK TAKSİT GÜNCELLE ─────────────
    def update_taksit(self, taksit_id, data, user=None):
        """Tek bir taksitin tutarını veya vadesini güncelle"""
        try:
            taksit = Taksit.objects.get(id=taksit_id)
        except Taksit.DoesNotExist:
            return None, {'error': 'Taksit bulunamadı'}

        if taksit.durum == TaksitDurum.ODENDI:
            return None, {'error': 'Ödenmiş taksit değiştirilemez'}

        if 'tutar' in data:
            yeni_tutar = int(data['tutar'])
            taksit.tutar = yeni_tutar
            taksit.kalan_tutar = yeni_tutar - taksit.odenen_tutar

        if 'vade_tarihi' in data:
            taksit.vade_tarihi = data['vade_tarihi']

        if 'odeme_yontemi_id' in data:
            taksit.odeme_yontemi_id = data['odeme_yontemi_id'] or None

        taksit.save()
        if 'odeme_yontemi_id' in data:
            from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
            CekSenetService().sync_sozlesme_plan(taksit.sozlesme)
        return taksit, None

    # ─── VADE HESAPLAMA ──────────────────
    @staticmethod
    def _month_offset_date(anchor, month_offset: int):
        """Seçilen günü koruyarak ay ekler; ayda yoksa bir gün öncesini alır."""
        from calendar import monthrange
        from datetime import date as date_cls

        if isinstance(anchor, str):
            anchor = date_cls.fromisoformat(anchor)

        anchor_day = anchor.day
        total = (anchor.month - 1) + month_offset
        year = anchor.year + total // 12
        month = total % 12 + 1
        last_day = monthrange(year, month)[1]
        day = anchor_day if anchor_day <= last_day else min(anchor_day - 1, last_day)
        return date_cls(year, month, day)

    def _hesapla_vade(self, baslangic, index, periyot, has_pesinat=False):
        """Periyoda göre vade tarihi hesapla — her ay seçilen gün korunur."""
        if isinstance(baslangic, str):
            from datetime import date as _date
            baslangic = _date.fromisoformat(baslangic)

        offset = index + (1 if has_pesinat else 0)

        if periyot == TaksitPeriyodu.IKI_AYLIK:
            return self._month_offset_date(baslangic, offset * 2)
        if periyot == TaksitPeriyodu.UC_AYLIK:
            return self._month_offset_date(baslangic, offset * 3)
        return self._month_offset_date(baslangic, offset)

    def _apply_contract_odeme_yontemi_to_taksits(self, sozlesme):
        """Peşin/taksitli sözleşmede tüm taksitlere sözleşme ödeme yöntemini uygula."""
        from apps.odeme_takip.domain.enums import OdemeTuru
        if sozlesme.odeme_turu == OdemeTuru.CEK_SENET:
            return
        if sozlesme.odeme_yontemi_id:
            Taksit.objects.filter(sozlesme=sozlesme).update(
                odeme_yontemi_id=sozlesme.odeme_yontemi_id,
            )

    def _apply_taksit_odeme_yontemleri(
        self,
        sozlesme,
        yontem,
        manuel_taksitler,
        taksit_odeme_yontemleri,
    ):
        """Plan sonrası taksit başına ödeme yöntemi ata."""
        if yontem == 'manuel' and manuel_taksitler:
            taksitler = list(Taksit.objects.filter(sozlesme=sozlesme).order_by('taksit_no'))
            for i, row in enumerate(manuel_taksitler):
                if i >= len(taksitler):
                    break
                oy_id = row.get('odeme_yontemi_id')
                if oy_id:
                    taksitler[i].odeme_yontemi_id = oy_id
                    taksitler[i].save(update_fields=['odeme_yontemi_id'])
            return

        if not taksit_odeme_yontemleri:
            return

        for item in taksit_odeme_yontemleri:
            taksit_no = item.get('taksit_no')
            oy_id = item.get('odeme_yontemi_id')
            if not taksit_no or not oy_id:
                continue
            Taksit.objects.filter(sozlesme=sozlesme, taksit_no=taksit_no).update(
                odeme_yontemi_id=oy_id,
            )

    def _sync_cek_senet_plan(self, sozlesme):
        from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
        CekSenetService().sync_sozlesme_plan(sozlesme)
