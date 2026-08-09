"""
ClassScheduleNotifyLog — sınıf ders programı WhatsApp bildirimi geçmişi.
"""
from django.db import models


class ClassScheduleNotifyStatus(models.TextChoices):
    SENT = 'SENT', 'Gönderildi'
    PARTIAL = 'PARTIAL', 'Kısmi'
    SKIPPED = 'SKIPPED', 'Atlandı'
    FAILED = 'FAILED', 'Başarısız'


class ClassScheduleNotifyLog(models.Model):
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='class_schedule_notify_logs',
    )
    term = models.ForeignKey(
        'term.Term',
        on_delete=models.CASCADE,
        related_name='class_schedule_notify_logs',
    )
    schedule_version = models.ForeignKey(
        'academic.ScheduleVersion',
        on_delete=models.CASCADE,
        related_name='notify_logs',
    )
    sinif = models.ForeignKey(
        'sinif.Sinif',
        on_delete=models.CASCADE,
        related_name='schedule_notify_logs',
    )
    grid_fingerprint = models.CharField(max_length=64, db_index=True)
    veli_count = models.PositiveIntegerField(default=0)
    ogrenci_count = models.PositiveIntegerField(default=0)
    status = models.CharField(
        max_length=16,
        choices=ClassScheduleNotifyStatus.choices,
        default=ClassScheduleNotifyStatus.SENT,
    )
    detail = models.JSONField(default=dict, blank=True)
    sent_at = models.DateTimeField(auto_now_add=True, db_index=True)
    sent_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_schedule_notify_logs',
    )

    class Meta:
        db_table = 'academic_class_schedule_notify_log'
        verbose_name = 'Sınıf Programı Bildirim Kaydı'
        verbose_name_plural = 'Sınıf Programı Bildirim Kayıtları'
        ordering = ['-sent_at', '-id']
        indexes = [
            models.Index(
                fields=['schedule_version', 'sinif', '-sent_at'],
                name='acad_notify_ver_sinif_idx',
            ),
        ]

    def __str__(self):
        return f'{self.sinif_id} · {self.schedule_version_id} · {self.status}'
