"""
Ödeme Yöntemi Repository
Veritabanı erişim katmanı — tüm ORM sorguları burada.
"""
from django.db import models
from django.utils import timezone

from apps.finans.domain.payment_method import OdemeYontemi


class OdemeYontemiRepository:
    """
    OdemeYontemi entity'si için veritabanı operasyonları.
    Soft delete desteği dahildir.
    """

    # ─── READ ────────────────────────────────────

    @staticmethod
    def get_by_id(pk):
        """ID ile aktif (silinmemiş) kaydi getirir."""
        try:
            return OdemeYontemi.objects.select_related(
                'kurum', 'mali_hesap',
            ).get(pk=pk)
        except OdemeYontemi.DoesNotExist:
            return None

    @staticmethod
    def get_by_id_with_deleted(pk):
        """ID ile kaydı getirir (silinmiş dahil)."""
        try:
            return OdemeYontemi.all_objects.get(pk=pk)
        except OdemeYontemi.DoesNotExist:
            return None

    @staticmethod
    def get_by_kurum(kurum_id):
        """Kuruma ait tüm aktif (silinmemiş) ödeme yöntemlerini döndürür."""
        return OdemeYontemi.objects.filter(
            kurum_id=kurum_id,
        ).select_related(
            'kurum', 'mali_hesap',
        ).order_by('siralama', 'ad')

    @staticmethod
    def get_active_by_kurum(kurum_id):
        """Kuruma ait aktif ve silinmemiş ödeme yöntemlerini döndürür."""
        return OdemeYontemi.objects.filter(
            kurum_id=kurum_id,
            aktif_mi=True,
        ).order_by('siralama', 'ad')

    @staticmethod
    def get_by_mali_hesap(mali_hesap_id, sadece_aktif=False):
        """Bir mali hesaba ait (silinmemiş) ödeme yöntemlerini döndürür."""
        qs = OdemeYontemi.objects.filter(mali_hesap_id=mali_hesap_id)
        if sadece_aktif:
            qs = qs.filter(aktif_mi=True)
        return qs.select_related('mali_hesap').order_by('siralama', 'ad')

    @staticmethod
    def get_by_tip(kurum_id, tip):
        """Kuruma ait belirli tipteki ödeme yöntemlerini döndürür."""
        return OdemeYontemi.objects.filter(
            kurum_id=kurum_id,
            tip=tip,
        ).order_by('siralama', 'ad')

    @staticmethod
    def exists_by_kurum_and_ad(kurum_id, ad, exclude_id=None, mali_hesapsiz=False):
        """Kurum + ad benzersizliği (çek/senet için mali_hesapsiz=True)."""
        qs = OdemeYontemi.objects.filter(kurum_id=kurum_id, ad=ad)
        if mali_hesapsiz:
            qs = qs.filter(mali_hesap__isnull=True)
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)
        return qs.exists()

    @staticmethod
    def exists_by_mali_hesap_and_ad(mali_hesap_id, ad, exclude_id=None):
        """Aynı mali hesap + ad kombinasyonu var mı? (Uniqueness kontrolü)"""
        qs = OdemeYontemi.objects.filter(mali_hesap_id=mali_hesap_id, ad=ad)
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)
        return qs.exists()

    # ─── WRITE ───────────────────────────────────

    @staticmethod
    def create(data):
        """Yeni ödeme yöntemi oluşturur."""
        return OdemeYontemi.objects.create(**data)

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
    def count_by_kurum(kurum_id):
        """Kuruma ait aktif kayıt sayısı."""
        return OdemeYontemi.objects.filter(kurum_id=kurum_id).count()

    @staticmethod
    def search(kurum_id, query):
        """Ad veya açıklama içinde arama yapar."""
        return OdemeYontemi.objects.filter(
            kurum_id=kurum_id,
        ).filter(
            models.Q(ad__icontains=query) | models.Q(aciklama__icontains=query)
        ).order_by('siralama', 'ad')
