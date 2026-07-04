"""
Gider Ödeme Repository — Veritabanı erişim katmanı
"""
from decimal import Decimal
from django.db.models import Sum, Q

from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.constants.gider_types import OdemeDurum


class GiderOdemeRepository:
    """GiderOdeme entity için CRUD operasyonları."""

    @staticmethod
    def get_by_id(odeme_id):
        try:
            return GiderOdeme.objects.select_related(
                'gider_kaydi', 'gider_kaydi__cari_hesap',
                'gider_taksit', 'odeme_yontemi', 'mali_hesap', 'islem_yapan'
            ).get(pk=odeme_id)
        except GiderOdeme.DoesNotExist:
            return None

    @staticmethod
    def get_by_gider(gider_id):
        """Bir gider kaydının tüm ödemelerini getirir."""
        return GiderOdeme.objects.filter(
            gider_kaydi_id=gider_id,
        ).select_related('odeme_yontemi', 'mali_hesap', 'gider_taksit', 'islem_yapan').order_by('-odeme_tarihi')

    @staticmethod
    def get_by_taksit(taksit_id):
        """Bir taksite ait ödemeleri getirir."""
        return GiderOdeme.objects.filter(
            gider_taksit_id=taksit_id,
        ).select_related('odeme_yontemi', 'mali_hesap', 'islem_yapan').order_by('-odeme_tarihi')

    @staticmethod
    def create(data: dict) -> GiderOdeme:
        return GiderOdeme.objects.create(**data)

    @staticmethod
    def iptal_et(odeme: GiderOdeme) -> GiderOdeme:
        """Ödemeyi iptal et."""
        odeme.durum = OdemeDurum.IPTAL
        odeme.save(update_fields=['durum', 'updated_at'])
        return odeme

    @staticmethod
    def toplam_odeme_by_gider(gider_id):
        """Bir gider kaydının toplam ödemesini hesaplar (iptal hariç)."""
        return GiderOdeme.objects.filter(
            gider_kaydi_id=gider_id,
            durum=OdemeDurum.TAMAMLANDI,
        ).aggregate(toplam=Sum('tutar'))['toplam'] or Decimal('0.00')

    @staticmethod
    def son_odemeler(kurum_id, limit=10, cari_hesap_id=None, sube_id=None, egitim_yili_id=None):
        """Son yapılan ödemeleri listeler."""
        qs = GiderOdeme.objects.filter(
            gider_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.TAMAMLANDI,
        )
        if cari_hesap_id:
            qs = qs.filter(gider_kaydi__cari_hesap_id=cari_hesap_id)
        if sube_id:
            qs = qs.filter(
                Q(gider_kaydi__sube_id=sube_id) | Q(gider_kaydi__sube_id__isnull=True),
            )
        if egitim_yili_id:
            qs = qs.filter(
                Q(gider_kaydi__egitim_yili_id=egitim_yili_id)
                | Q(gider_kaydi__egitim_yili_id__isnull=True),
            )
        return qs.select_related(
            'gider_kaydi', 'gider_kaydi__cari_hesap',
            'odeme_yontemi', 'mali_hesap'
        ).order_by('-odeme_tarihi', '-created_at')[:limit]
