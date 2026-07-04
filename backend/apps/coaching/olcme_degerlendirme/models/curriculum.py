"""
Müfredat Modelleri  (models/curriculum.py)

Hiyerarsi (4 seviye):
  Subject    -> Ders         (Matematik, Turkce ...)
  Topic      -> Konu         (Fonksiyonlar, Siir ...)
  Outcome    -> Kazanim      (MEB kodu bazli, or. 9.2.1)
  SubOutcome -> Alt Kazanim  (MEB kodu bazli, or. 9.2.1.1)
"""
from django.db import models


class Subject(models.Model):
    """Ders."""

    class ExamTypeFilter(models.TextChoices):
        ALL      = 'ALL',     'Tum Sinav Turleri'
        YKS_TYT  = 'YKS_TYT', 'YKS - TYT'
        YKS_AYT  = 'YKS_AYT', 'YKS - AYT'
        LGS      = 'LGS',     'LGS'

    code         = models.CharField('Ders Kodu', max_length=30, unique=True)
    name         = models.CharField('Ders Adi', max_length=100)
    display_name = models.CharField(
        'Gorunen Ad', max_length=100, blank=True,
        help_text='Bos birakilirsa name kullanilir.',
    )
    exam_type_filter = models.CharField(
        'Sinav Turu', max_length=20,
        choices=ExamTypeFilter.choices,
        default=ExamTypeFilter.ALL,
    )
    order = models.PositiveSmallIntegerField('Sira', default=0)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Ders'
        verbose_name_plural = 'Dersler'
        ordering = ['order', 'name']

    def __str__(self):
        return self.display_name or self.name


class Topic(models.Model):
    """Konu - dogrudan Ders'e bagli."""
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE,
        related_name='topics', verbose_name='Ders',
    )
    code  = models.CharField('Konu Kodu', max_length=30, blank=True,
                             help_text='Or: 9.1, 9.2')
    name  = models.CharField('Konu Adi', max_length=200)
    order = models.PositiveSmallIntegerField('Sira', default=0)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Konu'
        verbose_name_plural = 'Konular'
        ordering = ['subject', 'order']

    def __str__(self):
        prefix = f'[{self.code}] ' if self.code else ''
        return f'{self.subject} - {prefix}{self.name}'


class Outcome(models.Model):
    """Kazanim - Konuya bagli."""
    topic   = models.ForeignKey(
        Topic, on_delete=models.CASCADE,
        related_name='outcomes', verbose_name='Konu',
    )
    code    = models.CharField('Kazanim Kodu', max_length=50, blank=True)
    text    = models.TextField('Kazanim Metni')
    order   = models.PositiveSmallIntegerField('Sira', default=0)
    is_active = models.BooleanField('Aktif', default=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Kazanim'
        verbose_name_plural = 'Kazanimlar'
        ordering = ['topic', 'order']

    def __str__(self):
        return f'[{self.code}] {self.text[:60]}' if self.code else self.text[:60]


class SubOutcome(models.Model):
    """Alt Kazanim - Kazanima bagli."""
    outcome = models.ForeignKey(
        Outcome, on_delete=models.CASCADE,
        related_name='sub_outcomes', verbose_name='Kazanim',
    )
    code    = models.CharField('Alt Kazanim Kodu', max_length=50, blank=True)
    text    = models.TextField('Alt Kazanim Metni')
    order   = models.PositiveSmallIntegerField('Sira', default=0)
    is_active = models.BooleanField('Aktif', default=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Alt Kazanim'
        verbose_name_plural = 'Alt Kazanimlar'
        ordering = ['outcome', 'order']

    def __str__(self):
        return f'[{self.code}] {self.text[:60]}' if self.code else self.text[:60]
