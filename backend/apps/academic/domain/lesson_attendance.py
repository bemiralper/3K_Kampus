"""
LessonAttendanceRecord — ders oturumu öğrenci yoklaması.
"""
from __future__ import annotations

from datetime import datetime, time
from typing import Any

from django.db import models
from django.utils import timezone


def parse_late_time(value: Any) -> time | None:
    """'08:45' / '08:45:00' / time → time; boş veya geçersiz → None."""
    if value in (None, ''):
        return None
    if isinstance(value, time):
        return value
    raw = str(value).strip()
    for fmt in ('%H:%M', '%H:%M:%S'):
        try:
            return datetime.strptime(raw, fmt).time()
        except ValueError:
            continue
    return None


def format_late_time(value: Any) -> str | None:
    parsed = parse_late_time(value) if not isinstance(value, time) else value
    if parsed is None:
        return None
    return parsed.strftime('%H:%M')


def late_time_or_now(value: Any) -> time:
    return parse_late_time(value) or timezone.localtime().time().replace(second=0, microsecond=0)


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
    late_time = models.TimeField(
        null=True,
        blank=True,
        help_text='Geç gelen öğrencinin derse giriş saati.',
    )
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
