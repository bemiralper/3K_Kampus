"""Daire Dizisi yazıcı profilleri ve onay öncesi OMR tarama kayıtları."""
from django.conf import settings
from django.db import models
from django.db.models import Q


def bos_yazici_kalibrasyonu():
    return {
        'ofset_x_mm': 0.0,
        'ofset_y_mm': 0.0,
        'olcek': 1.0,
        'olcek_y': 1.0,
        'donus_derece': 0.0,
    }


def _omr_page_upload_path(instance, filename):
    return f'olcme/omr/job_{instance.job_id}/page_{instance.sequence}/{filename}'


def _omr_source_upload_path(instance, filename):
    return f'olcme/omr/job_{instance.job_id}/sources/{instance.sequence}-{filename}'


class OptikYaziciProfili(models.Model):
    """Bir kurumda tekrar kullanılabilen, adı belli yazıcı kalibrasyonu."""

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='optik_yazici_profilleri',
        verbose_name='Kurum',
    )
    ad = models.CharField('Profil adı', max_length=120)
    kalibrasyon = models.JSONField(
        'Kalibrasyon',
        default=bos_yazici_kalibrasyonu,
        help_text='Ofset, X/Y ölçek ve isteğe bağlı küçük dönüş.',
    )
    varsayilan = models.BooleanField('Varsayılan', default=False)
    son_kalite = models.JSONField('Son ölçüm kalitesi', default=dict, blank=True)
    aktif = models.BooleanField('Aktif', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        ordering = ['ad', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'ad'],
                name='unique_optik_yazici_profili_ad',
            ),
            models.UniqueConstraint(
                fields=['kurum'],
                condition=Q(varsayilan=True),
                name='unique_default_optik_yazici_profili',
            ),
        ]

    def __str__(self):
        return self.ad


class OmrTaramaOturumu(models.Model):
    """Tarama sayfalarını sonuçlara yazmadan önce hazırlayan inceleme işi."""

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Bekliyor'
        PROCESSING = 'PROCESSING', 'İşleniyor'
        REVIEW = 'REVIEW', 'İnceleme bekliyor'
        CONFIRMED = 'CONFIRMED', 'Onaylandı'
        ERROR = 'ERROR', 'Hata'

    exam = models.ForeignKey(
        'olcme_degerlendirme.Exam',
        on_delete=models.CASCADE,
        related_name='omr_tarama_oturumlari',
        verbose_name='Sınav',
    )
    sablon = models.ForeignKey(
        'olcme_degerlendirme.OptikDaireSablon',
        on_delete=models.PROTECT,
        related_name='omr_tarama_oturumlari',
        verbose_name='Daire şablonu',
    )
    status = models.CharField(
        'Durum', max_length=15, choices=Status.choices, default=Status.PENDING,
    )
    original_filenames = models.JSONField('Kaynak dosya adları', default=list, blank=True)
    total_pages = models.PositiveIntegerField('Toplam sayfa', default=0)
    processed_pages = models.PositiveIntegerField('İşlenen sayfa', default=0)
    error_pages = models.PositiveIntegerField('Hatalı sayfa', default=0)
    error_message = models.TextField('Hata mesajı', blank=True)
    result_session = models.OneToOneField(
        'olcme_degerlendirme.ExamSession',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='omr_tarama_oturumu',
        verbose_name='Oluşturulan sonuç oturumu',
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_omr_sessions',
        verbose_name='Yükleyen',
    )
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='confirmed_omr_sessions',
        verbose_name='Onaylayan',
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.exam} – OMR #{self.pk}'


class OmrTaramaDosyasi(models.Model):
    """Yüklenen asıl PDF/görsel; sayfalar işlenirken küçük gruplarda rasterlenir."""

    job = models.ForeignKey(
        OmrTaramaOturumu,
        on_delete=models.CASCADE,
        related_name='kaynaklar',
        verbose_name='Tarama oturumu',
    )
    sequence = models.PositiveIntegerField('Sıra')
    original_filename = models.CharField('Dosya adı', max_length=255)
    kind = models.CharField('Tür', max_length=8)
    page_count = models.PositiveIntegerField('Sayfa sayısı', default=1)
    file = models.FileField('Kaynak dosya', upload_to=_omr_source_upload_path)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        ordering = ['sequence', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['job', 'sequence'],
                name='unique_omr_job_source_sequence',
            ),
        ]


class OmrTaramaSayfasi(models.Model):
    """Bir öğrenciye ait raster sayfa ve kullanıcı onayına kadar geçici çözüm."""

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Bekliyor'
        PROCESSING = 'PROCESSING', 'İşleniyor'
        REVIEW = 'REVIEW', 'İnceleme bekliyor'
        READY = 'READY', 'Onaya hazır'
        ERROR = 'ERROR', 'Hata'

    job = models.ForeignKey(
        OmrTaramaOturumu,
        on_delete=models.CASCADE,
        related_name='sayfalar',
        verbose_name='Tarama oturumu',
    )
    sequence = models.PositiveIntegerField('Sıra')
    original_filename = models.CharField('Kaynak dosya adı', max_length=255)
    source_page = models.PositiveIntegerField('Kaynak sayfa', default=1)
    source_file = models.ForeignKey(
        OmrTaramaDosyasi,
        on_delete=models.CASCADE,
        related_name='sayfalar',
        null=True,
        blank=True,
        verbose_name='Kaynak dosya',
    )
    image = models.ImageField('Raster sayfa', upload_to=_omr_page_upload_path, blank=True)
    status = models.CharField(
        'Durum', max_length=15, choices=Status.choices, default=Status.PENDING,
    )
    registration = models.JSONField('Sayfa kaydı', default=dict, blank=True)
    decoded = models.JSONField('Ham OMR çözümü', default=dict, blank=True)
    review = models.JSONField('İnceleme düzeltmeleri', default=dict, blank=True)
    confidence = models.FloatField('Güven', default=0.0)
    warnings = models.JSONField('Uyarılar', default=list, blank=True)
    critical_warnings = models.JSONField('Kritik uyarılar', default=list, blank=True)
    error_message = models.TextField('Hata mesajı', blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_omr_pages',
        verbose_name='İnceleyen',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        ordering = ['sequence', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['job', 'sequence'],
                name='unique_omr_job_page_sequence',
            ),
        ]

    def __str__(self):
        return f'OMR #{self.job_id} / {self.sequence}'
