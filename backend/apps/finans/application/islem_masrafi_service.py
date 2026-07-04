"""
İşlem Masrafı Service — banka/POS kesintilerini gider olarak kaydetme.

Akış:
1. Ana işlem (tahsilat/gelir tahsilat/gider ödeme) kaydedilir
2. kesinti_tutar > 0 ise otomatik GiderKaydi + GiderOdeme + BakiyeHareketi (CIKIS)
3. Mali hesap net etkisi: tahsilatta GIRIS - kesinti; gider ödemede CIKIS + kesinti
"""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.finans.application.gider_kategorisi_service import GiderKategorisiService
from apps.finans.constants.gider_types import GiderDurum, OdemeDurum
from apps.finans.constants.hareket_types import HareketKaynagi, HareketYonu
from apps.finans.constants.kesinti_types import (
    KesintiTuru,
    KESINTI_ALT_KATEGORI,
    islem_masrafi_gerekli,
)
from apps.finans.domain.islem_masrafi import (
    IslemMasrafi,
    IslemMasrafiDurum,
    IslemMasrafiKaynakTipi,
)
from apps.finans.infrastructure.gider_odeme_repository import GiderOdemeRepository
from apps.finans.infrastructure.gider_repository import GiderKaydiRepository


class IslemMasrafiService:
    """Ödeme/tahsilat işlemlerindeki banka masraflarını yönetir."""

    def __init__(self):
        self.bakiye_service = BakiyeHareketiService()
        self.gider_repo = GiderKaydiRepository
        self.odeme_repo = GiderOdemeRepository
        self.kategori_service = GiderKategorisiService()

    @staticmethod
    def extract_from_data(data: dict) -> dict | None:
        """İstek gövdesinden masraf alanlarını çıkarır."""
        nested = data.get('islem_masrafi') or {}
        kesinti_turu = (
            data.get('kesinti_turu')
            or nested.get('kesinti_turu')
            or ''
        ).strip()
        raw_tutar = data.get('kesinti_tutar', nested.get('kesinti_tutar'))
        kesinti_aciklama = (
            data.get('kesinti_aciklama')
            or nested.get('kesinti_aciklama')
            or ''
        ).strip()

        if raw_tutar in (None, '', 0, '0'):
            return None

        try:
            kesinti_tutar = Decimal(str(raw_tutar))
        except (InvalidOperation, TypeError, ValueError):
            return {'error': 'Geçersiz kesinti tutarı.'}

        if kesinti_tutar <= Decimal('0'):
            return None

        if not kesinti_turu:
            return {'error': 'Kesinti türü seçilmelidir.'}
        if kesinti_turu not in KesintiTuru.get_values():
            return {'error': f'Geçersiz kesinti türü: {kesinti_turu}'}

        return {
            'kesinti_turu': kesinti_turu,
            'kesinti_tutar': kesinti_tutar,
            'kesinti_aciklama': kesinti_aciklama,
        }

    @staticmethod
    def validate_for_payment(odeme_yontemi_tip, mali_hesap_tip, fee_data):
        """Masraf alanları doluysa ödeme yöntemi uygunluğunu kontrol eder."""
        if not fee_data or fee_data.get('error'):
            return fee_data.get('error') if fee_data and fee_data.get('error') else None

        if not islem_masrafi_gerekli(odeme_yontemi_tip, mali_hesap_tip):
            return 'Seçilen ödeme yöntemi için işlem masrafı girilemez.'
        return None

    @transaction.atomic
    def olustur(
        self,
        *,
        kaynak_tip: str,
        kaynak_id: int,
        kurum_id: int,
        sube_id,
        egitim_yili_id,
        mali_hesap_id: int,
        odeme_yontemi_id: int,
        islem_tarihi,
        fee_data: dict,
        ana_islem_aciklama: str = '',
        islem_yapan=None,
    ):
        """
        İşlem masrafını gider olarak kaydeder.
        Returns: (IslemMasrafi, None) veya (None, error_str)
        """
        if not fee_data or fee_data.get('error'):
            return None, fee_data.get('error') if fee_data else None

        kesinti_turu = fee_data['kesinti_turu']
        kesinti_tutar = fee_data['kesinti_tutar']
        kesinti_aciklama = fee_data.get('kesinti_aciklama', '')

        kategori, kat_err = self.kategori_service.get_banka_gider_kategorisi(
            kurum_id, sube_id, kesinti_turu,
        )
        if kat_err:
            return None, kat_err

        kesinti_label = KesintiTuru.get_label(kesinti_turu)
        fatura_no = self._generate_masraf_fatura_no(kurum_id)
        aciklama_parts = [f'İşlem masrafı: {kesinti_label}']
        if ana_islem_aciklama:
            aciklama_parts.append(ana_islem_aciklama)
        if kesinti_aciklama:
            aciklama_parts.append(kesinti_aciklama)
        gider_aciklama = ' — '.join(aciklama_parts)

        gider = self.gider_repo.create({
            'kurum_id': kurum_id,
            'sube_id': sube_id,
            'cari_hesap_id': None,
            'gider_kategorisi_id': kategori.id,
            'mali_hesap_id': mali_hesap_id,
            'odeme_yontemi_id': odeme_yontemi_id,
            'egitim_yili_id': egitim_yili_id,
            'fatura_no': fatura_no,
            'fatura_tarihi': islem_tarihi,
            'vade_tarihi': islem_tarihi,
            'aciklama': gider_aciklama,
            'brut_tutar': kesinti_tutar,
            'kdv_orani': 0,
            'kdv_tutar': Decimal('0.00'),
            'net_tutar': kesinti_tutar,
            'odenen_toplam': kesinti_tutar,
            'taksit_sayisi': 1,
            'durum': GiderDurum.ODENDI,
            'onay_tarihi': timezone.now(),
            'onaylayan': islem_yapan,
        })

        odeme = self.odeme_repo.create({
            'gider_kaydi_id': gider.pk,
            'odeme_yontemi_id': odeme_yontemi_id,
            'mali_hesap_id': mali_hesap_id,
            'tutar': kesinti_tutar,
            'odeme_tarihi': islem_tarihi,
            'aciklama': gider_aciklama,
            'islem_yapan': islem_yapan,
            'durum': OdemeDurum.TAMAMLANDI,
            'bakiyeden_mahsup': False,
        })

        bakiye_tutar = int(kesinti_tutar.to_integral_value())
        if bakiye_tutar <= 0:
            return None, 'Kesinti tutarı en az 1 TL olmalıdır.'

        hareket = self.bakiye_service.hareket_olustur(
            mali_hesap_id=mali_hesap_id,
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            yon=HareketYonu.CIKIS,
            tutar=bakiye_tutar,
            kaynak=HareketKaynagi.GIDER,
            islem_tarihi=islem_tarihi,
            kaynak_id=odeme.pk,
            aciklama=gider_aciklama,
            islem_yapan=islem_yapan,
        )

        odeme.bakiye_hareketi_id = hareket.pk
        odeme.save(update_fields=['bakiye_hareketi_id'])

        masraf = IslemMasrafi.objects.create(
            kaynak_tip=kaynak_tip,
            kaynak_id=kaynak_id,
            kesinti_turu=kesinti_turu,
            kesinti_tutar=kesinti_tutar,
            kesinti_aciklama=kesinti_aciklama,
            gider_kaydi=gider,
            gider_odeme=odeme,
            bakiye_hareketi=hareket,
            kurum_id=kurum_id,
            sube_id=sube_id,
            islem_yapan=islem_yapan,
            durum=IslemMasrafiDurum.AKTIF,
        )

        return masraf, None

    @transaction.atomic
    def iptal(self, kaynak_tip: str, kaynak_id: int, islem_tarihi=None, islem_yapan=None):
        """
        Ana işlem iptal edildiğinde bağlı masrafı geri alır.
        Returns: (IslemMasrafi, None) veya (None, error_str)
        """
        masraf = (
            IslemMasrafi.objects.select_related('gider_odeme', 'gider_kaydi')
            .filter(
                kaynak_tip=kaynak_tip,
                kaynak_id=kaynak_id,
                durum=IslemMasrafiDurum.AKTIF,
            )
            .first()
        )
        if not masraf:
            return None, None

        odeme = masraf.gider_odeme
        gider = masraf.gider_kaydi
        if not odeme or odeme.durum == OdemeDurum.IPTAL:
            masraf.durum = IslemMasrafiDurum.IPTAL
            masraf.save(update_fields=['durum', 'updated_at'])
            return masraf, None

        iptal_tarihi = islem_tarihi or timezone.localdate()
        bakiye_tutar = masraf.bakiye_tutar

        self.bakiye_service.hareket_olustur(
            mali_hesap_id=odeme.mali_hesap_id,
            kurum_id=gider.kurum_id,
            sube_id=gider.sube_id,
            egitim_yili_id=gider.egitim_yili_id,
            yon=HareketYonu.GIRIS,
            tutar=bakiye_tutar,
            kaynak=HareketKaynagi.GIDER_IPTAL,
            islem_tarihi=iptal_tarihi,
            kaynak_id=odeme.pk,
            aciklama=f'İşlem masrafı iptali: {KesintiTuru.get_label(masraf.kesinti_turu)}',
            islem_yapan=islem_yapan,
        )

        self.odeme_repo.iptal_et(odeme)
        if gider:
            self.gider_repo.update(gider, {
                'durum': GiderDurum.IPTAL,
                'odenen_toplam': Decimal('0.00'),
            })

        masraf.durum = IslemMasrafiDurum.IPTAL
        masraf.save(update_fields=['durum', 'updated_at'])

        return masraf, None

    @staticmethod
    def get_by_kaynak(kaynak_tip: str, kaynak_id: int):
        return (
            IslemMasrafi.objects.filter(
                kaynak_tip=kaynak_tip,
                kaynak_id=kaynak_id,
                durum=IslemMasrafiDurum.AKTIF,
            )
            .select_related('gider_kaydi', 'gider_odeme')
            .first()
        )

    @staticmethod
    def serialize_masraf(masraf: IslemMasrafi | None) -> dict | None:
        if not masraf:
            return None
        return {
            'id': masraf.id,
            'kesinti_turu': masraf.kesinti_turu,
            'kesinti_turu_label': masraf.get_kesinti_turu_display(),
            'kesinti_tutar': str(masraf.kesinti_tutar),
            'kesinti_aciklama': masraf.kesinti_aciklama,
            'gider_kaydi_id': masraf.gider_kaydi_id,
            'gider_odeme_id': masraf.gider_odeme_id,
        }

    def process_if_present(
        self,
        data: dict,
        *,
        kaynak_tip: str,
        kaynak_id: int,
        kurum_id: int,
        sube_id,
        egitim_yili_id,
        mali_hesap_id,
        odeme_yontemi_id,
        islem_tarihi,
        ana_islem_aciklama: str = '',
        islem_yapan=None,
    ):
        """
        İstekte masraf varsa oluşturur; yoksa (None, None) döner.
        Hata durumunda (None, error_str).
        """
        if not mali_hesap_id or not odeme_yontemi_id:
            fee_data = self.extract_from_data(data)
            if fee_data and not fee_data.get('error'):
                return None, 'İşlem masrafı için mali hesap ve ödeme yöntemi zorunludur.'
            return None, None

        fee_data = self.extract_from_data(data)
        if not fee_data:
            return None, None
        if fee_data.get('error'):
            return None, fee_data['error']

        from apps.finans.domain.payment_method import OdemeYontemi
        from apps.finans.domain.financial_account import MaliHesap

        yontem = OdemeYontemi.objects.filter(id=odeme_yontemi_id).first()
        hesap = MaliHesap.objects.filter(id=mali_hesap_id).first()
        err = self.validate_for_payment(
            yontem.tip if yontem else None,
            hesap.tip if hesap else None,
            fee_data,
        )
        if err:
            return None, err

        return self.olustur(
            kaynak_tip=kaynak_tip,
            kaynak_id=kaynak_id,
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            mali_hesap_id=mali_hesap_id,
            odeme_yontemi_id=odeme_yontemi_id,
            islem_tarihi=islem_tarihi,
            fee_data=fee_data,
            ana_islem_aciklama=ana_islem_aciklama,
            islem_yapan=islem_yapan,
        )

    @staticmethod
    def _generate_masraf_fatura_no(kurum_id):
        now = timezone.now()
        prefix = f'MAS-{now.strftime("%Y%m")}-'
        from apps.finans.domain.gider_kaydi import GiderKaydi
        son = (
            GiderKaydi.objects
            .filter(kurum_id=kurum_id, fatura_no__startswith=prefix)
            .order_by('-fatura_no')
            .values_list('fatura_no', flat=True)
            .first()
        )
        sira = 0
        if son:
            try:
                sira = int(son.split('-')[-1])
            except (ValueError, IndexError):
                sira = 0
        return f'{prefix}{sira + 1:03d}'
