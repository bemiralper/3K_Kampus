"""
WeeklyCycle (Çalışma Takvimi) Model

Haftalık eğitim düzeni: hangi gün aktif ve o günde hangi ders saati şablonu kullanılacak.
"""

from django.db import models


class ProgramTipi(models.TextChoices):
    """Çalışma takviminin hedeflediği ders formatı (grup / birebir / karma)."""

    GRUP = 'GRUP', 'Grup Dersleri'
    BIREBIR = 'BIREBIR', 'Birebir / Özel Ders'
    GENEL = 'GENEL', 'Genel / Karma'


class WeeklyCycle(models.Model):
    """Çalışma Takvimi — haftalık gün planı."""

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='weekly_cycles',
        verbose_name='Kurum',
        null=True,
        blank=True,
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='weekly_cycles',
        verbose_name='Şube',
        null=True,
        blank=True,
    )

    # Eski model uyumluluğu — şablona bağlı otomatik oluşturulan döngüler
    schedule_template = models.ForeignKey(
        'academic.ScheduleTemplate',
        on_delete=models.CASCADE,
        related_name='weekly_cycles',
        verbose_name='Zaman Şablonu',
        null=True,
        blank=True,
        help_text='Eski bağlantı — yeni takvimler şablonsuz oluşturulur',
    )

    name = models.CharField(
        max_length=100,
        verbose_name='Takvim Adı',
        help_text='Örn: Normal Eğitim, Hafta Sonu Grubu',
    )

    description = models.TextField(
        blank=True,
        null=True,
        verbose_name='Açıklama',
    )

    is_active = models.BooleanField(
        default=True,
        verbose_name='Aktif mi',
    )

    is_default = models.BooleanField(
        default=False,
        verbose_name='Varsayılan mı?',
        help_text='Bu şube için varsayılan çalışma takvimi',
    )

    color = models.CharField(
        max_length=7,
        default='#0262a7',
        blank=True,
        verbose_name='Renk',
    )

    icon = models.CharField(
        max_length=32,
        default='calendar',
        blank=True,
        verbose_name='İkon',
    )

    program_tipi = models.CharField(
        max_length=16,
        choices=ProgramTipi.choices,
        default=ProgramTipi.GENEL,
        verbose_name='Program Tipi',
        help_text='Grup dersleri, birebir özel ders veya karma program',
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Oluşturulma Tarihi')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Güncellenme Tarihi')

    class Meta:
        db_table = 'academic_weekly_cycle'
        verbose_name = 'Çalışma Takvimi'
        verbose_name_plural = 'Çalışma Takvimleri'
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'sube', 'name'],
                condition=models.Q(is_active=True),
                name='unique_work_calendar_name_per_branch_active',
            ),
        ]

    def __str__(self):
        return self.name

    @property
    def active_days(self):
        return self.weekly_days.filter(is_active=True).order_by('order')

    @property
    def active_day_count(self):
        return self.weekly_days.filter(is_active=True).count()

    def used_schedule_templates(self):
        from apps.academic.domain.schedule_template import ScheduleTemplate
        ids = (
            self.weekly_days.filter(is_active=True, schedule_template_id__isnull=False)
            .values_list('schedule_template_id', flat=True)
            .distinct()
        )
        return ScheduleTemplate.objects.filter(id__in=ids, is_active=True).order_by('name')

    def total_lesson_count(self):
        total = 0
        for day in self.weekly_days.filter(is_active=True, schedule_template_id__isnull=False):
            total += day.schedule_template.lesson_count
        return total

    def create_default_days(self):
        from apps.academic.domain.weekly_day import WeeklyDay, DayOfWeek

        days_created = []
        for day_choice in DayOfWeek.choices:
            day_value = day_choice[0]
            day_name = day_choice[1]
            is_weekday = day_value < 5

            day, created = WeeklyDay.objects.get_or_create(
                weekly_cycle=self,
                day_of_week=day_value,
                defaults={
                    'name': day_name,
                    'order': day_value + 1,
                    'is_active': is_weekday,
                    'note': '',
                },
            )
            if created:
                days_created.append(day)
        return days_created

    def soft_delete(self):
        self.is_active = False
        self.is_default = False
        self.save(update_fields=['is_active', 'is_default', 'updated_at'])
        self.weekly_days.update(is_active=False, schedule_template_id=None)

    def hard_delete(self):
        if self.is_active:
            raise ValueError('Aktif takvim kalıcı silinemez; önce pasif yapın.')
        if self.schedule_versions.exists():
            raise ValueError('Bu takvim programlarda kullanıldığı için kalıcı silinemez.')
        self.delete()

    def ensure_default_unique(self):
        if not self.is_default or not self.kurum_id:
            return
        WeeklyCycle.objects.filter(
            kurum_id=self.kurum_id,
            sube_id=self.sube_id,
            is_default=True,
        ).exclude(pk=self.pk).update(is_default=False)
