"""Yedekleme domain modelleri — Resource Registry + Artifact + Job + Schedule."""

from django.conf import settings
from django.db import models


class ResourceType(models.TextChoices):
    DATABASE_TABLE = 'database_table', 'Database Table'
    FILE_DIRECTORY = 'file_directory', 'File Directory'
    CONFIGURATION = 'configuration', 'Configuration'
    MEDIA = 'media', 'Media'
    LOGS = 'logs', 'Logs'
    CACHE = 'cache', 'Cache'
    EXPORT = 'export', 'Export'
    OTHER = 'other', 'Other'


class BackupKind(models.TextChoices):
    FULL = 'full', 'Tam Sistem'
    DATABASE = 'database', 'Veritabanı'
    FILES = 'files', 'Dosyalar'
    SETTINGS = 'settings', 'Ayarlar'
    SELECTED = 'selected', 'Seçili Kaynaklar'


class BackupTrigger(models.TextChoices):
    MANUAL = 'manual', 'Manuel'
    DAILY = 'daily', 'Günlük'
    WEEKLY = 'weekly', 'Haftalık'
    MONTHLY = 'monthly', 'Aylık'
    PRE_RESTORE = 'pre_restore', 'Restore Öncesi Güvenlik'


class ScheduleFrequency(models.TextChoices):
    OFF = 'off', 'Kapalı'
    DAILY = 'daily', 'Günlük'
    WEEKLY = 'weekly', 'Haftalık'
    MONTHLY = 'monthly', 'Aylık'


class BackupStatus(models.TextChoices):
    PENDING = 'pending', 'Bekliyor'
    RUNNING = 'running', 'Çalışıyor'
    COMPLETED = 'completed', 'Tamamlandı'
    FAILED = 'failed', 'Başarısız'
    CANCELLED = 'cancelled', 'İptal'


class JobPhase(models.TextChoices):
    QUEUED = 'queued', 'Kuyrukta'
    PREPARING = 'preparing', 'Hazırlanıyor'
    EXPORTING = 'exporting', 'Dışa aktarılıyor'
    COMPRESSING = 'compressing', 'Sıkıştırılıyor'
    ENCRYPTING = 'encrypting', 'Şifreleniyor'
    HASHING = 'hashing', 'Hash hesaplanıyor'
    STORING = 'storing', 'Kaydediliyor'
    ANALYZING = 'analyzing', 'Analiz ediliyor'
    DRY_RUN = 'dry_run', 'Dry-run'
    RESTORING = 'restoring', 'Geri yükleniyor'
    DONE = 'done', 'Tamamlandı'
    ERROR = 'error', 'Hata'


class BackupOperationAction(models.TextChoices):
    CREATE = 'create', 'Yedek Oluştur'
    DOWNLOAD = 'download', 'İndir'
    VERIFY = 'verify', 'Doğrula'
    PREVIEW = 'preview', 'Önizle'
    ANALYZE = 'analyze', 'Analiz'
    DRY_RUN = 'dry_run', 'Dry-run'
    RESTORE = 'restore', 'Geri Yükle'
    DELETE = 'delete', 'Sil'
    IMPORT = 'import', 'İçe Aktar'
    SCHEDULE_UPDATE = 'schedule_update', 'Zamanlama Güncelle'
    SETTINGS_UPDATE = 'settings_update', 'Ayar Güncelle'
    RESOURCE_UPDATE = 'resource_update', 'Kaynak Güncelle'
    RESOURCE_SYNC = 'resource_sync', 'Kaynak Sync'
    PURGE = 'purge', 'Temizlik'


class BackupResource(models.Model):
    """Resource Registry kaydı. Motor yalnızca bu kayıtları okur; silinmez."""

    code = models.CharField('Kod', max_length=128, unique=True, db_index=True)
    name = models.CharField('Kaynak Adı', max_length=255)
    resource_type = models.CharField(
        'Tür', max_length=32, choices=ResourceType.choices, default=ResourceType.OTHER,
    )
    description = models.TextField('Açıklama', blank=True, default='')
    handler_key = models.CharField('Handler', max_length=64, default='other')
    config = models.JSONField('Yapılandırma', default=dict, blank=True)
    is_active = models.BooleanField('Aktif', default=True)
    is_default = models.BooleanField('Varsayılan', default=True)
    encrypt = models.BooleanField('Şifrele', default=False)
    compress = models.BooleanField('Sıkıştır', default=True)
    priority = models.IntegerField('Öncelik', default=100)
    is_restorable = models.BooleanField('Geri Yüklenebilir', default=True)
    source_app = models.CharField('Kaynak App', max_length=128, blank=True, default='')
    is_system = models.BooleanField('Sistem Kaynağı', default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'yedekleme_resource'
        verbose_name = 'Yedek Kaynağı'
        verbose_name_plural = 'Yedek Kaynakları'
        ordering = ['priority', 'code']

    def __str__(self):
        return f'{self.code} ({self.name})'


class BackupArtifact(models.Model):
    filename = models.CharField('Dosya Adı', max_length=255)
    storage_key = models.CharField('Depolama Anahtarı', max_length=512, unique=True)
    size_bytes = models.BigIntegerField('Boyut (byte)', default=0)
    checksum = models.CharField('SHA-256', max_length=64, blank=True, default='')
    status = models.CharField(
        'Durum', max_length=20, choices=BackupStatus.choices, default=BackupStatus.PENDING,
    )
    kind = models.CharField(
        'Tür', max_length=20, choices=BackupKind.choices, default=BackupKind.FULL,
    )
    trigger = models.CharField(
        'Tetikleyici', max_length=20, choices=BackupTrigger.choices, default=BackupTrigger.MANUAL,
    )
    resource_codes = models.JSONField('Kaynak Kodları', default=list, blank=True)
    manifest = models.JSONField('Manifest', default=dict, blank=True)
    encrypted = models.BooleanField('Şifreli', default=False)
    format_version = models.CharField('Format', max_length=16, default='2.0')
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
    """Otomatik yedek zamanlaması (tek kayıt, pk=1)."""

    frequency = models.CharField(
        'Sıklık', max_length=20, choices=ScheduleFrequency.choices, default=ScheduleFrequency.OFF,
    )
    hour = models.PositiveSmallIntegerField('Saat', default=3)
    minute = models.PositiveSmallIntegerField('Dakika', default=0)
    enabled = models.BooleanField('Aktif', default=False)
    kind = models.CharField(
        'Yedek Türü', max_length=20, choices=BackupKind.choices, default=BackupKind.FULL,
    )
    resource_codes = models.JSONField('Seçili Kaynaklar', default=list, blank=True)
    max_artifacts = models.PositiveIntegerField('Maksimum Yedek', default=10)
    auto_delete_old = models.BooleanField('Eski Yedekleri Sil', default=True)
    encrypt = models.BooleanField('Şifrele', default=False)
    last_run_at = models.DateTimeField('Son Çalışma', null=True, blank=True)
    last_run_status = models.CharField('Son Çalışma Durumu', max_length=20, blank=True, default='')
    last_run_message = models.CharField('Son Çalışma Mesajı', max_length=512, blank=True, default='')
    last_run_artifact = models.ForeignKey(
        'BackupArtifact',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name='Son Çalışma Yedeği',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'yedekleme_schedule'
        verbose_name = 'Yedek Zamanlaması'
        verbose_name_plural = 'Yedek Zamanlamaları'

    @classmethod
    def get_singleton(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def effective_trigger(self) -> str:
        """Zamanlamanın mevcut durumuna göre BackupTrigger değeri.

        Kapalı/OFF ise MANUAL; aksi halde frekansa karşılık gelen tetikleyici.
        Hem orchestrator hem management command bunu kullanır (tek kaynak).
        """
        if not self.enabled or self.frequency == ScheduleFrequency.OFF:
            return BackupTrigger.MANUAL
        return {
            ScheduleFrequency.DAILY: BackupTrigger.DAILY,
            ScheduleFrequency.WEEKLY: BackupTrigger.WEEKLY,
            ScheduleFrequency.MONTHLY: BackupTrigger.MONTHLY,
        }.get(self.frequency, BackupTrigger.MANUAL)

    def record_run(self, *, artifact=None, status: str = '', message: str = ''):
        """Son otomatik/manuel-zamanlanmış çalışmayı kalıcı olarak kaydeder."""
        from django.utils import timezone

        self.last_run_at = timezone.now()
        self.last_run_status = (status or '')[:20]
        self.last_run_message = (message or '')[:512]
        update_fields = ['last_run_at', 'last_run_status', 'last_run_message']
        if artifact is not None:
            self.last_run_artifact = artifact
            update_fields.append('last_run_artifact')
        self.save(update_fields=update_fields)


class BackupSettings(models.Model):
    """Platform yedekleme ayarları (tek kayıt)."""

    encryption_enabled = models.BooleanField('Şifreleme Aktif', default=False)
    default_encrypt = models.BooleanField('Varsayılan Şifrele', default=False)
    default_compress = models.BooleanField('Varsayılan Sıkıştır', default=True)
    notify_enabled = models.BooleanField('Bildirim Aktif', default=False)
    notify_emails = models.CharField('Bildirim E-postaları', max_length=512, blank=True, default='')
    notify_on_success = models.BooleanField('Başarıda Bildir', default=False)
    notify_on_failure = models.BooleanField('Hatada Bildir', default=True)
    notes = models.TextField('Notlar', blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'yedekleme_settings'
        verbose_name = 'Yedekleme Ayarı'
        verbose_name_plural = 'Yedekleme Ayarları'

    @classmethod
    def get_singleton(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class BackupJob(models.Model):
    """Canlı işlem durumu (polling için)."""

    artifact = models.ForeignKey(
        BackupArtifact,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='jobs',
    )
    action = models.CharField(max_length=32, choices=BackupOperationAction.choices)
    status = models.CharField(
        max_length=20, choices=BackupStatus.choices, default=BackupStatus.PENDING,
    )
    phase = models.CharField(max_length=32, choices=JobPhase.choices, default=JobPhase.QUEUED)
    progress = models.PositiveSmallIntegerField(default=0)
    message = models.CharField(max_length=512, blank=True, default='')
    result = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default='')
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='backup_jobs',
    )

    class Meta:
        db_table = 'yedekleme_job'
        ordering = ['-started_at']


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
    job = models.ForeignKey(
        BackupJob,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='logs',
    )
    step = models.CharField('Adım', max_length=128, blank=True, default='')
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
