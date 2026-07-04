"""
ProgramGridCell Model
Program Grid Engine'in temel hücre modeli.

Grid şu şekilde oluşur:
WeeklyDay × TimeSlot(LESSON türleri) = ProgramGridCell

Not:
- BREAK slotları grid'e dahil edilmez
- Sadece LESSON slot_type grid hücresi üretir

Gelecek entegrasyonlar:
- Ders Program Motoru: lesson_id, teacher_id doldurur
- Sınav Planlama: status=EXAM kullanır
- Resmi Tatil Motoru: status=HOLIDAY işaretler
- Oda Planlama: room_id, classroom_id doldurur

TODO: Drag-drop ders yerleşimi
TODO: Öğretmen çakışma kontrolü
TODO: Oda çakışma kontrolü
TODO: Resmi tatil senkronizasyonu
"""

from django.db import models
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.academic.domain.weekly_day import WeeklyDay
from apps.academic.domain.timeslot import TimeSlot


class CellStatus(models.TextChoices):
    """Grid hücre durumu enum"""
    EMPTY = 'EMPTY', 'Boş'
    LOCKED = 'LOCKED', 'Kilitli'
    FILLED = 'FILLED', 'Dolu'
    HOLIDAY = 'HOLIDAY', 'Tatil'
    EXAM = 'EXAM', 'Sınav'
    BLOCKED = 'BLOCKED', 'Bloklanmış'


class ProgramGridCell(models.Model):
    """
    Program Grid Hücresi
    
    Ders programı, sınav planlama, yoklama ve oda planlama için
    temel grid altyapısını sağlar.
    
    Her hücre bir gün + zaman dilimi kombinasyonunu temsil eder.
    """
    
    schedule_template = models.ForeignKey(
        ScheduleTemplate,
        on_delete=models.CASCADE,
        related_name='grid_cells',
        verbose_name='Zaman Şablonu'
    )
    
    weekly_cycle = models.ForeignKey(
        WeeklyCycle,
        on_delete=models.CASCADE,
        related_name='grid_cells',
        verbose_name='Haftalık Döngü'
    )
    
    # Program Versiyonu (Versiyonlu program yönetimi için)
    schedule_version = models.ForeignKey(
        'academic.ScheduleVersion',
        on_delete=models.CASCADE,
        null=True,  # Migration için geçici null
        blank=True,
        related_name='grid_cells',
        verbose_name='Program Versiyonu',
        help_text='Bu hücrenin ait olduğu program versiyonu'
    )
    
    weekly_day = models.ForeignKey(
        WeeklyDay,
        on_delete=models.CASCADE,
        related_name='grid_cells',
        verbose_name='Haftalık Gün'
    )
    
    timeslot = models.ForeignKey(
        TimeSlot,
        on_delete=models.CASCADE,
        related_name='grid_cells',
        verbose_name='Zaman Dilimi'
    )
    
    # ==================== DERS PROGRAM BİLGİLERİ ====================
    # Scheduler motoru tarafından doldurulur
    
    # Sınıf (Program hangi sınıf için)
    sinif = models.ForeignKey(
        'sinif.Sinif',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='grid_cells',
        verbose_name='Sınıf',
        help_text='Bu hücrenin ait olduğu sınıf'
    )
    
    # Ders (Planlanmış ders)
    ders = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grid_cells',
        verbose_name='Ders',
        help_text='Bu slota yerleştirilen ders'
    )
    
    # Öğretmen (Dersi verecek öğretmen)
    ogretmen = models.ForeignKey(
        'personel.Personel',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grid_cells',
        verbose_name='Öğretmen',
        help_text='Bu slotta dersi verecek öğretmen'
    )
    
    # Sınıf Ders Planı (Kaynak plan)
    class_lesson_plan = models.ForeignKey(
        'academic.ClassLessonPlan',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grid_cells',
        verbose_name='Sınıf Ders Planı',
        help_text='Bu yerleşimin kaynak planı'
    )
    
    # Double Block - Bir sonraki slot ile birleşik mi?
    is_double_block_start = models.BooleanField(
        'Çift Blok Başlangıcı',
        default=False,
        help_text='Bu hücre çift blok dersinin başlangıcı mı?'
    )
    
    # Double Block Partner - Birleşik olduğu hücre
    double_block_partner = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='double_block_source',
        verbose_name='Çift Blok Partner',
        help_text='Çift blok dersinin diğer hücresi'
    )
    
    status = models.CharField(
        max_length=20,
        choices=CellStatus.choices,
        default=CellStatus.EMPTY,
        verbose_name='Durum',
        help_text='Hücre durumu: EMPTY, LOCKED, FILLED, HOLIDAY, EXAM, BLOCKED'
    )
    
    # Metadata
    notes = models.TextField(
        blank=True,
        null=True,
        verbose_name='Notlar',
        help_text='Hücre hakkında notlar'
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name='Aktif mi'
    )
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Oluşturulma Tarihi')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Güncellenme Tarihi')

    class Meta:
        db_table = 'academic_program_grid_cell'
        verbose_name = 'Program Grid Hücresi'
        verbose_name_plural = 'Program Grid Hücreleri'
        ordering = ['weekly_day__order', 'timeslot__order']
        indexes = [
            models.Index(
                fields=['schedule_version', 'sinif'],
                name='idx_grid_version_sinif'
            ),
            models.Index(
                fields=['schedule_version', 'ogretmen'],
                name='idx_grid_version_ogretmen'
            ),
            models.Index(
                fields=['schedule_version', 'status'],
                name='idx_grid_version_status'
            ),
        ]
        constraints = [
            # Versiyon bazlı unique constraint
            models.UniqueConstraint(
                fields=['schedule_version', 'weekly_day', 'timeslot', 'sinif'],
                condition=models.Q(is_active=True),
                name='unique_grid_cell_version_sinif'
            ),
            # Eski constraint (legacy için, schedule_version olmadan)
            models.UniqueConstraint(
                fields=['schedule_template', 'weekly_cycle', 'weekly_day', 'timeslot'],
                condition=models.Q(is_active=True, schedule_version__isnull=True),
                name='unique_grid_cell_legacy'
            )
        ]

    def __str__(self):
        return f"{self.weekly_day.name} - {self.timeslot.name} ({self.get_status_display()})"

    @property
    def is_empty(self):
        """Hücre boş mu?"""
        return self.status == CellStatus.EMPTY

    @property
    def is_available(self):
        """Hücre kullanılabilir mi? (Boş ve aktif)"""
        return self.is_active and self.status == CellStatus.EMPTY

    @property
    def time_range(self):
        """Zaman aralığını döndür"""
        return f"{self.timeslot.start_time.strftime('%H:%M')} - {self.timeslot.end_time.strftime('%H:%M')}"

    @property
    def cell_key(self):
        """Benzersiz hücre anahtarı"""
        return f"{self.weekly_day.day_of_week}_{self.timeslot.order}"

    def lock(self):
        """Hücreyi kilitle"""
        self.status = CellStatus.LOCKED
        self.save(update_fields=['status', 'updated_at'])

    def unlock(self):
        """Hücre kilidini aç"""
        if self.status == CellStatus.LOCKED:
            self.status = CellStatus.EMPTY
            self.save(update_fields=['status', 'updated_at'])

    def mark_holiday(self):
        """Tatil olarak işaretle"""
        self.status = CellStatus.HOLIDAY
        self.save(update_fields=['status', 'updated_at'])

    def mark_exam(self):
        """Sınav olarak işaretle"""
        self.status = CellStatus.EXAM
        self.save(update_fields=['status', 'updated_at'])

    def block(self):
        """Blokla"""
        self.status = CellStatus.BLOCKED
        self.save(update_fields=['status', 'updated_at'])

    def clear(self):
        """Hücreyi temizle - LOCKED hücrelere dokunmaz"""
        if self.status == CellStatus.LOCKED:
            return False
        
        self.status = CellStatus.EMPTY
        self.ders = None
        self.ogretmen = None
        self.class_lesson_plan = None
        self.is_double_block_start = False
        self.double_block_partner = None
        self.save(update_fields=[
            'status', 'ders', 'ogretmen', 'class_lesson_plan',
            'is_double_block_start', 'double_block_partner', 'updated_at'
        ])
        return True

    def fill(self, ders, ogretmen, class_lesson_plan, is_double_block_start=False, partner_cell=None):
        """
        Hücreyi doldur
        
        Args:
            ders: Yerleştirilecek ders
            ogretmen: Dersi verecek öğretmen
            class_lesson_plan: Kaynak sınıf ders planı
            is_double_block_start: Çift blok başlangıcı mı
            partner_cell: Çift blok partner hücresi
        
        Returns:
            bool: Başarılı ise True
        """
        if not self.is_available:
            return False
        
        self.status = CellStatus.FILLED
        self.ders = ders
        self.ogretmen = ogretmen
        self.class_lesson_plan = class_lesson_plan
        self.is_double_block_start = is_double_block_start
        self.double_block_partner = partner_cell
        self.save(update_fields=[
            'status', 'ders', 'ogretmen', 'class_lesson_plan',
            'is_double_block_start', 'double_block_partner', 'updated_at'
        ])
        return True
