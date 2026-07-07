"""
Cari Hareket Service — İş kuralları katmanı
Cari hesap borç/alacak hareketlerini yönetir.
Her hareket immutable'dır — düzeltme için ters kayıt yapılır.
"""
from django.db import transaction

from apps.finans.infrastructure.cari_hareket_repository import CariHareketRepository
from apps.finans.infrastructure.cari_hesap_repository import CariHesapRepository
from apps.finans.constants.cari_types import CariHareketYonu


class CariHareketService:
    """Cari hareket iş kuralları."""

    def __init__(self):
        self.hareket_repo = CariHareketRepository
        self.hesap_repo = CariHesapRepository

    @transaction.atomic
    def hareket_olustur(
        self,
        cari_hesap_id,
        kurum_id,
        tutar,
        yon,
        islem_turu,
        islem_tarihi,
        sube_id=None,
        egitim_yili_id=None,
        kaynak_tip='',
        kaynak_id=None,
        aciklama='',
        belge_no='',
        islem_yapan=None,
    ):
        """
        Cari hareket oluşturur ve cari hesap bakiyesini günceller.
        
        Args:
            yon: CariHareketYonu.BORC veya CariHareketYonu.ALACAK
            islem_turu: CariHareketTuru.*
        
        Returns: CariHareket
        """
        hesap = self.hesap_repo.get_by_id(cari_hesap_id, for_update=True)
        if not hesap:
            raise ValueError(f'Cari hesap bulunamadı: {cari_hesap_id}')

        # Bakiye anlık değerleri kaydet
        borc_oncesi = hesap.toplam_borc
        alacak_oncesi = hesap.toplam_alacak

        # Bakiye güncelle
        if yon == CariHareketYonu.BORC:
            self.hesap_repo.bakiye_guncelle(hesap, borc_degisim=tutar)
        else:
            self.hesap_repo.bakiye_guncelle(hesap, alacak_degisim=tutar)

        hesap.refresh_from_db()

        # Hareket kaydı oluştur
        hareket_data = {
            'cari_hesap_id': cari_hesap_id,
            'kurum_id': kurum_id,
            'sube_id': sube_id,
            'egitim_yili_id': egitim_yili_id,
            'islem_turu': islem_turu,
            'yon': yon,
            'tutar': tutar,
            'borc_oncesi': borc_oncesi,
            'alacak_oncesi': alacak_oncesi,
            'borc_sonrasi': hesap.toplam_borc,
            'alacak_sonrasi': hesap.toplam_alacak,
            'kaynak_tip': kaynak_tip,
            'kaynak_id': kaynak_id,
            'aciklama': aciklama,
            'belge_no': belge_no,
            'islem_tarihi': islem_tarihi,
            'islem_yapan': islem_yapan,
        }

        hareket = self.hareket_repo.create(hareket_data)
        return hareket
