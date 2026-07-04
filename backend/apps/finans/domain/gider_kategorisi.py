"""
Gider Kategorisi Domain Model
İki seviyeli kategori yapısı: Ana Kategori + Alt Kategori.

İş Kuralları:
- Ana kategorinin parent'ı None'dır
- Alt kategorinin parent'ı bir ana kategoridir (sadece 2 seviye)
- Kurum başına kategori adı benzersiz (parent bazlı)
- Silme soft delete ile yapılır
- Bir ana kategori silinirse alt kategorileri de silinir
- Eğitim yılından BAĞIMSIZ — kalıcı parametrik veri
"""
from django.db import models
from django.utils import timezone


class GiderKategorisiManager(models.Manager):
    """Soft delete filtresi uygulayan custom manager."""

    def get_queryset(self):
        return super().get_queryset().filter(silindi_mi=False)

    def tumu(self):
        return super().get_queryset()

    def silinenler(self):
        return super().get_queryset().filter(silindi_mi=True)


class GiderKategorisi(models.Model):
    """
    Gider Kategorisi (Expense Category)
    İki seviyeli hiyerarşi: parent=None → Ana Kategori, parent!=None → Alt Kategori.
    Kurum + şube düzeyinde tanımlanır — her şube kendi kategori ağacına sahiptir.

    Örnek:
      Ana: Personel Giderleri
        ├─ Maaş
        ├─ SGK Primi
        └─ Yemek
    """

    # ─── İlişkiler ───────────────────────────────
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='gider_kategorileri',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='gider_kategorileri',
        verbose_name='Şube',
        help_text='Her şubenin kendi gider kategori seti vardır',
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='alt_kategoriler',
        verbose_name='Üst Kategori',
        help_text='Boş ise ana kategoridir',
    )

    # ─── Temel Bilgiler ──────────────────────────
    ad = models.CharField(
        'Kategori Adı',
        max_length=150,
    )
    ikon = models.CharField(
        'İkon',
        max_length=10,
        blank=True,
        default='',
        help_text='Emoji ikon (opsiyonel)',
    )
    renk = models.CharField(
        'Renk',
        max_length=7,
        blank=True,
        default='',
        help_text='Hex renk kodu, örn: #3b82f6',
    )
    aciklama = models.TextField(
        'Açıklama',
        blank=True,
        default='',
    )

    # ─── Sıralama & Durum ────────────────────────
    siralama = models.PositiveIntegerField(
        'Sıralama',
        default=0,
    )
    aktif_mi = models.BooleanField(
        'Aktif',
        default=True,
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
    objects = GiderKategorisiManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'finans_gider_kategorisi'
        verbose_name = 'Gider Kategorisi'
        verbose_name_plural = 'Gider Kategorileri'
        ordering = ['siralama', 'ad']
        constraints = [
            models.UniqueConstraint(
                fields=['sube', 'parent', 'ad'],
                condition=models.Q(silindi_mi=False),
                name='unique_sube_gider_kategori_ad',
            ),
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'parent', 'aktif_mi', 'silindi_mi']),
        ]

    def __str__(self):
        if self.parent:
            return f"{self.parent.ad} → {self.ad}"
        return self.ad

    @property
    def is_ana_kategori(self):
        return self.parent_id is None

    def soft_delete(self):
        """Kendisini ve tüm alt kategorilerini soft delete eder."""
        now = timezone.now()
        if self.is_ana_kategori:
            # Alt kategorileri de sil
            GiderKategorisi.objects.filter(parent=self).update(
                silindi_mi=True,
                silinme_tarihi=now,
            )
        self.silindi_mi = True
        self.silinme_tarihi = now
        self.save(update_fields=['silindi_mi', 'silinme_tarihi'])
