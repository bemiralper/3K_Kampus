from django.conf import settings
from django.db import models


class BackupTrigger(models.TextChoices):
    MANUAL = 'manual', 'Manuel'
    DAILY = 'daily', 'Günlük'
    WEEKLY = 'weekly', 'Haftalık'
    MONTHLY = 'monthly', 'Aylık'


class BackupStatus(models.TextChoices):
    PENDING = 'pending', 'Bekliyor'
    RUNNING = 'running', 'Çalışıyor'
    COMPLETED = 'completed', 'Tamamlandı'
    FAILED = 'failed', 'Başarısız'


class BackupOperationAction(models.TextChoices):
    CREATE = 'create', 'Yedek Oluştur'
    DOWNLOAD = 'download', 'İndir'
    VALIDATE = 'validate', 'Doğrula'
    RESTORE = 'restore', 'Geri Yükle'
    DELETE = 'delete', 'Sil'
    SCHEDULE_UPDATE = 'schedule_update', 'Zamanlama Güncelle'
    PURGE = 'purge', 'Temizlik'


class BackupArtifact(models.Model):
    filename = models.CharField('Dosya Adı', max_length=255)
    storage_key = models.CharField('Depolama Anahtarı', max_length=512, unique=True)
    size_bytes = models.BigIntegerField('Boyut (byte)', default=0)
    checksum = models.CharField('SHA-256', max_length=64, blank=True, default='')
    status = models.CharField(
        'Durum', max_length=20, choices=BackupStatus.choices, default=BackupStatus.PENDING,
    )
    trigger = models.CharField(
        'Tetikleyici', max_length=20, choices=BackupTrigger.choices, default=BackupTrigger.MANUAL,
    )
    components = models.JSONField('Bileşenler', default=dict, blank=True)
    started_at = models.DateTimeField('Başlangıç', auto_now_add=True)
    finished_at = models.DateTimeField('Bitiş', null=True, blank=True)
    duration_ms = models.PositiveIntegerField('Süre (ms)', null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='backup_artifacts',
        verbose_name='Oluşturan',
    )
    error_message = models.TextField('Hata', blank=True, default='')

    class Meta:
        db_table = 'yedekleme_artifact'
        verbose_name = 'Yedek Dosyası'
        verbose_name_plural = 'Yedek Dosyaları'
        ordering = ['-started_at']

    def __str__(self):
        return self.filename


class BackupSchedule(models.Model):
    """Platform geneli otomatik yedek zamanlaması (tek kayıt)."""

    frequency = models.CharField(
        'Sıklık',
        max_length=20,
        choices=BackupTrigger.choices,
        default=BackupTrigger.DAILY,
    )
    hour = models.PositiveSmallIntegerField('Saat', default=3)
    minute = models.PositiveSmallIntegerField('Dakika', default=0)
    enabled = models.BooleanField('Aktif', default=False)
    include_logs = models.BooleanField('Logları Dahil Et', default=False)
    last_run_at = models.DateTimeField('Son Çalışma', null=True, blank=True)
    retention_override = models.JSONField('Retention Override', null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'yedekleme_schedule'
        verbose_name = 'Yedek Zamanlaması'
        verbose_name_plural = 'Yedek Zamanlamaları'

    @classmethod
    def get_singleton(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class BackupOperationLog(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='backup_operations',
    )
    ip_address = models.GenericIPAddressField('IP', null=True, blank=True)
    action = models.CharField('İşlem', max_length=32, choices=BackupOperationAction.choices)
    artifact = models.ForeignKey(
        BackupArtifact,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='operation_logs',
    )
    duration_ms = models.PositiveIntegerField('Süre (ms)', null=True, blank=True)
    success = models.BooleanField('Başarılı', default=True)
    error_message = models.TextField('Hata', blank=True, default='')
    metadata = models.JSONField('Metadata', default=dict, blank=True)
    created_at = models.DateTimeField('Tarih', auto_now_add=True)

    class Meta:
        db_table = 'yedekleme_operation_log'
        verbose_name = 'Yedekleme İşlem Logu'
        verbose_name_plural = 'Yedekleme İşlem Logları'
        ordering = ['-created_at']
