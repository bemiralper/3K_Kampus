"""
WeeklyCycle Model
Bir zaman şablonuna ait haftalık döngüyü temsil eder.

Örnek kullanım:
- Standart Hafta (5 gün, Pzt-Cum)
- A Haftası / B Haftası (ikili döngü)
- Tam Hafta (7 gün)

TODO: A/B hafta desteği için cycle_order alanı eklenebilir
TODO: Hafta periyodu için period_weeks alanı eklenebilir
"""

from django.db import models
from apps.academic.domain.schedule_template import ScheduleTemplate


class WeeklyCycle(models.Model):
    """
    Haftalık Döngü Modeli
    
    Bir zaman şablonuna bağlı haftalık gün döngüsünü tanımlar.
    Her döngü içinde aktif günler (WeeklyDay) tanımlanır.
    """
    
    schedule_template = models.ForeignKey(
        ScheduleTemplate,
        on_delete=models.CASCADE,
        related_name='weekly_cycles',
        verbose_name='Zaman Şablonu',
        help_text='Bu döngünün bağlı olduğu zaman şablonu'
    )
    
    name = models.CharField(
        max_length=100,
        verbose_name='Döngü Adı',
        help_text='Örn: Standart Hafta, A Haftası, B Haftası'
    )
    
    description = models.TextField(
        blank=True,
        null=True,
        verbose_name='Açıklama',
        help_text='Döngü hakkında açıklama'
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name='Aktif mi',
        help_text='Pasif döngüler grid oluşturmada kullanılmaz'
    )
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Oluşturulma Tarihi')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Güncellenme Tarihi')

    class Meta:
        db_table = 'academic_weekly_cycle'
        verbose_name = 'Haftalık Döngü'
        verbose_name_plural = 'Haftalık Döngüler'
        ordering = ['schedule_template', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['schedule_template', 'name'],
                condition=models.Q(is_active=True),
                name='unique_cycle_name_per_template_active'
            )
        ]

    def __str__(self):
        return f"{self.schedule_template.name} - {self.name}"

    @property
    def active_days(self):
        """Aktif günlerin listesi"""
        return self.weekly_days.filter(is_active=True).order_by('order')

    @property
    def active_day_count(self):
        """Aktif gün sayısı"""
        return self.weekly_days.filter(is_active=True).count()

    def create_default_days(self):
        """
        Varsayılan günleri oluştur (Pazartesi-Pazar)
        Sadece hafta içi günler aktif olarak işaretlenir
        """
        from apps.academic.domain.weekly_day import WeeklyDay, DayOfWeek
        
        days_created = []
        for day_choice in DayOfWeek.choices:
            day_value = day_choice[0]
            day_name = day_choice[1]
            
            # Hafta içi günler aktif, hafta sonu pasif
            is_weekday = day_value < 5  # 0-4 = Pzt-Cum
            
            day, created = WeeklyDay.objects.get_or_create(
                weekly_cycle=self,
                day_of_week=day_value,
                defaults={
                    'name': day_name,
                    'order': day_value + 1,  # 1-7 sıralama
                    'is_active': is_weekday
                }
            )
            if created:
                days_created.append(day)
        
        return days_created
