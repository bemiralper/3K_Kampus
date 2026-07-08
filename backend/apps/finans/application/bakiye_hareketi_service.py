"""
Bakiye Hareketi Service
İş mantığı katmanı — hareket oluşturma ve bakiye güncelleme.

Temel Kural: Her finansal işlem (tahsilat, gider, devir) bu service
üzerinden hareket oluşturmalıdır. Doğrudan repository'ye gitmek YASAK.
"""
from django.db import transaction

from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository
from apps.finans.infrastructure.donem_bakiye_repository import DonemBakiyeRepository
from apps.finans.constants.hareket_types import HareketYonu, HareketKaynagi


class BakiyeHareketiService:
    """Bakiye hareketleri için iş mantığı."""

    def __init__(self):
        self.repo = BakiyeHareketiRepository()
        self.donem_repo = DonemBakiyeRepository()

    @transaction.atomic
    def hareket_olustur(
        self,
        mali_hesap_id,
        kurum_id,
        sube_id,
        egitim_yili_id,
        yon,
        tutar,
        kaynak,
        islem_tarihi,
        kaynak_tip='',
        kaynak_id=None,
        aciklama='',
        islem_yapan=None,
    ):
        """
        Yeni bakiye hareketi oluşturur ve dönem bakiyesini günceller.

        Args:
            mali_hesap_id: Hedef mali hesap PK
            kurum_id: Kurum PK
            sube_id: Şube PK
            egitim_yili_id: Eğitim yılı PK
            yon: HareketYonu.GIRIS veya HareketYonu.CIKIS
            tutar: Pozitif integer (TL)
            kaynak: HareketKaynagi sabiti
            islem_tarihi: date objesi
            kaynak_tip: Kaynak modelin adı (opsiyonel)
            kaynak_id: Kaynak modelin PK (opsiyonel)
            aciklama: Açıklama (opsiyonel)
            islem_yapan: User instance (opsiyonel)

        Returns:
            BakiyeHareketi instance

        Raises:
            ValueError: Geçersiz parametrelerde
        """
        # ─── Validasyon ───────────────────────────
        if tutar <= 0:
            raise ValueError("Tutar 0'dan büyük olmalıdır.")

        if yon not in [HareketYonu.GIRIS, HareketYonu.CIKIS]:
            raise ValueError(f"Geçersiz hareket yönü: {yon}")

        if kaynak not in HareketKaynagi.get_values():
            raise ValueError(f"Geçersiz hareket kaynağı: {kaynak}")

        # ─── Eşzamanlılık kilidi ──────────────────
        # Mali hesap satırını kilitleyerek son_bakiye okuması ile hareket
        # oluşturma arasındaki race condition'ı engelle (double-spend koruması).
        from apps.finans.domain.financial_account import MaliHesap
        MaliHesap.objects.select_for_update().filter(pk=mali_hesap_id).first()

        # ─── Mevcut bakiye ────────────────────────
        bakiye_oncesi = self.repo.son_bakiye(mali_hesap_id)

        if yon == HareketYonu.GIRIS:
            bakiye_sonrasi = bakiye_oncesi + tutar
        else:
            bakiye_sonrasi = bakiye_oncesi - tutar

        # ─── Hareket oluştur ──────────────────────
        hareket = self.repo.create({
            'mali_hesap_id': mali_hesap_id,
            'kurum_id': kurum_id,
            'sube_id': sube_id,
            'egitim_yili_id': egitim_yili_id,
            'yon': yon,
            'tutar': tutar,
            'kaynak': kaynak,
            'kaynak_tip': kaynak_tip,
            'kaynak_id': kaynak_id,
            'bakiye_oncesi': bakiye_oncesi,
            'bakiye_sonrasi': bakiye_sonrasi,
            'islem_tarihi': islem_tarihi,
            'aciklama': aciklama,
            'islem_yapan': islem_yapan,
        })

        # ─── Dönem bakiye güncelle ────────────────
        self._donem_bakiye_guncelle(
            mali_hesap_id=mali_hesap_id,
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            yon=yon,
            tutar=tutar,
            kaynak=kaynak,
        )

        return hareket

    def _donem_bakiye_guncelle(self, mali_hesap_id, kurum_id, sube_id, egitim_yili_id, yon, tutar, kaynak):
        """
        Dönem bakiye kaydını günceller. Yoksa oluşturur.
        Devir/açılış hareketleri gelir/gidere sayılmaz.
        """
        donem = self.donem_repo.get_by_mali_hesap_ve_yil(mali_hesap_id, egitim_yili_id)

        if not donem:
            donem = self.donem_repo.create({
                'mali_hesap_id': mali_hesap_id,
                'kurum_id': kurum_id,
                'sube_id': sube_id,
                'egitim_yili_id': egitim_yili_id,
            })

        # Devir ve açılış hareketleri gelir/gider toplamına dahil edilmez
        devir_kaynaklari = [HareketKaynagi.DEVIR, HareketKaynagi.ACILIS]

        if kaynak not in devir_kaynaklari:
            if yon == HareketYonu.GIRIS:
                donem.toplam_gelir += tutar
            else:
                donem.toplam_gider += tutar

        donem.hesapla_bakiye()
        donem.save(update_fields=[
            'toplam_gelir', 'toplam_gider', 'donem_sonu_bakiye', 'updated_at',
        ])

    # ─── Kolaylık Metodları ──────────────────────

    def tahsilat_giris(self, mali_hesap_id, kurum_id, sube_id, egitim_yili_id,
                       tutar, islem_tarihi, tahsilat_id, aciklama='', islem_yapan=None):
        """Tahsilat girişi — kasaya/bankaya para girişi."""
        return self.hareket_olustur(
            mali_hesap_id=mali_hesap_id,
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            yon=HareketYonu.GIRIS,
            tutar=tutar,
            kaynak=HareketKaynagi.TAHSILAT,
            islem_tarihi=islem_tarihi,
            kaynak_tip='tahsilat',
            kaynak_id=tahsilat_id,
            aciklama=aciklama or f'Tahsilat #{tahsilat_id}',
            islem_yapan=islem_yapan,
        )

    def tahsilat_iptal(self, mali_hesap_id, kurum_id, sube_id, egitim_yili_id,
                       tutar, islem_tarihi, tahsilat_id, aciklama='', islem_yapan=None):
        """Tahsilat iptali — kasadan/bankadan para çıkışı."""
        return self.hareket_olustur(
            mali_hesap_id=mali_hesap_id,
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            yon=HareketYonu.CIKIS,
            tutar=tutar,
            kaynak=HareketKaynagi.TAHSILAT_IPTAL,
            islem_tarihi=islem_tarihi,
            kaynak_tip='tahsilat',
            kaynak_id=tahsilat_id,
            aciklama=aciklama or f'Tahsilat İptal #{tahsilat_id}',
            islem_yapan=islem_yapan,
        )

    def iade_cikis(self, mali_hesap_id, kurum_id, sube_id, egitim_yili_id,
                   tutar, islem_tarihi, tahsilat_id, aciklama='', islem_yapan=None):
        """İade işlemi — kasadan/bankadan para çıkışı."""
        return self.hareket_olustur(
            mali_hesap_id=mali_hesap_id,
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            yon=HareketYonu.CIKIS,
            tutar=tutar,
            kaynak=HareketKaynagi.IADE,
            islem_tarihi=islem_tarihi,
            kaynak_tip='tahsilat',
            kaynak_id=tahsilat_id,
            aciklama=aciklama or f'İade #{tahsilat_id}',
            islem_yapan=islem_yapan,
        )
