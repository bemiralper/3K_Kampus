# MİMARİ DOKÜMANTASYON

## PRODUCTION-GRADE SaaS MİMARİSİ

Bu proje **LOGICAL MULTI-TENANT** mimarisini uygular.

### 1. HİYERARŞİ (DEĞİŞTİRİLEMEZ)

```
Kurum (Top-level Tenant)
  └── Şube (Second-level Tenant)
       └── Eğitim Yılı (Global - Kurum bağımsız)
            └── Tüm Yıllık Veriler (Tenant Isolation)
```

### 2. ZORUNLU ALANLAR

**YILLIK VERİLER** için (Sınıf, OgrenciKayit, KocAtama vb.) **MUTLAKA** olmalı:
```sql
kurum_id BIGINT NOT NULL
sube_id BIGINT NOT NULL  
egitim_yili_id BIGINT NOT NULL
```

**KALICI VERİLER** için (Ogrenci, Personel) sadece:
```sql
kurum_id BIGINT NOT NULL
sube_id BIGINT NOT NULL
```

### 3. VERİTABANI STRATEJİSİ

#### ✅ TEK VERİTABANI - LOGICAL ISOLATION

**Public Schema İçinde Tüm Tablolar:**

**KALICI VARLIKLAR** (Yıldan Bağımsız):
- `kurum` - Kurum tanımları
- `sube` - Şube tanımları  
- `egitim_yili` - Eğitim yılları (2024-2025, 2025-2026)
- `ogrenci` - Öğrenci kimlik bilgileri (TC, ad, soyad, iletişim)
- `personel` - Personel/Koç/Öğretmen bilgileri
- `sinif_seviyesi`, `alan`, `ders` - Eğitim tanımları

**YILLIK VARLIKLAR** (Tenant Isolation):
- `sinif` - Sınıflar (kurum + sube + egitim_yili)
- `ogrenci_kayit` - Öğrenci-Sınıf-Yıl ilişkisi (KRİTİK TABLO)
- `koc_atama` - Koç-Sınıf-Yıl ilişkisi
- `yoklama`, `not`, `odeme`, `deneme` - Diğer yıllık veriler

#### ❌ ARTIK YOK
- Dynamic PostgreSQL schemas
- Schema-based multi-tenancy
- `managed=False` modeller
- Raw SQL zorunluluğu

### 4. QUERY KURALLARI

#### KALICI VERİLER (Öğrenci, Personel)
```python
# Kurum ve şube filtrelemesi
ogrenciler = Ogrenci.objects.filter(
    kurum_id=request.kurum_id,
    sube_id=request.sube_id,
    aktif_mi=True
)
```

#### YILLIK VERİLER (Sınıf, OgrenciKayit)
```python
# Tenant isolation (kurum + sube + egitim_yili)
siniflar = Sinif.objects.filter(
    kurum_id=request.kurum_id,
    sube_id=request.sube_id,
    egitim_yili_id=request.egitim_yili_id,
    aktif_mi=True
)

# Öğrenci kayıtları (belirli yıl için)
kayitlar = OgrenciKayit.objects.filter(
    egitim_yili_id=request.egitim_yili_id,
    aktif_mi=True
).select_related('ogrenci', 'sinif')
```

### 5. YENİ EĞİTİM YILI SÜRECİ

```python
def yeni_egitim_yili_baslat(baslangic_yil, bitis_yil):
    # 1. Eğitim yılı oluştur (Global - tüm kurumlar için)
    egitim_yili = EgitimYili.objects.create(
        baslangic_yil=baslangic_yil,
        bitis_yil=bitis_yil,
        aktif_mi=True
    )
    
    # 2. Yeni yıl için sınıflar oluştur (her kurum/şube kendi sınıflarını)
    for kurum in Kurum.objects.filter(aktif_mi=True):
        for sube in kurum.subeler.filter(aktif_mi=True):
            # Sınıf tanımları oluştur
            Sinif.objects.create(
                ad="9-A",
                kurum=kurum,
                sube=sube,
                egitim_yili=egitim_yili,
                kapasite=30
            )
    
    # 3. Öğrenciler zaten mevcut (kalıcı)
    # 4. Öğrenci kayıtları manuel veya toplu oluşturulur
    
    return egitim_yili
```

### 6. CONTEXT MIDDLEWARE (ÖNERİLEN)

Her request'te aktif tenant bilgisi taşınabilir:

```python
# middleware/active_context.py
class ActiveContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Session'dan aktif context'i al
        request.aktif_kurum_id = request.session.get('aktif_kurum_id')
        request.aktif_sube_id = request.session.get('aktif_sube_id')
        request.aktif_egitim_yili_id = request.session.get('aktif_egitim_yili_id')
        
        response = self.get_response(request)
        return response
```

### 7. VERİ KATEGORİLERİ

#### KALICI VERİLER (Yıldan Bağımsız):
- ✅ Kurum
- ✅ Şube
- ✅ Öğrenci (kimlik bilgisi)
- ✅ Personel/Koç
- ✅ Eğitim tanımları (Sınıf seviyesi, Alan, Ders)

#### YILLIK VERİLER (Her Yıl Sıfırdan):
- 🔄 Sınıf (her yıl yeni tanım)
- 🔄 Öğrenci Kaydı (öğrenci-sınıf-yıl ilişkisi)
- 🔄 Koç Ataması
- 🔄 Notlar
- 🔄 Yoklamalar
- 🔄 Ödemeler
- 🔄 Denemeler

**ÖNEMLİ**: Öğrenci bir kez tanımlanır, yıllık ilişkileri `ogrenci_kayit` tablosunda tutulur.

### 8. GÜVENLİK KURALLARI

1. **Her query** uygun tenant filtreleri içermeli
2. **UNIQUE constraints** veri bütünlüğünü sağlar:
   - `ogrenci_kayit`: UNIQUE(ogrenci_id, egitim_yili_id)
   - `sinif`: UNIQUE(kurum, sube, egitim_yili, ad)
   - `koc_atama`: UNIQUE(sinif, egitim_yili)
3. **Transaction** kullanımı önerilir
4. **Migration** tek veritabanı için

## ÖRNEK KULLANIM SENARYOLARI

### Senaryo 1: Yeni Kurum Ekleme

```python
# 1. Kurum oluştur
kurum = Kurum.objects.create(
    ad="ABC Eğitim Kurumları",
    kod="ABC",
    aktif_mi=True
)

# 2. Şube ekle
sube = Sube.objects.create(
    kurum=kurum,
    ad="Ankara Şubesi",
    kod="ANK",
    aktif_mi=True
)

# 3. Eğitim yılı (global) - zaten var veya oluştur
egitim_yili = EgitimYili.objects.get_or_create(
    baslangic_yil=2024,
    bitis_yil=2025,
    defaults={'aktif_mi': True}
)[0]

# 4. Sınıflar oluştur
Sinif.objects.create(
    ad="9-A",
    kurum=kurum,
    sube=sube,
    egitim_yili=egitim_yili,
    kapasite=30
)
```

### Senaryo 2: Öğrenci Kaydı

```python
def ogrenci_kayit(request, form_data):
    # 1. Öğrenci oluştur (kalıcı - bir kez)
    ogrenci = Ogrenci.objects.create(
        kurum_id=request.kurum_id,
        sube_id=request.sube_id,
        tc_kimlik_no=form_data['tc_kimlik_no'],
        ad=form_data['ad'],
        soyad=form_data['soyad'],
        telefon=form_data['telefon']
    )
    
    # 2. Sınıf seç
    sinif = Sinif.objects.get(
        id=form_data['sinif_id'],
        kurum_id=request.kurum_id,
        sube_id=request.sube_id,
        egitim_yili_id=request.egitim_yili_id
    )
    
    # 3. Öğrenciyi sınıfa kaydet (yıllık ilişki)
    kayit = OgrenciKayit.objects.create(
        ogrenci=ogrenci,
        sinif=sinif,
        egitim_yili_id=request.egitim_yili_id,
        # kurum ve sube otomatik doldurulur (save override)
    )
    
    return ogrenci, kayit
```

### Senaryo 3: Sınıf Listesi

```python
def sinif_listesi(request):
    # Aktif eğitim yılı için sınıfları getir
    siniflar = Sinif.objects.filter(
        kurum_id=request.kurum_id,
        sube_id=request.sube_id,
        egitim_yili_id=request.egitim_yili_id,
        aktif_mi=True
    ).select_related('sinif_seviyesi', 'alan')
    
    return siniflar
```

### Senaryo 4: Yeni Yıla Geçiş

```python
# 2024-2025 yılı bitti, yeni yıl başlatılıyor

# 1. Yeni eğitim yılı oluştur (global)
egitim_yili_2025_2026 = EgitimYili.objects.create(
    baslangic_yil=2025,
    bitis_yil=2026,
    aktif_mi=True
)

# 2. Eski yılı pasif yap
EgitimYili.objects.filter(
    baslangic_yil=2024,
    bitis_yil=2025
).update(aktif_mi=False)

# 3. Her kurum/şube için yeni sınıflar oluştur
for kurum in Kurum.objects.filter(aktif_mi=True):
    for sube in kurum.subeler.filter(aktif_mi=True):
        # Geçen yılki sınıflardan kopyala (opsiyonel)
        eski_siniflar = Sinif.objects.filter(
            kurum=kurum,
            sube=sube,
            egitim_yili__baslangic_yil=2024
        )
        
        for eski_sinif in eski_siniflar:
            Sinif.objects.create(
                ad=eski_sinif.ad,
                kod=eski_sinif.kod,
                kurum=kurum,
                sube=sube,
                egitim_yili=egitim_yili_2025_2026,
                kapasite=eski_sinif.kapasite
            )

# 4. Öğrenciler zaten mevcut (kalıcı)
# 5. Öğrenci kayıtları yeni yıl için manuel yapılır
```

## TEKNİK DETAYLAR

### PostgreSQL Bağlantı
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'lms_db',
        'USER': 'taner',
        'PASSWORD': '',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}
```

### Model Örnekleri

**Kalıcı Varlık:**
```python
class Ogrenci(models.Model):
    kurum = models.ForeignKey('kurum.Kurum', ...)
    sube = models.ForeignKey('sube.Sube', ...)
    ad = models.CharField(max_length=100)
    soyad = models.CharField(max_length=100)
    # Eğitim yılı YOK!
```

**Yıllık Varlık:**
```python
class OgrenciKayit(models.Model):
    ogrenci = models.ForeignKey('Ogrenci', ...)
    sinif = models.ForeignKey('sinif.Sinif', ...)
    egitim_yili = models.ForeignKey('egitim_yili.EgitimYili', ...)
    kurum = models.ForeignKey('kurum.Kurum', ...)  # Denormalized
    sube = models.ForeignKey('sube.Sube', ...)     # Denormalized
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['ogrenci', 'egitim_yili'],
                name='unique_ogrenci_per_year'
            )
        ]
```

## PERFORMANS İPUÇLARI

1. **İndeksler:** Her tenant alan için index oluşturulmuş
2. **Connection Pooling:** PostgreSQL connection pool kullanılmalı
3. **Query Optimization:** Raw SQL kullanırken EXPLAIN ANALYZE kullan
4. **Caching:** Tenant bilgileri cache'lenebilir
5. **Batch Operations:** Bulk insert/update kullan

## HATA YÖNETİMİ

```python
try:
    egitim_yili = YeniEgitimYiliServisi.yeni_egitim_yili_baslat(...)
except ValueError as e:
    # Validasyon hatası
    logger.error(f"Validasyon hatası: {e}")
except Exception as e:
    # Genel hata
    logger.error(f"Beklenmeyen hata: {e}")
    # Transaction rollback olur
```

## TEST STRATEJİSİ

```python
from django.test import TestCase

class EgitimYiliTestCase(TestCase):
    def test_yeni_yil_olusturma(self):
        # Test implementation
        pass
    
    def test_schema_olusturma(self):
        # Test implementation
        pass
    
    def test_tenant_filtreleme(self):
        # Test implementation
        pass
```

Bu mimari **DEĞİŞTİRİLEMEZ** ve **ZORUNLU**dur.
