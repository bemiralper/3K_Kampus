"""
Personel Domain Models
Production-Grade SaaS Multi-Tenant Architecture
"""
from django.db import models
from django.conf import settings
from django.core.validators import RegexValidator


class Personel(models.Model):
    """
    Staff/Teacher/Coach (Persistent Entity - Year Independent)
    
    KALICI VARLIK - Eğitim yılından bağımsız
    
    KURALLAR:
    - Personel bir kez tanımlanır, yıllarca kullanılır
    - Görevlendirme bilgisi BURADA OLMAZ
    - Eğitim yılı bilgisi BURADA OLMAZ
    - Yıllık ilişkiler (rol, şube, görev atamaları) PersonelGorevlendirme tablosunda tutulur
    """
    
    # Tenant isolation
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='personeller',
        verbose_name='Kurum'
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='personeller',
        verbose_name='Şube'
    )

    kisi = models.ForeignKey(
        'kimlik.Kisi',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='personel_kayitlari',
        verbose_name='Merkezi Kişi',
    )
    
    # Sisteme giriş hesabı (User ilişkisi - OneToOne)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='personel',
        verbose_name='Sistem Kullanıcısı',
        help_text='Personelin sisteme giriş yapabileceği kullanıcı hesabı'
    )
    
    # Kimlik bilgileri
    tc_kimlik_no = models.CharField(
        'TC Kimlik No',
        max_length=11,
        validators=[
            RegexValidator(
                regex=r'^\d{11}$',
                message='TC Kimlik No 11 haneli olmalıdır'
            )
        ],
        blank=True,
        null=True
    )
    
    ad = models.CharField('Ad', max_length=100)
    soyad = models.CharField('Soyad', max_length=100)
    dogum_tarihi = models.DateField('Doğum Tarihi', null=True, blank=True)
    
    CINSIYET_CHOICES = [
        ('E', 'Erkek'),
        ('K', 'Kadın'),
    ]
    cinsiyet = models.CharField(
        'Cinsiyet',
        max_length=1,
        choices=CINSIYET_CHOICES,
        null=True,
        blank=True
    )
    
    # İletişim Bilgileri
    telefon = models.CharField('Telefon', max_length=20, blank=True)
    cep_telefon = models.CharField('Cep Telefonu', max_length=20, blank=True)
    email = models.EmailField('E-posta', blank=True)
    adres = models.TextField('Adres', blank=True)
    il = models.CharField('İl', max_length=50, blank=True)
    ilce = models.CharField('İlçe', max_length=50, blank=True)
    
    # Acil durum iletişim
    acil_durum_kisi = models.CharField('Acil Durum Kişisi', max_length=200, blank=True)
    acil_durum_telefon = models.CharField('Acil Durum Telefonu', max_length=20, blank=True)
    
    # Profil Fotoğrafı
    fotograf = models.ImageField(
        'Profil Fotoğrafı',
        upload_to='personel/fotograflar/',
        null=True,
        blank=True,
        help_text='Personelin profil fotoğrafı'
    )
    
    # Durum
    aktif_mi = models.BooleanField('Aktif', default=True)
    
    # Notlar
    notlar = models.TextField('Notlar', blank=True, help_text='Personel hakkında özel notlar')
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'personel'
        verbose_name = 'Personel'
        verbose_name_plural = 'Personeller'
        ordering = ['soyad', 'ad']
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'tc_kimlik_no'],
                name='unique_kurum_personel_tc',
                condition=models.Q(tc_kimlik_no__isnull=False)
            )
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'aktif_mi']),
            models.Index(fields=['ad', 'soyad']),
            models.Index(fields=['tc_kimlik_no']),
        ]
    
    def __str__(self):
        return f"{self.ad} {self.soyad}"
    
    @property
    def tam_ad(self):
        return f"{self.ad} {self.soyad}"
    
    @property
    def has_user_account(self):
        """Personelin sisteme giriş hesabı var mı?"""
        return self.user is not None


# NOT: PersonelRol ve Birim modelleri kaldırıldı (Migration 0003)
# Artık roller 'roller.Role' modelinden geliyor
# Birim kavramı tamamen kaldırıldı


class PersonelGorevlendirme(models.Model):
    """
    Personel Görevlendirme (Year-Dependent)
    
    YILLIK İLİŞKİ - Eğitim yılına göre rol / şube / görev atamaları
    
    Her eğitim yılında personele:
    - Rol atanır (Sistem rolleri - roller.Role)
    - Şube atanır
    - Branş atanır (opsiyonel - öğretmenler için)
    - Sınıflar atanır (opsiyonel)
    """
    
    # Personel (KALICI)
    personel = models.ForeignKey(
        'Personel',
        on_delete=models.CASCADE,
        related_name='gorevlendirmeler',
        verbose_name='Personel'
    )
    
    # Eğitim Yılı
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='personel_gorevlendirmeleri',
        verbose_name='Eğitim Yılı'
    )
    
    # Rol (Yeni sistem rolleri)
    rol = models.ForeignKey(
        'roller.Role',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='personel_gorevlendirmeleri',
        verbose_name='Rol'
    )
    
    # Görev yeri (Şube) - Personel birden fazla şubede görevli olabilir
    gorev_sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='personel_gorevlendirmeleri',
        verbose_name='Görev Şubesi'
    )
    
    # Branş (Öğretmenler için - egitim_tanimlari.Brans modeli)
    brans = models.ForeignKey(
        'egitim_tanimlari.Brans',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='personel_gorevlendirmeleri',
        verbose_name='Branş'
    )
    
    # Atanan sınıflar (ManyToMany - Koç/Danışman için)
    siniflar = models.ManyToManyField(
        'sinif.Sinif',
        blank=True,
        related_name='gorevli_personeller',
        verbose_name='Atanan Sınıflar'
    )
    
    # Tenant isolation (denormalized for faster queries)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='personel_gorevlendirmeleri',
        verbose_name='Kurum'
    )
    
    # Görev bilgileri
    gorev_baslangic = models.DateField('Görev Başlangıcı', null=True, blank=True)
    gorev_bitis = models.DateField('Görev Bitişi', null=True, blank=True)
    
    # Durum
    aktif_mi = models.BooleanField('Aktif', default=True)
    
    # Notlar
    notlar = models.TextField('Notlar', blank=True)
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'personel_gorevlendirme'
        verbose_name = 'Personel Görevlendirme'
        verbose_name_plural = 'Personel Görevlendirmeleri'
        ordering = ['-egitim_yili', 'personel__soyad', 'personel__ad']
        constraints = [
            # Bir personel, bir eğitim yılında, bir şubede sadece 1 rol alabilir
            models.UniqueConstraint(
                fields=['personel', 'egitim_yili', 'gorev_sube', 'rol'],
                name='unique_personel_yil_sube_rol'
            )
        ]
        indexes = [
            models.Index(fields=['kurum', 'egitim_yili', 'aktif_mi']),
            models.Index(fields=['personel', 'egitim_yili']),
            models.Index(fields=['gorev_sube', 'egitim_yili', 'rol']),
        ]
    
    def __str__(self):
        return f"{self.personel.tam_ad} - {self.rol.ad} ({self.egitim_yili})"
    
    def save(self, *args, **kwargs):
        # Denormalized kurum alanını otomatik doldur
        if not self.kurum_id:
            self.kurum_id = self.personel.kurum_id
        super().save(*args, **kwargs)


class PersonelAktiviteLog(models.Model):
    """
    Personel Aktivite Logları
    
    Personelin sistemdeki tüm aktivitelerini loglar:
    - Giriş/Çıkış
    - Sayfa görüntüleme
    - İşlemler (CRUD)
    - Hata durumları
    """
    
    EYLEM_CHOICES = [
        ('LOGIN', 'Giriş'),
        ('LOGOUT', 'Çıkış'),
        ('LOGIN_FAILED', 'Başarısız Giriş'),
        ('PASSWORD_CHANGE', 'Şifre Değiştirme'),
        ('PASSWORD_RESET', 'Şifre Sıfırlama'),
        ('PROFILE_VIEW', 'Profil Görüntüleme'),
        ('PROFILE_UPDATE', 'Profil Güncelleme'),
        ('PAGE_VIEW', 'Sayfa Görüntüleme'),
        ('DATA_CREATE', 'Veri Oluşturma'),
        ('DATA_UPDATE', 'Veri Güncelleme'),
        ('DATA_DELETE', 'Veri Silme'),
        ('EXPORT', 'Veri Dışa Aktarma'),
        ('IMPORT', 'Veri İçe Aktarma'),
        ('OTHER', 'Diğer'),
    ]
    
    personel = models.ForeignKey(
        'Personel',
        on_delete=models.CASCADE,
        related_name='aktivite_loglari',
        verbose_name='Personel'
    )
    
    eylem = models.CharField(
        'Eylem',
        max_length=20,
        choices=EYLEM_CHOICES
    )
    
    detay = models.TextField(
        'Detay',
        blank=True,
        help_text='Eylem hakkında ek bilgi'
    )
    
    ip_adresi = models.GenericIPAddressField(
        'IP Adresi',
        null=True,
        blank=True
    )
    
    user_agent = models.TextField(
        'Tarayıcı Bilgisi',
        blank=True
    )
    
    sayfa_url = models.CharField(
        'Sayfa URL',
        max_length=500,
        blank=True
    )
    
    oturum_id = models.CharField(
        'Oturum ID',
        max_length=100,
        blank=True,
        help_text='Session ID - Oturum takibi için'
    )
    
    created_at = models.DateTimeField(
        'Tarih',
        auto_now_add=True
    )
    
    class Meta:
        db_table = 'personel_aktivite_log'
        verbose_name = 'Personel Aktivite Logu'
        verbose_name_plural = 'Personel Aktivite Logları'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['personel', '-created_at']),
            models.Index(fields=['eylem', '-created_at']),
            models.Index(fields=['personel', 'eylem']),
        ]
    
    def __str__(self):
        return f"{self.personel.tam_ad} - {self.get_eylem_display()} ({self.created_at})"
