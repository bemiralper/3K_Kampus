"""
Gider Ödeme Service — İş kuralları katmanı
Ödeme kaydı oluşturma, iptal, BakiyeHareketi entegrasyonu.
Bakiyeden mahsup: Cari hesaptaki artı bakiyeden gider ödemesi yapılabilir.
"""
from decimal import Decimal
from django.db import transaction

from apps.finans.infrastructure.gider_odeme_repository import GiderOdemeRepository
from apps.finans.infrastructure.gider_repository import GiderKaydiRepository, GiderTaksitRepository
from apps.finans.infrastructure.cari_hesap_repository import CariHesapRepository
from apps.finans.application.gider_service import GiderService
from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.application.islem_masrafi_service import IslemMasrafiService
from apps.finans.domain.islem_masrafi import IslemMasrafiKaynakTipi
from apps.finans.constants.gider_types import OdemeDurum, GiderDurum
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

    @transaction.atomic
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

        errors = self._validate_odeme(data, bakiyeden_mahsup=bakiyeden_mahsup)
        if errors:
            return None, errors

        gider_id = data.get('gider_kaydi_id') or data.get('gider_kaydi')
        gider = self.gider_repo.get_by_id(gider_id if isinstance(gider_id, int) else gider_id.pk)

        tutar = data['tutar']

        if bakiyeden_mahsup:
            return self._bakiyeden_mahsup_yap(gider, tutar, data)
        else:
            return self._normal_odeme_yap(gider, tutar, data)

    @transaction.atomic
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
        Cari bakiyeden mahsup: Mali hesaptan para çıkmaz.
        Cari hesapta biriken artı bakiye (önceki serbest ödemeler, avanslar vb.)
        bu giderin borcu ile netleştirilir.
        """
        # Bakiye yeterliliği zaten _validate_odeme'de kontrol edildi

        # 1. GiderOdeme kaydı oluştur (mali_hesap & odeme_yontemi null)
        odeme_data = {
            'gider_kaydi_id': gider.pk,
            'gider_taksit_id': data.get('gider_taksit_id'),
            'odeme_yontemi_id': None,
            'mali_hesap_id': None,
            'tutar': tutar,
            'odeme_tarihi': data['odeme_tarihi'],
            'aciklama': data.get('aciklama', '') or f'Cari bakiyeden mahsup edildi',
            'islem_yapan': data.get('islem_yapan'),
            'durum': OdemeDurum.TAMAMLANDI,
            'bakiyeden_mahsup': True,
        }
        odeme = self.odeme_repo.create(odeme_data)

        # 2. BakiyeHareketi OLUŞTURULMAZ — kasadan/bankadan para çıkmıyor!

        # 3. Taksit bakiyesini güncelle (varsa)
        if data.get('gider_taksit_id'):
            taksit = self.taksit_repo.get_by_id(data['gider_taksit_id'])
            if taksit:
                self.taksit_repo.odenen_tutar_guncelle(taksit)

        # 4. GiderKaydi durumunu güncelle
        self.gider_service.durum_guncelle(gider)

        # 5. Cari hesapta ALACAK hareketi (mahsup — artı bakiyeyi düşürüyoruz)
        #    Serbest ödeme ile BORÇ yönünde bakiye artmıştı.
        #    Mahsup = o bakiyeyi tüketmek → ALACAK yönünde olmalı.
        #    bakiye = toplam_borc - toplam_alacak → ALACAK artınca bakiye düşer.
        self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=gider.cari_hesap_id,
            kurum_id=gider.kurum_id,
            tutar=tutar,
            yon=CariHareketYonu.ALACAK,
            islem_turu=CariHareketTuru.MAHSUP,
            islem_tarihi=data['odeme_tarihi'],
            sube_id=gider.sube_id,
            egitim_yili_id=gider.egitim_yili_id,
            kaynak_tip='GiderOdeme',
            kaynak_id=odeme.pk,
            aciklama=f'Bakiyeden mahsup: {gider.fatura_no or "Belgesiz"} — {tutar} ₺',
        )

        return odeme, None

    @transaction.atomic
    def odeme_iptal(self, odeme_id: int):
        """
        Ödemeyi iptal eder ve tüm bakiyeleri geri alır.
        Bakiyeden mahsup ödemelerde BakiyeHareketi oluşturulmaz, sadece cari hareket yapılır.
        Returns: (GiderOdeme, None) veya (None, error_dict)
        """
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

        # 2. BakiyeHareketi oluştur (sadece normal ödemelerde — mahsupta kasadan para çıkmamıştı)
        if not is_mahsup and odeme.mali_hesap_id:
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
        #    Normal ödeme: BORÇ yapılmıştı → iptalinde ALACAK
        #    Mahsup: ALACAK yapılmıştı → iptalinde BORÇ (bakiye geri yüklenir)
        if is_mahsup:
            iptal_yon = CariHareketYonu.BORC
        else:
            iptal_yon = CariHareketYonu.ALACAK

        islem_turu = CariHareketTuru.MAHSUP if is_mahsup else CariHareketTuru.IADE
        aciklama_cari = f'{"Mahsup" if is_mahsup else "Gider ödeme"} iptali: {gider.fatura_no or "Belgesiz"} — {tutar} ₺'
        self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=gider.cari_hesap_id,
            kurum_id=gider.kurum_id,
            tutar=tutar,
            yon=iptal_yon,
            islem_turu=islem_turu,
            islem_tarihi=odeme.odeme_tarihi,
            sube_id=gider.sube_id,
            egitim_yili_id=gider.egitim_yili_id,
            kaynak_tip='GiderOdeme',
            kaynak_id=odeme.pk,
            aciklama=aciklama_cari,
        )

        self.masraf_service.iptal(
            IslemMasrafiKaynakTipi.GIDER_ODEME,
            odeme.pk,
            islem_tarihi=odeme.odeme_tarihi,
            islem_yapan=None,
        )

        return odeme, None

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
            # Serbest bakiye yeterliliği kontrol et
            # Serbest bakiye = serbest_ödemeler - serbest_iptaller - mahsuplar
            cari_hesap = self.cari_hesap_repo.get_by_id(gider.cari_hesap_id)
            if cari_hesap:
                from django.db.models import Sum
                qs = cari_hesap.hareketler.all()
                serbest = qs.filter(
                    kaynak_tip='SerbestOdeme', islem_turu='odeme'
                ).aggregate(t=Sum('tutar'))['t'] or Decimal('0')
                iptaller = qs.filter(
                    kaynak_tip='SerbestOdemeIptal'
                ).aggregate(t=Sum('tutar'))['t'] or Decimal('0')
                mahsuplar = qs.filter(
                    islem_turu='mahsup'
                ).aggregate(t=Sum('tutar'))['t'] or Decimal('0')
                serbest_bakiye = serbest - iptaller - mahsuplar

                if tutar and serbest_bakiye <= 0:
                    errors['tutar'] = f'Cari hesapta mahsup edilecek serbest bakiye bulunmuyor. Serbest bakiye: {serbest_bakiye} ₺'
                elif tutar and tutar > serbest_bakiye:
                    errors['tutar'] = f'Mahsup tutarı serbest bakiyeden ({serbest_bakiye} ₺) fazla olamaz.'
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
