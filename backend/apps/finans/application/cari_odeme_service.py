"""
Cari Ödeme Service — Serbest Ödeme / Erken Ödeme
Gider kaydına bağlı olmadan doğrudan cari hesaba ödeme yapılmasını sağlar.
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.finans.application.islem_masrafi_service import IslemMasrafiService
from apps.finans.domain.islem_masrafi import IslemMasrafiKaynakTipi
from apps.finans.infrastructure.cari_hesap_repository import CariHesapRepository
from apps.finans.infrastructure.cari_hareket_repository import CariHareketRepository
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.constants.cari_types import CariHareketTuru, CariHareketYonu
from apps.finans.constants.hareket_types import HareketYonu, HareketKaynagi
from apps.egitim_yili.domain.models import EgitimYili


class CariOdemeService:
    """
    Serbest (gider-bağımsız) ödeme iş kuralları.
    
    Kullanım alanları:
    - Gider kaydı olmadan tedarikçiye direkt ödeme
    - Avans / erken ödeme
    - Artı bakiye oluşturma
    """

    def __init__(self):
        self.cari_hareket_service = CariHareketService()
        self.bakiye_service = BakiyeHareketiService()
        self.masraf_service = IslemMasrafiService()
        self.hesap_repo = CariHesapRepository
        self.hareket_repo = CariHareketRepository

    @transaction.atomic
    def serbest_odeme_yap(self, data: dict):
        """
        Gider kaydına bağlı olmadan cari hesaba ödeme yapar.
        
        1. Cari hesap validasyonu
        2. BakiyeHareketi oluştur (ÇIKIŞ — kasadan para çıkıyor)
        3. Cari hareket oluştur (BORC — tedarikçiye ödeme yapıyoruz)
        
        Returns: (dict, None) veya (None, error_dict)
        """
        errors = self._validate(data)
        if errors:
            return None, errors

        cari_hesap_id = data['cari_hesap_id']
        kurum_id = data['kurum_id']
        tutar = Decimal(str(data['tutar']))
        odeme_tarihi = data.get('odeme_tarihi', timezone.now().date())
        aciklama = data.get('aciklama', '')
        mali_hesap_id = data['mali_hesap_id']
        odeme_yontemi_id = data.get('odeme_yontemi_id')

        hesap = self.hesap_repo.get_by_id(cari_hesap_id)

        # Aktif şube — view zorunlu şube bağlamı sağlar
        sube_id = data.get('sube_id')
        if not sube_id:
            return None, {'genel': 'Şube bağlamı zorunludur.'}

        egitim_yili_id = data.get('egitim_yili_id')
        if not egitim_yili_id:
            aktif_yil = EgitimYili.objects.filter(aktif_mi=True).first()
            if not aktif_yil:
                return None, {'genel': 'Aktif eğitim yılı bulunamadı. Lütfen eğitim yılı tanımlayın.'}
            egitim_yili_id = aktif_yil.pk

        # Tutar — bakiye hareketi IntegerField olduğu için int'e çevir
        tutar_int = int(tutar)

        # 1. BakiyeHareketi (ÇIKIŞ — kasadan para çıkıyor)
        hareket_aciklama = f"Serbest ödeme: {hesap.gorunen_ad or hesap.unvan} — {tutar} ₺"
        if aciklama:
            hareket_aciklama += f" ({aciklama})"

        bakiye_hareket = self.bakiye_service.hareket_olustur(
            mali_hesap_id=mali_hesap_id,
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            tutar=tutar_int,
            yon=HareketYonu.CIKIS,
            kaynak=HareketKaynagi.AVANS,
            islem_tarihi=odeme_tarihi,
            kaynak_id=cari_hesap_id,
            aciklama=hareket_aciklama,
        )

        # 2. Cari hareket (BORC — borcumuz azalıyor / avans oluşuyor)
        cari_hareket = self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=cari_hesap_id,
            kurum_id=kurum_id,
            tutar=tutar,
            yon=CariHareketYonu.BORC,
            islem_turu=CariHareketTuru.ODEME,
            islem_tarihi=odeme_tarihi,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            kaynak_tip='SerbestOdeme',
            kaynak_id=bakiye_hareket.pk,
            aciklama=hareket_aciklama,
            islem_yapan=data.get('islem_yapan'),
        )

        if odeme_yontemi_id:
            _, masraf_err = self.masraf_service.process_if_present(
                data,
                kaynak_tip=IslemMasrafiKaynakTipi.CARI_ODEME,
                kaynak_id=cari_hareket.pk,
                kurum_id=kurum_id,
                sube_id=sube_id,
                egitim_yili_id=egitim_yili_id,
                mali_hesap_id=mali_hesap_id,
                odeme_yontemi_id=odeme_yontemi_id,
                islem_tarihi=odeme_tarihi,
                ana_islem_aciklama=hareket_aciklama,
                islem_yapan=data.get('islem_yapan'),
            )
            if masraf_err:
                return None, {'genel': masraf_err}

        return {
            'detail': 'Ödeme başarıyla kaydedildi.',
            'tutar': str(tutar),
            'cari_hareket_id': cari_hareket.pk,
            'bakiye_hareketi_id': bakiye_hareket.pk,
            'yeni_bakiye': str(hesap.bakiye),
        }, None

    @transaction.atomic
    def serbest_odeme_iptal(self, cari_hareket_id: int):
        """
        Serbest ödemeyi iptal eder.
        
        Serbest ödeme yapıldığında:
          - BakiyeHareketi ÇIKIŞ (kasadan para çıktı)
          - CariHareket BORÇ (cari bakiye arttı)
        
        İptal:
          1. Ters BakiyeHareketi GİRİŞ (kasaya para geri giriyor)
          2. Ters CariHareket ALACAK (cari bakiye düşüyor)
        
        Returns: (dict, None) veya (None, error_dict)
        """
        from apps.finans.domain.cari_hareket import CariHareket

        # 1. Orijinal cari hareketi bul
        try:
            hareket = CariHareket.objects.get(pk=cari_hareket_id)
        except CariHareket.DoesNotExist:
            return None, {'genel': 'Cari hareket bulunamadı.'}

        # Sadece SerbestOdeme kaynaklı hareketler iptal edilebilir
        if hareket.kaynak_tip != 'SerbestOdeme':
            return None, {'genel': 'Bu hareket serbest ödeme değil, bu ekrandan iptal edilemez.'}

        # Zaten iptal edilmiş mi kontrol et (aynı kaynak_id ile ters hareket var mı)
        iptal_hareket = CariHareket.objects.filter(
            kaynak_tip='SerbestOdemeIptal',
            kaynak_id=hareket.pk,
        ).exists()
        if iptal_hareket:
            return None, {'genel': 'Bu ödeme zaten iptal edilmiş.'}

        self.masraf_service.iptal(
            IslemMasrafiKaynakTipi.CARI_ODEME,
            cari_hareket_id,
            islem_tarihi=timezone.localdate(),
        )

        tutar = hareket.tutar
        hesap = self.hesap_repo.get_by_id(hareket.cari_hesap_id)

        # 2. Ters BakiyeHareketi (GİRİŞ — kasaya para geri giriyor)
        #    Orijinal serbest ödemede kaynak_id = bakiye_hareketi.pk
        bakiye_hareketi_id = hareket.kaynak_id
        if bakiye_hareketi_id:
            try:
                orijinal_bh = BakiyeHareketi.objects.get(pk=bakiye_hareketi_id)
                ters_bh = self.bakiye_service.hareket_olustur(
                    mali_hesap_id=orijinal_bh.mali_hesap_id,
                    kurum_id=orijinal_bh.kurum_id,
                    sube_id=orijinal_bh.sube_id,
                    egitim_yili_id=orijinal_bh.egitim_yili_id,
                    tutar=int(tutar),
                    yon=HareketYonu.GIRIS,
                    kaynak=HareketKaynagi.TAHSILAT_IPTAL,
                    islem_tarihi=timezone.now().date(),
                    kaynak_id=hareket.pk,
                    aciklama=f'Serbest ödeme iptali: {hesap.gorunen_ad or hesap.unvan} — {tutar} ₺',
                )
            except BakiyeHareketi.DoesNotExist:
                pass  # Bakiye hareketi bulunamazsa devam et

        # 3. Ters CariHareket (ALACAK — cari bakiye düşüyor)
        ters_cari = self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=hareket.cari_hesap_id,
            kurum_id=hareket.kurum_id,
            tutar=tutar,
            yon=CariHareketYonu.ALACAK,
            islem_turu=CariHareketTuru.IADE,
            islem_tarihi=timezone.now().date(),
            sube_id=hareket.sube_id,
            egitim_yili_id=hareket.egitim_yili_id,
            kaynak_tip='SerbestOdemeIptal',
            kaynak_id=hareket.pk,
            aciklama=f'Serbest ödeme iptali: {tutar} ₺',
        )

        hesap.refresh_from_db()

        return {
            'detail': 'Serbest ödeme iptal edildi.',
            'tutar': str(tutar),
            'yeni_bakiye': str(hesap.bakiye),
        }, None

    def _validate(self, data):
        errors = {}

        if not data.get('cari_hesap_id'):
            errors['cari_hesap_id'] = 'Cari hesap zorunludur.'
            return errors

        hesap = self.hesap_repo.get_by_id(data['cari_hesap_id'])
        if not hesap:
            errors['cari_hesap_id'] = 'Cari hesap bulunamadı.'
            return errors

        if not hesap.aktif_mi:
            errors['cari_hesap_id'] = 'Pasif cari hesaba ödeme yapılamaz.'

        kurum_id = data.get('kurum_id')
        if not kurum_id:
            errors['kurum_id'] = 'Kurum zorunludur.'
        elif hesap.kurum_id != kurum_id:
            errors['cari_hesap_id'] = 'Cari hesap seçilen kuruma ait değil.'

        sube_id = data.get('sube_id')
        if sube_id and hesap.sube_id and hesap.sube_id != sube_id:
            errors['cari_hesap_id'] = 'Cari hesap seçilen şubeye ait değil.'

        mali_hesap_id = data.get('mali_hesap_id')
        if not mali_hesap_id:
            errors['mali_hesap_id'] = 'Mali hesap seçimi zorunludur.'
        else:
            from apps.finans.domain.financial_account import MaliHesap

            mali_hesap = (
                MaliHesap.objects.filter(id=mali_hesap_id, silindi_mi=False, aktif_mi=True)
                .select_related('sube')
                .first()
            )
            if not mali_hesap:
                errors['mali_hesap_id'] = 'Mali hesap bulunamadı veya pasif.'
            elif kurum_id and mali_hesap.sube.kurum_id != kurum_id:
                errors['mali_hesap_id'] = 'Mali hesap seçilen kuruma ait değil.'
            elif sube_id and mali_hesap.sube_id != sube_id:
                errors['mali_hesap_id'] = 'Mali hesap seçilen şubeye ait değil.'

        tutar = data.get('tutar')
        if not tutar or Decimal(str(tutar)) <= Decimal('0'):
            errors['tutar'] = 'Ödeme tutarı sıfırdan büyük olmalıdır.'

        if not data.get('odeme_tarihi'):
            errors['odeme_tarihi'] = 'Ödeme tarihi zorunludur.'

        return errors if errors else None
