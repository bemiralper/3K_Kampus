"""Sınav karne / cevap anahtarı zamanlanmış WhatsApp gönderimi."""
from django.db import models


class ExamScheduledDispatch(models.Model):
    class Kind(models.TextChoices):
        KARNE = 'karne', 'Karne PDF'
        ANSWER_KEY = 'answer_key', 'Cevap anahtarı PDF'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Bekliyor'
        SENT = 'sent', 'Gönderildi'
        OVERDUE_UNREAD = 'overdue_unread', 'Saat geçti — hazır değil'
        CANCELLED = 'cancelled', 'İptal'

    exam = models.ForeignKey(
        'olcme_degerlendirme.Exam',
        on_delete=models.CASCADE,
        related_name='scheduled_dispatches',
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING,
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    sent_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True, default='')
    is_enabled = models.BooleanField(
        default=False,
        help_text='Kapalıysa yayın saati dolsa bile otomatik gönderilmez.',
    )
    campaign_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Sınav Zamanlı Gönderim'
        verbose_name_plural = 'Sınav Zamanlı Gönderimler'
        constraints = [
            models.UniqueConstraint(fields=['exam', 'kind'], name='unique_exam_scheduled_dispatch'),
        ]

    def __str__(self):
        return f'{self.exam_id} {self.kind} {self.status}'
