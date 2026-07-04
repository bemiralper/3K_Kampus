"""
Gelir Kaydı Repository — Veritabanı erişim katmanı
"""
from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum, Q

from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.constants.cari_types import GelirDurum


class GelirKaydiRepository:
    """GelirKaydi entity için CRUD operasyonları."""

    @staticmethod
    def get_by_id(gelir_id):
        try:
            return GelirKaydi.objects.select_related(
                'cari_hesap', 'gelir_kategorisi', 'mali_hesap', 'odeme_yontemi',
                'sube', 'olusturan'
            ).get(pk=gelir_id)
        except GelirKaydi.DoesNotExist:
            return None

    @staticmethod
    def get_by_kurum(kurum_id, filtreler=None):
        """Kuruma ait gelir kayıtlarını filtreli listeler."""
        qs = GelirKaydi.objects.filter(kurum_id=kurum_id).select_related(
            'cari_hesap', 'gelir_kategorisi', 'sube', 'mali_hesap'
        )
        if filtreler:
            if filtreler.get('durum'):
                qs = qs.filter(durum=filtreler['durum'])
            if filtreler.get('cari_hesap_id'):
                qs = qs.filter(cari_hesap_id=filtreler['cari_hesap_id'])
            if filtreler.get('sube_id'):
                qs = qs.filter(sube_id=filtreler['sube_id'])
            if filtreler.get('baslangic'):
                qs = qs.filter(fatura_tarihi__gte=filtreler['baslangic'])
            if filtreler.get('bitis'):
                qs = qs.filter(fatura_tarihi__lte=filtreler['bitis'])
            if filtreler.get('kategori_id'):
                qs = qs.filter(gelir_kategorisi_id=filtreler['kategori_id'])
            if filtreler.get('odeme_yontemi_id'):
                qs = qs.filter(odeme_yontemi_id=filtreler['odeme_yontemi_id'])
            if filtreler.get('arama'):
                qs = qs.filter(
                    Q(fatura_no__icontains=filtreler['arama'])
                    | Q(aciklama__icontains=filtreler['arama'])
                    | Q(cari_hesap__unvan__icontains=filtreler['arama'])
                    | Q(gelir_kategorisi__ad__icontains=filtreler['arama'])
                )
        return qs

    @staticmethod
    def create(data: dict) -> GelirKaydi:
        return GelirKaydi.objects.create(**data)

    @staticmethod
    def update(gelir: GelirKaydi, data: dict) -> GelirKaydi:
        for key, value in data.items():
            setattr(gelir, key, value)
        gelir.save()
        return gelir

    @staticmethod
    def soft_delete(gelir: GelirKaydi) -> GelirKaydi:
        gelir.silindi_mi = True
        gelir.silinme_tarihi = timezone.now()
        gelir.save(update_fields=['silindi_mi', 'silinme_tarihi', 'updated_at'])
        return gelir

    @staticmethod
    def tahsil_edilen_guncelle(gelir: GelirKaydi):
        """Gelire ait tüm tahsilatların toplamını yeniden hesaplar (ileride kullanılacak)."""
        # Şimdilik gelir doğrudan tahsil_edilen olarak güncelleniyor
        # İleride GelirTahsilat modeli eklenirse burada hesaplanacak
        return gelir

    @staticmethod
    def ozet_istatistikler(kurum_id, egitim_yili_id=None, sube_id=None):
        """Dashboard için gelir özet istatistikleri."""
        qs = GelirKaydi.objects.filter(kurum_id=kurum_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)

        return {
            'toplam_gelir': qs.exclude(durum=GelirDurum.IPTAL).aggregate(
                t=Sum('net_tutar'))['t'] or Decimal('0.00'),
            'toplam_tahsil': qs.exclude(durum=GelirDurum.IPTAL).aggregate(
                t=Sum('tahsil_edilen'))['t'] or Decimal('0.00'),
            'bekleyen_sayi': qs.filter(
                durum__in=[GelirDurum.ONAYLANDI, GelirDurum.KISMI_TAHSIL]
            ).count(),
        }
