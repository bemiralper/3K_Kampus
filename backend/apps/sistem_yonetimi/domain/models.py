from django.conf import settings
from django.db import models


class HealthStatus(models.TextChoices):
    UP = 'up', 'Çalışıyor'
    WARN = 'warn', 'Uyarı'
    DOWN = 'down', 'Hata'
    STOPPED = 'stopped', 'Durduruldu'
    UNKNOWN = 'unknown', 'Bilinmiyor'


class JobRunStatus(models.TextChoices):
    PENDING = 'pending', 'Bekliyor'
    RUNNING = 'running', 'Çalışıyor'
    COMPLETED = 'completed', 'Tamamlandı'
    FAILED = 'failed', 'Başarısız'


class SystemSettings(models.Model):
    """Panel ayarları (tek kayıt)."""

    poll_interval_sec = models.PositiveIntegerField(default=20)
    disk_warn_percent = models.PositiveSmallIntegerField(default=85)
    disk_critical_percent = models.PositiveSmallIntegerField(default=90)
    error_rate_warn_per_min = models.PositiveIntegerField(default=10)
    scheduler_stale_minutes = models.PositiveIntegerField(default=15)
    ops_enabled = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sistem_yonetimi_settings'

    @classmethod
    def get_singleton(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class SystemMetricSample(models.Model):
    collected_at = models.DateTimeField(db_index=True)
    cpu_percent = models.FloatField(default=0)
    ram_percent = models.FloatField(default=0)
    ram_used_bytes = models.BigIntegerField(default=0)
    ram_total_bytes = models.BigIntegerField(default=0)
    disk_percent = models.FloatField(default=0)
    disk_used_bytes = models.BigIntegerField(default=0)
    disk_total_bytes = models.BigIntegerField(default=0)
    disk_read_bytes = models.BigIntegerField(default=0)
    disk_write_bytes = models.BigIntegerField(default=0)
    net_bytes_sent = models.BigIntegerField(default=0)
    net_bytes_recv = models.BigIntegerField(default=0)
    pg_connections = models.PositiveIntegerField(default=0)
    extra = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'sistem_yonetimi_metric'
        ordering = ['-collected_at']
        indexes = [
            models.Index(fields=['-collected_at'], name='sistem_metric_at_idx'),
        ]


class SystemErrorEvent(models.Model):
    fingerprint = models.CharField(max_length=64, db_index=True)
    module = models.CharField(max_length=64, blank=True, default='')
    error_type = models.CharField(max_length=128, blank=True, default='')
    message = models.TextField()
    stack_trace = models.TextField(blank=True, default='')
    request_url = models.TextField(blank=True, default='')
    http_method = models.CharField(max_length=16, blank=True, default='')
    status_code = models.PositiveSmallIntegerField(null=True, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default='')
    request_params = models.JSONField(default=dict, blank=True)
    occurrence_count = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, default='open')  # open|resolved|ignored
    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sistem_yonetimi_error'
        ordering = ['-last_seen_at']


class SystemAuditLog(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )
    module = models.CharField(max_length=64, db_index=True)
    action = models.CharField(max_length=64, db_index=True)
    description = models.TextField(blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'sistem_yonetimi_audit'
        ordering = ['-created_at']


class SystemTimelineEvent(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    category = models.CharField(max_length=32, db_index=True)  # backup|comm|auth|finans|system|job
    title = models.CharField(max_length=255)
    detail = models.TextField(blank=True, default='')
    level = models.CharField(max_length=16, default='info')  # info|success|warning|error
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'sistem_yonetimi_timeline'
        ordering = ['-created_at']


class SystemJobRun(models.Model):
    job_code = models.CharField(max_length=64, db_index=True)
    status = models.CharField(max_length=20, choices=JobRunStatus.choices, default=JobRunStatus.PENDING)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    result_message = models.TextField(blank=True, default='')
    output = models.TextField(blank=True, default='')
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'sistem_yonetimi_job_run'
        ordering = ['-created_at']


class SystemAlertState(models.Model):
    code = models.CharField(max_length=64, unique=True)
    active = models.BooleanField(default=True)
    severity = models.CharField(max_length=16, default='warning')  # info|warning|critical
    title = models.CharField(max_length=255)
    message = models.TextField(blank=True, default='')
    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'sistem_yonetimi_alert'
        ordering = ['-last_seen_at']
