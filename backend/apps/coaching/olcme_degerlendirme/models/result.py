"""
Öğrenci Sonuç Modelleri  (models/result.py)

StudentAnswer       → Öğrencinin tüm cevapları + genel sonuç
StudentSectionScore → Bölüm bazında net / puan / sıra
"""
from django.db import models


class StudentAnswer(models.Model):
    """Öğrencinin bir sınav oturumundaki cevap kaydı."""

    session = models.ForeignKey(
        'olcme_degerlendirme.ExamSession',
        on_delete=models.CASCADE,
        related_name='student_answers',
        verbose_name='Oturum',
    )
    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='exam_answers',
        verbose_name='Öğrenci',
    )

    # DAT'tan gelen ham kimlik (eşleşme öncesi)
    raw_student_id  = models.CharField('Ham Öğrenci No', max_length=50, blank=True)
    raw_student_name = models.CharField('Ham Ad Soyad', max_length=200, blank=True)

    booklet = models.CharField('Kitapçık', max_length=1, blank=True)
    booklet_auto_detected = models.BooleanField(
        'Kitapçık Otomatik Tespit',
        default=False,
        help_text='Kitapçık bilgisi DAT dosyasında yoksa, en yüksek net\'e göre otomatik seçildi.',
    )

    # Cevaplar ve karşılaştırma sonucu
    answers = models.JSONField(
        'Cevaplar',
        default=dict,
        help_text='{soru_no: verilen_cevap} — örn: {"1":"A","2":"C"}',
    )
    comparison = models.JSONField(
        'Karşılaştırma',
        default=dict,
        help_text='{soru_no: {"given":"A","correct":"B","result":"wrong"}}',
    )

    # Genel toplamlar
    total_correct = models.PositiveSmallIntegerField('Toplam Doğru', default=0)
    total_wrong   = models.PositiveSmallIntegerField('Toplam Yanlış', default=0)
    total_empty   = models.PositiveSmallIntegerField('Toplam Boş', default=0)
    total_net     = models.DecimalField('Toplam Net', max_digits=6, decimal_places=2, default=0)

    # Eşleştirme bilgisi
    match_score  = models.FloatField('Eşleşme Skoru', default=0.0, help_text='0.0-1.0 arası')
    match_method = models.CharField('Eşleşme Yöntemi', max_length=20, blank=True,
                                    help_text='tc, name_exact, id, name, manual')

    is_processed = models.BooleanField('İşlendi', default=False)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Öğrenci Cevabı'
        verbose_name_plural = 'Öğrenci Cevapları'
        ordering = ['session', 'raw_student_id']
        constraints = [
            # Aynı oturumda aynı öğrenci yalnızca bir kez olabilir (sadece eşleşenler)
            models.UniqueConstraint(
                fields=['session', 'student'],
                name='unique_session_student',
                condition=models.Q(student__isnull=False),
            ),
        ]

    def __str__(self):
        name = self.student or self.raw_student_id or '?'
        return f'{self.session.exam.name} – {name}'


class StudentSectionScore(models.Model):
    """Bölüm bazında skor."""

    student_answer = models.ForeignKey(
        StudentAnswer,
        on_delete=models.CASCADE,
        related_name='section_scores',
        verbose_name='Öğrenci Cevabı',
    )
    section = models.ForeignKey(
        'olcme_degerlendirme.ExamSection',
        on_delete=models.CASCADE,
        related_name='student_scores',
        verbose_name='Bölüm',
    )
    correct = models.PositiveSmallIntegerField('Doğru', default=0)
    wrong   = models.PositiveSmallIntegerField('Yanlış', default=0)
    empty   = models.PositiveSmallIntegerField('Boş', default=0)
    net     = models.DecimalField('Net', max_digits=5, decimal_places=2, default=0)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Bölüm Skoru'
        verbose_name_plural = 'Bölüm Skorları'
        unique_together = [('student_answer', 'section')]
        ordering = ['section__order']

    def __str__(self):
        return f'{self.section.name}: {self.net} net'
