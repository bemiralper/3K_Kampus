"""
Cari Hesap Repository — Veritabanı erişim katmanı
"""
from django.utils import timezone
from django.db.models import Q, F

from apps.finans.domain.cari_hesap import CariHesap


class CariHesapRepository:
    """CariHesap entity için CRUD operasyonları."""

    @staticmethod
    def get_by_id(hesap_id, for_update=False):
        """Aktif (silinmemiş) cari hesabı ID ile getirir."""
        try:
            qs = CariHesap.objects.filter(pk=hesap_id)
            if for_update:
                qs = qs.select_for_update()
            return qs.get()
        except CariHesap.DoesNotExist:
            return None

    @staticmethod
    def get_by_kurum(kurum_id, sube_id=None, sadece_aktif=True, hesap_turu=None):
        """Kuruma ait cari hesapları listeler."""
        qs = CariHesap.objects.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if sadece_aktif:
            qs = qs.filter(aktif_mi=True)
        if hesap_turu:
            qs = qs.filter(hesap_turu=hesap_turu)
        return qs

    @staticmethod
    def search(kurum_id, arama_metni, sube_id=None, sadece_aktif=True, hesap_turu=None):
        """Ünvan, kısa ad veya vergi numarasında arama yapar."""
        qs = CariHesap.objects.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if hesap_turu:
            qs = qs.filter(hesap_turu=hesap_turu)
        if arama_metni:
            qs = qs.filter(
                Q(unvan__icontains=arama_metni)
                | Q(kisa_ad__icontains=arama_metni)
                | Q(vergi_no__icontains=arama_metni)
                | Q(hesap_kodu__icontains=arama_metni)
            )
        return qs

    @staticmethod
    def create(data: dict) -> CariHesap:
        """Yeni cari hesap oluşturur."""
        gider_kategorileri = data.pop('gider_kategorileri', None)
        gelir_kategorileri = data.pop('gelir_kategorileri', None)
        hesap = CariHesap.objects.create(**data)
        if gider_kategorileri:
            hesap.gider_kategorileri.set(gider_kategorileri)
        if gelir_kategorileri:
            hesap.gelir_kategorileri.set(gelir_kategorileri)
        return hesap

    @staticmethod
    def update(hesap: CariHesap, data: dict) -> CariHesap:
        """Cari hesap bilgilerini günceller."""
        gider_kategorileri = data.pop('gider_kategorileri', None)
        gelir_kategorileri = data.pop('gelir_kategorileri', None)
        for key, value in data.items():
            setattr(hesap, key, value)
        hesap.save()
        if gider_kategorileri is not None:
            hesap.gider_kategorileri.set(gider_kategorileri)
        if gelir_kategorileri is not None:
            hesap.gelir_kategorileri.set(gelir_kategorileri)
        return hesap

    @staticmethod
    def soft_delete(hesap: CariHesap) -> CariHesap:
        """Soft delete uygular."""
        hesap.silindi_mi = True
        hesap.silinme_tarihi = timezone.now()
        hesap.save(update_fields=['silindi_mi', 'silinme_tarihi', 'updated_at'])
        return hesap

    @staticmethod
    def toggle_aktif(hesap: CariHesap) -> CariHesap:
        """Aktif/pasif durumunu değiştirir."""
        hesap.aktif_mi = not hesap.aktif_mi
        hesap.save(update_fields=['aktif_mi', 'updated_at'])
        return hesap

    @staticmethod
    def bakiye_guncelle(hesap: CariHesap, borc_degisim=None, alacak_degisim=None):
        """
        Cari bakiye bileşenlerini atomik olarak günceller.
        borc_degisim: Karşı tarafın bize borcundaki değişim
        alacak_degisim: Bizim karşı tarafa borcumuzdaki değişim
        """
        if borc_degisim is not None:
            CariHesap.objects.filter(pk=hesap.pk).update(
                toplam_borc=F('toplam_borc') + borc_degisim
            )
        if alacak_degisim is not None:
            CariHesap.objects.filter(pk=hesap.pk).update(
                toplam_alacak=F('toplam_alacak') + alacak_degisim
            )
        hesap.refresh_from_db()
        return hesap

    @staticmethod
    def vergi_no_kontrol(kurum_id, vergi_no, sube_id=None, haric_id=None):
        """Aynı şubede aynı vergi numarası var mı kontrol eder."""
        if not vergi_no:
            return False
        qs = CariHesap.objects.filter(kurum_id=kurum_id, vergi_no=vergi_no)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if haric_id:
            qs = qs.exclude(pk=haric_id)
        return qs.exists()

    @staticmethod
    def son_hesap_kodu_sirasi(kurum_id, prefix: str, sube_id=None) -> int:
        """
        Verilen prefix ile başlayan en büyük sıra numarasını bulur.
        Örn: prefix='CH-TDR-' → CH-TDR-0005 varsa 5 döner.
        """
        hesaplar = (
            CariHesap.tum_kayitlar
            .filter(kurum_id=kurum_id, hesap_kodu__startswith=prefix)
        )
        if sube_id:
            hesaplar = hesaplar.filter(sube_id=sube_id)
        hesaplar = hesaplar.values_list('hesap_kodu', flat=True)
        max_sira = 0
        for kod in hesaplar:
            try:
                sira = int(kod.replace(prefix, ''))
                if sira > max_sira:
                    max_sira = sira
            except (ValueError, IndexError):
                continue
        return max_sira

    @staticmethod
    def dropdown_list(kurum_id, sube_id=None, hesap_turu=None):
        """Dropdown için minimal liste (id, ünvan, hesap_turu, gider_kategorileri dahil)."""
        qs = (
            CariHesap.objects
            .filter(kurum_id=kurum_id, aktif_mi=True)
            .prefetch_related('gider_kategorileri', 'gelir_kategorileri')
            .order_by('unvan')
        )
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if hesap_turu:
            qs = qs.filter(hesap_turu=hesap_turu)
        return qs
