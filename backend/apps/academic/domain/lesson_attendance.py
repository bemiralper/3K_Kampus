"""
LessonAttendanceRecord — ders oturumu öğrenci yoklaması.
"""

from django.db import models


class StudentAttendanceStatus(models.TextChoices):
    PRESENT = 'PRESENT', 'Var'
    LATE = 'LATE', 'Geç'
    ABSENT = 'ABSENT', 'Yok'
    EXCUSED = 'EXCUSED', 'İzinli'


class LessonAttendanceRecord(models.Model):
    session = models.ForeignKey(
        'academic.LessonSession',
        on_delete=models.CASCADE,
        related_name='attendance_records',
        verbose_name='Ders Oturumu',
    )
    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='lesson_attendance_records',
        verbose_name='Öğrenci',
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
        related_name='marked_lesson_attendance',
    )

    class Meta:
        db_table = 'academic_lesson_attendance'
        verbose_name = 'Öğrenci Yoklama Kaydı'
        verbose_name_plural = 'Öğrenci Yoklama Kayıtları'
        ordering = ['student__ad', 'student__soyad', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['session', 'student'],
                name='unique_attendance_per_session_student',
            ),
        ]

    def __str__(self):
        return f'{self.session_id} · {self.student_id} · {self.status}'
