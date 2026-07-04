"""
Sınav Modeli  (models/exam.py)

Exam             → Sınav tanımı
ExamSection      → Sınavın ders/bölüm blokları
ExamSessionModel → Sınav oturumu (sabah / öğleden sonra, 1.oturum vb.)
"""
from django.db import models


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  EXAM
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class Exam(models.Model):
    """Sınav tanımı."""

    class ExamType(models.TextChoices):
        YKS_TYT      = 'YKS_TYT',      'YKS – TYT (Temel Yeterlilik)'
        YKS_AYT      = 'YKS_AYT',      'YKS – AYT (Alan Yeterlilik)'
        LGS          = 'LGS',           'LGS (Liselere Geçiş)'
        DENEME       = 'DENEME',        'Deneme Sınavı'
        KURUM_ICI    = 'KURUM_ICI',     'Kurum İçi Sınav'
        KONU_TARAMA  = 'KONU_TARAMA',   'Konu Tarama'
        KAZANIM      = 'KAZANIM',       'Kazanım Sınavı'
        OZEL         = 'OZEL',          'Özel Sınav'

    class Status(models.TextChoices):
        DRAFT              = 'DRAFT',              'Taslak'
        ANSWER_KEY_READY   = 'ANSWER_KEY_READY',   'Cevap Anahtarı Hazır'
        RESULTS_UPLOADED   = 'RESULTS_UPLOADED',    'Sonuçlar Yüklendi'
        COMPLETED          = 'COMPLETED',           'Tamamlandı'

    class BookletType(models.TextChoices):
        NONE  = 'NONE',  'Kitapçık Yok'
        AB    = 'AB',    'A-B'
        ABCD  = 'ABCD',  'A-B-C-D'

    # ── TEMEL BİLGİLER ────────────────────────────────────────────────────────
    name = models.CharField('Sınav Adı', max_length=200)
    exam_type = models.CharField(
        'Sınav Türü', max_length=20, choices=ExamType.choices,
    )
    status = models.CharField(
        'Durum', max_length=25, choices=Status.choices, default=Status.DRAFT,
    )
    description = models.TextField('Açıklama', blank=True)
    is_active = models.BooleanField('Aktif', default=True)

    # ── TENANT (otomatik — aktif kurum/şube/dönem) ────────────────────────────
    kurum = models.ForeignKey(
        'kurum.Kurum', on_delete=models.CASCADE,
        related_name='olcme_sinavlari', verbose_name='Kurum',
        null=True, blank=True,
    )
    sube = models.ForeignKey(
        'sube.Sube', on_delete=models.CASCADE,
        related_name='olcme_sinavlari', verbose_name='Şube',
        null=True, blank=True,
    )
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili', on_delete=models.CASCADE,
        related_name='olcme_sinavlari', verbose_name='Eğitim Yılı',
        null=True, blank=True,
    )

    # ── SINIF / GRUP (M2M — sistemdeki sınıflardan seçilecek) ────────────────
    siniflar = models.ManyToManyField(
        'sinif.Sinif', blank=True,
        related_name='olcme_sinavlari', verbose_name='Sınıflar',
    )

    # ── DENEME HİZMETİ / PAKETİ ──────────────────────────────────────────────
    deneme_hizmeti = models.ForeignKey(
        'egitim_paketleri.EkHizmet', on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='olcme_sinavlari', verbose_name='Deneme Hizmeti',
        limit_choices_to={'hizmet_turu': 'deneme'},
    )
    deneme_paketi = models.ForeignKey(
        'egitim_paketleri.Deneme', on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='olcme_sinavlari', verbose_name='Deneme Paketi',
    )

    # ── TARİH ────────────────────────────────────────────────────────────────
    exam_date = models.DateField('Sınav Tarihi', null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(
        'Süre (dakika)', null=True, blank=True,
    )
    result_publish_date = models.DateTimeField(
        'Sonuç Yayın Tarihi', null=True, blank=True,
    )
    answer_key_publish_date = models.DateTimeField(
        'Cevap Anahtarı Yayın Tarihi', null=True, blank=True,
    )

    # ── PUANLAMA ──────────────────────────────────────────────────────────────
    wrong_answer_count = models.PositiveSmallIntegerField(
        'Yanlış Düzeltme Sayısı',
        default=4,
        help_text='Kaç yanlış cevap 1 doğruyu götürür? (Örn: 4 → 4 yanlış 1 doğruyu götürür, 0 → ceza yok)',
    )
    per_section_penalty = models.BooleanField('Bölüm Bazlı Düzeltme', default=True)
    score_coefficients = models.JSONField(
        'Puan Katsayıları', default=dict, blank=True,
    )

    # ── KİTAPÇIK ─────────────────────────────────────────────────────────────
    booklet_type = models.CharField(
        'Kitapçık Türü', max_length=4,
        choices=BookletType.choices, default=BookletType.NONE,
    )
    booklet_auto_detect = models.BooleanField(
        'Kitapçık Otomatik Tespit', default=True,
    )

    # ── AYT ↔ TYT BAĞLANTISI ─────────────────────────────────────────────────
    linked_tyt_exam = models.OneToOneField(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='linked_ayt_exam',
        limit_choices_to={'exam_type': 'YKS_TYT'},
    )

    # ── KİLİT / ŞABLON ───────────────────────────────────────────────────────
    is_locked = models.BooleanField('Kilitli', default=False)
    is_template = models.BooleanField('Şablon', default=False)

    # ── ZAMAN DAMGALARI ───────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Sınav'
        verbose_name_plural = 'Sınavlar'
        ordering = ['-exam_date', '-created_at']

    def __str__(self):
        return f'{self.name} ({self.get_exam_type_display()})'

    # ── PROPERTIES ────────────────────────────────────────────────────────────

    @property
    def section_count(self):
        return self.sections.filter(is_sub_section=False).count()

    @property
    def total_questions(self):
        from django.db.models import Sum
        result = self.sections.filter(is_sub_section=False).aggregate(
            total=Sum('question_count'),
        )
        return result['total'] or 0

    @property
    def session_count(self):
        return self.exam_sessions.count()

    @property
    def sinif_display(self):
        """Sınıf adlarını virgülle birleştirir."""
        names = list(self.siniflar.values_list('ad', flat=True)[:5])
        if self.siniflar.count() > 5:
            names.append(f'+{self.siniflar.count() - 5}')
        return ', '.join(names) if names else ''


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  EXAM SECTION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ExamSection(models.Model):
    """Sınav bölümü (ders bloğu)."""
    exam = models.ForeignKey(
        Exam, on_delete=models.CASCADE, related_name='sections',
    )
    name = models.CharField('Bölüm Adı', max_length=100)
    order = models.PositiveSmallIntegerField('Sıra', default=0)

    question_start = models.PositiveSmallIntegerField('Başlangıç Sorusu', default=1)
    question_end = models.PositiveSmallIntegerField('Bitiş Sorusu', default=1)
    question_count = models.PositiveSmallIntegerField('Soru Sayısı', default=0)

    is_sub_section = models.BooleanField('Alt Bölüm mü?', default=False)
    parent_section = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True,
        related_name='sub_sections',
    )
    subject = models.ForeignKey(
        'olcme_degerlendirme.Subject', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='exam_sections',
    )

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Sınav Bölümü'
        verbose_name_plural = 'Sınav Bölümleri'
        ordering = ['exam', 'order']
        constraints = [
            models.UniqueConstraint(
                fields=['exam', 'name', 'parent_section'],
                name='unique_section_name_per_parent',
            ),
            models.UniqueConstraint(
                fields=['exam', 'name'],
                condition=models.Q(parent_section__isnull=True),
                name='unique_main_section_name',
            ),
        ]

    def __str__(self):
        return f'{self.exam.name} – {self.name}'

    def save(self, *args, **kwargs):
        if self.question_start and self.question_end:
            self.question_count = self.question_end - self.question_start + 1
        super().save(*args, **kwargs)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  EXAM SESSION  (Sınav Oturumu)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ExamSessionModel(models.Model):
    """
    Sınav Oturumu — Bir sınav birden fazla oturuma ayrılabilir.
    Örnek: TYT 1.Oturum (Türkçe + Sosyal), TYT 2.Oturum (Matematik + Fen)
    """
    class SchedulePreference(models.TextChoices):
        HAFTA_ICI   = 'HAFTA_ICI',   'Hafta İçi'
        HAFTA_SONU  = 'HAFTA_SONU',  'Hafta Sonu'
        FARKETMEZ   = 'FARKETMEZ',   'Farketmez'

    exam = models.ForeignKey(
        Exam, on_delete=models.CASCADE,
        related_name='exam_sessions', verbose_name='Sınav',
    )
    name = models.CharField(
        'Oturum Adı', max_length=100,
        help_text='Örn: 1. Oturum, Cumartesi Sabah',
    )
    order = models.PositiveSmallIntegerField('Sıra', default=0)

    # ── TARİH / SAAT (oturum bazlı) ──────────────────────────────────────────
    session_date = models.DateField(
        'Oturum Tarihi', null=True, blank=True,
        help_text='Bu oturumun yapılacağı gün',
    )
    start_time = models.TimeField('Başlangıç Saati', null=True, blank=True)
    end_time = models.TimeField('Bitiş Saati', null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(
        'Süre (dakika)', null=True, blank=True,
    )

    # ── HAFTA İÇİ / SONU TERCİHİ ─────────────────────────────────────────────
    schedule_preference = models.CharField(
        'Zaman Tercihi', max_length=12,
        choices=SchedulePreference.choices,
        default=SchedulePreference.FARKETMEZ,
        help_text='Öğrenci bu oturumu hafta içi mi, hafta sonu mu tercih edebilir?',
    )

    sections = models.ManyToManyField(
        ExamSection, blank=True,
        related_name='session_assignments', verbose_name='Bölümler',
        help_text='Bu oturuma ait ders bölümleri',
    )
    description = models.TextField('Açıklama', blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Sınav Oturumu'
        verbose_name_plural = 'Sınav Oturumları'
        ordering = ['exam', 'order']
        unique_together = [('exam', 'name')]

    def __str__(self):
        return f'{self.exam.name} – {self.name}'

    @property
    def question_count(self):
        from django.db.models import Sum
        result = self.sections.aggregate(total=Sum('question_count'))
        return result['total'] or 0
