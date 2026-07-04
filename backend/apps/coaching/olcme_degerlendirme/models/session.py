"""
DAT Yükleme Oturumu  (models/session.py)

ExamSession → Bir sınava ait DAT dosyası yükleme kaydı
"""
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


def _session_upload_path(instance, filename):
    return f'olcme/dat/exam_{instance.exam_id}/{filename}'


class ExamSession(models.Model):
    """DAT dosyası yükleme ve işleme oturumu."""

    class Status(models.TextChoices):
        PENDING    = 'PENDING',    'Bekliyor'
        PROCESSING = 'PROCESSING', 'İşleniyor'
        COMPLETED  = 'COMPLETED',  'Tamamlandı'
        ERROR      = 'ERROR',      'Hata'

    exam = models.ForeignKey(
        'olcme_degerlendirme.Exam',
        on_delete=models.CASCADE,
        related_name='sessions',
        verbose_name='Sınav',
    )
    dat_file = models.FileField(
        'DAT Dosyası', upload_to=_session_upload_path,
        null=True, blank=True,
    )
    original_filename = models.CharField(
        'Orijinal Dosya Adı', max_length=255, blank=True,
    )
    status = models.CharField(
        'Durum', max_length=15, choices=Status.choices,
        default=Status.PENDING,
    )
    error_message = models.TextField('Hata Mesajı', blank=True)

    # Parse ayarları
    first_line_is_header = models.BooleanField('İlk Satır Başlık', default=True)
    delimiter = models.CharField('Ayırıcı', max_length=5, blank=True)
    empty_char = models.CharField('Boş Karakter', max_length=5, default=' ')
    student_id_start = models.PositiveSmallIntegerField('Öğrenci No Başlangıç', default=0)
    student_id_end   = models.PositiveSmallIntegerField('Öğrenci No Bitiş', default=10)
    answers_start    = models.PositiveSmallIntegerField('Cevap Başlangıç', default=10)
    student_id_field = models.CharField(
        'Öğrenci No Alanı', max_length=20, default='okul_no',
    )

    # Sütun eşleştirme haritası (JSON)
    field_mappings = models.JSONField(
        'Alan Eşleştirmeleri', default=list, blank=True,
    )

    # İstatistik
    total_rows      = models.PositiveIntegerField('Toplam Satır', default=0)
    matched_count   = models.PositiveIntegerField('Eşleşen', default=0)
    unmatched_count = models.PositiveIntegerField('Eşleşmeyen', default=0)
    error_count     = models.PositiveIntegerField('Hatalı', default=0)

    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='uploaded_exam_sessions',
        verbose_name='Yükleyen',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'DAT Oturumu'
        verbose_name_plural = 'DAT Oturumları'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.exam.name} – {self.original_filename or "DAT"} ({self.get_status_display()})'
