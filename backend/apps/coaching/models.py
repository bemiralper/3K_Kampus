"""
Coaching Domain Models
Öğrenci koçluk ve mentörlük sistemi modelleri
"""
from django.db import models
from django.conf import settings


class CoachProfile(models.Model):
    """
    Koç Profili
    
    Öğretmenin koç olarak görev yapabilmesi için gerekli profil.
    Her öğretmen bir koç profili sahibi olabilir.
    """
    
    teacher = models.OneToOneField(
        'personel.Personel',
        on_delete=models.CASCADE,
        related_name='coach_profile',
        verbose_name='Öğretmen'
    )
    
    capacity = models.PositiveIntegerField(
        'Öğrenci Kapasitesi',
        default=30,
        help_text='Koçun aynı anda sorumlu olabileceği maksimum öğrenci sayısı'
    )
    
    is_active = models.BooleanField(
        'Aktif',
        default=True,
        help_text='Koçluk yapıp yapamayacağını belirler'
    )
    
    is_coach = models.BooleanField(
        'Koç Rolü',
        default=True,
        help_text='Koç rolü aktif mi? İleride rehber öğretmen, branş öğretmeni ayrımı için'
    )
    
    created_at = models.DateTimeField(
        'Oluşturulma Tarihi',
        auto_now_add=True
    )
    
    updated_at = models.DateTimeField(
        'Güncellenme Tarihi',
        auto_now=True
    )
    
    class Meta:
        db_table = 'coaching_coach_profile'
        verbose_name = 'Koç Profili'
        verbose_name_plural = 'Koç Profilleri'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['is_active'], name='coach_profile_active_idx'),
            models.Index(fields=['teacher'], name='coach_profile_teacher_idx'),
            models.Index(fields=['is_coach'], name='coach_profile_is_coach_idx'),
        ]
    
    def __str__(self):
        return f"Koç: {self.teacher}"
    
    @property
    def current_student_count(self):
        """Şu an atanmış aktif öğrenci sayısı"""
        return self.assignments.filter(
            is_primary=True,
            end_date__isnull=True
        ).count()
    
    @property
    def available_capacity(self):
        """Kalan boş kapasite"""
        return max(0, self.capacity - self.current_student_count)


class CoachStudentAssignment(models.Model):
    """
    Koç-Öğrenci Atama
    
    Bir öğrencinin bir koça atanmasını temsil eder.
    Her öğrencinin bir tane birincil (primary) koçu olabilir.
    """
    
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name='assignments',
        verbose_name='Koç'
    )
    
    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='coach_assignments',
        verbose_name='Öğrenci'
    )
    
    start_date = models.DateField(
        'Başlangıç Tarihi'
    )
    
    end_date = models.DateField(
        'Bitiş Tarihi',
        null=True,
        blank=True,
        help_text='Boş bırakılırsa atama aktif kabul edilir'
    )
    
    is_primary = models.BooleanField(
        'Birincil Koç',
        default=True,
        help_text='Öğrencinin ana koçu olup olmadığını belirler'
    )
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_coach_assignments',
        verbose_name='Oluşturan'
    )
    
    created_at = models.DateTimeField(
        'Oluşturulma Tarihi',
        auto_now_add=True
    )
    
    updated_at = models.DateTimeField(
        'Güncellenme Tarihi',
        auto_now=True
    )
    
    class Meta:
        db_table = 'coaching_student_assignment'
        verbose_name = 'Koç-Öğrenci Ataması'
        verbose_name_plural = 'Koç-Öğrenci Atamaları'
        ordering = ['-start_date', '-created_at']
        indexes = [
            models.Index(fields=['student'], name='coach_assign_student_solo_idx'),
            models.Index(fields=['coach'], name='coach_assign_coach_solo_idx'),
            models.Index(fields=['is_primary'], name='coach_assign_primary_idx'),
            models.Index(fields=['student', 'is_primary'], name='coach_assign_student_idx'),
            models.Index(fields=['coach', 'is_primary'], name='coach_assign_coach_idx'),
            models.Index(fields=['start_date', 'end_date'], name='coach_assign_dates_idx'),
            models.Index(fields=['student', 'end_date'], name='coach_assign_active_idx'),
        ]
        constraints = [
            # Bir öğrencinin aynı anda sadece bir aktif birincil koçu olabilir
            models.UniqueConstraint(
                fields=['student'],
                condition=models.Q(is_primary=True, end_date__isnull=True),
                name='unique_active_primary_coach_per_student'
            )
        ]
    
    def __str__(self):
        status = "Aktif" if self.end_date is None else "Sonlandırılmış"
        primary = "(Birincil)" if self.is_primary else "(Yardımcı)"
        return f"{self.student} → {self.coach} {primary} [{status}]"


class CoachingEvent(models.Model):
    """
    Koçluk Etkinliği
    
    Koç ve öğrenci arasında gerçekleşen tüm etkinlikleri takip eder.
    Görüşmeler, ödevler, hedefler ve risk bildirimleri.
    """
    
    EVENT_TYPE_CHOICES = [
        ('MEETING', 'Görüşme'),
        ('ASSIGNMENT', 'Ödev'),
        ('GOAL', 'Hedef'),
        ('RISK', 'Risk Bildirimi'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Beklemede'),
        ('in_progress', 'Devam Ediyor'),
        ('completed', 'Tamamlandı'),
        ('cancelled', 'İptal Edildi'),
    ]
    
    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='coaching_events',
        verbose_name='Öğrenci'
    )
    
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name='events',
        verbose_name='Koç'
    )
    
    event_type = models.CharField(
        'Etkinlik Türü',
        max_length=20,
        choices=EVENT_TYPE_CHOICES
    )
    
    title = models.CharField(
        'Başlık',
        max_length=255
    )
    
    description = models.TextField(
        'Açıklama',
        blank=True,
        null=True
    )
    
    event_date = models.DateTimeField(
        'Etkinlik Tarihi'
    )
    
    status = models.CharField(
        'Durum',
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    
    # Genişletilebilir yapı - İlişkili kayıt referansı
    event_source = models.CharField(
        'Kaynak Tablo',
        max_length=50,
        null=True,
        blank=True,
        help_text='Etkinlik kaynağı: homework, meeting, goal, risk, system'
    )
    
    reference_id = models.IntegerField(
        'Referans ID',
        null=True,
        blank=True,
        help_text='İlişkili kayıt ID (event_source tablosundaki kayıt)'
    )
    
    # Esnek metadata alanı - JSON formatında ek bilgiler
    metadata = models.JSONField(
        'Ek Bilgiler',
        default=dict,
        blank=True,
        help_text='Etkinliğe özel ek veriler (homework detayları, meeting notları vb.)'
    )
    
    created_at = models.DateTimeField(
        'Oluşturulma Tarihi',
        auto_now_add=True
    )
    
    updated_at = models.DateTimeField(
        'Güncellenme Tarihi',
        auto_now=True
    )
    
    class Meta:
        db_table = 'coaching_event'
        verbose_name = 'Koçluk Etkinliği'
        verbose_name_plural = 'Koçluk Etkinlikleri'
        ordering = ['-event_date', '-created_at']
        indexes = [
            models.Index(fields=['student', 'event_type'], name='coach_event_student_idx'),
            models.Index(fields=['coach', 'event_type'], name='coach_event_coach_idx'),
            models.Index(fields=['event_date'], name='coach_event_date_idx'),
            models.Index(fields=['status'], name='coach_event_status_idx'),
            models.Index(fields=['event_source', 'reference_id'], name='coach_event_source_ref_idx'),
        ]
    
    def __str__(self):
        return f"[{self.get_event_type_display()}] {self.title} - {self.student}"


# ═══════════════════════════════════════════════════════════════
# GÖRÜŞME YÖNETİMİ MODELLERİ
# ═══════════════════════════════════════════════════════════════

class GorusmeKaydi(models.Model):
    """
    Koçluk Görüşme Kaydı

    Koç-öğrenci / veli / iç değerlendirme gibi tüm görüşmelerin
    tarihsel kaydını tutar. CRM benzeri takip sistemi.
    """

    # ─── Görüşme Türleri ─────────────────────────────────────
    GORUSME_TURU_CHOICES = [
        ('ogrenci', 'Öğrenci Görüşmesi'),
        ('veli', 'Veli Görüşmesi'),
        ('ic_degerlendirme', 'Koç İç Değerlendirme'),
        ('motivasyon', 'Motivasyon Görüşmesi'),
        ('akademik_analiz', 'Akademik Analiz'),
        ('disiplin', 'Disiplin Görüşmesi'),
        ('diger', 'Diğer'),
    ]

    # ─── Görüşme Durumları ───────────────────────────────────
    DURUM_CHOICES = [
        ('planlandi', 'Planlandı'),
        ('tamamlandi', 'Tamamlandı'),
        ('iptal', 'İptal Edildi'),
        ('ertelendi', 'Ertelendi'),
    ]

    # ─── Görüşme Yöntemleri ──────────────────────────────────
    YONTEM_CHOICES = [
        ('yuz_yuze', 'Yüz Yüze'),
        ('telefon', 'Telefon'),
        ('online', 'Online'),
    ]

    # ─── Öncelik ─────────────────────────────────────────────
    ONCELIK_CHOICES = [
        ('acil', 'Acil'),
        ('normal', 'Normal'),
        ('rutin', 'Rutin Takip'),
    ]

    # ─── İlişkiler ───────────────────────────────────────────
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='gorusme_kayitlari',
        verbose_name='Kurum',
    )

    ogrenci = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='gorusme_kayitlari',
        verbose_name='Öğrenci',
    )

    koc = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name='gorusme_kayitlari',
        verbose_name='Koç',
    )

    # ─── Temel Bilgiler ──────────────────────────────────────
    gorusme_turu = models.CharField(
        'Görüşme Türü',
        max_length=30,
        choices=GORUSME_TURU_CHOICES,
        default='ogrenci',
    )

    diger_tur_aciklama = models.CharField(
        'Diğer Tür Açıklaması',
        max_length=100,
        blank=True,
        default='',
        help_text='Görüşme türü "Diğer" seçildiğinde açıklama',
    )

    durum = models.CharField(
        'Durum',
        max_length=20,
        choices=DURUM_CHOICES,
        default='planlandi',
    )

    yontem = models.CharField(
        'Görüşme Yöntemi',
        max_length=20,
        choices=YONTEM_CHOICES,
        default='yuz_yuze',
    )

    oncelik = models.CharField(
        'Öncelik',
        max_length=10,
        choices=ONCELIK_CHOICES,
        default='normal',
    )

    # ─── Tarih / Saat / Süre ─────────────────────────────────
    gorusme_tarihi = models.DateField('Görüşme Tarihi')

    gorusme_saati = models.TimeField(
        'Görüşme Saati',
        null=True,
        blank=True,
    )

    sure_dakika = models.PositiveIntegerField(
        'Süre (dk)',
        null=True,
        blank=True,
        help_text='Görüşme süresi dakika cinsinden',
    )

    # ─── İçerik ──────────────────────────────────────────────
    konu = models.CharField(
        'Görüşme Konusu',
        max_length=500,
        help_text='Görüşmenin ana konusu / başlığı',
    )

    notlar = models.TextField(
        'Görüşme Notları',
        blank=True,
        default='',
        help_text='Koçun görüşme sırasında aldığı detaylı notlar',
    )

    # ─── Duygu / Durum Skoru ─────────────────────────────────
    motivasyon_skoru = models.PositiveSmallIntegerField(
        'Motivasyon Skoru',
        null=True,
        blank=True,
        help_text='1-5 arası',
    )

    akademik_ozguven_skoru = models.PositiveSmallIntegerField(
        'Akademik Özgüven Skoru',
        null=True,
        blank=True,
        help_text='1-5 arası',
    )

    stres_seviyesi = models.PositiveSmallIntegerField(
        'Stres Seviyesi',
        null=True,
        blank=True,
        help_text='1-5 arası (1=düşük, 5=yüksek)',
    )

    # ─── Etiketler (JSON) ────────────────────────────────────
    etiketler = models.JSONField(
        'Etiketler',
        default=list,
        blank=True,
        help_text='["dikkat-eksikliği", "uyku-düzeni", "sınav-kaygısı"] gibi',
    )

    # ─── Veli Paylaşımı ──────────────────────────────────────
    veli_ile_paylasilsin = models.BooleanField(
        'Veli ile Paylaşılsın',
        default=False,
    )

    veli_ozet = models.TextField(
        'Veli İçin Özet',
        blank=True,
        default='',
        help_text='Veliye gösterilecek özel özet notu (iç notlar paylaşılmaz)',
    )

    veli_paylasim_tarihi = models.DateTimeField(
        'Veli Paylaşım Tarihi',
        null=True,
        blank=True,
    )

    # ─── Sonraki Görüşme ─────────────────────────────────────
    sonraki_gorusme_tarihi = models.DateField(
        'Sonraki Görüşme Tarihi',
        null=True,
        blank=True,
        help_text='Takip görüşmesi planlandıysa tarihi',
    )

    # ─── Meta ─────────────────────────────────────────────────
    olusturan = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='olusturulan_gorusmeler',
        verbose_name='Oluşturan',
    )

    created_at = models.DateTimeField('Oluşturulma', auto_now_add=True)
    updated_at = models.DateTimeField('Güncellenme', auto_now=True)

    class Meta:
        db_table = 'coaching_gorusme_kaydi'
        verbose_name = 'Görüşme Kaydı'
        verbose_name_plural = 'Görüşme Kayıtları'
        ordering = ['-gorusme_tarihi', '-gorusme_saati']
        indexes = [
            models.Index(fields=['kurum', 'gorusme_tarihi'], name='gorusme_kurum_tarih_idx'),
            models.Index(fields=['ogrenci', 'gorusme_tarihi'], name='gorusme_ogrenci_tarih_idx'),
            models.Index(fields=['koc', 'gorusme_tarihi'], name='gorusme_koc_tarih_idx'),
            models.Index(fields=['durum'], name='gorusme_durum_idx'),
            models.Index(fields=['gorusme_turu'], name='gorusme_tur_idx'),
            models.Index(fields=['oncelik'], name='gorusme_oncelik_idx'),
        ]

    def __str__(self):
        return f"{self.get_gorusme_turu_display()} — {self.ogrenci} ({self.gorusme_tarihi})"


class GorusmeAksiyon(models.Model):
    """
    Görüşme Aksiyon Planı

    Her görüşmenin sonunda çıkan somut aksiyon maddeleri.
    Kimin yapacağı, deadline ve tamamlanma durumu.
    """

    SORUMLU_CHOICES = [
        ('ogrenci', 'Öğrenci'),
        ('koc', 'Koç'),
        ('veli', 'Veli'),
        ('idare', 'İdare'),
    ]

    gorusme = models.ForeignKey(
        GorusmeKaydi,
        on_delete=models.CASCADE,
        related_name='aksiyonlar',
        verbose_name='Görüşme',
    )

    aciklama = models.CharField(
        'Aksiyon Açıklaması',
        max_length=500,
    )

    sorumlu = models.CharField(
        'Sorumlu',
        max_length=20,
        choices=SORUMLU_CHOICES,
        default='ogrenci',
    )

    deadline = models.DateField(
        'Teslim Tarihi',
        null=True,
        blank=True,
    )

    tamamlandi = models.BooleanField('Tamamlandı', default=False)

    tamamlanma_tarihi = models.DateField(
        'Tamamlanma Tarihi',
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'coaching_gorusme_aksiyon'
        verbose_name = 'Görüşme Aksiyonu'
        verbose_name_plural = 'Görüşme Aksiyonları'
        ordering = ['deadline', 'created_at']

    def __str__(self):
        status = "✅" if self.tamamlandi else "⬜"
        return f"{status} {self.aciklama[:50]}"


class GorusmeKatilimci(models.Model):
    """
    Görüşme Katılımcıları

    Görüşmeye katılan kişiler (koç + öğrenci dışında ek katılımcılar).
    Veli, rehber öğretmen, idareci vb.
    """

    ROL_CHOICES = [
        ('veli', 'Veli'),
        ('rehber', 'Rehber Öğretmen'),
        ('idareci', 'İdareci'),
        ('brans_ogretmeni', 'Branş Öğretmeni'),
        ('diger', 'Diğer'),
    ]

    gorusme = models.ForeignKey(
        GorusmeKaydi,
        on_delete=models.CASCADE,
        related_name='katilimcilar',
        verbose_name='Görüşme',
    )

    ad_soyad = models.CharField('Ad Soyad', max_length=200)

    rol = models.CharField(
        'Katılımcı Rolü',
        max_length=30,
        choices=ROL_CHOICES,
    )

    personel = models.ForeignKey(
        'personel.Personel',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='katilim_gorusmeleri',
        verbose_name='Personel',
        help_text='Sistemde kayıtlı personel ise bağla',
    )

    class Meta:
        db_table = 'coaching_gorusme_katilimci'
        verbose_name = 'Görüşme Katılımcısı'
        verbose_name_plural = 'Görüşme Katılımcıları'

    def __str__(self):
        return f"{self.ad_soyad} ({self.get_rol_display()})"


class GorusmeDosya(models.Model):
    """Görüşmeye eklenen dosyalar (sınav sonucu, plan fotoğrafı vb.)"""

    gorusme = models.ForeignKey(
        GorusmeKaydi,
        on_delete=models.CASCADE,
        related_name='dosyalar',
        verbose_name='Görüşme',
    )

    dosya = models.FileField(
        'Dosya',
        upload_to='coaching/gorusme_dosyalari/%Y/%m/',
    )

    aciklama = models.CharField(
        'Açıklama',
        max_length=255,
        blank=True,
        default='',
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'coaching_gorusme_dosya'
        verbose_name = 'Görüşme Dosyası'
        verbose_name_plural = 'Görüşme Dosyaları'

    def __str__(self):
        return self.aciklama or self.dosya.name


class GorusmeHatirlatma(models.Model):
    """
    Görüşme Hatırlatmaları

    Koça sonraki adımlar için hatırlatma gönderilmesi.
    """

    TIP_CHOICES = [
        ('takip_gorusmesi', 'Takip Görüşmesi'),
        ('aksiyon_kontrol', 'Aksiyon Kontrol'),
        ('genel', 'Genel Hatırlatma'),
    ]

    gorusme = models.ForeignKey(
        GorusmeKaydi,
        on_delete=models.CASCADE,
        related_name='hatirlatmalar',
        verbose_name='Görüşme',
    )

    hatirlatma_tarihi = models.DateField('Hatırlatma Tarihi')

    mesaj = models.CharField(
        'Hatırlatma Mesajı',
        max_length=500,
    )

    tip = models.CharField(
        'Hatırlatma Tipi',
        max_length=30,
        choices=TIP_CHOICES,
        default='genel',
    )

    gonderildi = models.BooleanField('Gönderildi', default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'coaching_gorusme_hatirlatma'
        verbose_name = 'Görüşme Hatırlatması'
        verbose_name_plural = 'Görüşme Hatırlatmaları'
        ordering = ['hatirlatma_tarihi']

    def __str__(self):
        return f"{self.hatirlatma_tarihi} — {self.mesaj[:40]}"


# Predictive modelleri
from apps.coaching.predictive.models import StudentFeatureSnapshot, PredictiveCache  # noqa
