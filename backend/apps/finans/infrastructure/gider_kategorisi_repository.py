"""
Gider Kategorisi Repository
Veritabanı erişim katmanı — tüm ORM sorguları burada.
"""
from django.utils import timezone

from apps.finans.domain.gider_kategorisi import GiderKategorisi

_SENTINEL = object()


class GiderKategorisiRepository:
    """
    GiderKategorisi entity'si için veritabanı operasyonları.
    Soft delete desteği dahildir.
    """

    # ─── READ ────────────────────────────────────

    @staticmethod
    def get_by_id(pk):
        """ID ile aktif (silinmemiş) kaydı getirir."""
        try:
            return GiderKategorisi.objects.select_related(
                'kurum', 'parent',
            ).get(pk=pk)
        except GiderKategorisi.DoesNotExist:
            return None

    @staticmethod
    def get_by_kurum(kurum_id, sube_id=None):
        """Kuruma (ve opsiyonel şubeye) ait tüm aktif kategorileri döndürür."""
        qs = GiderKategorisi.objects.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        return qs.select_related('kurum', 'sube', 'parent').order_by('siralama', 'ad')

    @staticmethod
    def get_ana_kategoriler(kurum_id, sube_id=None):
        """Kuruma ait ana kategorileri (parent=None) döndürür."""
        qs = GiderKategorisi.objects.filter(
            kurum_id=kurum_id,
            parent__isnull=True,
        )
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        return qs.select_related('kurum').order_by('siralama', 'ad')

    @staticmethod
    def get_alt_kategoriler(parent_id):
        """Bir ana kategorinin alt kategorilerini döndürür."""
        return GiderKategorisi.objects.filter(
            parent_id=parent_id,
        ).select_related('kurum', 'parent').order_by('siralama', 'ad')

    @staticmethod
    def get_aktif_by_kurum(kurum_id):
        """Sadece aktif kategorileri döndürür."""
        return GiderKategorisi.objects.filter(
            kurum_id=kurum_id,
            aktif_mi=True,
        ).order_by('siralama', 'ad')

    @staticmethod
    def get_tree(kurum_id, sube_id=None):
        """Kuruma ait tüm kategorileri ağaç için döndürür."""
        qs = GiderKategorisi.objects.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        return qs.select_related('parent').order_by('siralama', 'ad')

    @staticmethod
    def exists_by_sube_parent_ad(sube_id, parent_id, ad, exclude_id=None):
        qs = GiderKategorisi.objects.filter(sube_id=sube_id, parent_id=parent_id, ad=ad)
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)
        return qs.exists()

    @staticmethod
    def count_by_sube(sube_id):
        return GiderKategorisi.objects.filter(sube_id=sube_id).count()

    @staticmethod
    def get_by_sube_ad(sube_id, ad, parent_id=_SENTINEL):
        qs = GiderKategorisi.objects.filter(sube_id=sube_id, ad=ad)
        if parent_id is not _SENTINEL:
            qs = qs.filter(parent_id=parent_id)
        return qs.first()

    @staticmethod
    def exists_by_kurum_parent_ad(kurum_id, parent_id, ad, exclude_id=None):
        """
        Aynı kurum + parent + ad kombinasyonu var mı?
        Uniqueness kontrolü.
        """
        qs = GiderKategorisi.objects.filter(
            kurum_id=kurum_id,
            parent_id=parent_id,
            ad=ad,
        )
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)
        return qs.exists()

    @staticmethod
    def count_by_kurum(kurum_id):
        """Kuruma ait toplam kategori sayısı."""
        return GiderKategorisi.objects.filter(kurum_id=kurum_id).count()

    @staticmethod
    def count_alt_kategoriler(parent_id):
        """Bir ana kategorinin alt kategori sayısı."""
        return GiderKategorisi.objects.filter(parent_id=parent_id).count()

    # ─── WRITE ───────────────────────────────────

    @staticmethod
    def create(data):
        """Yeni kategori oluşturur."""
        return GiderKategorisi.objects.create(**data)

    @staticmethod
    def bulk_create(items):
        """Toplu kategori oluşturur (seed işlemi için)."""
        return GiderKategorisi.objects.bulk_create(items)

    @staticmethod
    def update(instance, data):
        """Mevcut kaydı günceller."""
        for key, value in data.items():
            setattr(instance, key, value)
        instance.save(update_fields=list(data.keys()) + ['updated_at'])
        return instance

    @staticmethod
    def soft_delete(instance):
        """Soft delete yapar."""
        instance.soft_delete()
        return instance

    @staticmethod
    def toggle_aktif(instance):
        """Aktif/pasif durumunu tersine çevirir."""
        instance.aktif_mi = not instance.aktif_mi
        instance.save(update_fields=['aktif_mi', 'updated_at'])
        return instance
