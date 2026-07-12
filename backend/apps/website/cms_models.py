"""
Kurumsal CMS v2 modelleri — Page Builder, medya, menü, form, SEO, entegrasyon.
Kurum seviyesinde çok kiracılı; şube FK opsiyonel (ileride override).
"""
from __future__ import annotations

import secrets
import uuid

from django.conf import settings
from django.db import models
from django.utils.text import slugify


def media_asset_upload_to(instance, filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'bin'
    kid = getattr(instance, 'kurum_id', None) or 'new'
    folder = (instance.folder or 'genel').strip('/').replace('..', '') or 'genel'
    return f'website/{kid}/media/{folder}/{uuid.uuid4().hex[:12]}.{ext}'


def media_variant_upload_to(instance, filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'webp'
    kid = getattr(instance.asset, 'kurum_id', None) or 'new'
    return f'website/{kid}/media/variants/{uuid.uuid4().hex[:12]}.{ext}'


class WebPage(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_PUBLISHED = 'published'
    STATUS_SCHEDULED = 'scheduled'
    STATUS_ARCHIVED = 'archived'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Taslak'),
        (STATUS_PUBLISHED, 'Yayında'),
        (STATUS_SCHEDULED, 'Zamanlanmış'),
        (STATUS_ARCHIVED, 'Arşiv'),
    ]

    kurum = models.ForeignKey(
        'kurum.Kurum', on_delete=models.CASCADE, related_name='web_pages',
    )
    sube = models.ForeignKey(
        'sube.Sube', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='web_pages',
        help_text='Boş = kurum varsayılan sitesi',
    )
    parent = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='children',
    )
    title = models.CharField('Başlık', max_length=200)
    slug = models.SlugField('Slug', max_length=220)
    status = models.CharField(
        'Durum', max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True,
    )
    template = models.CharField('Şablon', max_length=60, blank=True, default='default')
    locale = models.CharField('Dil', max_length=10, default='tr')
    show_in_menu = models.BooleanField('Menüde Göster', default=False)
    show_breadcrumb = models.BooleanField('Breadcrumb', default=True)
    is_homepage = models.BooleanField('Anasayfa', default=False)
    publish_at = models.DateTimeField('Yayın Tarihi', null=True, blank=True)
    unpublish_at = models.DateTimeField('Yayından Kalkma', null=True, blank=True)

    # SEO
    meta_title = models.CharField('Meta Title', max_length=70, blank=True, default='')
    meta_description = models.CharField('Meta Description', max_length=320, blank=True, default='')
    meta_keywords = models.CharField('Meta Keywords', max_length=500, blank=True, default='')
    canonical_url = models.URLField('Canonical', max_length=500, blank=True, default='')
    robots_index = models.BooleanField('Index', default=True)
    robots_follow = models.BooleanField('Follow', default=True)
    og_title = models.CharField('OG Title', max_length=100, blank=True, default='')
    og_description = models.CharField('OG Description', max_length=300, blank=True, default='')
    og_image = models.URLField('OG Image', max_length=500, blank=True, default='')
    twitter_card = models.CharField('Twitter Card', max_length=40, blank=True, default='summary_large_image')
    schema_json = models.JSONField('JSON-LD', default=dict, blank=True)
    sitemap_include = models.BooleanField('Sitemap', default=True)
    sitemap_priority = models.DecimalField(
        'Sitemap Öncelik', max_digits=2, decimal_places=1, default=0.5,
    )

    published_version = models.PositiveIntegerField('Yayın Versiyon', default=0)
    preview_token = models.CharField('Önizleme Token', max_length=64, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_web_pages',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='updated_web_pages',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['title']
        unique_together = [('kurum', 'locale', 'slug')]
        verbose_name = 'Web Sayfası'
        verbose_name_plural = 'Web Sayfaları'
        indexes = [
            models.Index(fields=['kurum', 'status']),
            models.Index(fields=['kurum', 'is_homepage']),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title) or 'sayfa'
            slug = base
            n = 1
            while WebPage.objects.filter(
                kurum_id=self.kurum_id, locale=self.locale, slug=slug,
            ).exclude(pk=self.pk).exists():
                slug = f'{base}-{n}'
                n += 1
            self.slug = slug
        if not self.preview_token:
            self.preview_token = secrets.token_urlsafe(24)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.title} ({self.slug})'


class WebPageVersion(models.Model):
    page = models.ForeignKey(WebPage, on_delete=models.CASCADE, related_name='versions')
    version = models.PositiveIntegerField('Versiyon')
    label = models.CharField('Etiket', max_length=120, blank=True, default='')
    blocks = models.JSONField('Bloklar', default=list, blank=True)
    is_autosave = models.BooleanField('Otomatik Taslak', default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version']
        unique_together = [('page', 'version')]
        verbose_name = 'Sayfa Versiyonu'
        verbose_name_plural = 'Sayfa Versiyonları'

    def __str__(self):
        return f'{self.page_id} v{self.version}'


class MediaFolder(models.Model):
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='media_folders')
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True, related_name='children',
    )
    name = models.CharField('Ad', max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        unique_together = [('kurum', 'parent', 'name')]
        verbose_name = 'Medya Klasörü'
        verbose_name_plural = 'Medya Klasörleri'

    def __str__(self):
        return self.name


class MediaAsset(models.Model):
    KIND_IMAGE = 'image'
    KIND_VIDEO = 'video'
    KIND_FILE = 'file'
    KIND_CHOICES = [
        (KIND_IMAGE, 'Görsel'),
        (KIND_VIDEO, 'Video'),
        (KIND_FILE, 'Dosya'),
    ]

    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='media_assets')
    folder_ref = models.ForeignKey(
        MediaFolder, on_delete=models.SET_NULL, null=True, blank=True, related_name='assets',
    )
    folder = models.CharField('Klasör Yolu', max_length=200, blank=True, default='genel')
    kind = models.CharField('Tür', max_length=20, choices=KIND_CHOICES, default=KIND_IMAGE)
    title = models.CharField('Başlık', max_length=200, blank=True, default='')
    file = models.FileField('Dosya', upload_to=media_asset_upload_to)
    mime_type = models.CharField('MIME', max_length=100, blank=True, default='')
    size_bytes = models.PositiveIntegerField('Boyut', default=0)
    width = models.PositiveIntegerField('Genişlik', null=True, blank=True)
    height = models.PositiveIntegerField('Yükseklik', null=True, blank=True)
    alt_text = models.CharField('Alt Text', max_length=300, blank=True, default='')
    caption = models.CharField('Caption', max_length=500, blank=True, default='')
    description = models.TextField('Açıklama', blank=True, default='')
    tags = models.JSONField('Etiketler', default=list, blank=True)
    seo_filename = models.CharField('SEO Dosya Adı', max_length=200, blank=True, default='')
    usage_refs = models.JSONField('Kullanım', default=list, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Medya'
        verbose_name_plural = 'Medya Kütüphanesi'

    def __str__(self):
        return self.title or self.file.name


class MediaVariant(models.Model):
    asset = models.ForeignKey(MediaAsset, on_delete=models.CASCADE, related_name='variants')
    format = models.CharField('Format', max_length=20)  # webp, avif, jpeg
    width = models.PositiveIntegerField(null=True, blank=True)
    file = models.FileField(upload_to=media_variant_upload_to)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('asset', 'format', 'width')]
        verbose_name = 'Medya Türevi'
        verbose_name_plural = 'Medya Türevleri'


class NavMenu(models.Model):
    LOCATION_HEADER = 'header'
    LOCATION_FOOTER = 'footer'
    LOCATION_MOBILE = 'mobile'
    LOCATION_CHOICES = [
        (LOCATION_HEADER, 'Header'),
        (LOCATION_FOOTER, 'Footer'),
        (LOCATION_MOBILE, 'Mobil'),
    ]

    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='nav_menus')
    name = models.CharField('Ad', max_length=120)
    location = models.CharField('Konum', max_length=20, choices=LOCATION_CHOICES, default=LOCATION_HEADER)
    aktif = models.BooleanField(default=True)

    class Meta:
        unique_together = [('kurum', 'location', 'name')]
        verbose_name = 'Menü'
        verbose_name_plural = 'Menüler'

    def __str__(self):
        return f'{self.name} ({self.location})'


class NavItem(models.Model):
    menu = models.ForeignKey(NavMenu, on_delete=models.CASCADE, related_name='items')
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True, related_name='children',
    )
    label = models.CharField('Etiket', max_length=120)
    url = models.CharField('URL', max_length=500, blank=True, default='')
    page = models.ForeignKey(
        WebPage, on_delete=models.SET_NULL, null=True, blank=True, related_name='nav_items',
    )
    icon = models.CharField('İkon', max_length=60, blank=True, default='')
    badge = models.CharField('Badge', max_length=40, blank=True, default='')
    description = models.CharField('Açıklama', max_length=300, blank=True, default='')
    open_in_new_tab = models.BooleanField('Yeni Sekme', default=False)
    is_mega = models.BooleanField('Mega Menü', default=False)
    sira = models.PositiveSmallIntegerField('Sıra', default=0)
    aktif = models.BooleanField(default=True)

    class Meta:
        ordering = ['sira', 'id']
        verbose_name = 'Menü Öğesi'
        verbose_name_plural = 'Menü Öğeleri'

    def __str__(self):
        return self.label


class SiteTheme(models.Model):
    kurum = models.OneToOneField(
        'kurum.Kurum', on_delete=models.CASCADE, related_name='site_theme',
    )
    logo_url = models.URLField(max_length=500, blank=True, default='')
    favicon_url = models.URLField(max_length=500, blank=True, default='')
    primary_color = models.CharField(max_length=20, blank=True, default='#0f766e')
    secondary_color = models.CharField(max_length=20, blank=True, default='#0ea5e9')
    accent_color = models.CharField(max_length=20, blank=True, default='#f59e0b')
    font_heading = models.CharField(max_length=80, blank=True, default='')
    font_body = models.CharField(max_length=80, blank=True, default='')
    border_radius = models.CharField(max_length=20, blank=True, default='12px')
    button_style = models.JSONField(default=dict, blank=True)
    card_style = models.JSONField(default=dict, blank=True)
    header_config = models.JSONField(default=dict, blank=True)
    footer_config = models.JSONField(default=dict, blank=True)
    css_variables = models.JSONField(default=dict, blank=True)
    custom_css = models.TextField(blank=True, default='')
    dark_mode_enabled = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Site Teması'
        verbose_name_plural = 'Site Temaları'


class RedirectRule(models.Model):
    TYPE_301 = '301'
    TYPE_302 = '302'
    TYPE_410 = '410'
    TYPE_CHOICES = [
        (TYPE_301, '301 Permanent'),
        (TYPE_302, '302 Temporary'),
        (TYPE_410, '410 Gone'),
    ]

    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='redirect_rules')
    source_path = models.CharField('Kaynak', max_length=500)
    target_path = models.CharField('Hedef', max_length=500, blank=True, default='')
    redirect_type = models.CharField(max_length=3, choices=TYPE_CHOICES, default=TYPE_301)
    aktif = models.BooleanField(default=True)
    hit_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('kurum', 'source_path')]
        verbose_name = 'Yönlendirme'
        verbose_name_plural = 'Yönlendirmeler'


class SlugHistory(models.Model):
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='slug_history')
    page = models.ForeignKey(WebPage, on_delete=models.CASCADE, related_name='slug_history')
    old_slug = models.SlugField(max_length=220)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('kurum', 'old_slug')]
        verbose_name = 'Slug Geçmişi'
        verbose_name_plural = 'Slug Geçmişleri'


class ContentCategory(models.Model):
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='content_categories')
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140)
    kind = models.CharField(max_length=30, default='duyuru')  # duyuru, haber, blog, etkinlik

    class Meta:
        unique_together = [('kurum', 'kind', 'slug')]
        verbose_name = 'İçerik Kategorisi'
        verbose_name_plural = 'İçerik Kategorileri'


class ContentEntry(models.Model):
    KIND_DUYURU = 'duyuru'
    KIND_HABER = 'haber'
    KIND_BLOG = 'blog'
    KIND_ETKINLIK = 'etkinlik'
    KIND_CHOICES = [
        (KIND_DUYURU, 'Duyuru'),
        (KIND_HABER, 'Haber'),
        (KIND_BLOG, 'Blog'),
        (KIND_ETKINLIK, 'Etkinlik'),
    ]
    STATUS_DRAFT = 'draft'
    STATUS_PUBLISHED = 'published'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Taslak'),
        (STATUS_PUBLISHED, 'Yayında'),
    ]

    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='content_entries')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_DUYURU, db_index=True)
    category = models.ForeignKey(
        ContentCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='entries',
    )
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220)
    excerpt = models.TextField(blank=True, default='')
    body = models.TextField(blank=True, default='')
    cover_url = models.URLField(max_length=500, blank=True, default='')
    tags = models.JSONField(default=list, blank=True)
    author_name = models.CharField(max_length=120, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    is_featured = models.BooleanField(default=False)
    is_pinned = models.BooleanField(default=False)
    show_as_popup = models.BooleanField(default=False)
    sira = models.PositiveIntegerField('Sıra', default=0, db_index=True)
    publish_at = models.DateTimeField(null=True, blank=True)
    event_start = models.DateTimeField(null=True, blank=True)
    event_end = models.DateTimeField(null=True, blank=True)
    event_location = models.CharField(max_length=200, blank=True, default='')
    meta_title = models.CharField(max_length=70, blank=True, default='')
    meta_description = models.CharField(max_length=320, blank=True, default='')
    view_count = models.PositiveIntegerField(default=0)
    related_ids = models.JSONField(default=list, blank=True)
    legacy_duyuru_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sira', '-is_pinned', '-publish_at', '-created_at']
        unique_together = [('kurum', 'kind', 'slug')]
        verbose_name = 'İçerik'
        verbose_name_plural = 'İçerikler'

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title) or 'icerik'
            slug = base
            n = 1
            while ContentEntry.objects.filter(
                kurum_id=self.kurum_id, kind=self.kind, slug=slug,
            ).exclude(pk=self.pk).exists():
                slug = f'{base}-{n}'
                n += 1
            self.slug = slug
        super().save(*args, **kwargs)


class FormDefinition(models.Model):
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='form_definitions')
    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180)
    description = models.TextField(blank=True, default='')
    fields = models.JSONField(default=list, blank=True)
    settings = models.JSONField(default=dict, blank=True)  # captcha, notify emails, thank you
    aktif = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('kurum', 'slug')]
        verbose_name = 'Form'
        verbose_name_plural = 'Formlar'


class FormSubmission(models.Model):
    form = models.ForeignKey(FormDefinition, on_delete=models.CASCADE, related_name='submissions')
    payload = models.JSONField(default=dict)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=400, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Form Başvurusu'
        verbose_name_plural = 'Form Başvuruları'


class IntegrationSettings(models.Model):
    kurum = models.OneToOneField(
        'kurum.Kurum', on_delete=models.CASCADE, related_name='site_integrations',
    )
    # Google
    ga4_id = models.CharField(max_length=40, blank=True, default='')
    gtm_id = models.CharField(max_length=40, blank=True, default='')
    search_console_verification = models.CharField(max_length=120, blank=True, default='')
    google_ads_id = models.CharField(max_length=40, blank=True, default='')
    google_maps_api_key = models.CharField(max_length=120, blank=True, default='')
    recaptcha_site_key = models.CharField(max_length=120, blank=True, default='')
    recaptcha_secret_key = models.CharField(max_length=120, blank=True, default='')
    # Meta / Microsoft / others
    meta_pixel_id = models.CharField(max_length=40, blank=True, default='')
    meta_domain_verification = models.CharField(max_length=120, blank=True, default='')
    clarity_id = models.CharField(max_length=40, blank=True, default='')
    bing_verification = models.CharField(max_length=120, blank=True, default='')
    tiktok_pixel_id = models.CharField(max_length=40, blank=True, default='')
    linkedin_partner_id = models.CharField(max_length=40, blank=True, default='')
    hotjar_id = models.CharField(max_length=40, blank=True, default='')
    yandex_metrica_id = models.CharField(max_length=40, blank=True, default='')
    # Code injection
    head_code = models.TextField(blank=True, default='')
    body_start_code = models.TextField(blank=True, default='')
    body_end_code = models.TextField(blank=True, default='')
    custom_css = models.TextField(blank=True, default='')
    custom_js = models.TextField(blank=True, default='')
    # SMTP / messaging
    smtp_config = models.JSONField(default=dict, blank=True)
    whatsapp_notify = models.JSONField(default=dict, blank=True)
    # SEO site-wide
    robots_txt = models.TextField(blank=True, default='')
    humans_txt = models.TextField(blank=True, default='')
    manifest_json = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Entegrasyon Ayarları'
        verbose_name_plural = 'Entegrasyon Ayarları'


class NotFoundHit(models.Model):
    """404 izleme — SEO Merkezi kırık link uyarıları."""
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='not_found_hits')
    path = models.CharField(max_length=500)
    referrer = models.CharField(max_length=500, blank=True, default='')
    hit_count = models.PositiveIntegerField(default=1)
    last_seen = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('kurum', 'path')]
        ordering = ['-hit_count', '-last_seen']
        verbose_name = '404 Kaydı'
        verbose_name_plural = '404 Kayıtları'
