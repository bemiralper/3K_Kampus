"""
Manuel Ödev Atama - Models

ManualAssignment: Ana ödev kaydı
AssignmentLesson: Ödev içindeki ders blokları
AssignmentTask: Her ders bloğu içindeki görevler
"""

from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator


class ManualAssignment(models.Model):
    """
    Manuel Ödev Ataması
    Koç tarafından öğrencilere manuel olarak atanan ödevler
    """
    
    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Taslak'
        ASSIGNED = 'ASSIGNED', 'Atandı'
        IN_PROGRESS = 'IN_PROGRESS', 'Devam Ediyor'
        COMPLETED = 'COMPLETED', 'Tamamlandı'
        OVERDUE = 'OVERDUE', 'Süresi Geçti'
        CANCELLED = 'CANCELLED', 'İptal Edildi'
    
    class RiskStatus(models.TextChoices):
        PENDING = 'PENDING', 'Beklemede'
        PENDING_START = 'PENDING_START', 'Başlamadı'
        ON_TRACK = 'ON_TRACK', 'Yolunda'
        AT_RISK = 'AT_RISK', 'Risk Altında'
        DELAYED = 'DELAYED', 'Gecikmiş'
        LOW_ACCURACY = 'LOW_ACCURACY', 'Düşük Doğruluk'
        CRITICAL = 'CRITICAL', 'Kritik'
    
    class Priority(models.TextChoices):
        LOW = 'LOW', 'Düşük'
        MEDIUM = 'MEDIUM', 'Orta'
        HIGH = 'HIGH', 'Yüksek'
        URGENT = 'URGENT', 'Acil'
    
    # Atayan Koç
    coach = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='manual_assignments_created',
        verbose_name='Koç',
        null=True,
        blank=True
    )
    
    # Öğrenci
    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='manual_assignments',
        verbose_name='Öğrenci'
    )
    
    # Ödev Bilgileri
    title = models.CharField(
        max_length=255,
        verbose_name='Ödev Başlığı',
        help_text='Ödevin genel açıklaması'
    )
    
    description = models.TextField(
        blank=True,
        verbose_name='Açıklama',
        help_text='Ödev hakkında ek bilgiler'
    )
    
    # Durum
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='Durum'
    )
    
    risk_status = models.CharField(
        max_length=20,
        choices=RiskStatus.choices,
        default=RiskStatus.PENDING,
        verbose_name='Risk Durumu',
        db_index=True
    )
    
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.MEDIUM,
        verbose_name='Öncelik Seviyesi'
    )
    
    # Tarihler
    assigned_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Atanma Tarihi'
    )
    
    due_date = models.DateTimeField(
        verbose_name='Son Teslim Tarihi'
    )
    
    reminder_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Hatırlatma Tarihi'
    )
    
    completed_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Tamamlanma Tarihi'
    )
    
    # Performans Beklentileri
    expected_accuracy_percent = models.IntegerField(
        null=True,
        blank=True,
        verbose_name='Hedef Doğruluk %',
        help_text='Beklenen doğruluk yüzdesi'
    )
    
    minimum_completion_percent = models.IntegerField(
        default=100,
        verbose_name='Minimum Tamamlanma %',
        help_text='En az ne kadar tamamlanmalı'
    )
    
    estimated_duration_minutes = models.IntegerField(
        null=True,
        blank=True,
        verbose_name='Tahmini Süre (dk)',
        help_text='Ödevi tamamlamak için tahmini süre'
    )
    
    difficulty_level = models.IntegerField(
        default=3,
        verbose_name='Zorluk Seviyesi',
        help_text='1-5 arası zorluk seviyesi',
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    
    # Gerçek Performans (ödev tamamlandıkça güncellenir)
    actual_accuracy_percent = models.FloatField(
        null=True,
        blank=True,
        verbose_name='Gerçek Doğruluk %'
    )
    
    completion_percent = models.IntegerField(
        default=0,
        verbose_name='Tamamlanma %'
    )
    
    actual_duration_minutes = models.IntegerField(
        null=True,
        blank=True,
        verbose_name='Gerçek Süre (dk)'
    )
    
    # Kaynak Ataması İlişkisi
    source_assignment = models.ForeignKey(
        'student_resources.StudentResourceAssignment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='manual_assignments',
        verbose_name='Kaynak Ataması',
        help_text='Ödevin hangi kaynak atamasından oluşturulduğu'
    )
    
    # Ödev paketi şablonu
    template = models.ForeignKey(
        'AssignmentPackage',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assignments_from_template',
        verbose_name='Ödev Paketi Şablonu',
        help_text='Bu ödevin oluşturulduğu ödev paketi'
    )
    
    # Erteleme Bilgileri
    postpone_count = models.PositiveIntegerField(
        default=0,
        verbose_name='Erteleme Sayısı'
    )
    
    original_due_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Orijinal Teslim Tarihi',
        help_text='İlk verilen teslim tarihi (ertelenme öncesi)'
    )
    
    postpone_reason = models.TextField(
        blank=True,
        verbose_name='Erteleme Sebebi',
        help_text='Son erteleme sebebi'
    )
    
    max_postpone = models.PositiveIntegerField(
        default=3,
        verbose_name='Maksimum Erteleme',
        help_text='Kaç kez ertelenebilir'
    )
    
    # Geç Teslim Bilgileri
    late_submission_note = models.TextField(
        blank=True,
        verbose_name='Geç Teslim Notu',
        help_text='Ödev teslim tarihinden sonra getirildiğinde koçun eklediği not'
    )
    
    # Ödev Getirilmedi / Yapılmadı Bilgisi
    non_submission_reason = models.CharField(
        max_length=50,
        blank=True,
        verbose_name='Ödev Getirilmeme Sebebi',
        help_text='Öğrenci gelmedi / ödev getirilmedi / yapılmadı vb.',
        choices=[
            ('CONTROL_NOT_POSSIBLE', 'Ödev kontrolü yapılamadı'),
            ('NOT_BROUGHT', 'Öğrenci ödevi getirmedi'),
            ('NOT_DONE', 'Öğrenci ödevi yapmamış'),
            ('OTHER', 'Diğer'),
        ]
    )
    non_submission_note = models.TextField(
        blank=True,
        verbose_name='Ödev Getirilmeme Notu',
        help_text='Ek açıklama'
    )
    
    # Notlar
    coach_notes = models.TextField(
        blank=True,
        verbose_name='Koç Notları',
        help_text='Sadece koçun görebileceği notlar'
    )
    
    student_notes = models.TextField(
        blank=True,
        verbose_name='Öğrenci Notları',
        help_text='Öğrencinin ekleyebileceği notlar'
    )
    
    # Soft delete audit
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Silinme Tarihi',
    )
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='manual_assignments_deleted',
        verbose_name='Silen Kullanıcı',
    )
    deletion_reason = models.TextField(
        blank=True,
        verbose_name='Silme Sebebi',
    )

    # Sistem
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Oluşturma Tarihi')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Güncellenme Tarihi')
    is_active = models.BooleanField(default=True, verbose_name='Aktif mi?')
    
    class Meta:
        verbose_name = 'Manuel Ödev Ataması'
        verbose_name_plural = 'Manuel Ödev Atamaları'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['student', 'status']),
            models.Index(fields=['coach', 'assigned_date']),
            models.Index(fields=['due_date']),
            models.Index(fields=['risk_status', 'status']),
        ]
    
    def __str__(self):
        return f"{self.title} - {self.student}"
    
    @property
    def is_late_submission(self):
        """Ödev teslim tarihinden sonra mı tamamlandı?"""
        if not self.completed_date or not self.due_date:
            return False
        # Ertelenmiş ödevlerde mevcut (güncel) due_date'e bakıyoruz
        return self.completed_date > self.due_date
    
    @property
    def late_days(self):
        """Kaç gün geç teslim edildi"""
        if not self.is_late_submission:
            return 0
        delta = self.completed_date - self.due_date
        return max(delta.days, 0)
    
    def save(self, *args, **kwargs):
        # Durum ASSIGNED olduğunda assigned_date'i set et
        if self.status == self.Status.ASSIGNED and not self.assigned_date:
            self.assigned_date = timezone.now()
        
        # Durum COMPLETED olduğunda completed_date'i set et
        if self.status == self.Status.COMPLETED and not self.completed_date:
            self.completed_date = timezone.now()
        
        # Risk durumu güncelleme mantığı
        if self.status == self.Status.ASSIGNED:
            if not self.assigned_date or timezone.now() < self.assigned_date:
                self.risk_status = self.RiskStatus.PENDING_START
            elif timezone.now() > self.due_date:
                self.risk_status = self.RiskStatus.DELAYED
            elif self.actual_accuracy_percent and self.expected_accuracy_percent:
                if self.actual_accuracy_percent < self.expected_accuracy_percent:
                    self.risk_status = self.RiskStatus.LOW_ACCURACY
        
        super().save(*args, **kwargs)


class AssignmentLesson(models.Model):
    """
    Ödev içindeki Ders Blokları
    Her ödev birden fazla dersten oluşabilir
    """
    
    assignment = models.ForeignKey(
        ManualAssignment,
        on_delete=models.CASCADE,
        related_name='lessons',
        verbose_name='Ödev'
    )
    
    lesson = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='manual_assignment_lessons',
        verbose_name='Ders'
    )
    
    order = models.IntegerField(
        default=0,
        verbose_name='Sıra',
        help_text='Derslerin gösterim sırası'
    )
    
    # Kaynak Bilgisi
    resource_book = models.ForeignKey(
        'resources.ResourceBook',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='manual_assignment_lessons',
        verbose_name='Kaynak Kitap'
    )
    
    # Konu Seçim Modu
    class ContentMode(models.TextChoices):
        TOPIC = 'TOPIC', 'Konu Bazlı'
        PAGE_RANGE = 'PAGE_RANGE', 'Sayfa Aralığı'
        TEST_NUMBER = 'TEST_NUMBER', 'Test Numarası'
    
    content_mode = models.CharField(
        max_length=20,
        choices=ContentMode.choices,
        default=ContentMode.TOPIC,
        verbose_name='İçerik Seçim Modu'
    )
    
    # Konu Bilgileri (mode'a göre dolar)
    topic_name = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Konu Adı'
    )
    
    page_start = models.IntegerField(
        null=True,
        blank=True,
        verbose_name='Başlangıç Sayfası'
    )
    
    page_end = models.IntegerField(
        null=True,
        blank=True,
        verbose_name='Bitiş Sayfası'
    )
    
    test_number = models.CharField(
        max_length=50,
        blank=True,
        verbose_name='Test Numarası'
    )
    
    # Notlar
    notes = models.TextField(
        blank=True,
        verbose_name='Notlar'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Ödev Dersi'
        verbose_name_plural = 'Ödev Dersleri'
        ordering = ['order', 'id']
        indexes = [
            models.Index(fields=['assignment', 'order']),
        ]
    
    def __str__(self):
        return f"{self.assignment.title} - {self.lesson.ad}"


class AssignmentTask(models.Model):
    """
    Ders Bloğu içindeki Görevler
    Her ders bloğu birden fazla görev içerebilir
    """
    
    class TaskType(models.TextChoices):
        SOLVE_TEST = 'SOLVE_TEST', 'Test Çöz'
        WATCH_VIDEO = 'WATCH_VIDEO', 'Video İzle'
        REVIEW_TOPIC = 'REVIEW_TOPIC', 'Konu Tekrar Et'
        SOLVE_EXAM = 'SOLVE_EXAM', 'Deneme Çöz'
        ANALYZE_MISTAKES = 'ANALYZE_MISTAKES', 'Yanlış Analiz Yap'
        TAKE_NOTES = 'TAKE_NOTES', 'Not Çıkar'
        SOLVE_PDF = 'SOLVE_PDF', 'PDF Çöz'
        CUSTOM = 'CUSTOM', 'Özel Görev'
    
    class TaskStatus(models.TextChoices):
        NOT_STARTED = 'NOT_STARTED', 'Başlanmadı'
        IN_PROGRESS = 'IN_PROGRESS', 'Devam Ediyor'
        COMPLETED = 'COMPLETED', 'Tamamlandı'
        PARTIAL = 'PARTIAL', 'Eksik'
        NOT_DONE = 'NOT_DONE', 'Yapılmadı'
        SKIPPED = 'SKIPPED', 'Atlandı'
    
    class CompletionStatus(models.TextChoices):
        PENDING = 'PENDING', 'Beklemede'
        DONE = 'DONE', 'Yaptı'
        NOT_DONE = 'NOT_DONE', 'Yapmadı'
        PARTIAL = 'PARTIAL', 'Eksik'
    
    lesson_block = models.ForeignKey(
        AssignmentLesson,
        on_delete=models.CASCADE,
        related_name='tasks',
        verbose_name='Ders Bloğu'
    )
    
    # Kaynak İçerik İlişkisi
    content = models.ForeignKey(
        'resources.ResourceContent',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assignment_tasks',
        verbose_name='Kaynak İçerik',
        help_text='Görevin ait olduğu kaynak içerik'
    )
    
    task_type = models.CharField(
        max_length=20,
        choices=TaskType.choices,
        verbose_name='Görev Tipi'
    )
    
    title = models.CharField(
        max_length=255,
        verbose_name='Görev Başlığı'
    )
    
    description = models.TextField(
        blank=True,
        verbose_name='Açıklama'
    )
    
    # İçerik Snapshot (atama anındaki değerler)
    question_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='Soru Sayısı',
        help_text='Atama anındaki soru sayısı'
    )
    
    page_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='Sayfa Sayısı',
        help_text='Atama anındaki sayfa sayısı'
    )
    
    is_required = models.BooleanField(
        default=True,
        verbose_name='Zorunlu mu?'
    )
    
    estimated_duration_minutes = models.IntegerField(
        null=True,
        blank=True,
        verbose_name='Tahmini Süre (dk)'
    )
    
    order = models.IntegerField(
        default=0,
        verbose_name='Sıra'
    )
    
    # Durum
    status = models.CharField(
        max_length=20,
        choices=TaskStatus.choices,
        default=TaskStatus.NOT_STARTED,
        verbose_name='Durum'
    )
    
    # Koç Değerlendirmesi
    completion_status = models.CharField(
        max_length=20,
        choices=CompletionStatus.choices,
        default=CompletionStatus.PENDING,
        verbose_name='Tamamlanma Durumu',
        help_text='Koçun değerlendirmesi: Yaptı / Yapmadı / Eksik'
    )
    
    task_completion_percent = models.PositiveIntegerField(
        default=0,
        verbose_name='Görev Tamamlanma %',
        help_text='Eksik durumunda %10 luk dilimlerle (10, 20, ..., 90)'
    )
    
    completed_question_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='Çözülen Soru Sayısı',
        help_text='Otomatik hesaplanır: question_count * task_completion_percent / 100'
    )
    
    completed_page_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='Tamamlanan Sayfa Sayısı',
        help_text='Otomatik hesaplanır: page_count * task_completion_percent / 100'
    )
    
    coach_evaluation_note = models.TextField(
        blank=True,
        verbose_name='Koç Değerlendirme Notu',
        help_text='Koçun bu görev için yazdığı kısa not'
    )
    
    evaluated_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Değerlendirme Zamanı'
    )
    
    # Performans
    actual_duration_minutes = models.IntegerField(
        null=True,
        blank=True,
        verbose_name='Gerçek Süre (dk)'
    )
    
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Tamamlanma Zamanı'
    )
    
    # Eksik Tamamlama Bilgisi
    is_completion_task = models.BooleanField(
        default=False,
        verbose_name='Eksik Tamamlama mı?',
        help_text='Bu görev, daha önceki bir ödevdeki eksik içeriğin tamamlanması için mi verildi?'
    )
    
    previous_task_completion_percent = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='Önceki Tamamlanma %',
        help_text='Önceki ödevdeki tamamlanma yüzdesi (eksik tamamlama görevlerinde)'
    )
    
    previous_assignment_title = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Önceki Ödev Başlığı',
        help_text='Önceki ödevin başlığı (eksik tamamlama görevlerinde)'
    )
    
    # Notlar
    student_feedback = models.TextField(
        blank=True,
        verbose_name='Öğrenci Geri Bildirimi'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Ödev Görevi'
        verbose_name_plural = 'Ödev Görevleri'
        ordering = ['order', 'id']
        indexes = [
            models.Index(fields=['lesson_block', 'status']),
        ]
    
    def __str__(self):
        return f"{self.lesson_block.lesson.ad} - {self.get_task_type_display()}"


class AssignmentPackage(models.Model):
    """Ödev paketi — tekrar kullanılabilir ödev şablonu."""

    name = models.CharField(max_length=255, verbose_name='Paket Adı')
    description = models.TextField(blank=True, verbose_name='Açıklama')
    ders_ad = models.CharField(max_length=255, blank=True, verbose_name='Ders Adı')
    sinif_seviyesi = models.CharField(max_length=100, blank=True, verbose_name='Sınıf Seviyesi')
    usage_count = models.PositiveIntegerField(default=0, verbose_name='Kullanım Sayısı')
    is_active = models.BooleanField(default=True, verbose_name='Aktif mi?')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assignment_packages_created',
        verbose_name='Oluşturan',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Oluşturma Tarihi')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Güncellenme Tarihi')

    class Meta:
        verbose_name = 'Ödev Paketi'
        verbose_name_plural = 'Ödev Paketleri'
        ordering = ['-updated_at']

    def __str__(self):
        return self.name


class AssignmentPackageItem(models.Model):
    """Ödev paketi içindeki kaynak içerik satırı."""

    package = models.ForeignKey(
        AssignmentPackage,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='Paket',
    )
    book_id = models.PositiveIntegerField(verbose_name='Kitap ID')
    book_name = models.CharField(max_length=255, verbose_name='Kitap Adı')
    content_id = models.PositiveIntegerField(verbose_name='İçerik ID')
    content_name = models.CharField(max_length=255, verbose_name='İçerik Adı')
    content_type = models.CharField(max_length=50, verbose_name='İçerik Tipi')
    topic_name = models.CharField(max_length=255, blank=True, verbose_name='Konu Adı')
    unit_name = models.CharField(max_length=255, blank=True, verbose_name='Ünite Adı')
    question_count = models.PositiveIntegerField(null=True, blank=True, verbose_name='Soru Sayısı')
    page_start = models.PositiveIntegerField(null=True, blank=True, verbose_name='Başlangıç Sayfası')
    page_end = models.PositiveIntegerField(null=True, blank=True, verbose_name='Bitiş Sayfası')
    order = models.PositiveIntegerField(default=0, verbose_name='Sıra')

    class Meta:
        verbose_name = 'Ödev Paketi Kalemi'
        verbose_name_plural = 'Ödev Paketi Kalemleri'
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.package.name} — {self.content_name}"


class AssignmentNotificationConfig(models.Model):
    """Haftalık ödev PDF WhatsApp mesajları için aktif şablon eşlemesi."""

    kurum_id = models.IntegerField('Kurum ID', unique=True)
    plan_veli_template = models.ForeignKey(
        'communication.MessageTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
        verbose_name='Ödev planı — veli şablonu',
    )
    plan_ogrenci_template = models.ForeignKey(
        'communication.MessageTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
        verbose_name='Ödev planı — öğrenci şablonu',
    )
    report_veli_template = models.ForeignKey(
        'communication.MessageTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
        verbose_name='Ödev raporu — veli şablonu',
    )
    report_ogrenci_template = models.ForeignKey(
        'communication.MessageTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
        verbose_name='Ödev raporu — öğrenci şablonu',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'coaching_assignment_notify_config'
        verbose_name = 'Ödev Bildirim Ayarı'
        verbose_name_plural = 'Ödev Bildirim Ayarları'
