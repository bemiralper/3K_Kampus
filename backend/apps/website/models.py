"""
Kurumsal web sitesi modelleri — kurum FK ile çok kiracılı.
"""
from django.db import models
from django.utils.text import slugify


def _website_path(instance, filename, prefix: str):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
    kid = getattr(instance, 'kurum_id', None) or getattr(getattr(instance, 'kurum', None), 'pk', None) or 'new'
    return f'website/{kid}/{prefix}.{ext}'


def hero_slide_upload_to(instance, filename):
    return _website_path(instance, filename, f'hero_{instance.pk or "new"}')


def duyuru_kapak_upload_to(instance, filename):
    return _website_path(instance, filename, f'duyuru_{instance.pk or "new"}')


def sinav_gorsel_upload_to(instance, filename):
    return _website_path(instance, filename, f'sinav_{instance.pk or "new"}')


class SiteSettings(models.Model):
    kurum = models.OneToOneField(
        'kurum.Kurum', on_delete=models.CASCADE, related_name='site_settings',
    )
    telefon = models.CharField('Telefon', max_length=30, blank=True, default='')
    whatsapp = models.CharField('WhatsApp', max_length=30, blank=True, default='')
    eposta = models.EmailField('E-posta', blank=True, default='')
    adres = models.TextField('Adres', blank=True, default='')
    calisma_saatleri = models.TextField('Çalışma Saatleri', blank=True, default='')
    hero_baslik = models.CharField('Hero Başlık', max_length=200, blank=True, default='3K Kampüs')
    hero_alt_baslik = models.CharField('Hero Alt Başlık', max_length=300, blank=True, default='')
    hero_slogan = models.CharField('Hero Slogan', max_length=400, blank=True, default='')
    hero_maddeler = models.JSONField('Hero Maddeler', default=list, blank=True)
    tanitim_baslik = models.CharField('Tanıtım Başlık', max_length=200, blank=True, default='')
    tanitim_icerik = models.TextField('Tanıtım İçerik', blank=True, default='')
    youtube_video_id = models.CharField('YouTube Video ID', max_length=50, blank=True, default='')
    harita_embed_url = models.TextField('Harita Embed URL', blank=True, default='')
    footer_copyright = models.CharField(
        'Footer Telif', max_length=200, blank=True, default='© 2026 3K Kampüs',
    )
    footer_marka_metni = models.CharField(
        'Footer Marka Bildirimi',
        max_length=300,
        blank=True,
        default='3K Kampüs, Özgün Sınav Öğretim Eğitim A.Ş. markasıdır.',
    )
    seo_baslik = models.CharField('SEO Başlık', max_length=200, blank=True, default='')
    seo_aciklama = models.CharField('SEO Açıklama', max_length=400, blank=True, default='')
    seo_anahtar_kelimeler = models.CharField('SEO Anahtar Kelimeler', max_length=500, blank=True, default='')
    seo_canonical_url = models.URLField('Canonical URL', max_length=500, blank=True, default='')
    google_site_verification = models.CharField('Google Site Verification', max_length=120, blank=True, default='')
    google_analytics_id = models.CharField(
        'Google Analytics Ölçüm Kimliği', max_length=32, blank=True, default='',
        help_text='Örn. G-3NWSLBGCK8 (gtag.js)',
    )
    seo_robots_index = models.BooleanField('Arama Motorlarında İndeksle', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Site Ayarları'
        verbose_name_plural = 'Site Ayarları'

    def __str__(self):
        return f'Site Ayarları — {self.kurum.ad}'


class SiteSocialLink(models.Model):
    PLATFORM_CHOICES = [
        ('instagram', 'Instagram'),
        ('facebook', 'Facebook'),
        ('youtube', 'YouTube'),
        ('twitter', 'Twitter'),
        ('linkedin', 'LinkedIn'),
        ('whatsapp', 'WhatsApp'),
    ]
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='site_social_links')
    platform = models.CharField('Platform', max_length=30, choices=PLATFORM_CHOICES)
    url = models.URLField('URL', max_length=500)
    sira = models.PositiveSmallIntegerField('Sıra', default=0)
    aktif = models.BooleanField('Aktif', default=True)

    class Meta:
        ordering = ['sira', 'id']
        verbose_name = 'Sosyal Medya'
        verbose_name_plural = 'Sosyal Medya'

    def __str__(self):
        return f'{self.platform} — {self.kurum.ad}'


class SiteFooterLink(models.Model):
    COLUMN_CHOICES = [
        ('kurumsal', 'Kurumsal'),
        ('hizli', 'Hızlı Bağlantılar'),
        ('yasal', 'Yasal'),
        ('sosyal', 'Sosyal Medya'),
    ]
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='site_footer_links')
    kolon = models.CharField('Kolon', max_length=20, choices=COLUMN_CHOICES)
    etiket = models.CharField('Etiket', max_length=120)
    url = models.CharField('URL', max_length=500, blank=True, default='')
    sira = models.PositiveSmallIntegerField('Sıra', default=0)
    aktif = models.BooleanField('Aktif', default=True)

    class Meta:
        ordering = ['kolon', 'sira', 'id']
        verbose_name = 'Footer Bağlantısı'
        verbose_name_plural = 'Footer Bağlantıları'

    def __str__(self):
        return f'{self.etiket} ({self.kolon})'


class HeroSlide(models.Model):
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='hero_slides')
    gorsel = models.ImageField('Görsel', upload_to=hero_slide_upload_to, blank=True, null=True)
    sira = models.PositiveSmallIntegerField('Sıra', default=0)
    aktif = models.BooleanField('Aktif', default=True)

    class Meta:
        ordering = ['sira', 'id']
        verbose_name = 'Hero Slayt'
        verbose_name_plural = 'Hero Slaytlar'

    def __str__(self):
        return f'Hero #{self.sira} — {self.kurum.ad}'


class Duyuru(models.Model):
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='duyurular')
    baslik = models.CharField('Başlık', max_length=200)
    slug = models.SlugField('Slug', max_length=220, blank=True)
    ozet = models.TextField('Özet', blank=True, default='')
    icerik = models.TextField('İçerik', blank=True, default='')
    kapak_gorseli = models.ImageField('Kapak Görseli', upload_to=duyuru_kapak_upload_to, blank=True, null=True)
    yayin_tarihi = models.DateField('Yayın Tarihi', null=True, blank=True)
    aktif = models.BooleanField('Aktif', default=True)
    sira = models.PositiveSmallIntegerField('Sıra', default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-yayin_tarihi', '-created_at']
        unique_together = [('kurum', 'slug')]
        verbose_name = 'Duyuru'
        verbose_name_plural = 'Duyurular'

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.baslik) or 'duyuru'
            slug = base
            n = 1
            while Duyuru.objects.filter(kurum=self.kurum, slug=slug).exclude(pk=self.pk).exists():
                slug = f'{base}-{n}'
                n += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.baslik


class SinavTakvim(models.Model):
    TUR_CHOICES = [
        ('LGS', 'LGS'),
        ('TYT', 'TYT'),
        ('AYT', 'AYT'),
    ]
    KAPSAM_CHOICES = [
        ('turkiye_geneli', 'Türkiye Geneli'),
        ('yerel', 'Yerel'),
    ]
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='sinav_takvim')
    tur = models.CharField('Tür', max_length=10, choices=TUR_CHOICES)
    tarih = models.DateField('Tarih')
    saat = models.TimeField('Başlangıç Saati', null=True, blank=True)
    saat_bitis = models.TimeField('Bitiş Saati', null=True, blank=True)
    kapsam = models.CharField('Kapsam', max_length=20, choices=KAPSAM_CHOICES, default='turkiye_geneli')
    baslik = models.CharField('Başlık', max_length=200)
    yayin_adi = models.CharField('Yayın / Kurum Adı', max_length=120, blank=True, default='')
    aciklama = models.TextField('Açıklama', blank=True, default='')
    gorsel = models.ImageField('Görsel', upload_to=sinav_gorsel_upload_to, blank=True, null=True)
    aktif = models.BooleanField('Aktif', default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['tarih', 'saat']
        verbose_name = 'Sınav Takvimi'
        verbose_name_plural = 'Sınav Takvimi'

    def __str__(self):
        return f'{self.tur} — {self.baslik}'


class NedenKart(models.Model):
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='neden_kartlari')
    ikon = models.CharField('İkon', max_length=50, blank=True, default='star')
    baslik = models.CharField('Başlık', max_length=120)
    aciklama = models.TextField('Açıklama')
    sira = models.PositiveSmallIntegerField('Sıra', default=0)
    aktif = models.BooleanField('Aktif', default=True)

    class Meta:
        ordering = ['sira', 'id']
        verbose_name = 'Neden Kart'
        verbose_name_plural = 'Neden Kartları'

    def __str__(self):
        return self.baslik


class BasariIstatistik(models.Model):
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='basari_istatistikleri')
    etiket = models.CharField('Etiket', max_length=120)
    deger = models.CharField('Değer', max_length=50)
    sira = models.PositiveSmallIntegerField('Sıra', default=0)
    aktif = models.BooleanField('Aktif', default=True)

    class Meta:
        ordering = ['sira', 'id']
        verbose_name = 'Başarı İstatistiği'
        verbose_name_plural = 'Başarı İstatistikleri'

    def __str__(self):
        return f'{self.etiket}: {self.deger}'


class OgrenciYorumu(models.Model):
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='ogrenci_yorumlari')
    ad = models.CharField('Ad', max_length=100)
    rol = models.CharField('Rol', max_length=100, blank=True, default='')
    puan = models.PositiveSmallIntegerField('Puan', default=5)
    yorum = models.TextField('Yorum')
    sira = models.PositiveSmallIntegerField('Sıra', default=0)
    aktif = models.BooleanField('Aktif', default=True)

    class Meta:
        ordering = ['sira', 'id']
        verbose_name = 'Öğrenci Yorumu'
        verbose_name_plural = 'Öğrenci Yorumları'

    def __str__(self):
        return self.ad


class SSS(models.Model):
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='sss_listesi')
    soru = models.CharField('Soru', max_length=300)
    cevap = models.TextField('Cevap')
    sira = models.PositiveSmallIntegerField('Sıra', default=0)
    aktif = models.BooleanField('Aktif', default=True)

    class Meta:
        ordering = ['sira', 'id']
        verbose_name = 'SSS'
        verbose_name_plural = 'SSS'

    def __str__(self):
        return self.soru


class YasalMetin(models.Model):
    TUR_CHOICES = [
        ('kvkk', 'KVKK Aydınlatma Metni'),
        ('gizlilik', 'Gizlilik Politikası'),
        ('kullanim', 'Kullanım Koşulları'),
        ('cerez', 'Çerez Politikası'),
    ]
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='yasal_metinler')
    tur = models.CharField('Tür', max_length=30, choices=TUR_CHOICES)
    baslik = models.CharField('Başlık', max_length=200)
    icerik = models.TextField('İçerik')
    aktif = models.BooleanField('Aktif', default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('kurum', 'tur')]
        verbose_name = 'Yasal Metin'
        verbose_name_plural = 'Yasal Metinler'

    def __str__(self):
        return self.baslik


class IletisimMesaji(models.Model):
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='iletisim_mesajlari')
    ad_soyad = models.CharField('Ad Soyad', max_length=200)
    telefon = models.CharField('Telefon', max_length=30)
    mesaj = models.TextField('Mesaj')
    okundu = models.BooleanField('Okundu', default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'İletişim Mesajı'
        verbose_name_plural = 'İletişim Mesajları'

    def __str__(self):
        return f'{self.ad_soyad} — {self.created_at:%d.%m.%Y}'
