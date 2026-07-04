"""
Resources Domain Models
Enterprise DDD Pattern for Book-based Content Library
"""
from django.db import models


class BookType(models.Model):
    """
    Dinamik Kitap Türü Model
    Admin panelden yeni türler eklenebilir
    """
    kod = models.CharField('Kod', max_length=50, unique=True)
    ad = models.CharField('Tür Adı', max_length=100)
    renk = models.CharField('Badge Rengi', max_length=20, default='secondary',
                           help_text='primary, success, warning, danger, info, secondary')
    ikon = models.CharField('İkon', max_length=50, blank=True, help_text='Emoji veya ikon kodu')
    aciklama = models.TextField('Açıklama', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)
    sira = models.PositiveIntegerField('Sıra', default=0)
    
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'resource_book_type'
        verbose_name = 'Kitap Türü'
        verbose_name_plural = 'Kitap Türleri'
        ordering = ['sira', 'ad']
        
    def __str__(self):
        return self.ad


class ResourceBook(models.Model):
    """
    Kaynak Kitap Model
    """
    
    # Temel Bilgiler
    ad = models.CharField('Kitap Adı', max_length=200)
    kod = models.CharField('Kod', max_length=50)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='resource_books',
        verbose_name='Kurum',
        null=True,
        blank=True,
    )
    book_type = models.ForeignKey(
        BookType,
        on_delete=models.PROTECT,
        related_name='books',
        verbose_name='Kitap Türü'
    )
    
    # İlişkiler
    ders = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.PROTECT,
        related_name='resource_books',
        verbose_name='Ders'
    )
    sinif_seviyesi = models.ForeignKey(
        'egitim_tanimlari.SinifSeviyesi',
        on_delete=models.PROTECT,
        related_name='resource_books',
        verbose_name='Sınıf Seviyesi'
    )
    sinif_seviyeleri = models.ManyToManyField(
        'egitim_tanimlari.SinifSeviyesi',
        related_name='resource_books_multi',
        verbose_name='Sınıf Seviyeleri',
        blank=True,
        help_text='Kitabın hedeflediği sınıf seviyeleri (birden fazla seçilebilir)',
    )
    
    # Kitap Detayları
    yayinevi = models.CharField('Yayınevi', max_length=200, blank=True)
    yazar = models.CharField('Yazar', max_length=200, blank=True)
    yayin_yili = models.PositiveIntegerField('Yayın Yılı', null=True, blank=True)
    toplam_sayfa = models.PositiveIntegerField('Toplam Sayfa', null=True, blank=True)
    isbn = models.CharField('ISBN', max_length=20, blank=True)
    
    # Zorluk Seviyesi (1-10 arası)
    zorluk_min = models.PositiveSmallIntegerField(
        'Minimum Zorluk',
        null=True,
        blank=True,
        help_text='1-10 arası minimum zorluk seviyesi'
    )
    zorluk_max = models.PositiveSmallIntegerField(
        'Maksimum Zorluk',
        null=True,
        blank=True,
        help_text='1-10 arası maksimum zorluk seviyesi'
    )
    
    # Kapak Görseli
    kapak_url = models.URLField('Kapak URL', blank=True)
    
    # Meta
    aciklama = models.TextField('Açıklama', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)
    sira = models.PositiveIntegerField('Sıra', default=0)
    
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'resource_book'
        verbose_name = 'Kaynak Kitap'
        verbose_name_plural = 'Kaynak Kitaplar'
        ordering = ['sira', 'ad']
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'kod'],
                name='unique_resource_book_kod_per_kurum',
            ),
        ]
        
    def __str__(self):
        return f"{self.ad} ({self.book_type.ad})"
    
    @property
    def unit_count(self):
        """Ünite sayısı"""
        return self.units.count()
    
    @property
    def topic_count(self):
        """Toplam konu sayısı"""
        return sum(unit.topics.count() for unit in self.units.all())
    
    @property
    def content_count(self):
        """Toplam içerik sayısı"""
        return sum(
            topic.contents.count() 
            for unit in self.units.all() 
            for topic in unit.topics.all()
        )


class ResourceUnit(models.Model):
    """
    Ünite Model
    Kitabın bölümlerini temsil eder
    """
    book = models.ForeignKey(
        ResourceBook,
        on_delete=models.CASCADE,
        related_name='units',
        verbose_name='Kitap'
    )
    
    ad = models.CharField('Ünite Adı', max_length=200)
    kod = models.CharField('Kod', max_length=50)
    sira = models.PositiveIntegerField('Sıra', default=0)
    aciklama = models.TextField('Açıklama', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)
    
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'resource_unit'
        verbose_name = 'Ünite'
        verbose_name_plural = 'Üniteler'
        ordering = ['sira', 'ad']
        unique_together = ['book', 'kod']
        
    def __str__(self):
        return f"{self.book.ad} - {self.ad}"
    
    @property
    def topic_count(self):
        """Konu sayısı"""
        return self.topics.count()


class ResourceTopic(models.Model):
    """
    Konu Model
    Ünite altındaki konuları temsil eder
    """
    unit = models.ForeignKey(
        ResourceUnit,
        on_delete=models.CASCADE,
        related_name='topics',
        verbose_name='Ünite'
    )
    
    ad = models.CharField('Konu Adı', max_length=200)
    kod = models.CharField('Kod', max_length=50)
    sira = models.PositiveIntegerField('Sıra', default=0)
    aciklama = models.TextField('Açıklama', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)
    
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'resource_topic'
        verbose_name = 'Konu'
        verbose_name_plural = 'Konular'
        ordering = ['sira', 'ad']
        unique_together = ['unit', 'kod']
        
    def __str__(self):
        return f"{self.unit.ad} - {self.ad}"
    
    @property
    def content_count(self):
        """İçerik sayısı"""
        return self.contents.count()


class ResourceContent(models.Model):
    """
    İçerik Model
    Konu altındaki içerikleri temsil eder
    Supports: TEST_SET, SUBJECT_SECTION, PAGE_RANGE, EXERCISE, VIDEO, CUSTOM
    """
    
    class ContentType(models.TextChoices):
        TEST_SET = 'TEST_SET', 'Test Seti'
        SUBJECT_SECTION = 'SUBJECT_SECTION', 'Konu Anlatımı'
        PAGE_RANGE = 'PAGE_RANGE', 'Sayfa Aralığı'
        EXERCISE = 'EXERCISE', 'Alıştırma'
        VIDEO = 'VIDEO', 'Video'
        CUSTOM = 'CUSTOM', 'Özel İçerik'
    
    class DifficultyLevel(models.TextChoices):
        EASY = 'EASY', 'Kolay'
        MEDIUM = 'MEDIUM', 'Orta'
        HARD = 'HARD', 'Zor'
        MIXED = 'MIXED', 'Karışık'
    
    topic = models.ForeignKey(
        ResourceTopic,
        on_delete=models.CASCADE,
        related_name='contents',
        verbose_name='Konu'
    )
    
    # Temel Bilgiler
    ad = models.CharField('İçerik Adı', max_length=200)
    content_type = models.CharField(
        'İçerik Türü',
        max_length=20,
        choices=ContentType.choices,
        default=ContentType.CUSTOM
    )
    sira = models.PositiveIntegerField('Sıra', default=0)
    
    # TEST_SET için
    question_count = models.PositiveIntegerField('Soru Sayısı', null=True, blank=True)
    difficulty = models.CharField(
        'Zorluk',
        max_length=10,
        choices=DifficultyLevel.choices,
        default=DifficultyLevel.MIXED,
        blank=True
    )
    
    # PAGE_RANGE için
    page_start = models.PositiveIntegerField('Başlangıç Sayfa', null=True, blank=True)
    page_end = models.PositiveIntegerField('Bitiş Sayfa', null=True, blank=True)
    
    # SUBJECT_SECTION için
    estimated_minutes = models.PositiveIntegerField('Tahmini Süre (dk)', null=True, blank=True)
    
    # VIDEO için
    video_url = models.URLField('Video URL', blank=True)
    video_duration = models.PositiveIntegerField('Video Süresi (sn)', null=True, blank=True)
    
    # Ortak
    aciklama = models.TextField('Açıklama', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)
    
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'resource_content'
        verbose_name = 'İçerik'
        verbose_name_plural = 'İçerikler'
        ordering = ['sira', 'ad']
        
    def __str__(self):
        return f"{self.topic.ad} - {self.ad} ({self.get_content_type_display()})"
    
    @property
    def page_count(self):
        """Sayfa sayısı (PAGE_RANGE için)"""
        if self.page_start and self.page_end:
            return self.page_end - self.page_start + 1
        return None
