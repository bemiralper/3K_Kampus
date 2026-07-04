"""
Cevap Anahtarı Modeli  (models/answer_key.py)

AnswerKey     → Sınav cevap anahtarı başlığı (kitapçık bazlı)
AnswerKeyItem → Her sorunun doğru cevabı
"""
from django.db import models


class AnswerKey(models.Model):
    """Sınav cevap anahtarı."""

    class BookletChoice(models.TextChoices):
        NONE = '',  'Kitapçıksız'
        A    = 'A', 'A Kitapçığı'
        B    = 'B', 'B Kitapçığı'
        C    = 'C', 'C Kitapçığı'
        D    = 'D', 'D Kitapçığı'

    exam = models.ForeignKey(
        'olcme_degerlendirme.Exam',
        on_delete=models.CASCADE,
        related_name='answer_keys',
        verbose_name='Sınav',
    )
    booklet = models.CharField(
        'Kitapçık', max_length=1, blank=True, default='',
        choices=BookletChoice.choices,
    )
    is_primary = models.BooleanField(
        'Ana Cevap Anahtarı', default=True,
        help_text='Kitapçıksız sınavlarda tek anahtar.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Cevap Anahtarı'
        verbose_name_plural = 'Cevap Anahtarları'
        unique_together = [('exam', 'booklet')]

    def __str__(self):
        booklet_str = f' – {self.booklet} Kitapçığı' if self.booklet else ''
        return f'{self.exam.name}{booklet_str} Cevap Anahtarı'


class AnswerKeyItem(models.Model):
    """Tek bir sorunun cevabı."""

    CHOICE_OPTIONS = [
        ('A', 'A'), ('B', 'B'), ('C', 'C'), ('D', 'D'), ('E', 'E'),
        ('EMPTY', 'Boş'), ('INVALID', 'İptal'),
    ]

    answer_key = models.ForeignKey(
        AnswerKey,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='Cevap Anahtarı',
    )
    section = models.ForeignKey(
        'olcme_degerlendirme.ExamSection',
        on_delete=models.CASCADE,
        related_name='answer_key_items',
        verbose_name='Bölüm',
    )
    question_number = models.PositiveSmallIntegerField('Soru No')
    correct_answer = models.CharField(
        'Doğru Cevap', max_length=10, choices=CHOICE_OPTIONS,
    )
    is_cancelled = models.BooleanField('İptal', default=False)

    # Kazanım bağlantısı (sonraki aşamada kullanılacak)
    outcome = models.ForeignKey(
        'olcme_degerlendirme.Outcome',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='answer_key_items',
        verbose_name='Kazanım',
    )

    # Sınav yüklenirken girilen orijinal kazanım kodu/metni
    imported_outcome_text = models.CharField(
        'Girilen Kazanım Metni',
        max_length=500, blank=True, default='',
        help_text='Cevap anahtarı import edilirken yapıştırılan orijinal kazanım kodu veya metni',
    )

    # B kitapçığı soru eşlemesi — A kitapçığı item'ında B'deki karşılığı
    b_question_number = models.PositiveSmallIntegerField(
        'B Kitapçığı Soru No',
        null=True, blank=True,
        help_text='Bu sorunun B kitapçığındaki soru numarası',
    )

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Cevap Anahtarı Satırı'
        verbose_name_plural = 'Cevap Anahtarı Satırları'
        ordering = ['answer_key', 'question_number']
        unique_together = [('answer_key', 'question_number')]

    def __str__(self):
        return f'Soru {self.question_number}: {self.correct_answer}'
