"""
Günlük sınıf yoklama — sabah / öğleden sonra periyot oturumu.
"""
from django.db import models

from apps.academic.domain.lesson_attendance import StudentAttendanceStatus


class ClassPeriodCode(models.TextChoices):
    MORNING = 'MORNING', 'Sabah'
    AFTERNOON = 'AFTERNOON', 'Öğleden Sonra'


class ClassPeriodAttendanceSession(models.Model):
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='class_period_attendance_sessions',
    )
    term = models.ForeignKey(
        'term.Term',
        on_delete=models.CASCADE,
        related_name='class_period_attendance_sessions',
    )
    schedule_version = models.ForeignKey(
        'academic.ScheduleVersion',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_period_attendance_sessions',
    )
    sinif = models.ForeignKey(
        'sinif.Sinif',
        on_delete=models.CASCADE,
        related_name='class_period_attendance_sessions',
    )
    session_date = models.DateField(db_index=True)
    period = models.CharField(
        max_length=16,
        choices=ClassPeriodCode.choices,
        db_index=True,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_class_period_attendance',
    )

    class Meta:
        db_table = 'academic_class_period_attendance_session'
        verbose_name = 'Günlük Sınıf Yoklama Oturumu'
        verbose_name_plural = 'Günlük Sınıf Yoklama Oturumları'
        ordering = ['session_date', 'period', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['sinif', 'session_date', 'period'],
                condition=models.Q(is_active=True),
                name='unique_active_class_period_attendance',
            ),
        ]
        indexes = [
            models.Index(
                fields=['sinif', 'session_date'],
                name='acad_period_att_sinif_date',
            ),
        ]

    def __str__(self):
        return f'{self.sinif_id} · {self.session_date} · {self.period}'

    @property
    def period_label(self) -> str:
        return dict(ClassPeriodCode.choices).get(self.period, self.period)


class ClassPeriodAttendanceRecord(models.Model):
    session = models.ForeignKey(
        ClassPeriodAttendanceSession,
        on_delete=models.CASCADE,
        related_name='records',
    )
    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='class_period_attendance_records',
    )
    status = models.CharField(
        max_length=16,
        choices=StudentAttendanceStatus.choices,
        default=StudentAttendanceStatus.PRESENT,
    )
    note = models.CharField(max_length=255, blank=True, default='')
    marked_at = models.DateTimeField(auto_now=True)
    marked_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='marked_class_period_attendance',
    )

    class Meta:
        db_table = 'academic_class_period_attendance_record'
        verbose_name = 'Günlük Sınıf Yoklama Kaydı'
        verbose_name_plural = 'Günlük Sınıf Yoklama Kayıtları'
        ordering = ['student__ad', 'student__soyad', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['session', 'student'],
                name='unique_class_period_attendance_student',
            ),
        ]

    def __str__(self):
        return f'{self.session_id} · {self.student_id} · {self.status}'


class ClassAttendanceNotifySource(models.TextChoices):
    LESSON = 'LESSON', 'Ders oturumu'
    PERIOD = 'PERIOD', 'Günlük periyot'


class ClassAttendanceNotificationLog(models.Model):
    """Akademik yoklama WhatsApp gönderim dedupe kaydı."""

    source_type = models.CharField(
        max_length=16,
        choices=ClassAttendanceNotifySource.choices,
    )
    source_id = models.PositiveIntegerField(db_index=True)
    ogrenci = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='class_attendance_notify_logs',
    )
    recipient_type = models.CharField(max_length=16)  # VELI | OGRENCI
    recipient_id = models.PositiveIntegerField()
    event_key = models.CharField(max_length=64)
    message = models.ForeignKey(
        'communication.Message',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_attendance_notify_logs',
    )
    sent_at = models.DateTimeField(auto_now_add=True)
    sent_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_attendance_notifies',
    )

    class Meta:
        db_table = 'academic_class_attendance_notify_log'
        verbose_name = 'Sınıf Yoklama Bildirim Logu'
        verbose_name_plural = 'Sınıf Yoklama Bildirim Logları'
        ordering = ['-sent_at', '-id']
        constraints = [
            models.UniqueConstraint(
                fields=[
                    'source_type', 'source_id', 'ogrenci',
                    'recipient_type', 'recipient_id', 'event_key',
                ],
                name='unique_class_attendance_notify',
            ),
        ]
        indexes = [
            models.Index(
                fields=['source_type', 'source_id', 'event_key'],
                name='acad_att_notify_src_idx',
            ),
        ]
