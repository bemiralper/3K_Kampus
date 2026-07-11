"""
WeeklyDay Model — çalışma takvimindeki tek bir gün satırı.
"""

from django.db import models


class DayOfWeek(models.IntegerChoices):
    MONDAY = 0, 'Pazartesi'
    TUESDAY = 1, 'Salı'
    WEDNESDAY = 2, 'Çarşamba'
    THURSDAY = 3, 'Perşembe'
    FRIDAY = 4, 'Cuma'
    SATURDAY = 5, 'Cumartesi'
    SUNDAY = 6, 'Pazar'


class WeeklyDay(models.Model):
    weekly_cycle = models.ForeignKey(
        'WeeklyCycle',
        on_delete=models.CASCADE,
        related_name='weekly_days',
        verbose_name='Çalışma Takvimi',
    )

    day_of_week = models.IntegerField(
        choices=DayOfWeek.choices,
        verbose_name='Haftanın Günü',
    )

    name = models.CharField(max_length=50, verbose_name='Gün Adı')

    order = models.PositiveIntegerField(default=1, verbose_name='Sıra')

    is_active = models.BooleanField(default=True, verbose_name='Aktif mi')

    schedule_template = models.ForeignKey(
        'academic.ScheduleTemplate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='weekly_day_plans',
        verbose_name='Ders Saati Şablonu',
    )

    note = models.CharField(max_length=200, blank=True, default='', verbose_name='Not')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'academic_weekly_day'
        verbose_name = 'Haftalık Gün'
        verbose_name_plural = 'Haftalık Günler'
        ordering = ['weekly_cycle', 'order']
        constraints = [
            models.UniqueConstraint(
                fields=['weekly_cycle', 'day_of_week'],
                name='unique_day_per_cycle',
            ),
        ]

    def __str__(self):
        return f"{self.weekly_cycle.name} - {self.name}"

    @property
    def day_name_short(self):
        short_names = {0: 'Pzt', 1: 'Sal', 2: 'Çar', 3: 'Per', 4: 'Cum', 5: 'Cts', 6: 'Paz'}
        return short_names.get(self.day_of_week, '?')

    @property
    def is_weekend(self):
        return self.day_of_week >= 5
