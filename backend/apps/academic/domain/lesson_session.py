"""
LessonSession — tarihli ders oturumu (operasyon katmanı).

ProgramGridCell haftalık plandır; LessonSession o planın (veya ad-hoc dersin)
belirli bir gündeki gerçekleşmesidir. Yoklama ve ücret buraya bağlanır.
"""

from django.db import models


class SessionKind(models.TextChoices):
    REGULAR = 'REGULAR', 'Normal Ders'
    PRIVATE = 'PRIVATE', 'Özel Ders'
    MAKEUP = 'MAKEUP', 'Telafi Dersi'
    EXTRA = 'EXTRA', 'Ek Ders'


class SessionStatus(models.TextChoices):
    SCHEDULED = 'SCHEDULED', 'Planlandı'
    IN_PROGRESS = 'IN_PROGRESS', 'Devam Ediyor'
    COMPLETED = 'COMPLETED', 'Tamamlandı'
    CANCELLED = 'CANCELLED', 'İptal'
    POSTPONED = 'POSTPONED', 'Ertelendi'
    NO_SHOW = 'NO_SHOW', 'Öğretmen Gelmedi'


class TeacherAttendanceStatus(models.TextChoices):
    PENDING = 'PENDING', 'Bekliyor'
    PRESENT = 'PRESENT', 'Geldi'
    ABSENT = 'ABSENT', 'Gelmedi'
    SUBSTITUTE = 'SUBSTITUTE', 'Yerine Başkası'


class LessonSession(models.Model):
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='lesson_sessions',
        verbose_name='Eğitim Yılı',
    )
    term = models.ForeignKey(
        'term.Term',
        on_delete=models.CASCADE,
        related_name='lesson_sessions',
        verbose_name='Dönem',
    )
    schedule_version = models.ForeignKey(
        'academic.ScheduleVersion',
        on_delete=models.CASCADE,
        related_name='lesson_sessions',
        verbose_name='Program Versiyonu',
        null=True,
        blank=True,
    )
    source_grid_cell = models.ForeignKey(
        'academic.ProgramGridCell',
        on_delete=models.SET_NULL,
        related_name='lesson_sessions',
        verbose_name='Kaynak Grid Hücresi',
        null=True,
        blank=True,
    )
    class_lesson_plan = models.ForeignKey(
        'academic.ClassLessonPlan',
        on_delete=models.SET_NULL,
        related_name='lesson_sessions',
        verbose_name='Sınıf Ders Planı',
        null=True,
        blank=True,
    )

    session_date = models.DateField(verbose_name='Tarih', db_index=True)
    weekly_day = models.ForeignKey(
        'academic.WeeklyDay',
        on_delete=models.SET_NULL,
        related_name='lesson_sessions',
        null=True,
        blank=True,
    )
    timeslot = models.ForeignKey(
        'academic.TimeSlot',
        on_delete=models.PROTECT,
        related_name='lesson_sessions',
        verbose_name='Ders Saati',
    )
    start_time = models.TimeField(verbose_name='Başlangıç')
    end_time = models.TimeField(verbose_name='Bitiş')

    sinif = models.ForeignKey(
        'sinif.Sinif',
        on_delete=models.CASCADE,
        related_name='lesson_sessions',
        verbose_name='Sınıf',
        null=True,
        blank=True,
        help_text='Özel derslerde boş olabilir',
    )
    ders = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.PROTECT,
        related_name='lesson_sessions',
        verbose_name='Ders',
    )
    ogretmen = models.ForeignKey(
        'personel.Personel',
        on_delete=models.PROTECT,
        related_name='lesson_sessions',
        verbose_name='Öğretmen',
    )
    substitute_ogretmen = models.ForeignKey(
        'personel.Personel',
        on_delete=models.SET_NULL,
        related_name='substitute_lesson_sessions',
        verbose_name='Yedek Öğretmen',
        null=True,
        blank=True,
    )

    session_kind = models.CharField(
        max_length=16,
        choices=SessionKind.choices,
        default=SessionKind.REGULAR,
        db_index=True,
    )
    status = models.CharField(
        max_length=16,
        choices=SessionStatus.choices,
        default=SessionStatus.SCHEDULED,
        db_index=True,
    )
    teacher_attendance = models.CharField(
        max_length=16,
        choices=TeacherAttendanceStatus.choices,
        default=TeacherAttendanceStatus.PENDING,
    )

    # Özel ders öğrencisi (tek öğrenci odaklı)
    private_student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.SET_NULL,
        related_name='private_lesson_sessions',
        null=True,
        blank=True,
        verbose_name='Özel Ders Öğrencisi',
    )
    # Telafi: hangi oturumun yerine
    replaces_session = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        related_name='makeup_sessions',
        null=True,
        blank=True,
        verbose_name='Telafi Edilen Oturum',
    )

    notes = models.TextField(blank=True, default='')
    cancel_reason = models.CharField(max_length=255, blank=True, default='')
    payable = models.BooleanField(
        default=True,
        verbose_name='Ücrete dahil',
        help_text='Tamamlanan oturum ders ücretine sayılır mı',
    )
    duration_minutes = models.PositiveIntegerField(
        default=0,
        verbose_name='Süre (dk)',
        help_text='0 ise timeslot süresinden hesaplanır',
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_lesson_sessions',
    )

    class Meta:
        db_table = 'academic_lesson_session'
        verbose_name = 'Ders Oturumu'
        verbose_name_plural = 'Ders Oturumları'
        ordering = ['session_date', 'start_time', 'id']
        indexes = [
            models.Index(fields=['session_date', 'status'], name='idx_ls_date_status'),
            models.Index(fields=['ogretmen', 'session_date'], name='idx_ls_teacher_date'),
            models.Index(fields=['sinif', 'session_date'], name='idx_ls_sinif_date'),
            models.Index(fields=['session_kind', 'session_date'], name='idx_ls_kind_date'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['schedule_version', 'session_date', 'timeslot', 'sinif'],
                condition=models.Q(
                    is_active=True,
                    session_kind='REGULAR',
                    sinif__isnull=False,
                    schedule_version__isnull=False,
                ),
                name='unique_regular_session_per_slot',
            ),
        ]

    def __str__(self):
        return f'{self.session_date} {self.start_time} {self.ders_id} ({self.get_session_kind_display()})'

    @property
    def effective_teacher(self):
        if (
            self.teacher_attendance == TeacherAttendanceStatus.SUBSTITUTE
            and self.substitute_ogretmen_id
        ):
            return self.substitute_ogretmen
        return self.ogretmen

    def resolved_duration_minutes(self) -> int:
        if self.duration_minutes:
            return self.duration_minutes
        if self.start_time and self.end_time:
            from datetime import datetime, date as date_cls
            start = datetime.combine(date_cls.today(), self.start_time)
            end = datetime.combine(date_cls.today(), self.end_time)
            return max(int((end - start).total_seconds() // 60), 0)
        return 0
