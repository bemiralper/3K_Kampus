"""
Ödeme Yöntemi Domain Model
Bir Mali Hesaba (kasa/banka/pos) bağlı olarak tanımlanan ödeme yöntemleri.

İş Kuralları:
- Her ödeme yöntemi TAM OLARAK BİR mali hesaba aittir (mali_hesap zorunlu)
- Mali hesap başına ödeme yöntemi adı benzersiz olmalı (silinen kayıtlar hariç)
- Komisyon oranı >= 0 olmalı
- Valör gün >= 0 olmalı
- Silme işlemi SOFT DELETE ile yapılır (silindi_mi=True)
- Silinmiş kayıt tekrar aktif edilemez
- Eğitim yılından BAĞIMSIZ — kalıcı parametrik veri
- `kurum` alanı `mali_hesap.sube.kurum` üzerinden otomatik senkronize edilir (geriye dönük sorgu kolaylığı için)
"""
from decimal import Decimal
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator

from apps.finans.constants.payment_types import OdemeYontemiTipi


class OdemeYontemiManager(models.Manager):
    """Soft delete filtresi uygulayan custom manager."""

    def get_queryset(self):
        return super().get_queryset().filter(silindi_mi=False)

    def tumu(self):
        """Silinmiş kayıtlar dahil tümünü döndürür."""
        return super().get_queryset()

    def silinenler(self):
        """Sadece silinmiş kayıtları döndürür."""
        return super().get_queryset().filter(silindi_mi=True)


class OdemeYontemi(models.Model):
    """
    Ödeme Yöntemi (Payment Method)
    Bir Mali Hesaba (kasa/banka/pos) bağlı olarak tanımlanır. Tahsilat
    işlemlerinde kullanılacak ödeme kanallarını temsil eder.

    Örnek: Vakıfbank hesabı → EFT, Havale, FAST, QR Ödeme
           Nakit Kasa hesabı → Nakit, Açık Hesap Tahsilatı
           Garanti POS hesabı → Kredi Kartı, Taksitli Kart
    """

    # ─── İlişkiler ───────────────────────────────
    mali_hesap = models.ForeignKey(
        'finans.MaliHesap',
        on_delete=models.CASCADE,
        related_name='odeme_yontemleri',
        verbose_name='Mali Hesap',
        null=True,
        blank=True,
        help_text='Çek/senet tipinde boş bırakılır; diğer tiplerde zorunludur',
    )
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='odeme_yontemleri',
        verbose_name='Kurum',
        help_text='mali_hesap.sube.kurum üzerinden otomatik senkronize edilir',
    )

    # ─── Temel Bilgiler ──────────────────────────
    ad = models.CharField(
        'Ödeme Yöntemi Adı',
        max_length=150,
        help_text='Örn: Nakit, Ziraat POS, Garanti Havale',
    )
    tip = models.CharField(
        'Tip',
        max_length=20,
        choices=OdemeYontemiTipi.CHOICES,
        default=OdemeYontemiTipi.NAKIT,
        help_text='Ödeme kanalı türü',
    )

    # ─── Finansal Parametreler ────────────────────
    komisyon_orani = models.DecimalField(
        'Komisyon Oranı (%)',
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[
            MinValueValidator(Decimal('0.00')),
            MaxValueValidator(Decimal('100.00')),
        ],
        help_text='Ödeme yönteminin komisyon yüzdesi',
    )
    valor_gun = models.PositiveIntegerField(
        'Valör Gün',
        default=0,
        help_text='Paranın hesaba geçme süresi (gün)',
    )

    # ─── Sıralama & Durum ────────────────────────
    siralama = models.PositiveIntegerField(
        'Sıralama',
        default=0,
        help_text='Listeleme sırası (küçükten büyüğe)',
    )
    aktif_mi = models.BooleanField(
        'Aktif',
        default=True,
    )
    aciklama = models.TextField(
        'Açıklama',
        blank=True,
        default='',
    )

    # ─── Soft Delete ─────────────────────────────
    silindi_mi = models.BooleanField(
        'Silindi',
        default=False,
        db_index=True,
    )
    silinme_tarihi = models.DateTimeField(
        'Silinme Tarihi',
        null=True,
        blank=True,
    )

    # ─── Zaman Damgaları ─────────────────────────
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    # ─── Managers ────────────────────────────────
    objects = OdemeYontemiManager()
    all_objects = models.Manager()  # Soft delete bypass

    class Meta:
        db_table = 'finans_odeme_yontemi'
        verbose_name = 'Ödeme Yöntemi'
        verbose_name_plural = 'Ödeme Yöntemleri'
        ordering = ['siralama', 'ad']
        constraints = [
            models.UniqueConstraint(
                fields=['mali_hesap', 'ad'],
                condition=models.Q(silindi_mi=False, mali_hesap__isnull=False),
                name='unique_mali_hesap_odeme_yontemi_ad',
            ),
            models.UniqueConstraint(
                fields=['kurum', 'ad'],
                condition=models.Q(silindi_mi=False, mali_hesap__isnull=True),
                name='unique_kurum_odeme_yontemi_ad_no_mali',
            ),
        ]
        indexes = [
            models.Index(fields=['mali_hesap', 'aktif_mi', 'silindi_mi']),
            models.Index(fields=['kurum', 'aktif_mi', 'silindi_mi']),
            models.Index(fields=['tip']),
        ]

    def __str__(self):
        return f"{self.ad} ({self.get_tip_display()})"

    def save(self, *args, **kwargs):
        if self.mali_hesap_id:
            self.kurum_id = self.mali_hesap.sube.kurum_id
        super().save(*args, **kwargs)

    @property
    def mali_hesap_gerekli(self) -> bool:
        from apps.finans.constants.payment_types import OdemeYontemiTipi
        return self.tip not in (OdemeYontemiTipi.CEK, OdemeYontemiTipi.SENET)

    def clean(self):
        from django.core.exceptions import ValidationError
        errors = {}
        if self.komisyon_orani < 0:
            errors['komisyon_orani'] = 'Komisyon oranı negatif olamaz.'
        if self.valor_gun < 0:
            errors['valor_gun'] = 'Valör gün negatif olamaz.'
        if errors:
            raise ValidationError(errors)
