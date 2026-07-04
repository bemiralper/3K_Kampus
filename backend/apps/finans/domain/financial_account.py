"""
Mali Hesap Domain Model
Şube düzeyinde tanımlanan mali hesaplar.

İş Kuralları:
- Şube başına mali hesap adı benzersiz olmalı (silinen kayıtlar hariç)
- BANKA tipinde IBAN opsiyonel (girilirse format kontrolü)
- Silme işlemi SOFT DELETE ile yapılır (silindi_mi=True)
- Bakiye negatif olabilir (borç durumu)
- Eğitim yılından BAĞIMSIZ — kalıcı parametrik veri
- Para birimi default TRY, ancak değiştirilebilir
"""
from decimal import Decimal
from django.db import models
from django.core.validators import MinLengthValidator

from apps.finans.constants.account_types import MaliHesapTipi, BankaKodu


class ParaBirimi:
    """Desteklenen para birimleri."""
    TRY = 'TRY'
    USD = 'USD'
    EUR = 'EUR'
    GBP = 'GBP'

    CHOICES = [
        (TRY, 'Türk Lirası'),
        (USD, 'ABD Doları'),
        (EUR, 'Euro'),
        (GBP, 'İngiliz Sterlini'),
    ]


class MaliHesapManager(models.Manager):
    """Soft delete filtresi uygulayan custom manager."""

    def get_queryset(self):
        return super().get_queryset().filter(silindi_mi=False)

    def tumu(self):
        """Silinmiş kayıtlar dahil tümünü döndürür."""
        return super().get_queryset()

    def silinenler(self):
        """Sadece silinmiş kayıtları döndürür."""
        return super().get_queryset().filter(silindi_mi=True)


class MaliHesap(models.Model):
    """
    Mali Hesap (Financial Account)
    Şube düzeyinde tanımlanır. Tahsilatların hangi hesaba girdiğini
    ve kasaların/bankaların takibini sağlar.

    Örnek: Merkez Kasa, Ziraat Bankası Hesabı, Garanti POS
    """

    # ─── İlişkiler ───────────────────────────────
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='mali_hesaplar',
        verbose_name='Şube',
    )

    # ─── Temel Bilgiler ──────────────────────────
    ad = models.CharField(
        'Hesap Adı',
        max_length=200,
        help_text='Kullanıcıya görünen isim — örn: Vakıfbank Merkez, Merkez Nakit Kasası',
    )
    tip = models.CharField(
        'Hesap Tipi',
        max_length=20,
        choices=MaliHesapTipi.CHOICES,
        default=MaliHesapTipi.KASA,
        help_text='Hesabın türü',
    )

    # ─── Banka Bilgileri ─────────────────────────
    iban = models.CharField(
        'IBAN',
        max_length=34,
        blank=True,
        default='',
        help_text='Banka hesabı için IBAN numarası (TR ile başlamalı)',
    )
    banka = models.CharField(
        'Banka',
        max_length=30,
        choices=BankaKodu.CHOICES,
        blank=True,
        default='',
        help_text='Banka hesabı veya POS için banka seçimi',
    )
    banka_adi = models.CharField(
        'Banka Adı',
        max_length=100,
        blank=True,
        default='',
        help_text='Banka seçiminin görünen adı (banka alanından türetilir)',
    )
    hesap_no = models.CharField(
        'Hesap No',
        max_length=50,
        blank=True,
        default='',
        help_text='Banka hesap numarası (IBAN\'dan bağımsız, opsiyonel)',
    )

    # ─── Finansal Bilgiler ───────────────────────
    baslangic_bakiye = models.DecimalField(
        'Başlangıç Bakiye',
        max_digits=15,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text='Hesabın açılış bakiyesi',
    )
    para_birimi = models.CharField(
        'Para Birimi',
        max_length=3,
        choices=ParaBirimi.CHOICES,
        default=ParaBirimi.TRY,
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
    objects = MaliHesapManager()
    all_objects = models.Manager()  # Soft delete bypass

    class Meta:
        db_table = 'finans_mali_hesap'
        verbose_name = 'Mali Hesap'
        verbose_name_plural = 'Mali Hesaplar'
        ordering = ['siralama', 'ad']
        constraints = [
            models.UniqueConstraint(
                fields=['sube', 'ad'],
                condition=models.Q(silindi_mi=False),
                name='unique_sube_mali_hesap_ad',
            ),
        ]
        indexes = [
            models.Index(fields=['sube', 'aktif_mi', 'silindi_mi']),
            models.Index(fields=['tip']),
        ]

    def __str__(self):
        return f"{self.ad} ({self.get_tip_display()})"

    def clean(self):
        from django.core.exceptions import ValidationError
        errors = {}
        # IBAN girildiyse format kontrolü
        if MaliHesapTipi.banka_zorunlu_mu(self.tip) and not self.banka:
            errors['banka'] = 'Bu hesap tipi için banka seçimi zorunludur.'
        if self.banka and self.banka not in BankaKodu.get_values():
            errors['banka'] = 'Geçersiz banka seçimi.'
        # IBAN format kontrolü (basit)
        if self.iban and not self.iban.startswith('TR'):
            errors['iban'] = 'IBAN, TR ile başlamalıdır.'
        if self.iban and len(self.iban) != 26:
            errors['iban'] = 'IBAN 26 karakter olmalıdır.'
        if errors:
            raise ValidationError(errors)
