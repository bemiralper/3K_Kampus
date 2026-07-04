"""
Gelir Tahsilat Service — İş kuralları katmanı
Tahsilat kaydı oluşturma, iptal, BakiyeHareketi entegrasyonu.
"""
from decimal import Decimal
from django.db import transaction

from apps.finans.infrastructure.gelir_tahsilat_repository import GelirTahsilatRepository
from apps.finans.infrastructure.gelir_repository import GelirKaydiRepository
from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.application.islem_masrafi_service import IslemMasrafiService
from apps.finans.domain.islem_masrafi import IslemMasrafiKaynakTipi
from apps.finans.constants.gider_types import OdemeDurum
from apps.finans.constants.cari_types import GelirDurum, CariHareketTuru, CariHareketYonu
from apps.finans.constants.hareket_types import HareketYonu, HareketKaynagi


class GelirTahsilatService:
    """
    Gelir tahsilat iş kuralları.
    Tahsilat → BakiyeHareketi → GelirKaydi durum güncelleme → Cari hareket.
    """

    def __init__(self):
        self.tahsilat_repo = GelirTahsilatRepository
        self.gelir_repo = GelirKaydiRepository
        self.bakiye_service = BakiyeHareketiService()
        self.cari_hareket_service = CariHareketService()
        self.masraf_service = IslemMasrafiService()

    @transaction.atomic
    def tahsilat_yap(self, data: dict):
        """
        Gelir tahsilatı yapar.
        1. GelirTahsilat kaydı oluştur
        2. BakiyeHareketi oluştur (GİRİŞ — mali hesaba para giriyor)
        3. GelirKaydi tahsil_edilen + durum güncelle
        4. Cari hareket oluştur (ALACAK — müşteri borcu azalıyor)

        Returns: (GelirTahsilat, None) veya (None, error_dict)
        """
        errors = self._validate_tahsilat(data)
        if errors:
            return None, errors

        gelir_id = data.get('gelir_kaydi_id')
        gelir = self.gelir_repo.get_by_id(gelir_id)
        tutar = data['tutar']

        # 1. GelirTahsilat kaydı oluştur
        tahsilat_data = {
            'gelir_kaydi_id': gelir.pk,
            'odeme_yontemi_id': data['odeme_yontemi_id'],
            'mali_hesap_id': data['mali_hesap_id'],
            'tutar': tutar,
            'tahsilat_tarihi': data['tahsilat_tarihi'],
            'aciklama': data.get('aciklama', ''),
            'islem_yapan': data.get('islem_yapan'),
            'durum': OdemeDurum.TAMAMLANDI,
        }
        tahsilat = self.tahsilat_repo.create(tahsilat_data)

        # 2. BakiyeHareketi oluştur (GİRİŞ — kasaya/bankaya para giriyor)
        aciklama = f"Gelir tahsilatı: {gelir.cari_hesap} - {gelir.fatura_no or 'Belgesiz'}"
        hareket = self.bakiye_service.hareket_olustur(
            mali_hesap_id=data['mali_hesap_id'],
            kurum_id=gelir.kurum_id,
            sube_id=gelir.sube_id,
            egitim_yili_id=gelir.egitim_yili_id,
            tutar=tutar,
            yon=HareketYonu.GIRIS,
            kaynak=HareketKaynagi.TAHSILAT,
            islem_tarihi=data['tahsilat_tarihi'],
            kaynak_id=tahsilat.pk,
            aciklama=aciklama,
        )

        # BakiyeHareketi referansını kaydet
        tahsilat.bakiye_hareketi_id = hareket.pk
        tahsilat.save(update_fields=['bakiye_hareketi_id'])

        # 3. GelirKaydi tahsil_edilen güncelle
        self._gelir_durum_guncelle(gelir)

        # 4. Cari hesapta ALACAK hareketi (müşteri borcu azalıyor — tahsilat aldık)
        self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=gelir.cari_hesap_id,
            kurum_id=gelir.kurum_id,
            tutar=tutar,
            yon=CariHareketYonu.ALACAK,
            islem_turu=CariHareketTuru.TAHSILAT,
            islem_tarihi=data['tahsilat_tarihi'],
            sube_id=gelir.sube_id,
            egitim_yili_id=gelir.egitim_yili_id,
            kaynak_tip='GelirTahsilat',
            kaynak_id=tahsilat.pk,
            aciklama=f'Gelir tahsilatı: {gelir.fatura_no or "Belgesiz"} — {tutar} ₺',
        )

        _, masraf_err = self.masraf_service.process_if_present(
            data,
            kaynak_tip=IslemMasrafiKaynakTipi.GELIR_TAHSILAT,
            kaynak_id=tahsilat.pk,
            kurum_id=gelir.kurum_id,
            sube_id=gelir.sube_id,
            egitim_yili_id=gelir.egitim_yili_id,
            mali_hesap_id=data['mali_hesap_id'],
            odeme_yontemi_id=data['odeme_yontemi_id'],
            islem_tarihi=data['tahsilat_tarihi'],
            ana_islem_aciklama=aciklama,
            islem_yapan=data.get('islem_yapan'),
        )
        if masraf_err:
            return None, {'genel': masraf_err}

        return tahsilat, None

    @transaction.atomic
    def tahsilat_iptal(self, tahsilat_id: int):
        """
        Tahsilatı iptal eder ve tüm bakiyeleri geri alır.
        Returns: (GelirTahsilat, None) veya (None, error_dict)
        """
        tahsilat = self.tahsilat_repo.get_by_id(tahsilat_id)
        if not tahsilat:
            return None, {'genel': 'Tahsilat kaydı bulunamadı.'}

        if tahsilat.durum == OdemeDurum.IPTAL:
            return None, {'genel': 'Bu tahsilat zaten iptal edilmiş.'}

        tutar = tahsilat.tutar
        gelir = tahsilat.gelir_kaydi

        # 1. Tahsilatı iptal et
        tahsilat = self.tahsilat_repo.iptal_et(tahsilat)

        # 2. BakiyeHareketi — mali hesaptan para çıkış (iptal)
        if tahsilat.mali_hesap_id:
            aciklama = f"Tahsilat iptali: {gelir.cari_hesap} - {gelir.fatura_no or 'Belgesiz'}"
            self.bakiye_service.hareket_olustur(
                mali_hesap_id=tahsilat.mali_hesap_id,
                kurum_id=gelir.kurum_id,
                sube_id=gelir.sube_id,
                egitim_yili_id=gelir.egitim_yili_id,
                tutar=tutar,
                yon=HareketYonu.CIKIS,
                kaynak=HareketKaynagi.TAHSILAT_IPTAL,
                islem_tarihi=tahsilat.tahsilat_tarihi,
                kaynak_id=tahsilat.pk,
                aciklama=aciklama,
            )

        # 3. GelirKaydi tahsil_edilen güncelle
        self._gelir_durum_guncelle(gelir)

        # 4. Cari hesapta BORÇ hareketi (iptal — müşteri borcu geri artar)
        self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=gelir.cari_hesap_id,
            kurum_id=gelir.kurum_id,
            tutar=tutar,
            yon=CariHareketYonu.BORC,
            islem_turu=CariHareketTuru.IADE,
            islem_tarihi=tahsilat.tahsilat_tarihi,
            sube_id=gelir.sube_id,
            egitim_yili_id=gelir.egitim_yili_id,
            kaynak_tip='GelirTahsilat',
            kaynak_id=tahsilat.pk,
            aciklama=f'Tahsilat iptali: {gelir.fatura_no or "Belgesiz"} — {tutar} ₺',
        )

        self.masraf_service.iptal(
            IslemMasrafiKaynakTipi.GELIR_TAHSILAT,
            tahsilat.pk,
            islem_tarihi=tahsilat.tahsilat_tarihi,
        )

        return tahsilat, None

    # ─── Yardımcı ────────────────────────────────

    def _gelir_durum_guncelle(self, gelir):
        """Gelir kaydının tahsil_edilen ve durumunu yeniden hesaplar."""
        toplam = self.tahsilat_repo.toplam_tahsilat_by_gelir(gelir.pk)
        update_data = {'tahsil_edilen': toplam}

        if toplam >= gelir.net_tutar:
            update_data['durum'] = GelirDurum.TAHSIL_EDILDI
        elif toplam > Decimal('0'):
            update_data['durum'] = GelirDurum.KISMI_TAHSIL
        else:
            # İptal sonrası 0'a düşerse onaylandıya dön
            if gelir.durum in [GelirDurum.KISMI_TAHSIL, GelirDurum.TAHSIL_EDILDI]:
                update_data['durum'] = GelirDurum.ONAYLANDI

        self.gelir_repo.update(gelir, update_data)

    def _validate_tahsilat(self, data):
        errors = {}

        gelir_id = data.get('gelir_kaydi_id')
        if not gelir_id:
            errors['gelir_kaydi'] = 'Gelir kaydı zorunludur.'
            return errors

        gelir = self.gelir_repo.get_by_id(gelir_id)
        if not gelir:
            errors['gelir_kaydi'] = 'Gelir kaydı bulunamadı.'
            return errors

        if gelir.durum not in [GelirDurum.ONAYLANDI, GelirDurum.KISMI_TAHSIL]:
            errors['gelir_kaydi'] = f'Bu gelir kaydından tahsilat yapılamaz (durum: {gelir.get_durum_display()}).'

        tutar = data.get('tutar')
        if not tutar or tutar <= Decimal('0'):
            errors['tutar'] = 'Tahsilat tutarı sıfırdan büyük olmalıdır.'
        elif tutar > gelir.kalan_tutar:
            errors['tutar'] = f'Tahsilat tutarı kalan alacaktan ({gelir.kalan_tutar} ₺) fazla olamaz.'

        if not data.get('odeme_yontemi_id'):
            errors['odeme_yontemi'] = 'Ödeme yöntemi zorunludur.'
        if not data.get('mali_hesap_id'):
            errors['mali_hesap'] = 'Mali hesap seçimi zorunludur.'
        if not data.get('tahsilat_tarihi'):
            errors['tahsilat_tarihi'] = 'Tahsilat tarihi zorunludur.'

        return errors if errors else None
