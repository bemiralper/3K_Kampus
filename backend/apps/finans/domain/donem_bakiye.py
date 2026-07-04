"""
Dönem Bakiye Domain Model
Eğitim yılı bazında mali hesap bakiyelerinin dönemsel takibi.

İş Kuralları:
- Her mali hesap + eğitim yılı çifti için TEK bir DonemBakiye kaydı olur
- Dönem açıkken gelir/gider toplamları güncel BakiyeHareketi'nden hesaplanır
- Dönem kapatıldığında tüm rakamlar sabitlenir (snapshot alınır)
- Devir işlemi: eski dönem kapanır → devir tutarı hesaplanır →
  yeni dönemde açılış bakiyesi olarak yazılır
- Tüm tutarlar Integer (TL bazlı, kuruş YOK)
"""
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator

from apps.finans.constants.hareket_types import DonemDurum


class DonemBakiye(models.Model):
    """
    Dönem Bakiye — Eğitim yılı × mali hesap kesişiminin mali özeti.

    Her eğitim yılı kapandığında:
    1. Bu kayıt 'kapandi' durumuna alınır
    2. donem_sonu_bakiye hesaplanır
    3. Yeni eğitim yılı için yeni DonemBakiye oluşturulur
    4. devir_tutari → yeni dönemin donem_basi_bakiye'si olur

    Formüller:
      toplam_gelir     = SUM(BakiyeHareketi.tutar WHERE yon='giris' AND kaynak NOT IN ('devir','acilis'))
      toplam_gider     = SUM(BakiyeHareketi.tutar WHERE yon='cikis' AND kaynak NOT IN ('devir'))
      donem_sonu_bakiye = donem_basi_bakiye + toplam_gelir - toplam_gider
      devir_tutari      = donem_sonu_bakiye (kapanış anındaki son bakiye)
    """

    # ─── İlişkiler ───────────────────────────────
    mali_hesap = models.ForeignKey(
        'finans.MaliHesap',
        on_delete=models.PROTECT,
        related_name='donem_bakiyeleri',
        verbose_name='Mali Hesap',
    )
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='donem_bakiyeleri',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='donem_bakiyeleri',
        verbose_name='Şube',
        null=True, blank=True,
    )
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.PROTECT,
        related_name='donem_bakiyeleri',
        verbose_name='Eğitim Yılı',
        null=True, blank=True,
    )

    # ─── Bakiye Bilgileri (Integer-Only) ─────────
    donem_basi_bakiye = models.IntegerField(
        'Dönem Başı Bakiye (TL)',
        default=0,
        help_text='Dönem açıldığında başlangıç bakiyesi. İlk yılda 0, sonraki yıllarda önceki yılın devir tutarı.',
    )
    toplam_gelir = models.IntegerField(
        'Toplam Gelir (TL)',
        default=0,
        help_text='Dönem içi tüm giriş hareketleri toplamı (devir hariç)',
    )
    toplam_gider = models.IntegerField(
        'Toplam Gider (TL)',
        default=0,
        help_text='Dönem içi tüm çıkış hareketleri toplamı (devir hariç)',
    )
    donem_sonu_bakiye = models.IntegerField(
        'Dönem Sonu Bakiye (TL)',
        default=0,
        help_text='donem_basi_bakiye + toplam_gelir - toplam_gider',
    )
    devir_tutari = models.IntegerField(
        'Devir Tutarı (TL)',
        default=0,
        help_text='Sonraki eğitim yılına devredilecek tutar',
    )

    # ─── Durum ───────────────────────────────────
    durum = models.CharField(
        'Durum',
        max_length=15,
        choices=DonemDurum.CHOICES,
        default=DonemDurum.ACIK,
        db_index=True,
    )
    kapanma_tarihi = models.DateTimeField(
        'Kapanma Tarihi',
        null=True,
        blank=True,
        help_text='Dönemin kapandığı an',
    )
    devir_tarihi = models.DateTimeField(
        'Devir Tarihi',
        null=True,
        blank=True,
        help_text='Bakiyenin sonraki döneme devredildiği an',
    )
    kapatan_kullanici = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='kapattigi_donemler',
        verbose_name='Kapatan Kullanıcı',
    )

    # ─── Notlar ──────────────────────────────────
    notlar = models.TextField(
        'Notlar',
        blank=True,
        default='',
        help_text='Dönem kapanışı ile ilgili notlar',
    )

    # ─── Zaman Damgaları ─────────────────────────
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'finans_donem_bakiye'
        verbose_name = 'Dönem Bakiye'
        verbose_name_plural = 'Dönem Bakiyeleri'
        ordering = ['-egitim_yili__baslangic_yil', 'mali_hesap__ad']
        constraints = [
            models.UniqueConstraint(
                fields=['mali_hesap', 'egitim_yili'],
                name='unique_mali_hesap_egitim_yili',
            ),
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'egitim_yili', 'durum']),
            models.Index(fields=['mali_hesap', 'durum']),
        ]

    def __str__(self):
        return (
            f"{self.mali_hesap.ad} | {self.egitim_yili} | "
            f"Bakiye: {self.donem_sonu_bakiye:,} TL | {self.get_durum_display()}"
        )

    def hesapla_bakiye(self):
        """Dönem sonu bakiyesini hesaplar."""
        self.donem_sonu_bakiye = self.donem_basi_bakiye + self.toplam_gelir - self.toplam_gider
        return self.donem_sonu_bakiye

    @property
    def net_kar(self):
        """Dönem net kârı = toplam_gelir - toplam_gider."""
        return self.toplam_gelir - self.toplam_gider

    @property
    def gider_gelir_orani(self):
        """Gider/Gelir oranı (%). Gelir 0 ise None döner."""
        if self.toplam_gelir == 0:
            return None
        return round(self.toplam_gider * 100 / self.toplam_gelir, 1)
