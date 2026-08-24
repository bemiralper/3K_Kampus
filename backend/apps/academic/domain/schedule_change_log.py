"""
ScheduleChangeLog — program revizyon / değişiklik günlüğü.
"""

from django.db import models


class ScheduleChangeAction(models.TextChoices):
    CELL_FILL = 'CELL_FILL', 'Hücre Doldurma'
    CELL_CLEAR = 'CELL_CLEAR', 'Hücre Temizleme'
    CELL_MOVE = 'CELL_MOVE', 'Hücre Taşıma'
    # Kod değerleri geçmiş kayıtlarla uyumlu kalsın diye VERSION_* olarak
    # duruyor; kullanıcıya gösterilen etiketlerde versiyon kavramı yok.
    VERSION_CREATE = 'VERSION_CREATE', 'Program Oluşturma'
    VERSION_ACTIVATE = 'VERSION_ACTIVATE', 'Program Etkinleştirme'
    VERSION_LOCK = 'VERSION_LOCK', 'Program Kilitleme'
    VERSION_UNLOCK = 'VERSION_UNLOCK', 'Program Kilit Açma'
    SESSION_CREATE = 'SESSION_CREATE', 'Oturum Oluşturma'
    SESSION_CANCEL = 'SESSION_CANCEL', 'Oturum İptal'
    SESSION_COMPLETE = 'SESSION_COMPLETE', 'Oturum Tamamlama'
    PLAN_CREATE = 'PLAN_CREATE', 'Ders Planı Oluşturma'
    PLAN_DELETE = 'PLAN_DELETE', 'Ders Planı Silme'
    PLAN_SEED = 'PLAN_SEED', 'Alandan Doldurma'
    PLAN_COPY = 'PLAN_COPY', 'Sınıfa Kopyalama'


class ScheduleChangeLog(models.Model):
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='schedule_change_logs',
        null=True,
        blank=True,
    )
    term = models.ForeignKey(
        'term.Term',
        on_delete=models.CASCADE,
        related_name='schedule_change_logs',
        null=True,
        blank=True,
    )
    schedule_version = models.ForeignKey(
        'academic.ScheduleVersion',
        on_delete=models.CASCADE,
        related_name='change_logs',
        null=True,
        blank=True,
    )
    lesson_session = models.ForeignKey(
        'academic.LessonSession',
        on_delete=models.SET_NULL,
        related_name='change_logs',
        null=True,
        blank=True,
    )
    action = models.CharField(max_length=32, choices=ScheduleChangeAction.choices)
    summary = models.CharField(max_length=500)
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='schedule_change_logs',
    )

    class Meta:
        db_table = 'academic_schedule_change_log'
        verbose_name = 'Program Değişiklik Kaydı'
        verbose_name_plural = 'Program Değişiklik Kayıtları'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.action} · {self.summary[:60]}'
