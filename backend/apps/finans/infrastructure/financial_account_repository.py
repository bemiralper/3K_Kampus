"""
Mali Hesap Repository
Veritabanı erişim katmanı — tüm ORM sorguları burada.
"""
from django.utils import timezone

from apps.finans.domain.financial_account import MaliHesap


class MaliHesapRepository:
    """
    MaliHesap entity'si için veritabanı operasyonları.
    Soft delete desteği dahildir.
    """

    # ─── READ ────────────────────────────────────

    @staticmethod
    def get_by_id(pk):
        """ID ile aktif (silinmemiş) kaydı getirir."""
        try:
            return MaliHesap.objects.get(pk=pk)
        except MaliHesap.DoesNotExist:
            return None

    @staticmethod
    def get_by_id_with_deleted(pk):
        """ID ile kaydı getirir (silinmiş dahil)."""
        try:
            return MaliHesap.all_objects.get(pk=pk)
        except MaliHesap.DoesNotExist:
            return None

    @staticmethod
    def get_by_sube(sube_id):
        """Şubeye ait tüm aktif (silinmemiş) mali hesapları döndürür."""
        return MaliHesap.objects.filter(sube_id=sube_id).order_by('siralama', 'ad')

    @staticmethod
    def get_active_by_sube(sube_id):
        """Şubeye ait aktif ve silinmemiş mali hesapları döndürür."""
        return MaliHesap.objects.filter(
            sube_id=sube_id,
            aktif_mi=True,
        ).order_by('siralama', 'ad')

    @staticmethod
    def get_by_tip(sube_id, tip):
        """Şubeye ait belirli tipteki mali hesapları döndürür."""
        return MaliHesap.objects.filter(
            sube_id=sube_id,
            tip=tip,
        ).order_by('siralama', 'ad')

    @staticmethod
    def exists_by_sube_and_ad(sube_id, ad, exclude_id=None):
        """Aynı şube + ad kombinasyonu var mı? (Uniqueness kontrolü)"""
        qs = MaliHesap.objects.filter(sube_id=sube_id, ad=ad)
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)
        return qs.exists()

    # ─── WRITE ───────────────────────────────────

    @staticmethod
    def create(data):
        """Yeni mali hesap oluşturur."""
        return MaliHesap.objects.create(**data)

    @staticmethod
    def update(instance, data):
        """Mevcut kaydı günceller."""
        for key, value in data.items():
            setattr(instance, key, value)
        instance.save()
        return instance

    @staticmethod
    def soft_delete(instance):
        """Soft delete — kaydı silindi olarak işaretler."""
        instance.silindi_mi = True
        instance.aktif_mi = False
        instance.silinme_tarihi = timezone.now()
        instance.save(update_fields=['silindi_mi', 'aktif_mi', 'silinme_tarihi', 'updated_at'])
        return instance

    @staticmethod
    def activate(instance):
        """Kaydı aktif hale getirir."""
        instance.aktif_mi = True
        instance.save(update_fields=['aktif_mi', 'updated_at'])
        return instance

    @staticmethod
    def deactivate(instance):
        """Kaydı pasif hale getirir."""
        instance.aktif_mi = False
        instance.save(update_fields=['aktif_mi', 'updated_at'])
        return instance

    # ─── BULK ────────────────────────────────────

    @staticmethod
    def count_by_sube(sube_id):
        """Şubeye ait aktif kayıt sayısı."""
        return MaliHesap.objects.filter(sube_id=sube_id).count()

    @staticmethod
    def get_by_kurum(kurum_id):
        """Kuruma ait tüm şubelerdeki mali hesapları döndürür."""
        return MaliHesap.objects.filter(
            sube__kurum_id=kurum_id,
        ).select_related('sube').order_by('sube__ad', 'siralama', 'ad')
