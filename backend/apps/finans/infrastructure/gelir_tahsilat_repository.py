"""
Gelir Tahsilat Repository — Veritabanı erişim katmanı
"""
from decimal import Decimal
from django.db.models import Sum

from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.constants.gider_types import OdemeDurum


class GelirTahsilatRepository:
    """GelirTahsilat entity için CRUD operasyonları."""

    @staticmethod
    def get_by_id(tahsilat_id):
        try:
            return GelirTahsilat.objects.select_related(
                'gelir_kaydi', 'gelir_kaydi__cari_hesap',
                'odeme_yontemi', 'mali_hesap', 'islem_yapan'
            ).get(pk=tahsilat_id)
        except GelirTahsilat.DoesNotExist:
            return None

    @staticmethod
    def get_by_gelir(gelir_id):
        """Bir gelir kaydının tüm tahsilatlarını getirir."""
        return GelirTahsilat.objects.filter(
            gelir_kaydi_id=gelir_id,
        ).select_related(
            'odeme_yontemi', 'mali_hesap', 'islem_yapan'
        ).order_by('-tahsilat_tarihi')

    @staticmethod
    def create(data: dict) -> GelirTahsilat:
        return GelirTahsilat.objects.create(**data)

    @staticmethod
    def iptal_et(tahsilat: GelirTahsilat) -> GelirTahsilat:
        """Tahsilatı iptal et."""
        tahsilat.durum = OdemeDurum.IPTAL
        tahsilat.save(update_fields=['durum', 'updated_at'])
        return tahsilat

    @staticmethod
    def toplam_tahsilat_by_gelir(gelir_id):
        """Bir gelir kaydının toplam tahsilatını hesaplar (iptal hariç)."""
        return GelirTahsilat.objects.filter(
            gelir_kaydi_id=gelir_id,
            durum=OdemeDurum.TAMAMLANDI,
        ).aggregate(toplam=Sum('tutar'))['toplam'] or Decimal('0.00')

    @staticmethod
    def son_tahsilatlar(kurum_id, limit=10, cari_hesap_id=None):
        """Son yapılan tahsilatları listeler."""
        qs = GelirTahsilat.objects.filter(
            gelir_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.TAMAMLANDI,
        )
        if cari_hesap_id:
            qs = qs.filter(gelir_kaydi__cari_hesap_id=cari_hesap_id)
        return qs.select_related(
            'gelir_kaydi', 'gelir_kaydi__cari_hesap',
            'odeme_yontemi', 'mali_hesap'
        ).order_by('-tahsilat_tarihi', '-created_at')[:limit]
