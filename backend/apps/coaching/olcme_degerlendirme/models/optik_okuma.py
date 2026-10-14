from django.conf import settings
from django.db import models


def _okuma_kaynak_path(instance, filename):
    return f'olcme/optik-okuma/oturum_{instance.oturum_id}/kaynak/{filename}'


def _okuma_sayfa_path(instance, filename):
    return f'olcme/optik-okuma/oturum_{instance.oturum_id}/sayfa_{instance.sequence}.png'


class OptikOkumaOturumu(models.Model):
    """Yeni okuma sayfasının oturumu. Optik form şablonunu ve sınav sonucunu değiştirmez."""

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Bekliyor'
        PROCESSING = 'PROCESSING', 'İşleniyor'
        REVIEW = 'REVIEW', 'İnceleme'
        ERROR = 'ERROR', 'Hata'

    sablon = models.ForeignKey(
        'olcme_degerlendirme.OptikDaireSablon',
        on_delete=models.PROTECT,
        related_name='okuma_oturumlari',
        verbose_name='Daire şablonu',
    )
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    original_filename = models.CharField(max_length=255, blank=True)
    total_pages = models.PositiveIntegerField(default=0)
    processed_pages = models.PositiveIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='optik_okuma_oturumlari',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        ordering = ['-created_at', '-id']


class OptikOkumaKaynak(models.Model):
    oturum = models.ForeignKey(OptikOkumaOturumu, on_delete=models.CASCADE, related_name='kaynaklar')
    original_filename = models.CharField(max_length=255)
    kind = models.CharField(max_length=8)
    page_count = models.PositiveIntegerField(default=1)
    file = models.FileField(upload_to=_okuma_kaynak_path)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        ordering = ['id']


class OptikOkumaSayfa(models.Model):
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Bekliyor'
        REVIEW = 'REVIEW', 'İnceleme'
        ERROR = 'ERROR', 'Hata'

    oturum = models.ForeignKey(OptikOkumaOturumu, on_delete=models.CASCADE, related_name='sayfalar')
    sequence = models.PositiveIntegerField()
    source_page = models.PositiveIntegerField(default=1)
    kaynak = models.ForeignKey(
        OptikOkumaKaynak, on_delete=models.CASCADE, related_name='sayfalar', null=True, blank=True,
    )
    image = models.ImageField(upload_to=_okuma_sayfa_path, blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    registration = models.JSONField(default=dict, blank=True)
    decoded = models.JSONField(default=dict, blank=True)
    overlay = models.JSONField(default=list, blank=True)
    review = models.JSONField(default=dict, blank=True)
    confidence = models.FloatField(default=0)
    warnings = models.JSONField(default=list, blank=True)
    critical_warnings = models.JSONField(default=list, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        ordering = ['sequence', 'id']
        constraints = [
            models.UniqueConstraint(fields=['oturum', 'sequence'], name='unique_optik_okuma_sayfa'),
        ]
