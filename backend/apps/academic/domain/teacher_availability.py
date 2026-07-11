"""
Öğretmen Uygunluğu — akademik planlama motoru için slot matrisi.

İki kayıt modu:
- DEFAULT: süresiz varsayılan uygunluk
- TEMPORARY: tarih aralıklı geçici uygunluk
"""

from django.db import models
from django.db.models import Q


class AvailabilityKind(models.TextChoices):
    DEFAULT = 'DEFAULT', 'Varsayılan'
    TEMPORARY = 'TEMPORARY', 'Geçici'


class SlotAvailabilityStatus(models.TextChoices):
    AVAILABLE = 'AVAILABLE', 'Uygun'
    UNAVAILABLE = 'UNAVAILABLE', 'Uygun Değil'
    PREFERRED = 'PREFERRED', 'Tercih Edilir'


class TeacherAvailabilitySet(models.Model):
    """Bir öğretmenin uygunluk kaydı (varsayılan veya geçici)."""

    personel = models.ForeignKey(
        'personel.Personel',
        on_delete=models.CASCADE,
        related_name='availability_sets',
        verbose_name='Personel',
    )
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='teacher_availability_sets',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='teacher_availability_sets',
    )
    kind = models.CharField(
        max_length=16,
        choices=AvailabilityKind.choices,
        default=AvailabilityKind.DEFAULT,
    )
    title = models.CharField(max_length=120, blank=True, default='')
    valid_from = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'academic_teacher_availability_set'
        verbose_name = 'Öğretmen Uygunluk Seti'
        verbose_name_plural = 'Öğretmen Uygunluk Setleri'
        constraints = [
            models.UniqueConstraint(
                fields=['personel', 'sube'],
                condition=Q(kind='DEFAULT', is_active=True),
                name='unique_default_availability_per_teacher_branch',
            ),
        ]

    def __str__(self):
        return f'{self.personel_id} — {self.get_kind_display()}'


class TeacherAvailabilityCalendar(models.Model):
    """Set içinde seçili çalışma takvimleri."""

    availability_set = models.ForeignKey(
        TeacherAvailabilitySet,
        on_delete=models.CASCADE,
        related_name='calendar_links',
    )
    weekly_cycle = models.ForeignKey(
        'academic.WeeklyCycle',
        on_delete=models.CASCADE,
        related_name='teacher_availability_links',
    )

    class Meta:
        db_table = 'academic_teacher_availability_calendar'
        constraints = [
            models.UniqueConstraint(
                fields=['availability_set', 'weekly_cycle'],
                name='unique_calendar_per_availability_set',
            ),
        ]


class TeacherAvailabilityCell(models.Model):
    """Gün × ders slotu uygunluk hücresi."""

    availability_set = models.ForeignKey(
        TeacherAvailabilitySet,
        on_delete=models.CASCADE,
        related_name='cells',
    )
    weekly_cycle = models.ForeignKey(
        'academic.WeeklyCycle',
        on_delete=models.CASCADE,
        related_name='teacher_availability_cells',
    )
    day_of_week = models.PositiveSmallIntegerField(
        help_text='0=Pazartesi … 6=Pazar',
    )
    timeslot = models.ForeignKey(
        'academic.TimeSlot',
        on_delete=models.CASCADE,
        related_name='teacher_availability_cells',
    )
    status = models.CharField(
        max_length=16,
        choices=SlotAvailabilityStatus.choices,
        default=SlotAvailabilityStatus.UNAVAILABLE,
    )

    class Meta:
        db_table = 'academic_teacher_availability_cell'
        constraints = [
            models.UniqueConstraint(
                fields=['availability_set', 'weekly_cycle', 'day_of_week', 'timeslot'],
                name='unique_teacher_availability_cell',
            ),
        ]
