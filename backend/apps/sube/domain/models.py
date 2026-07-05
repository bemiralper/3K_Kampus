"""
Sube Domain Models
Production-Grade SaaS Multi-Tenant Architecture
"""
from django.db import models


def _branding_path(instance, filename, prefix: str):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'png'
    sid = instance.pk or 'new'
    return f'sube_branding/{sid}/{prefix}.{ext}'


def sube_login_logo_upload_to(instance, filename):
    return _branding_path(instance, filename, 'login_logo')


def sube_app_logo_upload_to(instance, filename):
    return _branding_path(instance, filename, 'app_logo')


def sube_favicon_upload_to(instance, filename):
    return _branding_path(instance, filename, 'favicon')


class Sube(models.Model):
    """
    Branch (Second-level Tenant)
    
    Kalıcı varlık - Eğitim yılından bağımsız
    """
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='subeler',
        verbose_name='Kurum'
    )
    
    ad = models.CharField('Şube Adı', max_length=200)
    kod = models.CharField('Şube Kodu', max_length=50)
    resmi_ad = models.CharField('Şube Resmi Adı', max_length=255, blank=True)

    # İletişim
    web_adresi = models.URLField('Web Adresi', max_length=500, blank=True)
    eposta = models.EmailField('E-posta', blank=True)
    adres = models.TextField('Adres', blank=True)
    telefon = models.CharField('Telefon', max_length=20, blank=True)

    # Ticari bilgiler
    ticari_unvan = models.CharField('Ticari Ünvan', max_length=255, blank=True)
    vergi_dairesi = models.CharField('Vergi Dairesi', max_length=120, blank=True)
    vergi_no = models.CharField('Vergi Numarası', max_length=20, blank=True)
    ticaret_sicil_no = models.CharField('Ticaret Sicil No', max_length=50, blank=True)

    # Yönetim
    kurs_muduru = models.CharField('Kurs Müdürü', max_length=120, blank=True)
    kurs_muduru_telefon = models.CharField('Kurs Müdürü Telefon', max_length=20, blank=True)
    
    # Durum
    aktif_mi = models.BooleanField('Aktif', default=True)

    # Marka / white-label (giriş sonrası uygulama — kurumsal site kurum markasından gelir)
    gorunen_ad = models.CharField(
        'Görünen Ad', max_length=200, blank=True, default='',
        help_text='Uygulama sidebar ve sekme başlığı (boşsa şube adı, o da yoksa kurum markası)',
    )
    slogan = models.CharField('Slogan', max_length=300, blank=True, default='')
    login_logo = models.ImageField(
        'Login Logosu', upload_to=sube_login_logo_upload_to,
        blank=True, null=True,
    )
    app_logo = models.ImageField(
        'Uygulama Logosu', upload_to=sube_app_logo_upload_to,
        blank=True, null=True,
    )
    favicon = models.FileField(
        'Favicon', upload_to=sube_favicon_upload_to,
        blank=True, null=True,
    )
    login_arkaplan_rengi = models.CharField(
        'Login Arka Plan Rengi', max_length=7, blank=True, default='',
    )
    login_arkaplan_rengi_2 = models.CharField(
        'Login Arka Plan Rengi 2', max_length=7, blank=True, default='',
    )
    tema_rengi = models.CharField(
        'Tema Rengi', max_length=7, blank=True, default='',
    )
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'sube'
        verbose_name = 'Şube'
        verbose_name_plural = 'Şubeler'
        ordering = ['kurum', 'ad']
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'kod'],
                name='unique_kurum_sube_kod'
            )
        ]
        indexes = [
            models.Index(fields=['kurum', 'aktif_mi']),
        ]
    
    def __str__(self):
        return f"{self.kurum.ad} - {self.ad}"

