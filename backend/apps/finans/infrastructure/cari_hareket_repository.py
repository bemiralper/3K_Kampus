"""
Cari Hareket Repository — Veritabanı erişim katmanı
"""
from django.db.models import Sum, Q

from apps.finans.domain.cari_hareket import CariHareket
from apps.finans.constants.cari_types import CariHareketYonu


class CariHareketRepository:
    """CariHareket entity için CRUD operasyonları."""

    @staticmethod
    def get_by_id(hareket_id):
        try:
            return CariHareket.objects.select_related(
                'cari_hesap', 'kurum', 'sube', 'islem_yapan'
            ).get(pk=hareket_id)
        except CariHareket.DoesNotExist:
            return None

    @staticmethod
    def get_by_cari_hesap(hesap_id, filtreler=None):
        """Bir cari hesabın tüm hareketlerini listeler."""
        qs = CariHareket.objects.filter(
            cari_hesap_id=hesap_id
        ).select_related('kurum', 'sube', 'islem_yapan')

        if filtreler:
            if filtreler.get('islem_turu__in'):
                qs = qs.filter(islem_turu__in=filtreler['islem_turu__in'])
            elif filtreler.get('islem_turu'):
                qs = qs.filter(islem_turu=filtreler['islem_turu'])
            if filtreler.get('yon'):
                qs = qs.filter(yon=filtreler['yon'])
            if filtreler.get('baslangic'):
                qs = qs.filter(islem_tarihi__gte=filtreler['baslangic'])
            if filtreler.get('bitis'):
                qs = qs.filter(islem_tarihi__lte=filtreler['bitis'])

        return qs.order_by('-islem_tarihi', '-created_at')

    @staticmethod
    def get_by_kurum(kurum_id, filtreler=None, limit=None):
        """Kuruma ait tüm cari hareketleri listeler."""
        qs = CariHareket.objects.filter(
            kurum_id=kurum_id
        ).select_related('cari_hesap', 'sube', 'islem_yapan')

        if filtreler:
            if filtreler.get('cari_hesap_id'):
                qs = qs.filter(cari_hesap_id=filtreler['cari_hesap_id'])
            if filtreler.get('islem_turu'):
                qs = qs.filter(islem_turu=filtreler['islem_turu'])
            if filtreler.get('yon'):
                qs = qs.filter(yon=filtreler['yon'])
            if filtreler.get('baslangic'):
                qs = qs.filter(islem_tarihi__gte=filtreler['baslangic'])
            if filtreler.get('bitis'):
                qs = qs.filter(islem_tarihi__lte=filtreler['bitis'])

        qs = qs.order_by('-islem_tarihi', '-created_at')

        if limit:
            qs = qs[:limit]

        return qs

    @staticmethod
    def create(data: dict) -> CariHareket:
        """Yeni cari hareket oluşturur."""
        return CariHareket.objects.create(**data)

    @staticmethod
    def toplam_borc_alacak(hesap_id):
        """Bir cari hesabın toplam borç ve alacak tutarlarını hesaplar."""
        result = CariHareket.objects.filter(cari_hesap_id=hesap_id).aggregate(
            toplam_borc=Sum('tutar', filter=Q(yon=CariHareketYonu.BORC)),
            toplam_alacak=Sum('tutar', filter=Q(yon=CariHareketYonu.ALACAK)),
        )
        return {
            'toplam_borc': result['toplam_borc'] or 0,
            'toplam_alacak': result['toplam_alacak'] or 0,
        }
