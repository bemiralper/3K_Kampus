"""
Gider Ödeme Service — İş kuralları katmanı
Ödeme kaydı oluşturma, iptal, BakiyeHareketi entegrasyonu.
Bakiyeden mahsup: Cari hesaptaki artı bakiyeden gider ödemesi yapılabilir.
"""
from decimal import Decimal
from apps.finans.application.transaction_utils import atomic_result

from apps.finans.infrastructure.gider_odeme_repository import GiderOdemeRepository
from apps.finans.infrastructure.gider_repository import GiderKaydiRepository, GiderTaksitRepository
from apps.finans.infrastructure.cari_hesap_repository import CariHesapRepository
from apps.finans.application.gider_service import GiderService
from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.application.islem_masrafi_service import IslemMasrafiService
from apps.finans.application.legacy_mahsup import mahsup_ters_kaydi_yaz
from apps.finans.domain.islem_masrafi import IslemMasrafiKaynakTipi
from apps.finans.constants.gider_types import OdemeDurum
from apps.finans.constants.hareket_types import HareketYonu, HareketKaynagi
from apps.finans.constants.cari_types import CariHareketTuru, CariHareketYonu


class GiderOdemeService:
    """
    Gider ödeme iş kuralları.
    Ödeme → BakiyeHareketi → Taksit güncelleme → Gider durum güncelleme → Cari hareket.
    """

    def __init__(self):
        self.odeme_repo = GiderOdemeRepository
        self.gider_repo = GiderKaydiRepository
        self.taksit_repo = GiderTaksitRepository
        self.gider_service = GiderService()
        self.bakiye_service = BakiyeHareketiService()
        self.cari_hareket_service = CariHareketService()
        self.cari_hesap_repo = CariHesapRepository
        self.masraf_service = IslemMasrafiService()

    @atomic_result
    def odeme_yap(self, data: dict):
        """
        Gider ödemesi yapar. İki mod destekler:
        
        A) Normal ödeme (bakiyeden_mahsup=False):
           1. GiderOdeme kaydı oluştur
           2. BakiyeHareketi oluştur (ÇIKIŞ — mali hesaptan para çıkıyor)
           3. Taksit bakiyesini güncelle
           4. GiderKaydi durumunu güncelle
           5. Cari hareket oluştur (BORÇ — ödeme yaptık)
        
        B) Bakiyeden mahsup (bakiyeden_mahsup=True):
           Cari hesapta artı bakiye varsa (önceki serbest ödemeler vb.)
           mali hesaptan para çıkmaz, sadece cari bakiye düşülür.
           1. GiderOdeme kaydı oluştur (mali_hesap/odeme_yontemi null)
           2. BakiyeHareketi OLUŞTURULMAZ (kasadan para çıkmıyor)
           3. Taksit bakiyesini güncelle
           4. GiderKaydi durumunu güncelle
           5. Cari hareket oluştur (BORÇ — mahsup yaptık)

        Returns: (GiderOdeme, None) veya (None, error_dict)
        """
        bakiyeden_mahsup = data.get('bakiyeden_mahsup', False)
        raw_gider = data.get('gider_kaydi_id') or data.get('gider_kaydi')
        gider_pk = raw_gider if isinstance(raw_gider, int) or raw_gider is None else raw_gider.pk
        if gider_pk:
            from apps.finans.domain.gider_kaydi import GiderKaydi
            from apps.finans.domain.gider_taksit import GiderTaksit
            cari_id = (
                GiderKaydi.objects.filter(pk=gider_pk)
                .values_list('cari_hesap_id', flat=True)
                .first()
            )
            if cari_id:
                self.cari_hesap_repo.get_by_id(cari_id, for_update=True)
            GiderKaydi.objects.select_for_update().filter(pk=gider_pk).first()
            if data.get('gider_taksit_id'):
                GiderTaksit.objects.select_for_update().filter(pk=data['gider_taksit_id']).first()

        errors = self._validate_odeme(data, bakiyeden_mahsup=bakiyeden_mahsup)
        if errors:
            return None, errors

        gider = self.gider_repo.get_by_id(gider_pk)

        tutar = data['tutar']

        if bakiyeden_mahsup:
            return self._bakiyeden_mahsup_yap(gider, tutar, data)
        else:
            return self._normal_odeme_yap(gider, tutar, data)

    @atomic_result
    def record_from_cek_senet_odeme(self, gider, tutar, data: dict):
        """
        Çek/senet modülünden yapılan gider ödemesini GiderOdeme'ye yansıtır.
        Normal ödeme akışıyla aynıdır; çek yöntemi doğrulama istisnası içindir.
        """
        return self._normal_odeme_yap(gider, tutar, data)

    def _normal_odeme_yap(self, gider, tutar, data):
        """Klasik ödeme: Mali hesaptan para çıkar, cari borç azalır."""

        # 1. GiderOdeme kaydı oluştur
        odeme_data = {
            'gider_kaydi_id': gider.pk,
            'gider_taksit_id': data.get('gider_taksit_id'),
            'odeme_yontemi_id': data['odeme_yontemi_id'],
            'mali_hesap_id': data['mali_hesap_id'],
            'tutar': tutar,
            'odeme_tarihi': data['odeme_tarihi'],
            'aciklama': data.get('aciklama', ''),
            'dekont': data.get('dekont'),
            'islem_yapan': data.get('islem_yapan'),
            'durum': OdemeDurum.TAMAMLANDI,
            'bakiyeden_mahsup': False,
        }
        odeme = self.odeme_repo.create(odeme_data)
        self._assign_odeme_belge_no(odeme, gider)

        # 2. BakiyeHareketi oluştur (ÇIKIŞ — hesaptan para çıkıyor)
        aciklama = f"Gider ödemesi: {gider.cari_hesap} - {gider.fatura_no or 'Belgesiz'}"
        hareket = self.bakiye_service.hareket_olustur(
            mali_hesap_id=data['mali_hesap_id'],
            kurum_id=gider.kurum_id,
            sube_id=gider.sube_id,
            egitim_yili_id=gider.egitim_yili_id,
            tutar=tutar,
            yon=HareketYonu.CIKIS,
            kaynak=HareketKaynagi.GIDER,
            islem_tarihi=data['odeme_tarihi'],
            kaynak_tip='GiderOdeme',
            kaynak_id=odeme.pk,
            aciklama=aciklama,
        )

        # BakiyeHareketi referansını kaydet
        odeme.bakiye_hareketi_id = hareket.pk
        odeme.save(update_fields=['bakiye_hareketi_id'])

        # 3. Taksit bakiyesini güncelle (varsa)
        if data.get('gider_taksit_id'):
            taksit = self.taksit_repo.get_by_id(data['gider_taksit_id'])
            if taksit:
                self.taksit_repo.odenen_tutar_guncelle(taksit)

        # 4. GiderKaydi durumunu güncelle
        self.gider_service.durum_guncelle(gider)

        # 5. Cari hesapta BORÇ hareketi (tedarikçi borcumuz azalıyor — ödeme yaptık)
        self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=gider.cari_hesap_id,
            kurum_id=gider.kurum_id,
            tutar=tutar,
            yon=CariHareketYonu.BORC,
            islem_turu=CariHareketTuru.ODEME,
            islem_tarihi=data['odeme_tarihi'],
            sube_id=gider.sube_id,
            egitim_yili_id=gider.egitim_yili_id,
            kaynak_tip='GiderOdeme',
            kaynak_id=odeme.pk,
            aciklama=f'Gider ödemesi: {gider.fatura_no or "Belgesiz"} — {tutar} ₺',
        )

        _, masraf_err = self.masraf_service.process_if_present(
            data,
            kaynak_tip=IslemMasrafiKaynakTipi.GIDER_ODEME,
            kaynak_id=odeme.pk,
            kurum_id=gider.kurum_id,
            sube_id=gider.sube_id,
            egitim_yili_id=gider.egitim_yili_id,
            mali_hesap_id=data['mali_hesap_id'],
            odeme_yontemi_id=data['odeme_yontemi_id'],
            islem_tarihi=data['odeme_tarihi'],
            ana_islem_aciklama=aciklama,
            islem_yapan=data.get('islem_yapan'),
        )
        if masraf_err:
            return None, {'genel': masraf_err}

        return odeme, None

    def _bakiyeden_mahsup_yap(self, gider, tutar, data):
        """
        Cari bakiyeden mahsup: Mali hesaptan para çıkmaz ve mükerrer CariHareket oluşmaz.
        Neden: SerbestOdeme sırasında cariye BORÇ, GiderKaydi onayında cariye ALACAK
        zaten işlenmiştir (net cari bakiye zaten doğrudur). Mahsup işlemi yalnızca
        mevcut serbest avans ödemesini bu gider faturasının açık borcuna eşleştirir.
        """
        # 1. GiderOdeme kaydı oluştur (mali_hesap & odeme_yontemi null)
        odeme_data = {
            'gider_kaydi_id': gider.pk,
            'gider_taksit_id': data.get('gider_taksit_id'),
            'odeme_yontemi_id': None,
            'mali_hesap_id': None,
            'tutar': tutar,
            'odeme_tarihi': data['odeme_tarihi'],
            'aciklama': data.get('aciklama', '') or 'Cari bakiyeden mahsup edildi',
            'islem_yapan': data.get('islem_yapan'),
            'durum': OdemeDurum.TAMAMLANDI,
            'bakiyeden_mahsup': True,
        }
        odeme = self.odeme_repo.create(odeme_data)
        self._assign_odeme_belge_no(odeme, gider)

        # 2. BakiyeHareketi OLUŞTURULMAZ — kasadan/bankadan para çıkmıyor!

        # 3. Taksit bakiyesini güncelle (varsa)
        if data.get('gider_taksit_id'):
            taksit = self.taksit_repo.get_by_id(data['gider_taksit_id'])
            if taksit:
                self.taksit_repo.odenen_tutar_guncelle(taksit)

        # 4. GiderKaydi durumunu güncelle
        self.gider_service.durum_guncelle(gider)

        return odeme, None

    @atomic_result
    def odeme_iptal(self, odeme_id: int):
        """
        Ödemeyi iptal eder ve tüm bakiyeleri geri alır.
        Bakiyeden mahsup ödemelerde BakiyeHareketi oluşturulmaz, sadece cari hareket yapılır.
        Returns: (GiderOdeme, None) veya (None, error_dict)
        """
        # Eşzamanlı işlem/iptal koruması — kilit sırası: CariHesap → GiderOdeme.
        from apps.finans.domain.gider_odeme import GiderOdeme as _GiderOdeme
        cari_id = (
            _GiderOdeme.objects.filter(pk=odeme_id)
            .values_list('gider_kaydi__cari_hesap_id', flat=True)
            .first()
        )
        if cari_id:
            self.cari_hesap_repo.get_by_id(cari_id, for_update=True)
        _GiderOdeme.objects.select_for_update().filter(pk=odeme_id).first()

        odeme = self.odeme_repo.get_by_id(odeme_id)
        if not odeme:
            return None, {'genel': 'Ödeme kaydı bulunamadı.'}

        if odeme.durum == OdemeDurum.IPTAL:
            return None, {'genel': 'Bu ödeme zaten iptal edilmiş.'}

        tutar = odeme.tutar
        gider = odeme.gider_kaydi
        is_mahsup = odeme.bakiyeden_mahsup

        # 1. Ödemeyi iptal et
        odeme = self.odeme_repo.iptal_et(odeme)

        # 2. BakiyeHareketi oluştur (sadece normal ödemelerde — mahsupta kasadan para çıkmamıştı).
        #    Daha önce iptal girişi yazıldıysa tekrar yazma (çift bakiye koruması).
        zaten_iptal_var = self.bakiye_service.kaynak_hareketi_var_mi(
            kaynak_tip='GiderOdeme',
            kaynak_id=odeme.pk,
            kaynaklar=[HareketKaynagi.GIDER_IPTAL],
        )
        if not is_mahsup and odeme.mali_hesap_id and not zaten_iptal_var:
            aciklama = f"Gider ödeme iptali: {gider.cari_hesap} - {gider.fatura_no or 'Belgesiz'}"
            self.bakiye_service.hareket_olustur(
                mali_hesap_id=odeme.mali_hesap_id,
                kurum_id=gider.kurum_id,
                sube_id=gider.sube_id,
                egitim_yili_id=gider.egitim_yili_id,
                tutar=tutar,
                yon=HareketYonu.GIRIS,
                kaynak=HareketKaynagi.GIDER_IPTAL,
                islem_tarihi=odeme.odeme_tarihi,
                kaynak_tip='GiderOdeme',
                kaynak_id=odeme.pk,
                aciklama=aciklama,
            )

        # 3. Taksit bakiyesini güncelle (varsa)
        if odeme.gider_taksit_id:
            taksit = self.taksit_repo.get_by_id(odeme.gider_taksit_id)
            if taksit:
                self.taksit_repo.odenen_tutar_guncelle(taksit)

        # 4. GiderKaydi durumunu güncelle
        self.gider_service.durum_guncelle(gider)

        # 5. Cari hesapta ters hareket (iptal)
        #    Normal ödeme: BORÇ yapılmıştı → iptalinde ALACAK/İADE.
        #    Yeni mahsuplarda mükerrer CariHareket yazılmaz; eski veride
        #    dengelenmemiş ALACAK/MAHSUP kalmışsa yalnızca kalan net kapatılır.
        if is_mahsup:
            mahsup_ters_kaydi_yaz(
                odeme,
                cari_hareket_service=self.cari_hareket_service,
                aciklama=f'Mahsup iptali: {gider.fatura_no or "Belgesiz"} — {tutar} ₺',
            )
        else:
            self.cari_hareket_service.hareket_olustur(
                cari_hesap_id=gider.cari_hesap_id,
                kurum_id=gider.kurum_id,
                tutar=tutar,
                yon=CariHareketYonu.ALACAK,
                islem_turu=CariHareketTuru.IADE,
                islem_tarihi=odeme.odeme_tarihi,
                sube_id=gider.sube_id,
                egitim_yili_id=gider.egitim_yili_id,
                kaynak_tip='GiderOdeme',
                kaynak_id=odeme.pk,
                aciklama=f'Gider ödeme iptali: {gider.fatura_no or "Belgesiz"} — {tutar} ₺',
            )

        self.masraf_service.iptal(
            IslemMasrafiKaynakTipi.GIDER_ODEME,
            odeme.pk,
            islem_tarihi=odeme.odeme_tarihi,
            islem_yapan=None,
        )

        return odeme, None

    @staticmethod
    def _assign_odeme_belge_no(odeme, gider):
        """Gerçekleşen ödemeye ODM-YYYY-000001 numarası verir."""
        from apps.finans.application.gider_belge_service import generate_odeme_belge_no
        odeme.odeme_belge_no = generate_odeme_belge_no(gider.kurum_id)
        odeme.save(update_fields=['odeme_belge_no'])

    # ─── Validasyon ──────────────────────────────

    def _validate_odeme(self, data, bakiyeden_mahsup=False):
        errors = {}

        gider_id = data.get('gider_kaydi_id') or data.get('gider_kaydi')
        if not gider_id:
            errors['gider_kaydi'] = 'Gider kaydı zorunludur.'
            return errors

        gider = self.gider_repo.get_by_id(gider_id if isinstance(gider_id, int) else gider_id.pk)
        if not gider:
            errors['gider_kaydi'] = 'Gider kaydı bulunamadı.'
            return errors

        from apps.finans.application.tenant_validation import validate_finans_links
        link_errors = validate_finans_links(
            kurum_id=gider.kurum_id, sube_id=gider.sube_id,
            mali_hesap_id=data.get('mali_hesap_id'),
            odeme_yontemi_id=data.get('odeme_yontemi_id'),
        )
        if link_errors:
            return link_errors

        if not gider.odenebilir_mi:
            errors['gider_kaydi'] = (
                f'Bu gidere ödeme yapılamaz (durum: {gider.get_durum_display()}). '
                f'Kalan borç: {gider.kalan_tutar} ₺'
            )
            return errors

        tutar = data.get('tutar')
        if not tutar or tutar <= Decimal('0'):
            errors['tutar'] = 'Ödeme tutarı sıfırdan büyük olmalıdır.'
        elif tutar > gider.kalan_tutar:
            errors['tutar'] = f'Ödeme tutarı kalan borçtan ({gider.kalan_tutar} ₺) fazla olamaz.'

        if bakiyeden_mahsup:
            from apps.finans.application.cari_balance import hesapla_serbest_odeme_bakiye
            cari_hesap = self.cari_hesap_repo.get_by_id(gider.cari_hesap_id)
            if cari_hesap:
                serbest_bakiye = hesapla_serbest_odeme_bakiye(gider.cari_hesap_id)
                if tutar and serbest_bakiye <= Decimal('0'):
                    errors['tutar'] = (
                        f'Cari hesapta mahsup edilecek serbest ödeme bakiyesi bulunmuyor. '
                        f'Kullanılabilir bakiye: {serbest_bakiye} ₺'
                    )
                elif tutar and tutar > serbest_bakiye:
                    errors['tutar'] = f'Mahsup tutarı kullanılabilir serbest bakiyeden ({serbest_bakiye} ₺) fazla olamaz.'
        else:
            # Normal ödeme — mali hesap ve ödeme yöntemi zorunlu
            if not data.get('odeme_yontemi_id'):
                errors['odeme_yontemi'] = 'Ödeme yöntemi zorunludur.'
            if not data.get('mali_hesap_id'):
                errors['mali_hesap'] = 'Mali hesap seçimi zorunludur.'
            elif data.get('odeme_yontemi_id'):
                from apps.finans.application.cek_senet.cek_senet_helpers import (
                    cek_senet_v2_enabled,
                    is_cek_senet_yontemi,
                )
                from apps.finans.domain.payment_method import OdemeYontemi
                if cek_senet_v2_enabled():
                    yontem = OdemeYontemi.objects.filter(id=data['odeme_yontemi_id']).first()
                    if is_cek_senet_yontemi(yontem):
                        errors['odeme_yontemi'] = (
                            'Çek/senet gider ödemesi Finans → Çek/Senet modülünden yapılmalıdır.'
                        )

        if not data.get('odeme_tarihi'):
            errors['odeme_tarihi'] = 'Ödeme tarihi zorunludur.'

        # Taksit kontrolü
        taksit_id = data.get('gider_taksit_id')
        if taksit_id:
            taksit = self.taksit_repo.get_by_id(taksit_id)
            if not taksit:
                errors['gider_taksit'] = 'Taksit bulunamadı.'
            elif taksit.gider_kaydi_id != gider.pk:
                errors['gider_taksit'] = 'Taksit bu gider kaydına ait değil.'
            elif tutar and tutar > taksit.kalan_tutar:
                errors['tutar'] = f'Ödeme tutarı taksit bakiyesinden ({taksit.kalan_tutar} ₺) fazla olamaz.'

        return errors if errors else None
