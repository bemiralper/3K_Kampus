"""
Bakiye Hareketi Repository
Veritabanı erişim katmanı — tüm ORM sorguları burada.
Hareketler immutable'dır: create-only, update/delete YOK.
"""
from django.db.models import Sum, Q

from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.constants.hareket_types import HareketYonu, HareketKaynagi


class BakiyeHareketiRepository:
    """BakiyeHareketi entity'si için veritabanı operasyonları."""

    # ─── READ ────────────────────────────────────

    @staticmethod
    def get_by_id(pk):
        """ID ile kayıt getirir."""
        try:
            return BakiyeHareketi.objects.select_related(
                'mali_hesap', 'kurum', 'sube', 'egitim_yili', 'islem_yapan'
            ).get(pk=pk)
        except BakiyeHareketi.DoesNotExist:
            return None

    @staticmethod
    def get_by_mali_hesap(mali_hesap_id, egitim_yili_id=None):
        """Mali hesaba ait hareketler."""
        qs = BakiyeHareketi.objects.filter(mali_hesap_id=mali_hesap_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs.select_related('mali_hesap', 'egitim_yili', 'islem_yapan')

    @staticmethod
    def get_by_sube(sube_id, egitim_yili_id=None):
        """Şubeye ait tüm hareketler."""
        qs = BakiyeHareketi.objects.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs.select_related('mali_hesap', 'egitim_yili', 'islem_yapan')

    @staticmethod
    def get_by_kurum(kurum_id, egitim_yili_id=None):
        """Kuruma ait tüm hareketler."""
        qs = BakiyeHareketi.objects.filter(kurum_id=kurum_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs.select_related('mali_hesap', 'sube', 'egitim_yili', 'islem_yapan')

    @staticmethod
    def get_by_kaynak(kaynak_tip, kaynak_id):
        """Belirli bir kaynak işlemin hareketlerini getirir."""
        return BakiyeHareketi.objects.filter(
            kaynak_tip=kaynak_tip,
            kaynak_id=kaynak_id,
        ).select_related('mali_hesap')

    # ─── AGGREGATES ──────────────────────────────

    @staticmethod
    def toplam_giris(mali_hesap_id, egitim_yili_id, devir_haric=True):
        """Dönem içi toplam giriş tutarı."""
        qs = BakiyeHareketi.objects.filter(
            mali_hesap_id=mali_hesap_id,
            egitim_yili_id=egitim_yili_id,
            yon=HareketYonu.GIRIS,
        )
        if devir_haric:
            qs = qs.exclude(kaynak__in=[HareketKaynagi.DEVIR, HareketKaynagi.ACILIS])
        return qs.aggregate(toplam=Sum('tutar'))['toplam'] or 0

    @staticmethod
    def toplam_cikis(mali_hesap_id, egitim_yili_id, devir_haric=True):
        """Dönem içi toplam çıkış tutarı."""
        qs = BakiyeHareketi.objects.filter(
            mali_hesap_id=mali_hesap_id,
            egitim_yili_id=egitim_yili_id,
            yon=HareketYonu.CIKIS,
        )
        if devir_haric:
            qs = qs.exclude(kaynak=HareketKaynagi.DEVIR)
        return qs.aggregate(toplam=Sum('tutar'))['toplam'] or 0

    @staticmethod
    def son_bakiye(mali_hesap_id):
        """Mali hesabın en son hareket sonrası bakiyesi."""
        son = BakiyeHareketi.objects.filter(
            mali_hesap_id=mali_hesap_id,
        ).order_by('-islem_tarihi', '-created_at', '-id').first()
        return son.bakiye_sonrasi if son else 0

    @staticmethod
    def hareket_sayisi(mali_hesap_id, egitim_yili_id):
        """Dönem içi hareket sayısı."""
        return BakiyeHareketi.objects.filter(
            mali_hesap_id=mali_hesap_id,
            egitim_yili_id=egitim_yili_id,
        ).count()

    # ─── WRITE (Create-Only) ─────────────────────

    @staticmethod
    def create(data):
        """Yeni hareket oluşturur. Hareketler immutable'dır."""
        return BakiyeHareketi.objects.create(**data)

    @staticmethod
    def bulk_create(records):
        """Toplu hareket oluşturur (dönem devri gibi batch işlemler için)."""
        objs = [BakiyeHareketi(**r) for r in records]
        return BakiyeHareketi.objects.bulk_create(objs)
