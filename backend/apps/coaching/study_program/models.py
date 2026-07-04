"""
Çalışma Programı - Models

WeeklyProgram       : Haftalık program ana kaydı
ProgramDay          : Bir günün planı
ProgramBlock        : Güne atanmış tekil çalışma bloğu (ödev kartı)
DailyFeedback       : Öğrencinin günlük mini yorumu
Badge               : Kazanılan rozetler
"""

from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone


# ────────────────────────────────────────
# Sabit Seçimler
# ────────────────────────────────────────

class BlockType(models.TextChoices):
    """Çalışma bloğu tipleri — raporlamada filtrelenebilir."""
    KONU_OGRENME      = 'KONU_OGRENME',      '📖 Konu Öğrenme'
    TEKRAR             = 'TEKRAR',             '🔁 Tekrar'
    SORU_COZUMU        = 'SORU_COZUMU',        '📝 Soru Çözümü'
    BRANS_DENEMESI     = 'BRANS_DENEMESI',     '🎯 Branş Denemesi'
    MINI_TEST          = 'MINI_TEST',          '⚡ Mini Test'
    ANALIZ             = 'ANALIZ',             '📊 Analiz'
    ZAYIF_KONU         = 'ZAYIF_KONU',         '🧠 Zayıf Konu Çalışması'
    DENEME             = 'DENEME',             '📋 Deneme'


class GoalType(models.TextChoices):
    """Her görevin bağlı olabileceği hedef türleri."""
    NET_ARTIRMA        = 'NET_ARTIRMA',        'Net Artırma'
    KONU_TAMAMLAMA     = 'KONU_TAMAMLAMA',     'Konu Tamamlama'
    DENEME_HAZIRLIK    = 'DENEME_HAZIRLIK',    'Deneme Hazırlık'
    EKSIK_KAPATMA      = 'EKSIK_KAPATMA',      'Eksik Kapatma'
    SURE_HIZLANDIRMA   = 'SURE_HIZLANDIRMA',   'Süre Hızlandırma'


class BadgeCode(models.TextChoices):
    """Rozet tipleri."""
    EKSIKSIZ_GUN       = 'EKSIKSIZ_GUN',       'Eksiksiz Gün'
    SERI_3             = 'SERI_3',             '3 Gün Seri'
    SERI_5             = 'SERI_5',             '5 Gün Seri'
    SERI_7             = 'SERI_7',             '7 Gün Seri'
    HAFTA_SAMPIYONU    = 'HAFTA_SAMPIYONU',    'Hafta Şampiyonu'
    SORU_AVCISI        = 'SORU_AVCISI',        'Soru Avcısı'         # Haftalık 500+ soru
    ERKEN_KUSU         = 'ERKEN_KUSU',         'Erken Kuşu'          # Sabah 08:00'den önce tamamlanma


class LoadLevel(models.TextChoices):
    """Günlük yük seviyesi."""
    IDEAL  = 'IDEAL',  'İdeal'
    YOGUN  = 'YOGUN',  'Yoğun'
    ASIRI  = 'ASIRI',  'Aşırı'


class EnergyLevel(models.TextChoices):
    """Öğrencinin enerji seviyesi (günlük yorumdan çıkarılır)."""
    YUKSEK  = 'YUKSEK',  'Yüksek'
    NORMAL  = 'NORMAL',  'Normal'
    DUSUK   = 'DUSUK',   'Düşük'


# ════════════════════════════════════════
# 1) HAFTALIK PROGRAM
# ════════════════════════════════════════

class WeeklyProgram(models.Model):
    """
    Bir öğrenci için bir haftalık çalışma programı.
    Koç tarafından oluşturulur, sistemdeki ödevlerden beslenir.
    """

    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='weekly_programs',
        verbose_name='Öğrenci',
    )
    coach = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_programs',
        verbose_name='Koç',
    )

    # Hafta aralığı (esnek tarih aralığı)
    week_start = models.DateField('Hafta Başlangıcı', help_text='Program başlangıç tarihi')
    week_end   = models.DateField('Hafta Bitişi', help_text='Program bitiş tarihi')

    # İstatistikler (ön-hesaplanmış — save() ile güncellenir)
    total_question_count  = models.PositiveIntegerField('Toplam Soru', default=0)
    total_block_count     = models.PositiveIntegerField('Toplam Blok', default=0)
    completion_percent    = models.PositiveIntegerField('Tamamlanma %', default=0)

    # Şablon
    is_template   = models.BooleanField('Şablon mı?', default=False, help_text='Tekrar kullanılmak üzere şablon olarak kaydedildi mi?')
    template_name = models.CharField('Şablon Adı', max_length=120, blank=True)

    # Koç notu
    coach_note = models.TextField('Koç Haftalık Notu', blank=True, help_text='Haftaya özel motivasyon / strateji notu')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'study_weekly_program'
        verbose_name = 'Haftalık Çalışma Programı'
        verbose_name_plural = 'Haftalık Çalışma Programları'
        ordering = ['-week_start']
        indexes = [
            models.Index(fields=['student', 'week_start'], name='sp_student_week_idx'),
            models.Index(fields=['coach'], name='sp_coach_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'week_start'],
                name='unique_student_week',
            ),
        ]

    def __str__(self):
        return f"{self.student} — {self.week_start} / {self.week_end}"

    # ── Aggregate helpers ──
    def refresh_stats(self):
        """Gün verilerinden istatistikleri yeniden hesapla."""
        days = self.days.all()
        day_count = days.count() or 1
        self.total_block_count    = sum(d.blocks.count() for d in days)
        self.total_question_count = sum(
            d.blocks.aggregate(s=models.Sum('question_count'))['s'] or 0
            for d in days
        )
        completed = sum(1 for d in days if d.completion_percent >= 100)
        self.completion_percent = int(completed / day_count * 100)
        self.save(update_fields=['total_block_count', 'total_question_count', 'completion_percent', 'updated_at'])


# ════════════════════════════════════════
# 2) PROGRAM GÜNÜ
# ════════════════════════════════════════

class ProgramDay(models.Model):
    """
    Haftalık programın bir günü (Pzt–Paz).
    Drop-zone: bloklar buraya sürüklenir.
    """

    WEEKDAYS = [
        (0, 'Pazartesi'),
        (1, 'Salı'),
        (2, 'Çarşamba'),
        (3, 'Perşembe'),
        (4, 'Cuma'),
        (5, 'Cumartesi'),
        (6, 'Pazar'),
    ]

    program  = models.ForeignKey(WeeklyProgram, on_delete=models.CASCADE, related_name='days', verbose_name='Program')
    day_date = models.DateField('Tarih')
    weekday  = models.IntegerField('Gün', choices=WEEKDAYS)

    # Ön-hesaplanmış
    total_question_count = models.PositiveIntegerField('Toplam Soru', default=0)
    total_block_count    = models.PositiveIntegerField('Blok Sayısı', default=0)
    completion_percent   = models.PositiveIntegerField('Tamamlanma %', default=0)

    # Yük seviyesi
    load_level = models.CharField('Yük Seviyesi', max_length=10, choices=LoadLevel.choices, default=LoadLevel.IDEAL)

    # Koç günlük notu (motivasyon)
    coach_note = models.TextField('Koç Notu', blank=True, help_text='Koçun o güne özel motivasyon notu')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'study_program_day'
        verbose_name = 'Program Günü'
        verbose_name_plural = 'Program Günleri'
        ordering = ['day_date']
        indexes = [
            models.Index(fields=['program', 'weekday'], name='sp_day_weekday_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['program', 'day_date'],
                name='unique_program_day_date',
            ),
        ]

    def __str__(self):
        return f"{self.get_weekday_display()} — {self.day_date}"

    def refresh_stats(self):
        """Blok verilerinden istatistikleri güncelle + yük seviyesini hesapla."""
        agg = self.blocks.aggregate(
            total_q=models.Sum('question_count'),
            cnt=models.Count('id'),
            done=models.Count('id', filter=models.Q(is_completed=True)),
        )
        self.total_question_count = agg['total_q'] or 0
        self.total_block_count    = agg['cnt'] or 0
        total = agg['cnt'] or 1
        self.completion_percent   = int((agg['done'] or 0) / total * 100)

        # Yük seviyesi kuralları
        if self.total_question_count > 200 or self.total_block_count > 6:
            self.load_level = LoadLevel.ASIRI
        elif self.total_question_count > 120 or self.total_block_count > 4:
            self.load_level = LoadLevel.YOGUN
        else:
            self.load_level = LoadLevel.IDEAL

        self.save(update_fields=[
            'total_question_count', 'total_block_count',
            'completion_percent', 'load_level', 'updated_at',
        ])


# ════════════════════════════════════════
# 3) ÇALIŞMA BLOĞU (kart)
# ════════════════════════════════════════

class ProgramBlock(models.Model):
    """
    Bir güne atanmış tekil çalışma kartı.
    Systemdeki ManualAssignment / AssignmentTask kaynaklarından beslenebilir,
    veya bağımsız olarak da oluşturulabilir.
    """

    day = models.ForeignKey(ProgramDay, on_delete=models.CASCADE, related_name='blocks', verbose_name='Gün')

    # ── Kaynak ilişkileri (varsa) ──
    source_assignment = models.ForeignKey(
        'assignment_manual.ManualAssignment',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='program_blocks',
        verbose_name='Kaynak Ödev',
    )
    source_task = models.ForeignKey(
        'assignment_manual.AssignmentTask',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='program_blocks',
        verbose_name='Kaynak Görev',
    )
    source_lesson = models.ForeignKey(
        'assignment_manual.AssignmentLesson',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='program_blocks',
        verbose_name='Kaynak Ödev Dersi',
    )

    # ── Ders bağlantısı ──
    lesson = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='study_blocks',
        verbose_name='Ders',
    )

    # ── İçerik ──
    title          = models.CharField('Başlık', max_length=255)
    topic_name     = models.CharField('Konu', max_length=255, blank=True)
    resource_name  = models.CharField('Kaynak', max_length=255, blank=True, help_text='Kitap / fasikül adı')

    # ── Tipler & Hedef ──
    block_type = models.CharField('Blok Tipi', max_length=30, choices=BlockType.choices, default=BlockType.SORU_COZUMU)
    goal_type  = models.CharField('Hedef Türü', max_length=30, choices=GoalType.choices, blank=True)

    # ── Metrikler ──
    question_count            = models.PositiveIntegerField('Soru Sayısı', default=0)
    estimated_duration_minutes = models.PositiveIntegerField('Tahmini Süre (dk)', null=True, blank=True)

    # ── Öncelik ──
    class Priority(models.TextChoices):
        LOW    = 'LOW',    'Düşük'
        MEDIUM = 'MEDIUM', 'Orta'
        HIGH   = 'HIGH',   'Yüksek'
        URGENT = 'URGENT', 'Acil'

    priority = models.CharField('Öncelik', max_length=10, choices=Priority.choices, default=Priority.MEDIUM)

    # ── Sıralama ──
    order = models.PositiveIntegerField('Sıra', default=0)

    # ── Tamamlanma ──
    is_completed    = models.BooleanField('Tamamlandı mı?', default=False)
    completed_at    = models.DateTimeField('Tamamlanma Zamanı', null=True, blank=True)
    actual_duration = models.PositiveIntegerField('Gerçek Süre (dk)', null=True, blank=True)

    # Renk (ders bazlı — frontendde hesaplanır ama fallback olarak tutarız)
    color = models.CharField('Renk Kodu', max_length=20, blank=True, help_text='hex (#3b82f6) veya tailwind renk adı')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'study_program_block'
        verbose_name = 'Çalışma Bloğu'
        verbose_name_plural = 'Çalışma Blokları'
        ordering = ['order', 'id']
        indexes = [
            models.Index(fields=['day', 'order'], name='sp_block_order_idx'),
            models.Index(fields=['block_type'], name='sp_block_type_idx'),
            models.Index(fields=['lesson'], name='sp_block_lesson_idx'),
        ]

    def __str__(self):
        return f"{self.title} ({self.get_block_type_display()})"


# ════════════════════════════════════════
# 4) GÜNLÜK MİNİ YORUM
# ════════════════════════════════════════

class DailyFeedback(models.Model):
    """
    Öğrencinin günlük 3 soruluk hızlı check yanıtı.
    Koçun dashboard'ına düşer.
    """

    day = models.OneToOneField(ProgramDay, on_delete=models.CASCADE, related_name='feedback', verbose_name='Gün')

    struggled    = models.BooleanField('Zorlandı mı?', null=True, blank=True)
    time_enough  = models.BooleanField('Süre yetti mi?', null=True, blank=True)
    unclear_topic = models.CharField('Anlamadığı konu', max_length=255, blank=True)

    # Opsiyonel serbest yorum
    comment = models.TextField('Ek Yorum', blank=True)

    # Hesaplanmış enerji seviyesi
    energy_level = models.CharField('Enerji', max_length=10, choices=EnergyLevel.choices, default=EnergyLevel.NORMAL)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'study_daily_feedback'
        verbose_name = 'Günlük Geri Bildirim'
        verbose_name_plural = 'Günlük Geri Bildirimler'

    def __str__(self):
        return f"Feedback — {self.day}"

    def save(self, *args, **kwargs):
        # Basit enerji hesaplama
        negative = 0
        if self.struggled:
            negative += 1
        if self.time_enough is False:
            negative += 1
        if self.unclear_topic:
            negative += 1

        if negative >= 2:
            self.energy_level = EnergyLevel.DUSUK
        elif negative == 1:
            self.energy_level = EnergyLevel.NORMAL
        else:
            self.energy_level = EnergyLevel.YUKSEK

        super().save(*args, **kwargs)


# ════════════════════════════════════════
# 5) ROZET (Badge)
# ════════════════════════════════════════

class Badge(models.Model):
    """Öğrencinin kazandığı başarı rozeti."""

    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='study_badges',
        verbose_name='Öğrenci',
    )
    program = models.ForeignKey(
        WeeklyProgram,
        on_delete=models.CASCADE,
        related_name='badges',
        verbose_name='Program',
    )

    code        = models.CharField('Rozet Kodu', max_length=30, choices=BadgeCode.choices)
    title       = models.CharField('Başlık', max_length=120)
    description = models.CharField('Açıklama', max_length=255, blank=True)
    icon        = models.CharField('İkon', max_length=10, blank=True, help_text='Emoji veya ikon kodu')
    earned_date = models.DateField('Kazanma Tarihi', default=timezone.now)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'study_badge'
        verbose_name = 'Rozet'
        verbose_name_plural = 'Rozetler'
        ordering = ['-earned_date']

    def __str__(self):
        return f"{self.icon} {self.title} — {self.student}"
