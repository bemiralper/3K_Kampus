"""
Kurum Domain Models
Production-Grade SaaS Multi-Tenant Architecture
"""
from django.db import models


def _branding_path(instance, filename, prefix: str):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'png'
    kid = instance.pk or 'new'
    return f'kurum_branding/{kid}/{prefix}.{ext}'


def login_logo_upload_to(instance, filename):
    return _branding_path(instance, filename, 'login_logo')


def app_logo_upload_to(instance, filename):
    return _branding_path(instance, filename, 'app_logo')


def favicon_upload_to(instance, filename):
    return _branding_path(instance, filename, 'favicon')


class Kurum(models.Model):
    """
    Institution (Top-level Tenant)
    
    Kalıcı varlık - Eğitim yılından bağımsız
    """
    ad = models.CharField('Kurum Adı', max_length=200)
    kod = models.CharField('Kurum Kodu', max_length=50, unique=True)
    
    # İletişim
    telefon_sabit = models.CharField('Sabit Telefon', max_length=20, blank=True)
    telefon_cep = models.CharField('Cep Telefon', max_length=20, blank=True)
    yetkili_ad_soyad = models.CharField('Yetkili Ad Soyad', max_length=200, blank=True)
    
    # Vergi
    vergi_no = models.CharField('Vergi No', max_length=20, blank=True)
    vergi_dairesi = models.CharField('Vergi Dairesi', max_length=100, blank=True)
    
    # Adres
    adres = models.TextField('Adres', blank=True)
    
    # Durum
    aktif_mi = models.BooleanField('Aktif', default=True)

    # Marka / white-label
    gorunen_ad = models.CharField(
        'Görünen Ad', max_length=200, blank=True, default='',
        help_text='Web ve login ekranında görünen ad (boşsa kurum adı kullanılır)',
    )
    slogan = models.CharField('Slogan', max_length=300, blank=True, default='')
    login_logo = models.ImageField(
        'Login Logosu', upload_to=login_logo_upload_to,
        blank=True, null=True,
        help_text='Koyu arka plan için (genelde beyaz/açık logo)',
    )
    app_logo = models.ImageField(
        'Uygulama Logosu', upload_to=app_logo_upload_to,
        blank=True, null=True,
        help_text='Sidebar ve açık zemin için renkli logo',
    )
    favicon = models.FileField(
        'Favicon', upload_to=favicon_upload_to,
        blank=True, null=True,
        help_text='.ico veya .png',
    )
    login_arkaplan_rengi = models.CharField(
        'Login Arka Plan Rengi', max_length=7, blank=True, default='',
    )
    login_arkaplan_rengi_2 = models.CharField(
        'Login Arka Plan Rengi 2', max_length=7, blank=True, default='',
        help_text='Gradient ikinci renk',
    )
    tema_rengi = models.CharField(
        'Tema Rengi', max_length=7, blank=True, default='',
        help_text='Buton, sidebar vurgu rengi',
    )
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'kurum'
        verbose_name = 'Kurum'
        verbose_name_plural = 'Kurumlar'
        ordering = ['ad']
        indexes = [
            models.Index(fields=['kod']),
            models.Index(fields=['aktif_mi']),
        ]
    
    def __str__(self):
        return self.ad

