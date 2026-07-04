"""
Term (Eğitim Dönemi) Domain Model
"""
from django.db import models


class Term(models.Model):
    """
    Eğitim Dönemi modeli
    
    Akademik yıla bağlı dönem tanımları.
    Örnek: 2025-2026 Güz Dönemi, 2025-2026 Bahar Dönemi
    """
    
    TERM_TYPE_CHOICES = [
        ('regular', 'Normal Dönem'),
        ('summer', 'Yaz Okulu'),
        ('camp', 'Kamp'),
        ('exam', 'Sınav Dönemi'),
        ('coaching', 'Koçluk Dönemi'),
    ]
    
    # İlişkiler
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='terms',
        verbose_name='Kurum'
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='terms',
        verbose_name='Şube'
    )
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='terms',
        verbose_name='Eğitim Yılı'
    )
    
    # Temel bilgiler
    name = models.CharField('Dönem Adı', max_length=100)
    code = models.CharField('Kısa Kod', max_length=20)
    
    term_type = models.CharField(
        'Dönem Türü',
        max_length=20,
        choices=TERM_TYPE_CHOICES,
        default='regular'
    )
    
    # Tarihler
    start_date = models.DateField('Başlangıç Tarihi')
    end_date = models.DateField('Bitiş Tarihi')
    
    # Sıralama
    order_no = models.IntegerField('Sıra No', default=1)
    
    # Durum
    is_active = models.BooleanField('Aktif', default=True)
    
    # Operasyon ayarları
    program_olusturulabilir = models.BooleanField('Program Oluşturulabilir', default=True)
    yoklama_acik = models.BooleanField('Yoklama Açık', default=True)
    not_girisi_acik = models.BooleanField('Not Girişi Açık', default=False)
    ogrenci_kayit_acik = models.BooleanField('Öğrenci Kayıt Açık', default=True)
    
    # Planlama motoru ayarları
    schedule_locked = models.BooleanField('Program Kilitli', default=False)
    auto_generate_enabled = models.BooleanField('Otomatik Oluşturma Aktif', default=True)
    allow_conflict_override = models.BooleanField('Çakışma Geçersiz Kılma İzni', default=False)
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'term'
        verbose_name = 'Eğitim Dönemi'
        verbose_name_plural = 'Eğitim Dönemleri'
        ordering = ['order_no', 'start_date']
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'sube', 'egitim_yili', 'code'],
                name='unique_term_code_per_year'
            ),
        ]
    
    def __str__(self):
        return f"{self.egitim_yili} - {self.name}"
    
    def clean(self):
        from django.core.exceptions import ValidationError
        if self.start_date and self.end_date:
            if self.start_date >= self.end_date:
                raise ValidationError('Başlangıç tarihi bitiş tarihinden önce olmalıdır.')
