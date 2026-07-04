# PROJE YAPISI - DETAYLI GÖRÜNTÜLENMESİ

```
3K Kampüs LMS/
│
├── core/                                    # Django core projesi
│   ├── __init__.py
│   ├── settings.py                         # Ana ayarlar, INSTALLED_APPS, MIDDLEWARE
│   ├── urls.py                             # Ana URL routing
│   ├── wsgi.py                             # WSGI konfigürasyonu
│   └── asgi.py                             # ASGI konfigürasyonu
│
├── backend/apps/                            # DDD Pattern - Modüler uygulamalar
│   │
│   ├── __init__.py
│   │
│   ├── kurum/                              # ★ ÇEKİRDEK APP - Top-level Tenant
│   │   ├── __init__.py
│   │   ├── apps.py
│   │   ├── admin.py                        # KurumAdmin
│   │   ├── urls.py
│   │   │
│   │   ├── domain/
│   │   │   └── models.py                   # Kurum model (id, ad, kod)
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── serializers/
│   │   ├── views/
│   │   └── migrations/
│   │
│   ├── sube/                               # ★ ÇEKİRDEK APP - Second-level Tenant
│   │   ├── domain/
│   │   │   └── models.py                   # Sube model (kurum FK)
│   │   ├── admin.py
│   │   └── migrations/
│   │
│   ├── egitim_yili/                        # ★ Global Education Year
│   │   ├── domain/
│   │   │   └── models.py                   # EgitimYili (GLOBAL - no tenant FK)
│   │   ├── admin.py
│   │   └── migrations/
│   │
│   ├── ogrenci/                            # ★ Student Management (NEW)
│   │   ├── domain/
│   │   │   └── models.py                   # Ogrenci (persistent)
│   │   │                                   # OgrenciKayit (yearly)
│   │   ├── admin.py                        # OgrenciAdmin, OgrenciKayitAdmin
│   │   ├── views/
│   │   ├── serializers/
│   │   └── migrations/
│   │
│   ├── sinif/                              # ★ Class Management (NEW)
│   │   ├── domain/
│   │   │   └── models.py                   # Sinif (yearly)
│   │   ├── admin.py                        # Shows mevcutluk, doluluk_orani
│   │   └── migrations/
│   │
│   ├── personel/                           # ★ Staff Management (NEW)
│   │   ├── domain/
│   │   │   └── models.py                   # Personel (persistent)
│   │   │                                   # KocAtama (yearly)
│   │   ├── admin.py
│   │   └── migrations/
│   │
│   ├── alan/                               # Education Field
│   │   ├── domain/
│   │   │   └── models.py
│   │   └── migrations/
│   │
│   ├── sinif_seviyesi/                     # Class Level (9, 10, 11, 12)
│   │   ├── domain/
│   │   │   └── models.py
│   │   └── migrations/
│   │
│   └── ders/                               # Course Management
│       ├── domain/
│       │   └── models.py
│       └── migrations/
│
├── manage.py                                # Django management
├── requirements.txt                         # Python bağımlılıklar
├── README.md                                # Proje dokümantasyonu
├── ARCHITECTURE.md                          # Mimari detaylar
└── .gitignore                               # Git ignore

```

## ★ ÖNEMLİ DOSYALAR

### 1. core/settings.py
- INSTALLED_APPS: Tüm modüller (kurum, sube, egitim_yili, ogrenci, sinif, personel...)
- MIDDLEWARE: TenantMiddleware (ÖNERİLEN - session bazlı)
- DATABASES: PostgreSQL konfigürasyonu (single database)
- ~~DATABASE_ROUTERS~~: Artık yok (logical isolation)

### 2. backend/apps/kurum/domain/models.py
- **Kurum**: Top-level tenant (id, ad, kod, contact info)
- Table: kurum

### 3. backend/apps/sube/domain/models.py
- **Sube**: Second-level tenant (kurum FK)
- Constraint: unique_kurum_sube_kod
- Table: sube

### 4. backend/apps/egitim_yili/domain/models.py
- **EgitimYili**: **GLOBAL** - NO kurum/sube FK!
- Fields: baslangic_yil, bitis_yil, aktif_mi
- Constraint: bitis_yil = baslangic_yil + 1
- Table: egitim_yili

### 5. backend/apps/ogrenci/domain/models.py
- **Ogrenci**: Persistent student identity
  - Fields: kurum, sube, tc_kimlik_no, ad, soyad
  - NO egitim_yili, NO sinif
- **OgrenciKayit**: Yearly enrollment
  - Fields: ogrenci, sinif, egitim_yili
  - Denormalized: kurum, sube
  - **CRITICAL**: UNIQUE(ogrenci_id, egitim_yili_id)
- Tables: ogrenci, ogrenci_kayit

### 6. backend/apps/sinif/domain/models.py
- **Sinif**: Year-dependent class
  - Fields: ad, kurum, sube, egitim_yili, kapasite
  - Constraint: unique_sinif_per_year
  - Properties: mevcutluk, doluluk_orani
- Table: sinif

### 7. backend/apps/personel/domain/models.py
- **Personel**: Persistent staff/teacher
  - Fields: kurum, sube, gorev_turu (OGRETMEN/KOC)
- **KocAtama**: Year-dependent coach assignment
  - Constraint: UNIQUE(sinif, egitim_yili)
- Tables: personel, koc_atama

## VERİTABANI YAPISI

### PostgreSQL - Single Database (Logical Isolation)

```
lms_db (single database)
│
└── public/                          # TÜM tablolar burada
    │
    ├── Django System Tables
    │   ├── auth_user
    │   ├── auth_group
    │   ├── django_session
    │   ├── django_admin_log
    │   └── django_content_type
    │
    ├── Tenant Tables (Top-level)
    │   ├── kurum                    # Top-level tenant
    │   ├── sube                     # Second-level tenant
    │   └── egitim_yili              # GLOBAL (no tenant FK!)
    │
    ├── Education Definition Tables (Persistent)
    │   ├── alan                     # Education field
    │   ├── sinif_seviyesi           # Class level (9, 10, 11, 12)
    │   ├── ders                     # Courses
    │   └── brans                    # Teaching branch
    │
    ├── Student Tables
    │   ├── ogrenci                  # PERSISTENT (kurum, sube, NO year)
    │   └── ogrenci_kayit            # YEARLY (ogrenci → sinif → year)
    │                                # UNIQUE(ogrenci_id, egitim_yili_id)
    │
    ├── Class Tables
    │   └── sinif                    # YEARLY (kurum, sube, egitim_yili)
    │                                # UNIQUE(kurum, sube, year, ad)
    │
    ├── Staff Tables
    │   ├── personel                 # PERSISTENT (kurum, sube)
    │   └── koc_atama                # YEARLY (koc → sinif → year)
    │                                # UNIQUE(sinif, egitim_yili)
    │
    └── Future Tables (To be implemented)
        ├── yoklama
        ├── not
        ├── odeme
        ├── deneme
        └── kocluk_kayit

# Query Pattern:
Sinif.objects.filter(
    kurum_id=1,
    sube_id=1,
    egitim_yili_id=5  # 2024-2025
)
```

## ÇALIŞMA AKIŞI

### 1. İlk Kurulum
```bash
python manage.py makemigrations
python manage.py migrate          # 24 tables created in public schema
python manage.py createsuperuser
```

### 2. Yeni Kurum Ekleme
```python
from backend.apps.kurum.domain.models import Kurum
from backend.apps.sube.domain.models import Sube

kurum = Kurum.objects.create(
    ad="ABC Eğitim Kurumları",
    kod="ABC",
    aktif_mi=True
)

sube = Sube.objects.create(
    kurum=kurum,
    ad="Ankara Şubesi",
    kod="ANK",
    aktif_mi=True
)
```

### 3. Yeni Eğitim Yılı Oluşturma (GLOBAL)
```python
from backend.apps.egitim_yili.domain.models import EgitimYili

# Global eğitim yılı oluştur
egitim_yili = EgitimYili.objects.create(
    baslangic_yil=2024,
    bitis_yil=2025,
    aktif_mi=True
)

# Eski yılı pasif yap
EgitimYili.objects.filter(
    baslangic_yil=2023
).update(aktif_mi=False)
```

### 4. Sınıf Oluşturma
```python
from backend.apps.sinif.domain.models import Sinif

sinif = Sinif.objects.create(
    ad="9-A",
    kurum_id=1,
    sube_id=1,
    egitim_yili_id=5,  # 2024-2025
    kapasite=30
)
```

### 5. Öğrenci Kaydı
```python
from backend.apps.ogrenci.domain.models import Ogrenci, OgrenciKayit

# 1. Öğrenci oluştur (bir kez - persistent)
ogrenci = Ogrenci.objects.create(
    kurum_id=1,
    sube_id=1,
    tc_kimlik_no="12345678901",
    ad="Ahmet",
    soyad="Yılmaz"
)

# 2. Sınıfa kaydet (her yıl için)
kayit = OgrenciKayit.objects.create(
    ogrenci=ogrenci,
    sinif_id=10,
    egitim_yili_id=5
    # kurum ve sube otomatik doldurulur
)
```

### 6. Veri Sorgulama (Direct ORM)
```python
# Aktif yıldaki sınıflar
siniflar = Sinif.objects.filter(
    kurum_id=request.kurum_id,
    sube_id=request.sube_id,
    egitim_yili_id=request.egitim_yili_id,
    aktif_mi=True
)

# Bir sınıftaki öğrenciler
ogrenciler = OgrenciKayit.objects.filter(
    sinif_id=10,
    egitim_yili_id=5
).select_related('ogrenci')

# Cross-year query (mümkün!)
ayni_ogrenci_farkli_yillar = OgrenciKayit.objects.filter(
    ogrenci_id=100
).select_related('egitim_yili', 'sinif')
```

## DEPLOYMENT NOTLARI

1. **PostgreSQL**: Minimum 12+
2. **Python**: 3.10+
3. **Django**: 4.2+
4. **Connection Pool**: pgbouncer önerilir
5. **Backup**: Tek veritabanı yedekleme (public schema)
6. **Monitoring**: Tenant-based query performance tracking
7. **Indexing**: kurum_id, sube_id, egitim_yili_id için index'ler otomatik

## GÜVENLİK

- ✅ Her query tenant filtreli (kurum, sube, egitim_yili)
- ✅ UNIQUE constraints ile veri bütünlüğü
- ✅ Django ORM kullanımı (SQL injection koruması)
- ✅ Transaction kullanımı
- ✅ Logical isolation (performanslı)
- ✅ Cross-year query desteği
- ✅ Yetkilendirme (geliştirilecek)

## MİMARİ PRENSİPLER

### Persistent vs Yearly
- **Persistent**: Ogrenci, Personel (NO egitim_yili FK)
- **Yearly**: OgrenciKayit, Sinif, KocAtama (HAS egitim_yili FK)

### Denormalization Strategy
- OgrenciKayit: kurum, sube (from ogrenci)
- KocAtama: kurum, sube (from koc/personel)
- Purpose: Fast tenant filtering without JOINs

### Critical Constraints
- `ogrenci_kayit`: UNIQUE(ogrenci_id, egitim_yili_id)
- `sinif`: UNIQUE(kurum, sube, egitim_yili, ad)
- `koc_atama`: UNIQUE(sinif, egitim_yili)
- `egitim_yili`: CHECK(bitis_yil = baslangic_yil + 1)

Bu yapı **production-ready** ve **ölçeklenebilir**dir.
