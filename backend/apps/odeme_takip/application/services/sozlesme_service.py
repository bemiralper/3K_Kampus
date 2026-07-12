"""
Sözleşme Service
İş kuralları: Sözleşme oluşturma, güncelleme, statü değişimi, sözleşme no üretimi

Integer-Only: Tüm parasal hesaplamalar tam sayı aritmetiğiyle yapılır.
Decimal KULLANILMAZ.
"""
from django.db import transaction
from django.utils import timezone

from apps.egitim_paketleri.models import hesapla_kdv
from apps.odeme_takip.domain.models import Sozlesme, SozlesmeKalemi, SozlesmeGecmisi
from apps.odeme_takip.domain.enums import (
    SozlesmeDurum, GecmisIslemTuru, KalemTuru, OnayDurum, PaketTuru, TaksitDurum,
)
from apps.odeme_takip.domain.notlar_utils import normalize_notlar_json, notlar_to_legacy_text
from apps.odeme_takip.infrastructure.repositories.sozlesme_repository import (
    SozlesmeRepository, SozlesmeKalemiRepository,
    SozlesmeIndirimiRepository, SozlesmeGecmisiRepository,
)
from apps.odeme_takip.application.services.taksit_service import TaksitService
from apps.odeme_takip.application.services.fiyat_utils import hesapla_kalem_fiyat


class SozlesmeService:

    def __init__(self):
        self.repo = SozlesmeRepository()
        self.kalem_repo = SozlesmeKalemiRepository()
        self.indirim_repo = SozlesmeIndirimiRepository()
        self.gecmis_repo = SozlesmeGecmisiRepository()
        self.taksit_service = TaksitService()

    @staticmethod
    def _resolve_notlar(data):
        if 'notlar_json' in data:
            notes = normalize_notlar_json(data.get('notlar_json'))
        elif data.get('notlar'):
            notes = normalize_notlar_json(data.get('notlar'))
        else:
            notes = []
        return notes, notlar_to_legacy_text(notes)

    def _kalem_fiyat_from_payload(self, payload):
        """API payload'dan kalem fiyat alanlarını hesapla."""
        return hesapla_kalem_fiyat(
            payload.get('brut_tutar', 0),
            payload.get('kdv_orani', 10),
            indirim_orani=payload.get('indirim_orani'),
            indirim_tutari=payload.get('indirim_tutari'),
            net_tutar=payload.get('net_tutar'),
        )

    def _classify_kalem(self, kalem, sozlesme=None):
        from apps.egitim_paketleri.models import Deneme, GrupDersi, OzelDers

        tur = kalem.kalem_turu
        if tur in (KalemTuru.GRUP_DERSI, PaketTuru.GRUP_DERSI):
            return PaketTuru.GRUP_DERSI
        if tur in (KalemTuru.OZEL_DERS, PaketTuru.OZEL_DERS):
            return PaketTuru.OZEL_DERS
        if tur in (KalemTuru.DENEME, PaketTuru.DENEME):
            return PaketTuru.DENEME
        if tur == KalemTuru.PAKET and sozlesme:
            if sozlesme.paket_id == kalem.kalem_id and sozlesme.paket_turu in (
                PaketTuru.GRUP_DERSI,
                PaketTuru.OZEL_DERS,
                PaketTuru.DENEME,
            ):
                return sozlesme.paket_turu
        kid = kalem.kalem_id
        if GrupDersi.objects.filter(id=kid).exists():
            return PaketTuru.GRUP_DERSI
        if OzelDers.objects.filter(id=kid).exists():
            return PaketTuru.OZEL_DERS
        if Deneme.objects.filter(id=kid).exists():
            return PaketTuru.DENEME
        return None

    def _normalize_storage_kalem_turu(self, raw):
        mapping = {
            "grup_dersi": KalemTuru.GRUP_DERSI,
            "grup_dersleri": KalemTuru.GRUP_DERSI,
            "ozel_ders": KalemTuru.OZEL_DERS,
            "ozel_dersler": KalemTuru.OZEL_DERS,
            "premium": KalemTuru.PREMIUM,
            "premium_paketler": KalemTuru.PREMIUM,
            "yayin": KalemTuru.YAYIN,
            "yayin_paketleri": KalemTuru.YAYIN,
            "deneme": KalemTuru.DENEME,
            "denemeler": KalemTuru.DENEME,
            "ek_hizmet": KalemTuru.EK_HIZMET,
            "ek_hizmet_satisi": KalemTuru.EK_HIZMET_SATISI,
        }
        return mapping.get(raw, raw)

    def _find_singleton_kalem(self, sozlesme, paket_kind):
        for k in SozlesmeKalemi.objects.filter(sozlesme=sozlesme):
            if self._classify_kalem(k, sozlesme) == paket_kind:
                return k
        return None

    def _deneme_net_tutar(self, sozlesme, kalem=None):
        if kalem is not None:
            return kalem.net_tutar or 0
        existing = self._find_singleton_kalem(sozlesme, PaketTuru.DENEME)
        if existing:
            return existing.net_tutar or 0
        if sozlesme.paket_id and sozlesme.paket_turu == PaketTuru.DENEME:
            paket_kalem = SozlesmeKalemi.objects.filter(
                sozlesme=sozlesme,
                kalem_id=sozlesme.paket_id,
            ).first()
            if paket_kalem:
                return paket_kalem.net_tutar or 0
        return 0

    def _subtract_kalem_totals(self, sozlesme, kalem):
        sozlesme.brut_tutar -= kalem.brut_tutar
        sozlesme.kdv_tutari -= kalem.kdv_tutari
        sozlesme.kdv_dahil_tutar -= kalem.brut_tutar
        sozlesme.toplam_indirim_tutari -= kalem.indirim_tutari
        sozlesme.net_tutar -= kalem.net_tutar

    def _remove_kalem_internal(self, sozlesme, kalem, user, aciklama):
        eski_net = sozlesme.net_tutar
        kalem_net = kalem.net_tutar
        kalem_adi = kalem.kalem_adi
        self._subtract_kalem_totals(sozlesme, kalem)
        sozlesme.save(
            update_fields=[
                "brut_tutar",
                "kdv_tutari",
                "kdv_dahil_tutar",
                "toplam_indirim_tutari",
                "net_tutar",
                "updated_at",
            ]
        )
        kalem.delete()
        self.gecmis_repo.create(
            {
                "sozlesme": sozlesme,
                "islem_turu": GecmisIslemTuru.KALEM_CIKARMA,
                "eski_deger": {"net_tutar": eski_net},
                "yeni_deger": {
                    "net_tutar": sozlesme.net_tutar,
                    "cikarilan_kalem": kalem_adi,
                    "kalem_tutar": kalem_net,
                },
                "aciklama": aciklama,
                "islem_yapan": user,
            }
        )
        return kalem_net

    def _apply_taksit_plan(self, sozlesme, data):
        """Sözleşme oluşturma/güncelleme sonrası taksit planını uygula."""
        from apps.odeme_takip.domain.enums import OdemeTuru

        is_cek_senet = sozlesme.odeme_turu == OdemeTuru.CEK_SENET

        if sozlesme.odeme_turu == OdemeTuru.PESIN or sozlesme.net_tutar <= 0:
            self.taksit_service.recreate_plan(
                sozlesme=sozlesme,
                taksit_sayisi=1,
                ilk_odeme_tarihi=sozlesme.ilk_odeme_tarihi or sozlesme.baslangic_tarihi,
                periyot=sozlesme.taksit_periyodu,
            )
        else:
            yontem = data.get('taksit_yontemi', 'esit')
            pesinat = int(data.get('pesinat', 0) or 0)
            ilk_tarih = sozlesme.ilk_odeme_tarihi or sozlesme.baslangic_tarihi
            periyot = sozlesme.taksit_periyodu

            if yontem == 'manuel':
                manuel = data.get('manuel_taksitler') or []
                if manuel:
                    self.taksit_service.create_manual_plan(sozlesme, manuel)
                    if is_cek_senet:
                        self.taksit_service._apply_taksit_odeme_yontemleri(
                            sozlesme, 'manuel', manuel,
                            data.get('taksit_odeme_yontemleri'),
                        )
            elif yontem == 'yuzde':
                yuzdeler = data.get('yuzde_dagilim') or []
                if yuzdeler:
                    tarih_listesi = []
                    for i in range(len(yuzdeler)):
                        tarih_listesi.append(
                            self.taksit_service._hesapla_vade(ilk_tarih, i, periyot)
                        )
                    self.taksit_service.create_percentage_plan(sozlesme, yuzdeler, tarih_listesi)
            else:
                self.taksit_service.recreate_plan(
                    sozlesme=sozlesme,
                    taksit_sayisi=sozlesme.taksit_sayisi,
                    ilk_odeme_tarihi=ilk_tarih,
                    periyot=periyot,
                    pesinat=pesinat,
                )
                taksit_odeme = data.get('taksit_odeme_yontemleri') or []
                if is_cek_senet and taksit_odeme:
                    self.taksit_service._apply_taksit_odeme_yontemleri(
                        sozlesme, 'esit', None, taksit_odeme,
                    )

        if is_cek_senet:
            self.taksit_service._sync_cek_senet_plan(sozlesme)
        else:
            self.taksit_service._apply_contract_odeme_yontemi_to_taksits(sozlesme)
            # Peşin/taksitli yollarda sync'i atla; sadece eski çek/senet detayı varsa temizle
            from apps.odeme_takip.domain.models import Taksit
            has_cek_detay = Taksit.objects.filter(
                sozlesme=sozlesme,
                cek_senet_detay__isnull=False,
            ).exists()
            if has_cek_detay:
                self.taksit_service._sync_cek_senet_plan(sozlesme)

    # ─── LIST ────────────────────────────
    def get_all(self, kurum_id=None, sube_id=None, egitim_yili_id=None, durum=None, ogrenci_id=None):
        return self.repo.get_all(kurum_id, sube_id, egitim_yili_id, durum, ogrenci_id)

    def get_by_id(self, id):
        return self.repo.get_by_id(id)

    def get_by_ogrenci(self, ogrenci_id, egitim_yili_id=None):
        return self.repo.get_by_ogrenci(ogrenci_id, egitim_yili_id)

    def get_ozet(self, kurum_id, sube_id, egitim_yili_id):
        return self.repo.get_ozet_istatistikler(kurum_id, sube_id, egitim_yili_id)

    # ─── CREATE ──────────────────────────
    def create(self, data, user=None):
        """
        Sözleşme oluştur — Integer-Only.
        Tüm brut_tutar değerleri KDV DAHİL tam sayıdır.
        """
        errors = self._validate_create(data)
        if errors:
            existing_id = errors.pop('existing_id', None)
            payload = {'errors': errors}
            if existing_id is not None:
                payload['existing_id'] = existing_id
            return None, payload

        try:
            with transaction.atomic():
                return self._create_atomic(data, user)
        except ValueError as exc:
            return None, {'error': str(exc)}

    def _create_atomic(self, data, user=None):
        # Sözleşme no üret
        from apps.egitim_yili.domain.models import EgitimYili
        egitim_yili = EgitimYili.objects.get(id=data['egitim_yili_id'])
        sozlesme_no = self._generate_sozlesme_no(egitim_yili)

        # ─── Kalemleri hesapla (Integer-Only) ──────
        kalemler_raw = data.get('kalemler', [])
        has_ana_paket = bool(data.get('paket_id'))

        # Ana paket kalemi (varsa)
        ana_brut = int(data.get('brut_tutar', 0) or 0)
        ana_kdv_orani = int(data.get('kdv_orani', 10))
        ana_fiyat = {'kdv_tutari': 0, 'indirim_orani': 0, 'indirim_tutari': 0, 'net_tutar': 0}
        if has_ana_paket and ana_brut > 0:
            ana_fiyat = self._kalem_fiyat_from_payload(data)

        toplam_brut = ana_brut if has_ana_paket else 0
        toplam_kdv = ana_fiyat['kdv_tutari'] if has_ana_paket else 0
        toplam_indirim = ana_fiyat['indirim_tutari'] if has_ana_paket else 0

        # Ek kalemler hesapla
        kalem_objeleri = []
        ana_paket_id = data.get('paket_id') if has_ana_paket else None
        for k in kalemler_raw:
            if (
                has_ana_paket
                and k.get('kalem_turu') == KalemTuru.PAKET
                and k.get('kalem_id') == ana_paket_id
            ):
                continue
            k_fiyat = self._kalem_fiyat_from_payload(k)
            k_brut = k_fiyat['brut_tutar']

            toplam_brut += k_brut
            toplam_kdv += k_fiyat['kdv_tutari']
            toplam_indirim += k_fiyat['indirim_tutari']

            kalem_objeleri.append({
                'kalem_turu': k.get('kalem_turu', KalemTuru.EK_HIZMET),
                'kalem_id': k['kalem_id'],
                'kalem_adi': k['kalem_adi'],
                'brut_tutar': k_brut,
                'kdv_orani': k_fiyat['kdv_orani'],
                'kdv_tutari': k_fiyat['kdv_tutari'],
                'kdv_dahil_tutar': k_brut,
                'indirim_orani': k_fiyat['indirim_orani'],
                'indirim_tutari': k_fiyat['indirim_tutari'],
                'net_tutar': k_fiyat['net_tutar'],
            })

        net_tutar = toplam_brut - toplam_indirim

        notlar_json, notlar_text = self._resolve_notlar(data)

        sozlesme = self.repo.create({
            'sozlesme_no': sozlesme_no,
            'ogrenci_id': data['ogrenci_id'],
            'ogrenci_kayit_id': data.get('ogrenci_kayit_id'),
            'egitim_yili_id': data['egitim_yili_id'],
            'kurum_id': data['kurum_id'],
            'sube_id': data['sube_id'],
            'veli_id': data.get('veli_id'),
            'odeme_yontemi_id': data.get('odeme_yontemi_id'),
            'mali_hesap_id': data.get('mali_hesap_id'),
            'baslangic_tarihi': data['baslangic_tarihi'],
            'bitis_tarihi': data['bitis_tarihi'],
            'paket_turu': data.get('paket_turu', 'ek_hizmet'),
            'paket_id': data.get('paket_id'),
            'paket_adi': data.get('paket_adi', 'Ek Hizmetler'),
            'brut_tutar': toplam_brut,
            'kdv_orani': ana_kdv_orani,
            'kdv_tutari': toplam_kdv,
            'kdv_dahil_tutar': toplam_brut,  # brut zaten KDV dahil
            'toplam_indirim_tutari': toplam_indirim,
            'net_tutar': net_tutar,
            'odeme_turu': data.get('odeme_turu', 'taksitli'),
            'taksit_sayisi': data.get('taksit_sayisi', 1),
            'ilk_odeme_tarihi': data.get('ilk_odeme_tarihi'),
            'taksit_periyodu': data.get('taksit_periyodu', 'aylik'),
            'durum': SozlesmeDurum.TASLAK,
            'notlar': notlar_text,
            'notlar_json': notlar_json,
            'olusturan': user,
            'muacceliyet_durumu': data.get('muacceliyet_durumu', False),
            'cayma_suresi': data.get('cayma_suresi', 14),
            'egitim_turu': data.get('egitim_turu', 'diger'),
            'yetkili_personel': user,
        })

        # Ana paket kalem olarak ekle (varsa)
        if has_ana_paket:
            SozlesmeKalemi.objects.create(
                sozlesme=sozlesme,
                kalem_turu=KalemTuru.PAKET,
                kalem_id=data['paket_id'],
                kalem_adi=data['paket_adi'],
                brut_tutar=ana_brut,
                kdv_orani=ana_fiyat['kdv_orani'],
                kdv_tutari=ana_fiyat['kdv_tutari'],
                kdv_dahil_tutar=ana_brut,
                indirim_orani=ana_fiyat['indirim_orani'],
                indirim_tutari=ana_fiyat['indirim_tutari'],
                net_tutar=ana_fiyat['net_tutar'],
            )

        # Ek hizmet kalemleri
        for ko in kalem_objeleri:
            SozlesmeKalemi.objects.create(sozlesme=sozlesme, **ko)

        # Taksit planı oluştur (hata → atomic rollback)
        self._apply_taksit_plan(sozlesme, data)

        # Audit log
        self.gecmis_repo.create({
            'sozlesme': sozlesme,
            'islem_turu': GecmisIslemTuru.OLUSTURMA,
            'yeni_deger': {
                'sozlesme_no': sozlesme_no,
                'net_tutar': sozlesme.net_tutar,
                'taksit_sayisi': sozlesme.taksit_sayisi,
            },
            'aciklama': f'Sözleşme oluşturuldu: {sozlesme_no}',
            'islem_yapan': user,
        })

        return sozlesme, None

    # ─── DELETE ──────────────────────────
    def delete(self, id, user=None):
        """Sözleşmeyi tamamen siler. Sadece taslak sözleşmeler silinebilir."""
        sozlesme = self.repo.get_by_id(id)
        if not sozlesme:
            return None, {'error': 'Sözleşme bulunamadı'}

        if sozlesme.durum != SozlesmeDurum.TASLAK:
            return None, {'error': 'Sadece taslak durumundaki sözleşmeler silinebilir. '
                                    'Aktif veya işlem görmüş sözleşmeler feshedilmeli veya iptal edilmelidir.'}

        from apps.odeme_takip.domain.models import Tahsilat
        tahsilat_var = Tahsilat.objects.filter(sozlesme_id=id).exists()
        if tahsilat_var:
            return None, {'error': 'Bu sözleşmeye ait tahsilat kayıtları var. Önce tahsilatları iptal edin.'}

        sozlesme_no = sozlesme.sozlesme_no
        self.repo.delete(sozlesme)
        return {'deleted': True, 'sozlesme_no': sozlesme_no}, None

    # ─── UPDATE ──────────────────────────
    def update(self, id, data, user=None):
        sozlesme = self.repo.get_by_id(id)
        if not sozlesme:
            return None, {'error': 'Sözleşme bulunamadı'}

        if sozlesme.durum not in [SozlesmeDurum.TASLAK, SozlesmeDurum.AKTIF]:
            return None, {'error': 'Sadece taslak veya aktif sözleşmeler düzenlenebilir'}

        try:
            with transaction.atomic():
                return self._update_atomic(sozlesme, data, user)
        except ValueError as exc:
            return None, {'error': str(exc)}

    def _update_atomic(self, sozlesme, data, user=None):
        is_aktif = sozlesme.durum == SozlesmeDurum.AKTIF

        eski_deger = {
            'brut_tutar': sozlesme.brut_tutar,
            'kdv_orani': sozlesme.kdv_orani,
            'net_tutar': sozlesme.net_tutar,
            'versiyon': sozlesme.versiyon,
        }

        update_fields = {}
        for field in ['baslangic_tarihi', 'bitis_tarihi', 'paket_turu', 'paket_id',
                       'paket_adi', 'odeme_turu', 'taksit_sayisi', 'ilk_odeme_tarihi',
                       'taksit_periyodu', 'muacceliyet_durumu', 'cayma_suresi',
                       'egitim_turu', 'veli_id', 'odeme_yontemi_id', 'mali_hesap_id']:
            if field in data:
                update_fields[field] = data[field]

        if 'notlar_json' in data or 'notlar' in data:
            notlar_json, notlar_text = self._resolve_notlar(data)
            update_fields['notlar_json'] = notlar_json
            update_fields['notlar'] = notlar_text

        # ─── Kalemler güncelleme ─────────────
        kalemler_raw = data.get('kalemler')
        if kalemler_raw is not None:
            # Mevcut kalemleri temizle ve yeniden oluştur
            SozlesmeKalemi.objects.filter(sozlesme=sozlesme).delete()

            toplam_brut = 0
            toplam_kdv = 0
            toplam_indirim = 0

            # Ana paket: istemci açıkça paket_id gönderdiyse (null dahil) onu kullan;
            # yoksa eski sözleşme kökündeki değere düşme — çift sayımı önler.
            if 'paket_id' in data:
                ana_paket_id = data.get('paket_id')
                has_ana_paket = bool(ana_paket_id)
            else:
                ana_paket_id = sozlesme.paket_id
                has_ana_paket = bool(ana_paket_id)

            ana_paket_adi = data.get('paket_adi', sozlesme.paket_adi)
            ana_brut = int(data.get('brut_tutar', sozlesme.brut_tutar) or 0)
            ana_kdv_orani = int(data.get('kdv_orani', sozlesme.kdv_orani) or 0)

            if has_ana_paket and ana_brut > 0:
                ana_payload = {
                    'brut_tutar': ana_brut,
                    'kdv_orani': ana_kdv_orani,
                    'indirim_orani': data.get('indirim_orani'),
                    'indirim_tutari': data.get('indirim_tutari'),
                    'net_tutar': data.get('net_tutar'),
                }
                ana_fiyat = self._kalem_fiyat_from_payload(ana_payload)
                SozlesmeKalemi.objects.create(
                    sozlesme=sozlesme,
                    kalem_turu=KalemTuru.PAKET,
                    kalem_id=ana_paket_id,
                    kalem_adi=ana_paket_adi,
                    brut_tutar=ana_brut,
                    kdv_orani=ana_fiyat['kdv_orani'],
                    kdv_tutari=ana_fiyat['kdv_tutari'],
                    kdv_dahil_tutar=ana_brut,
                    indirim_orani=ana_fiyat['indirim_orani'],
                    indirim_tutari=ana_fiyat['indirim_tutari'],
                    net_tutar=ana_fiyat['net_tutar'],
                )
                toplam_brut += ana_brut
                toplam_kdv += ana_fiyat['kdv_tutari']
                toplam_indirim += ana_fiyat['indirim_tutari']

            # Ek kalemler — ana paket ile aynı id tekrar eklenmesin
            for k in kalemler_raw:
                if (
                    has_ana_paket
                    and k.get('kalem_turu') == KalemTuru.PAKET
                    and k.get('kalem_id') == ana_paket_id
                ):
                    continue
                k_fiyat = self._kalem_fiyat_from_payload(k)
                k_brut = k_fiyat['brut_tutar']

                SozlesmeKalemi.objects.create(
                    sozlesme=sozlesme,
                    kalem_turu=k.get('kalem_turu', KalemTuru.EK_HIZMET),
                    kalem_id=k['kalem_id'],
                    kalem_adi=k['kalem_adi'],
                    brut_tutar=k_brut,
                    kdv_orani=k_fiyat['kdv_orani'],
                    kdv_tutari=k_fiyat['kdv_tutari'],
                    kdv_dahil_tutar=k_brut,
                    indirim_orani=k_fiyat['indirim_orani'],
                    indirim_tutari=k_fiyat['indirim_tutari'],
                    net_tutar=k_fiyat['net_tutar'],
                )
                toplam_brut += k_brut
                toplam_kdv += k_fiyat['kdv_tutari']
                toplam_indirim += k_fiyat['indirim_tutari']

            net_tutar = toplam_brut - toplam_indirim
            update_fields['brut_tutar'] = toplam_brut
            update_fields['kdv_tutari'] = toplam_kdv
            update_fields['kdv_dahil_tutar'] = toplam_brut
            update_fields['toplam_indirim_tutari'] = toplam_indirim
            update_fields['net_tutar'] = net_tutar
            if 'paket_id' in data:
                update_fields['paket_id'] = data.get('paket_id')
            if 'paket_turu' in data:
                update_fields['paket_turu'] = data.get('paket_turu')
            if 'paket_adi' in data:
                update_fields['paket_adi'] = data.get('paket_adi')

        # Fiyat güncelleme (kalemler yoksa, sadece brut_tutar değişmişse — Integer-Only)
        elif 'brut_tutar' in data:
            brut = int(data['brut_tutar'])
            kdv_orani = int(data.get('kdv_orani', sozlesme.kdv_orani))
            net, kdv = hesapla_kdv(brut, kdv_orani)
            update_fields['brut_tutar'] = brut
            update_fields['kdv_orani'] = kdv_orani
            update_fields['kdv_tutari'] = kdv
            update_fields['kdv_dahil_tutar'] = brut  # brut zaten KDV dahil
            update_fields['net_tutar'] = brut - sozlesme.toplam_indirim_tutari

        if is_aktif:
            update_fields['versiyon'] = sozlesme.versiyon + 1
            update_fields['revizyon_tarihi'] = timezone.now()

        sozlesme = self.repo.update(sozlesme, update_fields)

        # Taksit planını yeniden oluştur
        if any(f in data for f in ['brut_tutar', 'taksit_sayisi', 'ilk_odeme_tarihi', 'taksit_periyodu', 'kalemler', 'taksit_yontemi', 'pesinat', 'manuel_taksitler', 'yuzde_dagilim']):
            from apps.odeme_takip.domain.enums import TaksitDurum
            from apps.odeme_takip.domain.models import Taksit
            has_paid_taksit = Taksit.objects.filter(
                sozlesme=sozlesme,
                durum__in=[TaksitDurum.ODENDI, TaksitDurum.KISMI_ODENDI],
            ).exists()
            if is_aktif and has_paid_taksit:
                self.taksit_service.create_remaining_plan(
                    sozlesme=sozlesme,
                    taksit_sayisi=sozlesme.taksit_sayisi,
                    ilk_odeme_tarihi=sozlesme.ilk_odeme_tarihi or sozlesme.baslangic_tarihi,
                    periyot=sozlesme.taksit_periyodu,
                )
            else:
                self._apply_taksit_plan(sozlesme, data)

        islem_turu = GecmisIslemTuru.REVIZYON if is_aktif else GecmisIslemTuru.GUNCELLEME
        self.gecmis_repo.create({
            'sozlesme': sozlesme,
            'islem_turu': islem_turu,
            'eski_deger': eski_deger,
            'yeni_deger': {
                'brut_tutar': sozlesme.brut_tutar,
                'kdv_orani': sozlesme.kdv_orani,
                'net_tutar': sozlesme.net_tutar,
                'versiyon': sozlesme.versiyon,
            },
            'aciklama': f'Sözleşme revize edildi (v{sozlesme.versiyon})' if is_aktif else 'Sözleşme güncellendi',
            'islem_yapan': user,
        })

        return sozlesme, None

    # ─── DURUM DEĞİŞTİR (State Machine) ─
    def change_status(self, id, new_status, user=None, aciklama=''):
        sozlesme = self.repo.get_by_id(id)
        if not sozlesme:
            return None, {'error': 'Sözleşme bulunamadı'}

        eski_durum = sozlesme.durum

        if not SozlesmeDurum.gecis_izinli_mi(eski_durum, new_status):
            izinli = SozlesmeDurum.GECIS_KURALLARI.get(eski_durum, [])
            return None, {
                'error': f'"{sozlesme.get_durum_display()}" durumundan '
                         f'"{dict(SozlesmeDurum.CHOICES).get(new_status, new_status)}" durumuna geçiş yapılamaz. '
                         f'İzin verilen geçişler: {", ".join(izinli) if izinli else "Yok"}'
            }

        if new_status == SozlesmeDurum.TAMAMLANDI:
            from apps.odeme_takip.domain.models import Taksit
            unpaid = Taksit.objects.filter(sozlesme=sozlesme).exclude(
                durum__in=[TaksitDurum.ODENDI, TaksitDurum.IPTAL]
            ).exists()
            if unpaid:
                return None, {
                    'error': 'Ödeme planı tamamlanmadan sözleşme "Tamamlandı" durumuna alınamaz. '
                             'Lütfen önce tüm taksitlerin ödendiğinden emin olun.',
                    'code': 'ODEME_PLANI_TAMAMLANMADI',
                }

        sozlesme.durum = new_status
        sozlesme.save(update_fields=['durum', 'updated_at'])

        self.gecmis_repo.create({
            'sozlesme': sozlesme,
            'islem_turu': GecmisIslemTuru.DURUM_DEGISIKLIGI,
            'eski_deger': {'durum': eski_durum},
            'yeni_deger': {'durum': new_status},
            'aciklama': aciklama or f'Durum değişikliği: {eski_durum} → {new_status}',
            'islem_yapan': user,
        })

        return sozlesme, None

    def revert_last_status(self, id, user=None, aciklama=''):
        """Son durum değişikliğini geri al (yönetici)."""
        if not user or not (getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False)):
            return None, {'error': 'Durum geri alma için yönetici yetkisi gerekir'}

        sozlesme = self.repo.get_by_id(id)
        if not sozlesme:
            return None, {'error': 'Sözleşme bulunamadı'}

        last_change = self.gecmis_repo.get_by_sozlesme(id).filter(
            islem_turu=GecmisIslemTuru.DURUM_DEGISIKLIGI,
        ).first()

        if not last_change:
            return None, {'error': 'Geri alınacak durum değişikliği bulunamadı'}

        eski_durum = (last_change.eski_deger or {}).get('durum')
        yeni_durum = (last_change.yeni_deger or {}).get('durum')

        if not eski_durum:
            return None, {'error': 'Önceki durum kaydı bulunamadı'}

        if sozlesme.durum != yeni_durum:
            return None, {
                'error': 'Sözleşme durumu son değişiklikten sonra güncellenmiş. Geri alma uygulanamaz.',
            }

        onceki = sozlesme.durum
        sozlesme.durum = eski_durum
        sozlesme.save(update_fields=['durum', 'updated_at'])

        self.gecmis_repo.create({
            'sozlesme': sozlesme,
            'islem_turu': GecmisIslemTuru.DURUM_DEGISIKLIGI,
            'eski_deger': {'durum': onceki},
            'yeni_deger': {'durum': eski_durum},
            'aciklama': aciklama or f'Durum geri alındı: {onceki} → {eski_durum}',
            'islem_yapan': user,
        })

        return sozlesme, None

    # ─── NET TUTAR YENİDEN HESAPLA ──────
    def recalculate_net(self, sozlesme_id, user=None):
        """İndirim ekleme/silme sonrası net tutarı yeniden hesapla"""
        sozlesme = self.repo.get_by_id(sozlesme_id)
        if not sozlesme:
            return

        toplam_indirim = self.indirim_repo.get_onaylanan_toplam(sozlesme_id)
        eski_net = sozlesme.net_tutar

        sozlesme.toplam_indirim_tutari = toplam_indirim
        sozlesme.net_tutar = sozlesme.kdv_dahil_tutar - toplam_indirim
        sozlesme.save(update_fields=['toplam_indirim_tutari', 'net_tutar', 'updated_at'])

        if sozlesme.durum == SozlesmeDurum.TASLAK:
            self.taksit_service.recreate_plan(
                sozlesme=sozlesme,
                taksit_sayisi=sozlesme.taksit_sayisi,
                ilk_odeme_tarihi=sozlesme.ilk_odeme_tarihi or sozlesme.baslangic_tarihi,
                periyot=sozlesme.taksit_periyodu,
            )

        return sozlesme

    # ─── KALEM EKLE (Aktif sözleşmeye) ──
    def kalem_ekle(self, sozlesme_id, kalem_data, user=None):
        """Aktif sözleşmeye yeni kalem ekler — Integer-Only"""
        sozlesme = self.repo.get_by_id(sozlesme_id)
        if not sozlesme:
            return None, {"error": "Sözleşme bulunamadı"}

        if sozlesme.durum not in [SozlesmeDurum.TASLAK, SozlesmeDurum.AKTIF]:
            return None, {"error": "Sadece taslak veya aktif sözleşmelere kalem eklenebilir"}

        raw_turu = kalem_data.get("kalem_turu", KalemTuru.EK_HIZMET)
        storage_turu = self._normalize_storage_kalem_turu(raw_turu)
        kalem_id = kalem_data["kalem_id"]
        paket_kind = self._classify_kalem(
            type("Tmp", (), {"kalem_turu": storage_turu, "kalem_id": kalem_id})(),
            sozlesme,
        )

        force_ucretsiz = False

        # Grup dersi: aynı anda tek paket — değiştirme
        if paket_kind == PaketTuru.GRUP_DERSI:
            existing = self._find_singleton_kalem(sozlesme, PaketTuru.GRUP_DERSI)
            if (
                sozlesme.paket_id
                and sozlesme.paket_turu == PaketTuru.GRUP_DERSI
                and not existing
            ):
                if sozlesme.paket_id == kalem_id:
                    return None, {"error": "Bu grup dersi paketi zaten sözleşmede mevcut"}
                if not kalem_data.get("replace_confirmed"):
                    return None, {
                        "error": (
                            f'Mevcut grup dersi "{sozlesme.paket_adi}" kaldırılıp yeni paket eklenecek. '
                            "Onay için replace_confirmed gönderin."
                        ),
                        "code": "grup_degistirme_onayi_gerekli",
                        "mevcut_kalem_adi": sozlesme.paket_adi,
                    }
                sozlesme.paket_id = kalem_id
                sozlesme.paket_adi = kalem_data["kalem_adi"]
                sozlesme.paket_turu = PaketTuru.GRUP_DERSI
                sozlesme.save(update_fields=["paket_id", "paket_adi", "paket_turu", "updated_at"])
            elif existing:
                if existing.kalem_id == kalem_id:
                    return None, {"error": "Bu grup dersi paketi zaten sözleşmede mevcut"}
                if not kalem_data.get("replace_confirmed"):
                    return None, {
                        "error": (
                            f'Mevcut grup dersi "{existing.kalem_adi}" kaldırılıp yeni paket eklenecek. '
                            "Onay için replace_confirmed gönderin."
                        ),
                        "code": "grup_degistirme_onayi_gerekli",
                        "mevcut_kalem_adi": existing.kalem_adi,
                    }
                self._remove_kalem_internal(
                    sozlesme,
                    existing,
                    user,
                    f"Grup dersi değiştirildi: {existing.kalem_adi} → {kalem_data['kalem_adi']}",
                )
                if sozlesme.paket_turu == PaketTuru.GRUP_DERSI:
                    sozlesme.paket_id = kalem_id
                    sozlesme.paket_adi = kalem_data["kalem_adi"]
                    sozlesme.save(update_fields=["paket_id", "paket_adi", "updated_at"])

        # Deneme: aynı anda tek paket — ücretsiz durumu koru
        elif paket_kind == PaketTuru.DENEME:
            existing = self._find_singleton_kalem(sozlesme, PaketTuru.DENEME)
            if (
                sozlesme.paket_id
                and sozlesme.paket_turu == PaketTuru.DENEME
                and not existing
            ):
                if sozlesme.paket_id == kalem_id:
                    return None, {"error": "Bu deneme paketi zaten sözleşmede mevcut"}
                force_ucretsiz = self._deneme_net_tutar(sozlesme) == 0
                if not kalem_data.get("replace_confirmed"):
                    mesaj = (
                        f'Mevcut deneme paketi "{sozlesme.paket_adi}" kaldırılıp yeni paket eklenecek.'
                    )
                    if force_ucretsiz:
                        mesaj += " Yeni paket de ücretsiz uygulanacak."
                    mesaj += " Onay için replace_confirmed gönderin."
                    return None, {
                        "error": mesaj,
                        "code": "deneme_degistirme_onayi_gerekli",
                        "mevcut_kalem_adi": sozlesme.paket_adi,
                        "ucretsiz_korunacak": force_ucretsiz,
                    }
                sozlesme.paket_id = kalem_id
                sozlesme.paket_adi = kalem_data["kalem_adi"]
                sozlesme.paket_turu = PaketTuru.DENEME
                sozlesme.save(update_fields=["paket_id", "paket_adi", "paket_turu", "updated_at"])
            elif existing:
                if existing.kalem_id == kalem_id:
                    return None, {"error": "Bu deneme paketi zaten sözleşmede mevcut"}
                force_ucretsiz = (existing.net_tutar or 0) == 0
                if not kalem_data.get("replace_confirmed"):
                    mesaj = (
                        f'Mevcut deneme paketi "{existing.kalem_adi}" kaldırılıp yeni paket eklenecek.'
                    )
                    if force_ucretsiz:
                        mesaj += " Yeni paket de ücretsiz uygulanacak."
                    mesaj += " Onay için replace_confirmed gönderin."
                    return None, {
                        "error": mesaj,
                        "code": "deneme_degistirme_onayi_gerekli",
                        "mevcut_kalem_adi": existing.kalem_adi,
                        "ucretsiz_korunacak": force_ucretsiz,
                    }
                self._remove_kalem_internal(
                    sozlesme,
                    existing,
                    user,
                    f"Deneme paketi değiştirildi: {existing.kalem_adi} → {kalem_data['kalem_adi']}",
                )

        # Özel ders / ek hizmet: aynı paket tekrar eklenemez
        elif paket_kind == PaketTuru.OZEL_DERS:
            for k in SozlesmeKalemi.objects.filter(sozlesme=sozlesme):
                if (
                    self._classify_kalem(k, sozlesme) == PaketTuru.OZEL_DERS
                    and k.kalem_id == kalem_id
                ):
                    return None, {"error": "Bu özel ders paketi zaten sözleşmede mevcut"}
        elif storage_turu in (KalemTuru.EK_HIZMET, KalemTuru.EK_HIZMET_SATISI):
            mevcut = SozlesmeKalemi.objects.filter(
                sozlesme=sozlesme,
                kalem_turu=storage_turu,
                kalem_id=kalem_id,
            ).exists()
            if mevcut:
                return None, {"error": "Bu ek hizmet zaten sözleşmede mevcut"}

        k_fiyat = self._kalem_fiyat_from_payload(kalem_data)
        if force_ucretsiz:
            k_fiyat = hesapla_kalem_fiyat(0, kalem_data.get("kdv_orani", 0) or 0, net_tutar=0)
        k_brut = k_fiyat["brut_tutar"]
        k_kalem_net = k_fiyat["net_tutar"]
        k_indirim = k_fiyat["indirim_tutari"]

        kalem = SozlesmeKalemi.objects.create(
            sozlesme=sozlesme,
            kalem_turu=storage_turu,
            kalem_id=kalem_data["kalem_id"],
            kalem_adi=kalem_data["kalem_adi"],
            brut_tutar=k_brut,
            kdv_orani=k_fiyat["kdv_orani"],
            kdv_tutari=k_fiyat["kdv_tutari"],
            kdv_dahil_tutar=k_brut,
            indirim_orani=k_fiyat["indirim_orani"],
            indirim_tutari=k_indirim,
            net_tutar=k_kalem_net,
        )

        # Sözleşme tutarlarını güncelle
        eski_net = sozlesme.net_tutar
        sozlesme.brut_tutar += k_brut
        sozlesme.kdv_tutari += k_fiyat["kdv_tutari"]
        sozlesme.kdv_dahil_tutar += k_brut
        sozlesme.toplam_indirim_tutari += k_indirim
        sozlesme.net_tutar += k_kalem_net
        sozlesme.save(
            update_fields=[
                "brut_tutar",
                "kdv_tutari",
                "kdv_dahil_tutar",
                "toplam_indirim_tutari",
                "net_tutar",
                "updated_at",
            ]
        )

        if sozlesme.durum == SozlesmeDurum.AKTIF:
            self._fark_dagit(sozlesme, k_kalem_net)
        else:
            self.taksit_service.recreate_plan(
                sozlesme=sozlesme,
                taksit_sayisi=sozlesme.taksit_sayisi,
                ilk_odeme_tarihi=sozlesme.ilk_odeme_tarihi or sozlesme.baslangic_tarihi,
                periyot=sozlesme.taksit_periyodu,
            )

        self.gecmis_repo.create(
            {
                "sozlesme": sozlesme,
                "islem_turu": GecmisIslemTuru.KALEM_EKLEME,
                "eski_deger": {"net_tutar": eski_net},
                "yeni_deger": {
                    "net_tutar": sozlesme.net_tutar,
                    "eklenen_kalem": kalem_data["kalem_adi"],
                    "kalem_tutar": k_kalem_net,
                },
                "aciklama": f'Kalem eklendi: {kalem_data["kalem_adi"]} (+{k_kalem_net} TL)',
                "islem_yapan": user,
            }
        )

        return kalem, None

    # ─── KALEM ÇIKAR ─────────────────────
    def kalem_cikar(self, kalem_id, user=None):
        """Sözleşmeden kalem çıkarır. Ana paket kalemi çıkarılamaz."""
        try:
            kalem = SozlesmeKalemi.objects.select_related('sozlesme').get(id=kalem_id)
        except SozlesmeKalemi.DoesNotExist:
            return None, {'error': 'Kalem bulunamadı'}

        sozlesme = kalem.sozlesme

        if sozlesme.durum not in [SozlesmeDurum.TASLAK, SozlesmeDurum.AKTIF]:
            return None, {'error': 'Sadece taslak veya aktif sözleşmelerden kalem çıkarılabilir'}

        if kalem.kalem_turu == KalemTuru.PAKET:
            return None, {'error': 'Ana paket kalemi çıkarılamaz'}

        kalem_net = kalem.net_tutar
        kalem_adi = kalem.kalem_adi
        eski_net = sozlesme.net_tutar

        sozlesme.brut_tutar -= kalem.brut_tutar
        sozlesme.kdv_tutari -= kalem.kdv_tutari
        sozlesme.kdv_dahil_tutar -= kalem.brut_tutar
        sozlesme.toplam_indirim_tutari -= kalem.indirim_tutari
        sozlesme.net_tutar -= kalem_net
        sozlesme.save(update_fields=[
            'brut_tutar', 'kdv_tutari', 'kdv_dahil_tutar',
            'toplam_indirim_tutari', 'net_tutar', 'updated_at',
        ])

        kalem.delete()

        if sozlesme.durum == SozlesmeDurum.AKTIF:
            self._fark_dagit(sozlesme, -kalem_net)
        else:
            self.taksit_service.recreate_plan(
                sozlesme=sozlesme,
                taksit_sayisi=sozlesme.taksit_sayisi,
                ilk_odeme_tarihi=sozlesme.ilk_odeme_tarihi or sozlesme.baslangic_tarihi,
                periyot=sozlesme.taksit_periyodu,
            )

        self.gecmis_repo.create({
            'sozlesme': sozlesme,
            'islem_turu': GecmisIslemTuru.KALEM_CIKARMA,
            'eski_deger': {'net_tutar': eski_net},
            'yeni_deger': {
                'net_tutar': sozlesme.net_tutar,
                'cikarilan_kalem': kalem_adi,
                'kalem_tutar': kalem_net,
            },
            'aciklama': f'Kalem çıkarıldı: {kalem_adi} (-{kalem_net} TL)',
            'islem_yapan': user,
        })

        return {'removed': True}, None

    # ─── FARK DAĞITIM (Kalan taksitlere) ─
    def _fark_dagit(self, sozlesme, fark_tutar):
        """Kalan ödenmemiş taksitlere farkı eşit dağıtır — Integer-Only"""
        from apps.odeme_takip.domain.models import Taksit
        from apps.odeme_takip.domain.enums import TaksitDurum

        kalan_taksitler = list(
            Taksit.objects.filter(
                sozlesme_id=sozlesme.id,
                durum__in=[TaksitDurum.BEKLEMEDE, TaksitDurum.GECIKTI, TaksitDurum.KISMI_ODENDI],
            ).order_by('taksit_no')
        )

        if not kalan_taksitler:
            return

        adet = len(kalan_taksitler)
        ek_per_taksit = fark_tutar // adet
        fark_kalan = fark_tutar - (ek_per_taksit * adet)

        for i, taksit in enumerate(kalan_taksitler):
            ek = ek_per_taksit
            if i == adet - 1:
                ek += fark_kalan

            taksit.tutar += ek
            taksit.kalan_tutar += ek
            taksit.save(update_fields=['tutar', 'kalan_tutar'])

    # ─── SÖZLEŞME NO ÜRETİCİ ────────────
    def _generate_sozlesme_no(self, egitim_yili):
        """SZL-2526-0001 formatında otomatik no üret"""
        prefix = f"SZL-{str(egitim_yili.baslangic_yil)[-2:]}{str(egitim_yili.bitis_yil)[-2:]}"
        son_sira = self.repo.get_son_sira_no(egitim_yili)
        yeni_sira = son_sira + 1
        return f"{prefix}-{yeni_sira:04d}"

    # ─── VALIDASYON ──────────────────────
    def _validate_create(self, data):
        errors = {}
        if not data.get('ogrenci_id'):
            errors['ogrenci_id'] = 'Öğrenci seçilmedi'
        if not data.get('egitim_yili_id'):
            errors['egitim_yili_id'] = 'Eğitim yılı zorunlu'

        # Aynı öğrenci+eğitim yılında aktif sözleşme kontrolü
        if data.get('ogrenci_id') and data.get('egitim_yili_id'):
            from apps.odeme_takip.domain.enums import SozlesmeDurum
            aktif_durumlar = [SozlesmeDurum.TASLAK, SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS]
            mevcut = Sozlesme.objects.filter(
                ogrenci_id=data['ogrenci_id'],
                egitim_yili_id=data['egitim_yili_id'],
                durum__in=aktif_durumlar,
            ).first()
            if mevcut:
                errors['ogrenci_id'] = (
                    f'Bu öğrencinin bu eğitim yılında zaten bir sözleşmesi var '
                    f'({mevcut.sozlesme_no}). Mevcut sözleşme üzerinden devam edin.'
                )
                # İstemci mevcut sözleşmeye yönlenebilsin (çift tıklama / yarım UI yanıtı)
                errors['existing_id'] = mevcut.id
        if not data.get('kurum_id'):
            errors['kurum_id'] = 'Kurum zorunlu'
        if not data.get('sube_id'):
            errors['sube_id'] = 'Şube zorunlu'
        if not data.get('baslangic_tarihi'):
            errors['baslangic_tarihi'] = 'Başlangıç tarihi zorunlu'
        if not data.get('bitis_tarihi'):
            errors['bitis_tarihi'] = 'Bitiş tarihi zorunlu'
        elif data.get('baslangic_tarihi') and data.get('bitis_tarihi'):
            if str(data['bitis_tarihi']) < str(data['baslangic_tarihi']):
                errors['bitis_tarihi'] = 'Bitiş tarihi başlangıçtan önce olamaz'
        # paket_turu/paket_id/paket_adi: sadece ek hizmetlerle de sözleşme yapılabilir
        has_paket = bool(data.get('paket_id'))
        has_kalemler = bool(data.get('kalemler'))
        if not has_paket and not has_kalemler:
            errors['paket_id'] = 'En az bir paket veya ek hizmet seçilmeli'
        brut = data.get('brut_tutar')
        if brut is None:
            errors['brut_tutar'] = 'Brüt tutar zorunlu'
        elif int(brut) < 0:
            errors['brut_tutar'] = 'Brüt tutar 0 veya üstü olmalı'
        mali_hesap_id = data.get('mali_hesap_id')
        sube_id = data.get('sube_id')
        if mali_hesap_id and sube_id:
            from apps.finans.domain.financial_account import MaliHesap
            if not MaliHesap.objects.filter(
                id=mali_hesap_id, sube_id=sube_id, aktif_mi=True, silindi_mi=False,
            ).exists():
                errors['mali_hesap_id'] = 'Seçilen mali hesap bu şubeye ait değil'

        from apps.odeme_takip.domain.enums import OdemeTuru

        if data.get('odeme_turu') == OdemeTuru.CEK_SENET:
            if data.get('mali_hesap_id') or data.get('odeme_yontemi_id'):
                errors['odeme_turu'] = 'Çek/senet sözleşmesinde üst düzey mali hesap ve ödeme yöntemi kullanılmaz'
        elif (
            data.get('odeme_turu') in (OdemeTuru.PESIN, OdemeTuru.TAKSITLI)
            and not data.get('odeme_yontemi_id')
        ):
            errors['odeme_yontemi_id'] = 'Ödeme yöntemi zorunludur'
        return errors if errors else None
