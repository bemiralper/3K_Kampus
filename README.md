# 3K Kampüs LMS - Multi-Tenant Django + PostgreSQL

Dershane/kurs yönetimi için çok katmanlı (multi-tenant + multi-branch + multi-year) bir sistem.

## 🧭 Yeni Öğrenci Kayıt Wizard (2026)

- Frontend: `frontend/` (Next.js App Router)
- Backend API: `/api/ogrenci-kayit/`

Frontend çalıştırma:

```bash
cd frontend
npm install
npm run dev
```

İl/ilçe verisi yükleme:

```bash
cd backend
python manage.py seed_locations --file apps/ogrenci_kayit/data/locations_sample.json
```

## 📋 MİMARİ

### Hiyerarşi
```
Kurum → Şube → Eğitim Yılı → Tüm veriler
```

Her veri **ZORUNLU** olarak şu alanlara bağlıdır:
- `kurum_id`
- `sube_id`
- `egitim_yili_id`

## 🏗️ PROJE YAPISI

```
/
├── core/                          # Django core projesi
│   ├── settings.py
│   ├── urls.py
│   ├── wsgi.py
│   └── asgi.py
│
├── apps/                          # Modüler uygulamalar
│   ├── kurum_yonetimi/
│   │   ├── models/               # Kurum, Şube, EğitimYılı
│   │   ├── views/
│   │   ├── services/             # Schema manager, Eğitim yılı servisi
│   │   ├── repositories/
│   │   ├── serializers/
│   │   ├── middleware.py         # TenantMiddleware
│   │   ├── managers.py           # TenantManager
│   │   └── routers.py            # Database router
│   │
│   ├── ogrenci_yonetimi/
│   │   ├── models/               # Öğrenci, Sınıf, Atama modelleri
│   │   ├── views/
│   │   ├── services/
│   │   ├── repositories/
│   │   └── serializers/
│   │
│   ├── egitim_yonetimi/
│   ├── personel_yonetimi/
│   └── finans_yonetimi/
│
├── manage.py
└── requirements.txt
```

## 🗄️ POSTGRESQL STRATEJİSİ

### A) Public Schema
Çekirdek tablolar:
- `kurumlar`
- `subeler`
- `egitim_yillari`
- Django built-in tablolar (auth_user, django_session, vb.)

### B) Dynamic Schema (Eğitim Yılı Bazlı)

Her eğitim yılı için ayrı schema oluşturulur:

**Schema Format:**
```
kurum_{kurum_id}_{yil}
```

**Örnekler:**
- `kurum_1_2024_2025`
- `kurum_1_2025_2026`
- `kurum_2_2024_2025`

### Dynamic Schema Tabloları
Her schema içinde:
- `ogrenciler`
- `siniflar`
- `ogrenci_sinif_atamalari`
- `yoklamalar`
- `notlar`
- `odemeler`
- `denemeler`
- `kocluk_kayitlari`

**ZORUNLU:** Her tablo şu alanları içermek zorunda:
- `id`
- `kurum_id`
- `sube_id`
- `egitim_yili_id`

## 🔧 KURULUM

### 1. Sanal Ortam Oluştur
```bash
python -m venv venv
source venv/bin/activate  # macOS/Linux
# veya
venv\Scripts\activate  # Windows
```

### 2. Bağımlılıkları Yükle
```bash
pip install -r requirements.txt
```

### 3. PostgreSQL Veritabanı Oluştur
```sql
CREATE DATABASE lms_db;
CREATE USER postgres WITH PASSWORD 'postgres';
GRANT ALL PRIVILEGES ON DATABASE lms_db TO postgres;
```

### 4. Migration Çalıştır
```bash
python manage.py makemigrations
python manage.py migrate
```

### 5. Superuser Oluştur
```bash
python manage.py createsuperuser
```

### 6. Sunucuyu Başlat
```bash
python manage.py runserver
```

## 🎯 YENİ EĞİTİM YILI BAŞLATMA

```python
from apps.kurum_yonetimi.services.egitim_yili_servisi import YeniEgitimYiliServisi
from datetime import date

# Yeni eğitim yılı oluştur
egitim_yili = YeniEgitimYiliServisi.yeni_egitim_yili_baslat(
    kurum_id=1,
    sube_id=1,
    yil="2024-2025",
    baslangic_tarihi=date(2024, 9, 1),
    bitis_tarihi=date(2025, 6, 30),
    onceki_yildan_kopyala=True  # Sınıf tanımları kopyalanır
)

# Aktif et
YeniEgitimYiliServisi.egitim_yilini_aktif_et(egitim_yili.id)
```

### İşlem Adımları
1. ✅ `EgitimYili` kaydı oluşturulur (public schema)
2. ✅ PostgreSQL schema oluşturulur (`kurum_1_2024_2025`)
3. ✅ Tablolar schema içinde oluşturulur
4. ✅ Master data kopyalanır (sınıf tanımları)
5. ✅ Transactional data sıfırlanır (öğrenciler, notlar vb.)

## 🔐 TENANT YÖNETİMİ

### Session'da Tenant Bilgileri
```python
# View içinde
request.aktif_kurum         # Kurum objesi
request.aktif_sube          # Şube objesi
request.aktif_egitim_yili   # EgitimYili objesi

request.kurum_id            # Kurum ID (hızlı erişim)
request.sube_id             # Şube ID (hızlı erişim)
request.egitim_yili_id      # Eğitim yılı ID (hızlı erişim)
```

### Tenant Değiştirme
```python
from apps.kurum_yonetimi.middleware import set_active_tenant

def switch_tenant(request):
    set_active_tenant(
        request,
        kurum_id=1,
        sube_id=2,
        egitim_yili_id=5
    )
```

## ⚠️ QUERY KURALLARI (DEĞİŞTİRİLEMEZ)

### ❌ YANLIŞ KULLANIM
```python
# Tenant filtresi YOK!
ogrenciler = Ogrenci.objects.all()
```

### ✅ DOĞRU KULLANIM

#### 1. TenantManager ile
```python
from apps.kurum_yonetimi.managers import get_tenant_manager

def my_view(request):
    # Otomatik filtreleme
    manager = get_tenant_manager(Ogrenci, request)
    ogrenciler = manager.all()
    
    # İlave filtreler
    aktif_ogrenciler = manager.filter(aktif_mi=True)
```

#### 2. Manuel Set
```python
ogrenciler = Ogrenci.objects.set_tenant(
    kurum_id=1,
    sube_id=1,
    egitim_yili_id=5
).all()
```

#### 3. Raw SQL
```python
from django.db import connection

def ogrenci_listesi(request):
    schema_adi = request.aktif_egitim_yili.schema_adi
    
    with connection.cursor() as cursor:
        cursor.execute(f'''
            SELECT id, ad, soyad, telefon
            FROM "{schema_adi}".ogrenciler
            WHERE egitim_yili_id = %s
            AND aktif_mi = TRUE
        ''', [request.egitim_yili_id])
        
        return cursor.fetchall()
```

## 📊 VERİTABANI İŞLEMLERİ

### Öğrenci Ekleme (Raw SQL)
```python
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
```

### Sınıf Oluşturma
```python
def sinif_olustur(request, sinif_adi, sinif_kodu):
    schema_adi = request.aktif_egitim_yili.schema_adi
    
    with connection.cursor() as cursor:
        cursor.execute(f'''
            INSERT INTO "{schema_adi}".siniflar
            (kurum_id, sube_id, egitim_yili_id, ad, kod, kapasite, aktif_mi)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        ''', [
            request.kurum_id,
            request.sube_id,
            request.egitim_yili_id,
            sinif_adi,
            sinif_kodu,
            30,
            True
        ])
```

## 🎨 TEMPLATE KULLANIMI

Context processor sayesinde template'lerde:

```django
<h1>{{ aktif_kurum.ad }}</h1>
<h2>{{ aktif_sube.ad }}</h2>
<p>Eğitim Yılı: {{ aktif_egitim_yili.yil }}</p>
```

## 📁 DOSYA YAPISI

Her app zorunlu olarak şu yapıda:

```
/app_name
  ├── models/           # Model tanımları
  ├── views/            # View fonksiyonları/sınıfları
  ├── urls.py           # URL routing
  ├── services/         # Business logic
  ├── repositories/     # Database erişim katmanı
  ├── serializers/      # DRF serializers
  ├── templates/        # HTML şablonları
  └── migrations/       # Django migrations
```

## 🔒 GÜVENLİK

- Her query **ZORUNLU** olarak tenant filtresi içermeli
- Raw SQL kullanırken **ZORUNLU** olarak schema adı belirtilmeli
- Transaction kullanımı **ŞİDDETLE** önerilir
- Migration'lar sadece public schema'ya uygulanmalı

## 🚀 ÖNEMLİ NOTLAR

1. **Schema Yönetimi:** Django ORM migration'ları dynamic schema'larda çalışmaz. Tablolar `schema_manager.py` ile oluşturulur.

2. **Model Tanımları:** Dynamic schema modelleri `managed = False` olmalı.

3. **Query Zorunluluğu:** Her query `egitim_yili_id` filtresi içermek ZORUNDA.

4. **Veri Kopyalama:** Yeni yıl oluştururken sadece master data kopyalanır (sınıflar vb.), transactional data (öğrenciler, notlar) kopyalanmaz.

5. **Aktif Eğitim Yılı:** Bir şubede sadece bir eğitim yılı aktif olabilir.

## 📝 YAPILACAKLAR

- [ ] Admin panel entegrasyonu
- [ ] Authentication sistemi
- [ ] API endpoints
- [ ] Tenant seçici UI
- [ ] Raporlama modülü
- [ ] Yedekleme/geri yükleme

## 🤝 DESTEK

Bu mimari **DEĞİŞTİRİLEMEZ**. Alternatif çözümler üretilmemelidir.

## 📄 LİSANS

Tüm hakları saklıdır.
