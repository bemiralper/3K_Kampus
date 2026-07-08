"""
Finans İşlem Log (Audit Log) Domain Model

Finans modülündeki kritik işlemlerin (oluşturma, güncelleme, onay, iptal, ödeme,
tahsilat, silme, dışa aktarma) merkezi ve değiştirilemez iz kaydı.

Not: Bu kayıtlar create-only'dir; güncelleme/silme yapılmaz.
"""
from django.db import models


class FinansModul:
    GELIR = 'gelir'
    GIDER = 'gider'
    TAHSILAT = 'tahsilat'
    ODEME = 'odeme'
    TANIM = 'tanim'
    CARI = 'cari'
    KASA = 'kasa'
    RAPOR = 'rapor'

    CHOICES = [
        (GELIR, 'Gelir'),
        (GIDER, 'Gider'),
        (TAHSILAT, 'Tahsilat'),
        (ODEME, 'Ödeme'),
        (TANIM, 'Tanım'),
        (CARI, 'Cari'),
        (KASA, 'Kasa/Banka'),
        (RAPOR, 'Rapor'),
    ]


class FinansEylem:
    OLUSTUR = 'olustur'
    GUNCELLE = 'guncelle'
    ONAYLA = 'onayla'
    IPTAL = 'iptal'
    SIL = 'sil'
    ODEME = 'odeme'
    TAHSILAT = 'tahsilat'
    EXPORT = 'export'

    CHOICES = [
        (OLUSTUR, 'Oluşturma'),
        (GUNCELLE, 'Güncelleme'),
        (ONAYLA, 'Onaylama'),
        (IPTAL, 'İptal'),
        (SIL, 'Silme'),
        (ODEME, 'Ödeme'),
        (TAHSILAT, 'Tahsilat'),
        (EXPORT, 'Dışa Aktarma'),
    ]


class FinansIslemLog(models.Model):
    """Finans işlemlerinin değiştirilemez denetim (audit) kaydı."""

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='finans_islem_loglari',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='finans_islem_loglari',
        verbose_name='Şube',
    )

    modul = models.CharField('Modül', max_length=20, choices=FinansModul.CHOICES)
    eylem = models.CharField('Eylem', max_length=20, choices=FinansEylem.CHOICES)

    kayit_tip = models.CharField('Kayıt Tipi', max_length=50, blank=True, default='')
    kayit_id = models.PositiveIntegerField('Kayıt ID', null=True, blank=True)

    aciklama = models.CharField('Açıklama', max_length=255, blank=True, default='')
    tutar = models.DecimalField(
        'Tutar', max_digits=15, decimal_places=2, null=True, blank=True,
    )
    detay = models.JSONField('Detay', null=True, blank=True, default=None)

    kullanici = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='finans_islem_loglari',
        verbose_name='Kullanıcı',
    )
    ip_adresi = models.GenericIPAddressField('IP Adresi', null=True, blank=True)

    created_at = models.DateTimeField('Zaman', auto_now_add=True)

    class Meta:
        app_label = 'finans'
        db_table = 'finans_islem_log'
        verbose_name = 'Finans İşlem Logu'
        verbose_name_plural = 'Finans İşlem Logları'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['kurum', 'sube', '-created_at']),
            models.Index(fields=['modul', 'eylem']),
            models.Index(fields=['kayit_tip', 'kayit_id']),
            models.Index(fields=['kullanici', '-created_at']),
        ]

    def __str__(self):
        return f"[{self.modul}/{self.eylem}] {self.kayit_tip}#{self.kayit_id}"
