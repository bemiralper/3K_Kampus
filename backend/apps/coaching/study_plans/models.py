"""
Haftalık çalışma planı katmanı — ödev CRUD'dan bağımsız.

Şablon kural paketidir (öğrenci haftasının kopyası değil).
Program, açık ödev birimlerini günlere böler; taşan leftover'da kalır.
"""

from django.conf import settings
from django.db import models


class StudyScenario(models.TextChoices):
    STANDART = 'STANDART', 'Standart'
    YOGUN = 'YOGUN', 'Yoğun'
    SINAV_HAFTASI = 'SINAV_HAFTASI', 'Sınav Haftası'
    ZAYIF_KONU = 'ZAYIF_KONU', 'Zayıf Konu'
    TYT_GUNLUK = 'TYT_GUNLUK', 'TYT Günlük'
    OZEL = 'OZEL', 'Özel'


class TemplateScope(models.TextChoices):
    KURUM = 'KURUM', 'Kurum'
    KOC = 'KOC', 'Koç'


class DistributionStrategy(models.TextChoices):
    BY_TEST = 'BY_TEST', 'Teste göre'
    BY_QUESTION = 'BY_QUESTION', 'Soruya göre'
    EQUAL = 'EQUAL', 'Eşit'
    WEIGHTED = 'WEIGHTED', 'Ağırlıklı'


class WeekendPolicy(models.TextChoices):
    OFF = 'off', 'Kapalı'
    LIGHT = 'light', 'Hafif'
    SAME = 'same', 'Aynı'


class OverflowPolicy(models.TextChoices):
    LEFTOVER = 'leftover', 'Bekleyen kutu'
    NEXT_DAY = 'next_day', 'Sonraki gün'
    NEXT_WEEK = 'next_week', 'Sonraki hafta'


class ProgramStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Aktif'
    ARCHIVED = 'ARCHIVED', 'Arşiv'
    SUPERSEDED = 'SUPERSEDED', 'Üzerine yazıldı'


class SlotSourceKind(models.TextChoices):
    HOMEWORK = 'HOMEWORK', 'Ödev'
    GOAL = 'GOAL', 'Hedef'
    REVIEW = 'REVIEW', 'Tekrar'
    EXAM_ANALYSIS = 'EXAM_ANALYSIS', 'Deneme analizi'


class LeftoverReason(models.TextChoices):
    OVER_CAP = 'OVER_CAP', 'Tavan aşıldı'
    NO_DAY = 'NO_DAY', 'Uygun gün yok'
    DUE_PASSED = 'DUE_PASSED', 'Teslim geçti'


class LoadLevel(models.TextChoices):
    IDEAL = 'IDEAL', 'İdeal'
    YOGUN = 'YOGUN', 'Yoğun'
    TASTI = 'TASTI', 'Taştı'


class DayState(models.TextChoices):
    EMPTY = 'empty', 'Boş'
    PARTIAL = 'partial', 'Kısmi'
    DONE = 'done', 'Tamam'
    LOCKED = 'locked', 'Kilitli'
    OVER = 'over', 'Taştı'


class StudyTemplate(models.Model):
    """Kuruma ait, öğrenciye uygulanan kural paketi."""

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='study_templates',
        verbose_name='Kurum',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='study_templates_created',
        verbose_name='Oluşturan',
    )
    name = models.CharField('Ad', max_length=120)
    scenario = models.CharField(
        'Senaryo',
        max_length=20,
        choices=StudyScenario.choices,
        default=StudyScenario.STANDART,
    )
    scope = models.CharField(
        'Kapsam',
        max_length=10,
        choices=TemplateScope.choices,
        default=TemplateScope.KURUM,
    )
    is_builtin = models.BooleanField('Hazır şablon', default=False)
    is_active = models.BooleanField('Aktif', default=True)

    active_weekdays = models.JSONField('Aktif günler', default=list)
    day_weights = models.JSONField('Gün ağırlıkları', default=dict)
    weekend_policy = models.CharField(
        'Hafta sonu',
        max_length=10,
        choices=WeekendPolicy.choices,
        default=WeekendPolicy.OFF,
    )
    intensify_weekdays = models.JSONField('Yoğunlaştırılacak günler', default=list)
    strategy = models.CharField(
        'Dağıtım',
        max_length=20,
        choices=DistributionStrategy.choices,
        default=DistributionStrategy.BY_TEST,
    )
    unit_priority = models.JSONField(
        'Birim önceliği',
        default=list,
        help_text='örn. ["test", "exam", "question", "review"]',
    )

    max_questions_per_day = models.PositiveIntegerField('Günlük soru tavanı', default=20)
    max_tests_per_day = models.PositiveIntegerField('Günlük test tavanı', default=2)
    max_minutes_per_day = models.PositiveIntegerField('Günlük süre tavanı', default=90)
    max_slots_per_day = models.PositiveIntegerField('Günlük slot tavanı', default=6)

    overflow = models.CharField(
        'Taşma',
        max_length=16,
        choices=OverflowPolicy.choices,
        default=OverflowPolicy.LEFTOVER,
    )
    lock_past_days = models.BooleanField('Geçmiş günleri kilitle', default=True)
    respect_due_date = models.BooleanField('Teslim tarihine uy', default=True)
    honor_calendar = models.BooleanField('Takvim tatillerini say', default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'study_plan_template'
        verbose_name = 'Çalışma şablonu'
        verbose_name_plural = 'Çalışma şablonları'
        ordering = ['scenario', 'name']
        indexes = [
            models.Index(fields=['kurum', 'is_active'], name='spt_kurum_active_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'name'],
                name='unique_study_template_kurum_name',
            ),
        ]

    def __str__(self):
        return f'{self.name} ({self.get_scenario_display()})'


class StudentStudyWindow(models.Model):
    """Öğrencinin haftalık müsaitliği — şablondan bağımsız."""

    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='study_windows',
        verbose_name='Öğrenci',
    )
    weekday = models.PositiveSmallIntegerField('Gün (0=Pzt)')
    available_minutes = models.PositiveIntegerField('Müsait dakika', default=90)
    is_available = models.BooleanField('Çalışılabilir', default=True)
    exception_dates = models.JSONField('Kapalı tarihler', default=list)

    class Meta:
        db_table = 'study_plan_window'
        verbose_name = 'Öğrenci çalışma penceresi'
        verbose_name_plural = 'Öğrenci çalışma pencereleri'
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'weekday'],
                name='unique_study_window_student_weekday',
            ),
        ]

    def __str__(self):
        return f'{self.student_id} · gün {self.weekday}'


class StudyProgram(models.Model):
    """Bir öğrencinin bir haftalık üretilmiş planı. Şablon burada yaşamaz."""

    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='study_plan_programs',
        verbose_name='Öğrenci',
    )
    coach = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='study_plan_programs',
        verbose_name='Koç',
    )
    template = models.ForeignKey(
        StudyTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='programs',
        verbose_name='Şablon',
    )
    week_start = models.DateField('Hafta başlangıcı')
    week_end = models.DateField('Hafta bitişi')
    generation_version = models.PositiveIntegerField('Üretim sürümü', default=1)
    status = models.CharField(
        'Durum',
        max_length=16,
        choices=ProgramStatus.choices,
        default=ProgramStatus.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'study_plan_program'
        verbose_name = 'Çalışma programı'
        verbose_name_plural = 'Çalışma programları'
        ordering = ['-week_start']
        indexes = [
            models.Index(fields=['student', 'week_start'], name='spp_student_week_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'week_start'],
                name='unique_study_plan_student_week',
            ),
        ]

    def __str__(self):
        return f'{self.student_id} · {self.week_start}'


class StudyDay(models.Model):
    program = models.ForeignKey(
        StudyProgram,
        on_delete=models.CASCADE,
        related_name='days',
        verbose_name='Program',
    )
    day_date = models.DateField('Tarih')
    weekday = models.PositiveSmallIntegerField('Gün (0=Pzt)')
    is_locked = models.BooleanField('Kilitli', default=False)
    target_minutes = models.PositiveIntegerField('Hedef süre', default=0)
    planned_tests = models.PositiveIntegerField('Planlanan test', default=0)
    planned_questions = models.PositiveIntegerField('Planlanan soru', default=0)
    planned_minutes = models.PositiveIntegerField('Planlanan süre', default=0)
    planned_slots = models.PositiveIntegerField('Planlanan slot', default=0)
    completed_tests = models.PositiveIntegerField('Bitmiş test', default=0)
    completed_questions = models.PositiveIntegerField('Bitmiş soru', default=0)
    completed_minutes = models.PositiveIntegerField('Bitmiş süre', default=0)
    completed_slots = models.PositiveIntegerField('Bitmiş slot', default=0)
    load_level = models.CharField(
        'Yük',
        max_length=10,
        choices=LoadLevel.choices,
        default=LoadLevel.IDEAL,
    )
    cap_tests = models.PositiveIntegerField('Test tavanı', default=0)
    cap_questions = models.PositiveIntegerField('Soru tavanı', default=0)
    cap_minutes = models.PositiveIntegerField('Süre tavanı', default=0)
    cap_slots = models.PositiveIntegerField('Slot tavanı', default=0)

    class Meta:
        db_table = 'study_plan_day'
        verbose_name = 'Çalışma günü'
        verbose_name_plural = 'Çalışma günleri'
        ordering = ['day_date']
        constraints = [
            models.UniqueConstraint(
                fields=['program', 'day_date'],
                name='unique_study_plan_day',
            ),
        ]

    def __str__(self):
        return f'{self.program_id} · {self.day_date}'


class StudySlot(models.Model):
    day = models.ForeignKey(
        StudyDay,
        on_delete=models.CASCADE,
        related_name='slots',
        verbose_name='Gün',
    )
    source_assignment = models.ForeignKey(
        'assignment_manual.ManualAssignment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='study_plan_slots',
        verbose_name='Kaynak ödev',
    )
    source_lesson = models.ForeignKey(
        'assignment_manual.AssignmentLesson',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='study_plan_slots',
        verbose_name='Kaynak ödev dersi',
    )
    source_task = models.ForeignKey(
        'assignment_manual.AssignmentTask',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='study_plan_slots',
        verbose_name='Kaynak görev',
    )
    source_kind = models.CharField(
        'Kaynak türü',
        max_length=20,
        choices=SlotSourceKind.choices,
        default=SlotSourceKind.HOMEWORK,
    )
    lesson = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='study_plan_slots',
        verbose_name='Ders',
    )
    title = models.CharField('Başlık', max_length=255)
    topic_name = models.CharField('Konu', max_length=255, blank=True)
    resource_name = models.CharField('Kaynak', max_length=255, blank=True)
    planned_tests = models.PositiveIntegerField('Planlanan test', default=0)
    planned_questions = models.PositiveIntegerField('Planlanan soru', default=0)
    planned_minutes = models.PositiveIntegerField('Planlanan süre', default=0)
    completed_tests = models.PositiveIntegerField('Bitmiş test', default=0)
    completed_questions = models.PositiveIntegerField('Bitmiş soru', default=0)
    completed_minutes = models.PositiveIntegerField('Bitmiş süre', default=0)
    is_done = models.BooleanField('Tamamlandı', default=False)
    is_locked = models.BooleanField('Kilitli', default=False)
    is_orphaned = models.BooleanField('Yetim', default=False)
    order = models.PositiveIntegerField('Sıra', default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'study_plan_slot'
        verbose_name = 'Çalışma slotu'
        verbose_name_plural = 'Çalışma slotları'
        ordering = ['order', 'id']

    def __str__(self):
        return self.title


class StudyLeftover(models.Model):
    program = models.ForeignKey(
        StudyProgram,
        on_delete=models.CASCADE,
        related_name='leftovers',
        verbose_name='Program',
    )
    source_assignment = models.ForeignKey(
        'assignment_manual.ManualAssignment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='study_plan_leftovers',
    )
    source_lesson = models.ForeignKey(
        'assignment_manual.AssignmentLesson',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='study_plan_leftovers',
    )
    source_task = models.ForeignKey(
        'assignment_manual.AssignmentTask',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='study_plan_leftovers',
    )
    source_kind = models.CharField(
        'Kaynak türü',
        max_length=20,
        choices=SlotSourceKind.choices,
        default=SlotSourceKind.HOMEWORK,
    )
    title = models.CharField('Başlık', max_length=255)
    lesson_name = models.CharField('Ders', max_length=120, blank=True)
    remaining_tests = models.PositiveIntegerField('Kalan test', default=0)
    remaining_questions = models.PositiveIntegerField('Kalan soru', default=0)
    remaining_minutes = models.PositiveIntegerField('Kalan süre', default=0)
    reason = models.CharField(
        'Neden',
        max_length=16,
        choices=LeftoverReason.choices,
        default=LeftoverReason.OVER_CAP,
    )

    class Meta:
        db_table = 'study_plan_leftover'
        verbose_name = 'Bekleyen birim'
        verbose_name_plural = 'Bekleyen birimler'

    def __str__(self):
        return f'{self.title} ({self.reason})'


class StudyGenerationRun(models.Model):
    program = models.ForeignKey(
        StudyProgram,
        on_delete=models.CASCADE,
        related_name='generation_runs',
        verbose_name='Program',
    )
    template = models.ForeignKey(
        StudyTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='generation_runs',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='study_plan_generation_runs',
    )
    input_snapshot = models.JSONField('Girdi', default=dict)
    warnings = models.JSONField('Uyarılar', default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'study_plan_generation_run'
        verbose_name = 'Üretim kaydı'
        verbose_name_plural = 'Üretim kayıtları'
        ordering = ['-created_at']

    def __str__(self):
        return f'run {self.pk} · program {self.program_id}'
