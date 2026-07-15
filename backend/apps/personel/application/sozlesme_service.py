"""
Personel Sözleşmeleri — Application Service
DDD Pattern — Application Layer
"""
from django.db import transaction
from decimal import Decimal

from apps.personel.infrastructure.sozlesme_repository import (
    SozlesmeRepository, HakedisRepository, AvansRepository,
)
from apps.personel.domain.sozlesme_models import (
    SozlesmeDurumu, HakedisDurumu, AylikHakedis,
)


class SozlesmeService:
    """Sözleşme iş mantığı katmanı"""

    def __init__(self):
        self.repo = SozlesmeRepository()

    def list(self, kurum_id, egitim_yili_id=None, filters=None):
        return self.repo.get_all(kurum_id, egitim_yili_id, filters)

    def get(self, pk):
        return self.repo.get_by_id(pk)

    @transaction.atomic
    def create(self, data):
        return self.repo.create(data)

    @transaction.atomic
    def update(self, pk, data):
        return self.repo.update(pk, data)

    @transaction.atomic
    def delete(self, pk):
        return self.repo.delete(pk)

    @transaction.atomic
    def durum_degistir(self, pk, yeni_durum, fesih_sebebi='', fesih_tarihi=None):
        """Sözleşme durumunu değiştir (iş kuralları ile)."""
        sozlesme = self.repo.get_by_id(pk)
        if not sozlesme:
            return None, 'Sözleşme bulunamadı.'

        gecerli_gecisler = {
            SozlesmeDurumu.TASLAK: [SozlesmeDurumu.AKTIF, SozlesmeDurumu.FESHEDILDI],
            SozlesmeDurumu.AKTIF: [SozlesmeDurumu.PASIF, SozlesmeDurumu.SURESI_DOLMU, SozlesmeDurumu.FESHEDILDI],
            SozlesmeDurumu.PASIF: [SozlesmeDurumu.AKTIF, SozlesmeDurumu.FESHEDILDI],
            # Geriye uyumluluk
            SozlesmeDurumu.ASKIDA: [SozlesmeDurumu.AKTIF, SozlesmeDurumu.FESHEDILDI],
            SozlesmeDurumu.SONA_ERDI: [],
        }

        izin_verilen = gecerli_gecisler.get(sozlesme.durum, [])
        if yeni_durum not in izin_verilen:
            return None, f'"{sozlesme.get_durum_display()}" durumundan "{yeni_durum}" durumuna geçilemez.'

        update_data = {'durum': yeni_durum}

        # Fesih durumunda fesih bilgilerini kaydet
        if yeni_durum == SozlesmeDurumu.FESHEDILDI:
            update_data['fesih_sebebi'] = fesih_sebebi or ''
            if fesih_tarihi:
                update_data['fesih_tarihi'] = fesih_tarihi

        return self.repo.update(pk, update_data), None

    def stats(self, kurum_id, egitim_yili_id, sube_id=None):
        return self.repo.get_stats(kurum_id, egitim_yili_id, sube_id=sube_id)


class HakedisService:
    """Hakediş iş mantığı katmanı"""

    def __init__(self):
        self.repo = HakedisRepository()

    def list(self, kurum_id, yil=None, ay=None, filters=None):
        return self.repo.get_all(kurum_id, yil, ay, filters)

    def get(self, pk):
        return self.repo.get_by_id(pk)

    @transaction.atomic
    def create(self, data):
        return self.repo.create(data)

    @transaction.atomic
    def update(self, pk, data):
        hakedis = self.repo.get_by_id(pk)
        if not hakedis:
            return None, 'Hakediş bulunamadı.'
        if hakedis.durum in [HakedisDurumu.ONAYLANDI, HakedisDurumu.ODENDI]:
            return None, 'Onaylanmış veya ödenmiş hakediş düzenlenemez.'
        return self.repo.update(pk, data), None

    @transaction.atomic
    def onayla(self, pk):
        hakedis = self.repo.get_by_id(pk)
        if not hakedis:
            return None, 'Hakediş bulunamadı.'
        if hakedis.durum != HakedisDurumu.HESAPLANDI:
            return None, 'Sadece "Hesaplandı" durumundaki hakedişler onaylanabilir.'
        return self.repo.update(pk, {'durum': HakedisDurumu.ONAYLANDI}), None

    @transaction.atomic
    def odendi_isaretle(self, pk, odeme_tarihi):
        hakedis = self.repo.get_by_id(pk)
        if not hakedis:
            return None, 'Hakediş bulunamadı.'
        if hakedis.durum != HakedisDurumu.ONAYLANDI:
            return None, 'Sadece "Onaylandı" durumundaki hakedişler ödendi olarak işaretlenebilir.'
        return self.repo.update(pk, {
            'durum': HakedisDurumu.ODENDI,
            'odeme_tarihi': odeme_tarihi,
        }), None

    @transaction.atomic
    def toplu_olustur(self, kurum_id, egitim_yili_id, yil, ay):
        """Belirtilen ay için tüm aktif sözleşmelere hakediş oluştur."""
        created = self.repo.bulk_create_for_month(kurum_id, egitim_yili_id, yil, ay)
        return created

    def stats(self, kurum_id, yil, ay):
        return self.repo.get_stats(kurum_id, yil, ay)

    @transaction.atomic
    def delete(self, pk):
        hakedis = self.repo.get_by_id(pk)
        if not hakedis:
            return False, 'Hakediş bulunamadı.'
        if hakedis.durum in [HakedisDurumu.ODENDI]:
            return False, 'Ödenmiş hakediş silinemez.'
        return self.repo.delete(pk), None


class AvansService:
    """Avans kayıtları iş mantığı katmanı"""

    def __init__(self):
        self.repo = AvansRepository()
        self.hakedis_repo = HakedisRepository()

    def list_for_hakedis(self, sozlesme_id, yil, ay):
        return self.repo.get_all_for_hakedis(sozlesme_id, yil, ay)

    def list_for_sozlesme(self, sozlesme_id):
        return self.repo.get_all_for_sozlesme(sozlesme_id)

    def list_for_personel(self, personel_id, kurum_id=None):
        return self.repo.get_all_for_personel(personel_id, kurum_id)

    def get(self, pk):
        return self.repo.get_by_id(pk)

    @transaction.atomic
    def create(self, data):
        """Avans kaydı oluştur ve ilgili hakedişteki avans toplamını güncelle."""
        avans = self.repo.create(data)
        self._sync_hakedis_avans(avans.sozlesme_id, avans.mahsup_yil, avans.mahsup_ay)
        return avans

    @transaction.atomic
    def update(self, pk, data):
        """Avans kaydını güncelle ve hakediş avans toplamını senkronize et."""
        avans = self.repo.get_by_id(pk)
        if not avans:
            return None, 'Avans kaydı bulunamadı.'
        old_sozlesme_id = avans.sozlesme_id
        old_yil = avans.mahsup_yil
        old_ay = avans.mahsup_ay

        updated = self.repo.update(pk, data)

        # Eski ay'ı senkronize et
        self._sync_hakedis_avans(old_sozlesme_id, old_yil, old_ay)
        # Yeni ay farklıysa onu da senkronize et
        if updated.mahsup_yil != old_yil or updated.mahsup_ay != old_ay or updated.sozlesme_id != old_sozlesme_id:
            self._sync_hakedis_avans(updated.sozlesme_id, updated.mahsup_yil, updated.mahsup_ay)

        return updated, None

    @transaction.atomic
    def delete(self, pk):
        """Avans kaydını sil ve hakediş avans toplamını güncelle."""
        avans = self.repo.get_by_id(pk)
        if not avans:
            return False, 'Avans kaydı bulunamadı.'
        sozlesme_id = avans.sozlesme_id
        yil = avans.mahsup_yil
        ay = avans.mahsup_ay
        self.repo.delete(pk)
        self._sync_hakedis_avans(sozlesme_id, yil, ay)
        return True, None

    def _sync_hakedis_avans(self, sozlesme_id, yil, ay):
        """
        Avans kayıtlarından toplam hesaplayıp hakediş kaydındaki avans alanını güncelle.
        """
        toplam = self.repo.toplam_avans(sozlesme_id, yil, ay)
        hakedis = AylikHakedis.objects.filter(
            sozlesme_id=sozlesme_id, yil=yil, ay=ay,
        ).first()
        if hakedis:
            hakedis.avans = toplam
            hakedis.hesapla()
            hakedis.save()
