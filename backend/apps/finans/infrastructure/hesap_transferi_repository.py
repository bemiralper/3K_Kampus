"""
Hesap Transferi Repository
Veritabanı erişim katmanı — transferler immutable'dır: create-only.
"""
from apps.finans.domain.hesap_transferi import HesapTransferi


class HesapTransferiRepository:
    """HesapTransferi entity'si için veritabanı operasyonları."""

    @staticmethod
    def get_by_id(pk):
        try:
            return HesapTransferi.objects.select_related(
                'kaynak_hesap', 'hedef_hesap', 'kurum', 'sube', 'egitim_yili', 'islem_yapan',
            ).get(pk=pk)
        except HesapTransferi.DoesNotExist:
            return None

    @staticmethod
    def get_all(kurum_id, sube_id=None, egitim_yili_id=None, filters=None):
        qs = HesapTransferi.objects.filter(kurum_id=kurum_id).select_related(
            'kaynak_hesap', 'hedef_hesap', 'islem_yapan',
        )
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)

        filters = filters or {}
        if filters.get('mali_hesap_id'):
            from django.db.models import Q
            qs = qs.filter(
                Q(kaynak_hesap_id=filters['mali_hesap_id']) | Q(hedef_hesap_id=filters['mali_hesap_id'])
            )
        if filters.get('transfer_turu'):
            qs = qs.filter(transfer_turu=filters['transfer_turu'])
        if filters.get('baslangic'):
            qs = qs.filter(transfer_tarihi__gte=filters['baslangic'])
        if filters.get('bitis'):
            qs = qs.filter(transfer_tarihi__lte=filters['bitis'])

        return qs.order_by('-transfer_tarihi', '-created_at')

    @staticmethod
    def create(data):
        return HesapTransferi.objects.create(**data)
