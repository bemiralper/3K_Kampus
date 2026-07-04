"""
WeeklyDay Model
Haftalık döngü içindeki bir günü temsil eder.

Gün değerleri:
0 = Pazartesi (Monday)
1 = Salı (Tuesday)
2 = Çarşamba (Wednesday)
3 = Perşembe (Thursday)
4 = Cuma (Friday)
5 = Cumartesi (Saturday)
6 = Pazar (Sunday)

TODO: Özel gün override desteği
TODO: Yarım gün desteği (half_day boolean)
"""

from django.db import models


class DayOfWeek(models.IntegerChoices):
    """Haftanın günleri enum"""
    MONDAY = 0, 'Pazartesi'
    TUESDAY = 1, 'Salı'
    WEDNESDAY = 2, 'Çarşamba'
    THURSDAY = 3, 'Perşembe'
    FRIDAY = 4, 'Cuma'
    SATURDAY = 5, 'Cumartesi'
    SUNDAY = 6, 'Pazar'


class WeeklyDay(models.Model):
    """
    Haftalık Gün Modeli
    
    Bir haftalık döngü içindeki tek bir günü temsil eder.
    Günler aktif/pasif yapılabilir ve sıraları değiştirilebilir.
    """
    
    weekly_cycle = models.ForeignKey(
        'WeeklyCycle',
        on_delete=models.CASCADE,
        related_name='weekly_days',
        verbose_name='Haftalık Döngü'
    )
    
    day_of_week = models.IntegerField(
        choices=DayOfWeek.choices,
        verbose_name='Haftanın Günü',
        help_text='0=Pazartesi, 6=Pazar'
    )
    
    name = models.CharField(
        max_length=50,
        verbose_name='Gün Adı',
        help_text='Örn: Pazartesi, Salı'
    )
    
    order = models.PositiveIntegerField(
        default=1,
        verbose_name='Sıra',
        help_text='Grid sütun sırası'
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name='Aktif mi',
        help_text='Pasif günler grid\'de görünmez'
    )
    
    # TODO: Yarım gün desteği
    # is_half_day = models.BooleanField(default=False, verbose_name='Yarım Gün')
    # half_day_end_slot = models.ForeignKey('TimeSlot', null=True, blank=True, on_delete=models.SET_NULL)
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Oluşturulma Tarihi')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Güncellenme Tarihi')

    class Meta:
        db_table = 'academic_weekly_day'
        verbose_name = 'Haftalık Gün'
        verbose_name_plural = 'Haftalık Günler'
        ordering = ['weekly_cycle', 'order']
        constraints = [
            models.UniqueConstraint(
                fields=['weekly_cycle', 'day_of_week'],
                name='unique_day_per_cycle'
            )
        ]

    def __str__(self):
        return f"{self.weekly_cycle.name} - {self.name}"

    @property
    def day_name_short(self):
        """Kısa gün adı (3 harf)"""
        short_names = {
            0: 'Pzt',
            1: 'Sal',
            2: 'Çar',
            3: 'Per',
            4: 'Cum',
            5: 'Cts',
            6: 'Paz'
        }
        return short_names.get(self.day_of_week, '?')

    @property
    def is_weekend(self):
        """Hafta sonu mu?"""
        return self.day_of_week >= 5
