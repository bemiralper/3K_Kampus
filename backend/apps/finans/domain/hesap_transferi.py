"""
Hesap Transferi (Account Transfer) Domain Model
İki mali hesap arasındaki para hareketini (virman, bankaya yatırma,
bankadan çekme) temsil eder.

İş Kuralları:
- Her transfer, kaynak hesapta bir ÇIKIŞ ve hedef hesapta bir GİRİŞ
  BakiyeHareketi kaydı oluşturur (çift taraflı, tutarlı muhasebe).
- Kaynak ve hedef hesap aynı olamaz.
- Transferler ASLA silinmez (immutable audit trail) — yalnızca kayıt olarak tutulur.
"""
from django.db import models
from django.conf import settings

from apps.finans.constants.hareket_types import TransferTuru


class HesapTransferi(models.Model):
    """
    Hesap Transferi — Kasa/Banka hesapları arasındaki para hareketi kaydı.

    Örnek:
      Merkez Kasa → Ziraat Bankası: 10.000 TL (Bankaya Para Yatırma)
      Garanti Bankası → Merkez Kasa: 5.000 TL (Bankadan Kasaya Çekme)
      Merkez Kasa → Şube Kasası: 2.000 TL (Virman)
    """

    # ─── İlişkiler ───────────────────────────────
    kaynak_hesap = models.ForeignKey(
        'finans.MaliHesap',
        on_delete=models.PROTECT,
        related_name='giden_transferler',
        verbose_name='Kaynak Hesap',
    )
    hedef_hesap = models.ForeignKey(
        'finans.MaliHesap',
        on_delete=models.PROTECT,
        related_name='gelen_transferler',
        verbose_name='Hedef Hesap',
    )
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='hesap_transferleri',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='hesap_transferleri',
        verbose_name='Şube',
        null=True, blank=True,
    )
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.PROTECT,
        related_name='hesap_transferleri',
        verbose_name='Eğitim Yılı',
        null=True, blank=True,
    )

    # ─── Transfer Bilgileri ──────────────────────
    tutar = models.IntegerField(
        'Tutar (TL)',
        help_text='Transfer tutarı — her zaman pozitif',
    )
    transfer_turu = models.CharField(
        'Transfer Türü',
        max_length=20,
        choices=TransferTuru.CHOICES,
        default=TransferTuru.VIRMAN,
    )
    transfer_tarihi = models.DateField('Transfer Tarihi')
    aciklama = models.TextField('Açıklama', blank=True, default='')

    # ─── BakiyeHareketi Referansları ─────────────
    kaynak_hareket_id = models.PositiveBigIntegerField(
        'Kaynak Bakiye Hareketi ID', null=True, blank=True,
        help_text='Kaynak hesaptaki ÇIKIŞ hareketinin ID\'si',
    )
    hedef_hareket_id = models.PositiveBigIntegerField(
        'Hedef Bakiye Hareketi ID', null=True, blank=True,
        help_text='Hedef hesaptaki GİRİŞ hareketinin ID\'si',
    )

    # ─── İşlem Yapan ─────────────────────────────
    islem_yapan = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='hesap_transferleri',
        verbose_name='İşlemi Yapan',
    )

    # ─── İptal (geri alma) ───────────────────────
    # Transfer kaydı ASLA silinmez; iptal yerine ters (reversal) BakiyeHareketi
    # kayıtları oluşturulur ve bu bayrak set edilir.
    iptal_edildi = models.BooleanField('İptal Edildi', default=False)
    iptal_tarihi = models.DateTimeField('İptal Tarihi', null=True, blank=True)
    iptal_nedeni = models.TextField('İptal Nedeni', blank=True, default='')
    iptal_eden = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='iptal_ettigi_hesap_transferleri',
        verbose_name='İptal Eden',
    )

    # ─── Zaman Damgaları ─────────────────────────
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)

    class Meta:
        db_table = 'finans_hesap_transferi'
        verbose_name = 'Hesap Transferi'
        verbose_name_plural = 'Hesap Transferleri'
        ordering = ['-transfer_tarihi', '-created_at']
        indexes = [
            models.Index(fields=['kurum', 'sube', 'egitim_yili']),
            models.Index(fields=['kaynak_hesap', 'transfer_tarihi']),
            models.Index(fields=['hedef_hesap', 'transfer_tarihi']),
            models.Index(fields=['transfer_tarihi']),
        ]

    def __str__(self):
        return f"{self.kaynak_hesap.ad} → {self.hedef_hesap.ad} | {self.tutar:,} TL ({self.transfer_tarihi})"
