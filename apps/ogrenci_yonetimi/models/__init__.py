"""
ÖĞRENCİ MODELİ - DYNAMIC SCHEMA

Bu model eğitim yılı schema'sında saklanır.
Tablolar PostgreSQL'de dinamik olarak oluşturulmuştur.

ZORUNLU KURALLAR:
1. Her öğrenci kaydı kurum_id, sube_id, egitim_yili_id içermek ZORUNDA
2. Query'ler TenantManager ile filtrelenmek ZORUNDA
3. Raw SQL kullanılırken schema adı belirtilmek ZORUNDA

Schema yapısı:
kurum_1_2024_2025.ogrenciler
kurum_1_2025_2026.ogrenciler
"""

from django.db import models
from django.core.validators import RegexValidator
from apps.kurum_yonetimi.managers import TenantAwareModel


class Ogrenci(TenantAwareModel):
    """
    Öğrenci Modeli (Dynamic Schema)
    
    Bu model eğitim yılı bazlı schema'da saklanır.
    Her eğitim yılı için ayrı tablo vardır.
    
    NOT: Django ORM bu modeli kullanmaz, raw SQL ile yönetilir.
    Bu sadece referans amaçlıdır.
    """
    
    tc_kimlik_no_validator = RegexValidator(
        regex=r'^\d{11}$',
        message='TC Kimlik No 11 haneli olmalıdır'
    )
    
    tc_kimlik_no = models.CharField(
        max_length=11,
        validators=[tc_kimlik_no_validator],
        unique=True,
        verbose_name="TC Kimlik No",
        null=True,
        blank=True
    )
    ad = models.CharField(max_length=100, verbose_name="Ad")
    soyad = models.CharField(max_length=100, verbose_name="Soyad")
    dogum_tarihi = models.DateField(null=True, blank=True, verbose_name="Doğum Tarihi")
    
    CINSIYET_CHOICES = [
        ('E', 'Erkek'),
        ('K', 'Kadın'),
    ]
    cinsiyet = models.CharField(
        max_length=1,
        choices=CINSIYET_CHOICES,
        null=True,
        blank=True,
        verbose_name="Cinsiyet"
    )
    
    telefon = models.CharField(max_length=20, null=True, blank=True, verbose_name="Telefon")
    email = models.EmailField(null=True, blank=True, verbose_name="E-posta")
    adres = models.TextField(null=True, blank=True, verbose_name="Adres")
    
    aktif_mi = models.BooleanField(default=True, verbose_name="Aktif Mi?")
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Oluşturma Tarihi")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Güncellenme Tarihi")
    
    class Meta:
        # Managed=False çünkü tablo schema_manager tarafından oluşturuldu
        managed = False
        db_table = 'ogrenciler'  # Schema prefix runtime'da eklenir
        verbose_name = 'Öğrenci'
        verbose_name_plural = 'Öğrenciler'
        ordering = ['soyad', 'ad']
    
    def __str__(self):
        return f"{self.ad} {self.soyad}"
    
    @property
    def tam_ad(self):
        """Tam ad"""
        return f"{self.ad} {self.soyad}"


class Sinif(TenantAwareModel):
    """
    Sınıf Modeli (Dynamic Schema)
    """
    
    ad = models.CharField(max_length=100, verbose_name="Sınıf Adı")
    kod = models.CharField(max_length=50, verbose_name="Sınıf Kodu")
    kapasite = models.IntegerField(default=30, verbose_name="Kapasite")
    aktif_mi = models.BooleanField(default=True, verbose_name="Aktif Mi?")
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Oluşturma Tarihi")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Güncellenme Tarihi")
    
    class Meta:
        managed = False
        db_table = 'siniflar'
        verbose_name = 'Sınıf'
        verbose_name_plural = 'Sınıflar'
        ordering = ['ad']
    
    def __str__(self):
        return self.ad


class OgrenciSinifAtama(TenantAwareModel):
    """
    Öğrenci-Sınıf Atama Modeli (Dynamic Schema)
    """
    
    ogrenci_id = models.BigIntegerField(verbose_name="Öğrenci ID")
    sinif_id = models.BigIntegerField(verbose_name="Sınıf ID")
    atama_tarihi = models.DateField(verbose_name="Atama Tarihi")
    aktif_mi = models.BooleanField(default=True, verbose_name="Aktif Mi?")
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Oluşturma Tarihi")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Güncellenme Tarihi")
    
    class Meta:
        managed = False
        db_table = 'ogrenci_sinif_atamalari'
        verbose_name = 'Öğrenci-Sınıf Atama'
        verbose_name_plural = 'Öğrenci-Sınıf Atamaları'
        ordering = ['-atama_tarihi']
    
    def __str__(self):
        return f"Öğrenci {self.ogrenci_id} - Sınıf {self.sinif_id}"


# KULLANIM ÖRNEKLERİ:
"""
# 1. Request üzerinden query
from apps.kurum_yonetimi.managers import get_tenant_manager

def my_view(request):
    # Otomatik filtreleme
    manager = get_tenant_manager(Ogrenci, request)
    ogrenciler = manager.all()
    
    # Veya
    ogrenciler = manager.filter(ad__icontains='Ahmet')
    
    return ...


# 2. Manuel tenant set etme
ogrenciler = Ogrenci.objects.set_tenant(
    kurum_id=1,
    sube_id=1,
    egitim_yili_id=5
).all()


# 3. Yeni öğrenci kaydetme
from django.db import connection

def ogrenci_ekle(request, data):
    schema_adi = request.aktif_egitim_yili.schema_adi
    
    with connection.cursor() as cursor:
        cursor.execute(f'''
            INSERT INTO "{schema_adi}".ogrenciler 
            (kurum_id, sube_id, egitim_yili_id, tc_kimlik_no, ad, soyad, telefon, email)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ''', [
            request.kurum_id,
            request.sube_id,
            request.egitim_yili_id,
            data['tc_kimlik_no'],
            data['ad'],
            data['soyad'],
            data['telefon'],
            data['email']
        ])


# 4. RAW SQL ile öğrenci listesi
def ogrenci_listesi(request):
    schema_adi = request.aktif_egitim_yili.schema_adi
    
    with connection.cursor() as cursor:
        cursor.execute(f'''
            SELECT id, tc_kimlik_no, ad, soyad, telefon, email, aktif_mi
            FROM "{schema_adi}".ogrenciler
            WHERE egitim_yili_id = %s
            AND aktif_mi = TRUE
            ORDER BY soyad, ad
        ''', [request.egitim_yili_id])
        
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


# 5. YANLIŞ KULLANIM (YAPILMAMALI!)
ogrenciler = Ogrenci.objects.all()  # ❌ Tenant filtresi yok!

# DOĞRU KULLANIM
ogrenciler = Ogrenci.objects.set_tenant(
    egitim_yili_id=request.egitim_yili_id
).all()  # ✓ Tenant filtresi var
"""
