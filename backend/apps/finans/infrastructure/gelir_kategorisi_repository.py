"""
Gelir Kategorisi Repository — Veritabanı erişim katmanı
"""
from apps.finans.domain.gelir_kategorisi import GelirKategorisi


class GelirKategorisiRepository:
    @staticmethod
    def get_by_id(pk):
        try:
            return GelirKategorisi.objects.select_related('kurum', 'parent').get(pk=pk)
        except GelirKategorisi.DoesNotExist:
            return None

    @staticmethod
    def get_by_kurum(kurum_id, sube_id=None):
        qs = GelirKategorisi.objects.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        return qs.select_related('kurum', 'sube', 'parent').order_by('siralama', 'ad')

    @staticmethod
    def get_ana_kategoriler(kurum_id, sube_id=None):
        qs = GelirKategorisi.objects.filter(kurum_id=kurum_id, parent__isnull=True)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        return qs.select_related('kurum').order_by('siralama', 'ad')

    @staticmethod
    def get_alt_kategoriler(parent_id):
        return GelirKategorisi.objects.filter(parent_id=parent_id).select_related(
            'kurum', 'parent'
        ).order_by('siralama', 'ad')

    @staticmethod
    def get_tree(kurum_id, sube_id=None):
        qs = GelirKategorisi.objects.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        return qs.select_related('parent').order_by('siralama', 'ad')

    @staticmethod
    def exists_by_sube_parent_ad(sube_id, parent_id, ad, exclude_id=None):
        qs = GelirKategorisi.objects.filter(sube_id=sube_id, parent_id=parent_id, ad=ad)
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)
        return qs.exists()

    @staticmethod
    def count_by_sube(sube_id):
        return GelirKategorisi.objects.filter(sube_id=sube_id).count()

    @staticmethod
    def create(data):
        return GelirKategorisi.objects.create(**data)

    @staticmethod
    def bulk_create(items):
        return GelirKategorisi.objects.bulk_create(items)

    @staticmethod
    def update(instance, data):
        for key, value in data.items():
            setattr(instance, key, value)
        instance.save(update_fields=list(data.keys()) + ['updated_at'])
        return instance

    @staticmethod
    def soft_delete(instance):
        instance.soft_delete()
        return instance

    @staticmethod
    def toggle_aktif(instance):
        instance.aktif_mi = not instance.aktif_mi
        instance.save(update_fields=['aktif_mi', 'updated_at'])
        return instance
