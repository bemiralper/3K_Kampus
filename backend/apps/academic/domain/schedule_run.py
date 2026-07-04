"""
ScheduleRun Domain Model (Ders Programı Çalıştırma Logu)

Scheduler motorunun her çalışmasını loglar.
- Hangi sınıflar için çalıştırıldı
- Kaç job üretildi, kaç tanesi yerleşti
- Başarısız olanlar ve nedenleri
- Çakışma detayları

Kullanım:
1. PREVIEW - Sadece simülasyon, grid'e yazmaz
2. EXECUTE - Gerçek çalıştırma, grid doldurur
3. RESET - Grid temizleme
"""
from django.db import models
from django.core.validators import MinValueValidator


class ScheduleRunStatus(models.TextChoices):
    """Çalıştırma durumu"""
    PENDING = 'PENDING', 'Bekliyor'
    RUNNING = 'RUNNING', 'Çalışıyor'
    SUCCESS = 'SUCCESS', 'Başarılı'
    PARTIAL = 'PARTIAL', 'Kısmen Başarılı'
    FAILED = 'FAILED', 'Başarısız'


class ScheduleRunType(models.TextChoices):
    """Çalıştırma tipi"""
    PREVIEW = 'PREVIEW', 'Önizleme'
    EXECUTE = 'EXECUTE', 'Çalıştırma'
    RESET = 'RESET', 'Sıfırlama'


class ScheduleRun(models.Model):
    """
    Ders Programı Çalıştırma Logu
    
    Her motor çalışmasını loglar ve sonuçları saklar.
    """
    
    # ==================== İLİŞKİLER ====================
    
    # Akademik Yıl
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='schedule_runs',
        verbose_name='Eğitim Yılı'
    )
    
    # Dönem
    term = models.ForeignKey(
        'term.Term',
        on_delete=models.CASCADE,
        related_name='schedule_runs',
        verbose_name='Dönem'
    )
    
    # Zaman Şablonu
    schedule_template = models.ForeignKey(
        'academic.ScheduleTemplate',
        on_delete=models.CASCADE,
        related_name='schedule_runs',
        verbose_name='Zaman Şablonu'
    )
    
    # Haftalık Döngü
    weekly_cycle = models.ForeignKey(
        'academic.WeeklyCycle',
        on_delete=models.CASCADE,
        related_name='schedule_runs',
        verbose_name='Haftalık Döngü'
    )
    
    # Sınıf (opsiyonel - None ise tüm sınıflar)
    sinif = models.ForeignKey(
        'sinif.Sinif',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='schedule_runs',
        verbose_name='Sınıf',
        help_text='Belirli bir sınıf için çalıştırma (boş = tüm sınıflar)'
    )
    
    # ==================== ÇALIŞTIRMA BİLGİLERİ ====================
    
    # Çalıştırma tipi
    run_type = models.CharField(
        'Çalıştırma Tipi',
        max_length=20,
        choices=ScheduleRunType.choices,
        default=ScheduleRunType.PREVIEW
    )
    
    # Durum
    status = models.CharField(
        'Durum',
        max_length=20,
        choices=ScheduleRunStatus.choices,
        default=ScheduleRunStatus.PENDING
    )
    
    # ==================== İSTATİSTİKLER ====================
    
    # Toplam job sayısı (üretilen ders yerleştirme işi)
    total_jobs = models.PositiveIntegerField(
        'Toplam Job',
        default=0,
        validators=[MinValueValidator(0)],
        help_text='Toplam ders yerleştirme job sayısı'
    )
    
    # Yerleştirilen job sayısı
    placed_jobs = models.PositiveIntegerField(
        'Yerleştirilen',
        default=0,
        validators=[MinValueValidator(0)],
        help_text='Başarıyla yerleştirilen job sayısı'
    )
    
    # Başarısız job sayısı
    failed_jobs = models.PositiveIntegerField(
        'Başarısız',
        default=0,
        validators=[MinValueValidator(0)],
        help_text='Yerleştirilemeyen job sayısı'
    )
    
    # ==================== LOG VERİSİ ====================
    
    # Detaylı log (JSON formatında)
    log_json = models.JSONField(
        'Log Verisi',
        default=dict,
        blank=True,
        help_text="""
        Log yapısı:
        {
            "placed": [
                {"lesson": "Matematik", "classroom": "9-A", "day": "Pazartesi", "slot": 1, "teacher": "Ahmet Hoca"},
                ...
            ],
            "failed": [
                {"lesson": "Fizik", "classroom": "9-A", "reason": "Öğretmen müsait değil", "attempted_slots": [...]},
                ...
            ],
            "conflicts": [
                {"type": "teacher", "teacher": "Ahmet Hoca", "day": "Pazartesi", "slot": 1, "classes": ["9-A", "10-B"]},
                ...
            ],
            "warnings": [
                {"message": "9-A için 5 saat Matematik planlandı ama 4 saat yerleşti"},
                ...
            ]
        }
        """
    )
    
    # Hata mesajı (varsa)
    error_message = models.TextField(
        'Hata Mesajı',
        blank=True,
        null=True,
        help_text='Çalıştırma sırasında oluşan hata mesajı'
    )
    
    # ==================== ZAMAN DAMGALARI ====================
    
    started_at = models.DateTimeField(
        'Başlangıç Zamanı',
        null=True,
        blank=True
    )
    
    completed_at = models.DateTimeField(
        'Bitiş Zamanı',
        null=True,
        blank=True
    )
    
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'schedule_run'
        verbose_name = 'Program Çalıştırma Logu'
        verbose_name_plural = 'Program Çalıştırma Logları'
        ordering = ['-created_at']
    
    def __str__(self):
        sinif_str = self.sinif.ad if self.sinif else 'Tüm Sınıflar'
        return f"{self.term.name} - {sinif_str} ({self.get_run_type_display()}) - {self.get_status_display()}"
    
    @property
    def success_rate(self):
        """Başarı oranı"""
        if self.total_jobs == 0:
            return 0
        return round((self.placed_jobs / self.total_jobs) * 100, 2)
    
    @property
    def duration_seconds(self):
        """Çalışma süresi (saniye)"""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None
    
    def mark_running(self):
        """Çalışıyor olarak işaretle"""
        from django.utils import timezone
        self.status = ScheduleRunStatus.RUNNING
        self.started_at = timezone.now()
        self.save(update_fields=['status', 'started_at', 'updated_at'])
    
    def mark_completed(self, placed: int, failed: int):
        """Tamamlandı olarak işaretle"""
        from django.utils import timezone
        self.placed_jobs = placed
        self.failed_jobs = failed
        self.completed_at = timezone.now()
        
        if failed == 0:
            self.status = ScheduleRunStatus.SUCCESS
        elif placed == 0:
            self.status = ScheduleRunStatus.FAILED
        else:
            self.status = ScheduleRunStatus.PARTIAL
        
        self.save(update_fields=['status', 'placed_jobs', 'failed_jobs', 'completed_at', 'updated_at'])
    
    def mark_failed(self, error: str):
        """Hata ile işaretle"""
        from django.utils import timezone
        self.status = ScheduleRunStatus.FAILED
        self.error_message = error
        self.completed_at = timezone.now()
        self.save(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
    
    def add_log(self, category: str, entry: dict):
        """Log'a giriş ekle"""
        if category not in self.log_json:
            self.log_json[category] = []
        self.log_json[category].append(entry)
        self.save(update_fields=['log_json', 'updated_at'])
