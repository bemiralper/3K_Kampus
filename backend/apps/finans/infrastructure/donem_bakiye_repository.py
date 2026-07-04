"""
Dönem Bakiye Repository
Veritabanı erişim katmanı — dönem bazlı bakiye sorguları.
"""
from django.db.models import Sum, F, Q

from apps.finans.domain.donem_bakiye import DonemBakiye
from apps.finans.constants.hareket_types import DonemDurum


class DonemBakiyeRepository:
    """DonemBakiye entity'si için veritabanı operasyonları."""

    # ─── READ ────────────────────────────────────

    @staticmethod
    def get_by_id(pk):
        """ID ile kayıt getirir."""
        try:
            return DonemBakiye.objects.select_related(
                'mali_hesap', 'kurum', 'sube', 'egitim_yili', 'kapatan_kullanici'
            ).get(pk=pk)
        except DonemBakiye.DoesNotExist:
            return None

    @staticmethod
    def get_by_mali_hesap_ve_yil(mali_hesap_id, egitim_yili_id):
        """Mali hesap + eğitim yılı çifti ile tek kaydı getirir."""
        try:
            return DonemBakiye.objects.select_related(
                'mali_hesap', 'kurum', 'sube', 'egitim_yili'
            ).get(
                mali_hesap_id=mali_hesap_id,
                egitim_yili_id=egitim_yili_id,
            )
        except DonemBakiye.DoesNotExist:
            return None

    @staticmethod
    def get_by_sube_ve_yil(sube_id, egitim_yili_id):
        """Şube + eğitim yılı için tüm mali hesap dönem bakiyelerini getirir."""
        return DonemBakiye.objects.filter(
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
        ).select_related('mali_hesap', 'egitim_yili').order_by('mali_hesap__siralama')

    @staticmethod
    def get_by_kurum_ve_yil(kurum_id, egitim_yili_id):
        """Kurum + eğitim yılı için tüm şubelerdeki dönem bakiyelerini getirir."""
        return DonemBakiye.objects.filter(
            kurum_id=kurum_id,
            egitim_yili_id=egitim_yili_id,
        ).select_related('mali_hesap', 'sube', 'egitim_yili').order_by('sube__ad', 'mali_hesap__siralama')

    @staticmethod
    def get_acik_donemler(sube_id):
        """Şubeye ait tüm açık dönemleri getirir."""
        return DonemBakiye.objects.filter(
            sube_id=sube_id,
            durum=DonemDurum.ACIK,
        ).select_related('mali_hesap', 'egitim_yili')

    @staticmethod
    def get_yillar_arasi(mali_hesap_id):
        """Bir mali hesabın tüm yıllardaki dönem bakiyelerini getirir (kıyaslama için)."""
        return DonemBakiye.objects.filter(
            mali_hesap_id=mali_hesap_id,
        ).select_related('egitim_yili').order_by('egitim_yili__baslangic_yil')

    @staticmethod
    def get_kurum_yillar_arasi(kurum_id):
        """Kurum bazında tüm yılların konsolide bakiyelerini getirir."""
        return DonemBakiye.objects.filter(
            kurum_id=kurum_id,
        ).values(
            'egitim_yili__id',
            'egitim_yili__baslangic_yil',
            'egitim_yili__bitis_yil',
        ).annotate(
            toplam_donem_basi=Sum('donem_basi_bakiye'),
            toplam_gelir=Sum('toplam_gelir'),
            toplam_gider=Sum('toplam_gider'),
            toplam_donem_sonu=Sum('donem_sonu_bakiye'),
        ).order_by('egitim_yili__baslangic_yil')

    @staticmethod
    def exists(mali_hesap_id, egitim_yili_id):
        """Kayıt var mı?"""
        return DonemBakiye.objects.filter(
            mali_hesap_id=mali_hesap_id,
            egitim_yili_id=egitim_yili_id,
        ).exists()

    # ─── WRITE ───────────────────────────────────

    @staticmethod
    def create(data):
        """Yeni dönem bakiye kaydı oluşturur."""
        return DonemBakiye.objects.create(**data)

    @staticmethod
    def update(instance, data):
        """Mevcut kaydı günceller."""
        for key, value in data.items():
            setattr(instance, key, value)
        instance.save()
        return instance

    @staticmethod
    def bulk_create(records):
        """Toplu oluşturma (dönem açılışı gibi batch işlemler için)."""
        objs = [DonemBakiye(**r) for r in records]
        return DonemBakiye.objects.bulk_create(objs, ignore_conflicts=True)
