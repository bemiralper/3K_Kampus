# Şube İzolasyonu — Mimari Özet

Her **şube** bağımsız bir uygulama gibi çalışır. Finans ve tüm operasyonel modüller şube kapsamındadır. Kurum düzeyinde yalnızca kurum yönetimi ve kurumsal site paylaşılır.

## Kurum düzeyi (paylaşılan)

| Modül | Açıklama |
|-------|----------|
| **Kurum yönetimi** | Kurum / şube CRUD, eğitim yılı tanımları, bağlam (context) API |
| **Kurumsal site** | Website menü, hero, yasal metinler, iletişim formları |

## Şube düzeyi (izole)

Aşağıdaki modüller **şube_id** ile kapsamlanmalıdır (mevcut veya planlanan):

| Modül | Durum |
|-------|--------|
| Finans (gelir, gider, cari, mali hesaplar, taksit) | **Kısmen tamamlandı** — cari hesap ve gelir kayıtları şube FK + list/detail izolasyonu; gider create/list hâlâ `sube_id IS NULL` kayıtları içerebilir |
| **Öğrenci** (liste, export, arama, filter-options, kayıt, detay/veli/adres) | **Tamamlandı** — zorunlu şube + kayıt düzeyinde erişim (`apps/ogrenci/interfaces/sube_context.py`) |
| **Personel** (liste, detay, görevlendirme, koç listesi, finans-yetkililer) | **Tamamlandı** — zorunlu şube bağlamı; personel görünürlüğü `PersonelGorevlendirme.gorev_sube` üzerinden (görevlendirme yoksa ana şube) |
| Personel görevlendirmeleri | `PersonelGorevlendirme.gorev_sube` — API enforcement uygulandı |
| Takvim / bildirimler | **Kısmen tamamlandı** — etkinlik list/create/detail/mutasyon zorunlu şube; bildirim tercihleri henüz kayıt düzeyinde doğrulanmıyor |
| **Ölçme değerlendirme** | **Tamamlandı** — sınav list/create/detail/mutasyon, cevap anahtarı, sonuç yükleme/analiz, lookup endpoint'leri zorunlu şube (`apps/coaching/olcme_degerlendirme/interfaces/sube_context.py`) |
| **Koçluk** | **Tamamlandı** — atamalar, koç listesi, öğrenci listesi, bulk-assign, görüşme, study-program zorunlu şube (`apps/coaching/interfaces/sube_context.py`) |
| **Ödev / kaynak** | **Kısmen tamamlandı** — operasyonel atamalar (student_resources, manual-assignments) zorunlu şube; kaynak katalog (`/api/resources/*`) kurum düzeyinde |
| **Eğitim tanımları** (sınıf seviyesi, alan, ders, branş) | **Tamamlandı** — model `kurum`+`sube` FK, `(sube, kod)` unique; API zorunlu şube (`apps/egitim_tanimlari/interfaces/sube_context.py`) |
| **Eğitim paketleri** (grup/özel/deneme/ek hizmet) | **Tamamlandı** — liste/create şube filtresi; detail/mutasyon kayıt düzeyinde gate |
| **Akademik planlama** (şablon, saat, döngü, grid, ders planı, scheduler) | **Tamamlandı** — şablon doğrudan `sube` FK; diğer kayıtlar şablon/sınıf/ders üzerinden gate (`apps/academic/interfaces/sube_context.py`) |
| Kütüphane | **Henüz uygulanmadı** |
| Görev yönetimi | Kurum + şube |
| İletişim (WhatsApp/SMS kuyruğu) | **Tamamlandı** — konuşma, kampanya, şablon, kategori, ek zorunlu şube (`apps/communication/interfaces/sube_context.py`); WABA config kurum düzeyi |

## Giriş ve bağlam seçimi

```
Giriş
  │
  ├─ Birden fazla kurum? ──► /kurum-sec
  │       (çok kurumlu personel veya süper kullanıcı)
  │
  ├─ Tek kurum ──► otomatik kurum bağlamı
  │
  ├─ kurum_yoneticisi / süper kullanıcı? ──► /sube-sec (zorunlu)
  │
  ├─ Personel, birden fazla görev şubesi? ──► /sube-sec
  │
  └─ Tek şube ──► otomatik şube + ana sayfa
```

### Rol kuralları

| Kullanıcı | Kurum seçimi | Şube seçimi (giriş) |
|-----------|--------------|---------------------|
| Süper kullanıcı | Çok kurum varsa zorunlu | Her zaman zorunlu |
| `kurum_yoneticisi` | Tek kurum (otomatik) | Her zaman zorunlu |
| Çok kurumlu personel | Zorunlu | Görev şubesi >1 ise zorunlu |
| Tek kurumlu personel | Otomatik | Görev şubesi >1 ise zorunlu |

**Not:** `muhasebe` rolü global şube erişimine sahip **değildir** — yalnızca görevlendirildiği şubeleri görür. Global şube seçici erişimi yalnızca `kurum_yoneticisi` (ve süper kullanıcı) içindir.

### Giriş sonrası vs header seçici

- **Giriş akışı** (`/kurum-sec`, `/sube-sec`): Bağlamı ilk kez kilitler.
- **Header `ContextSelector`**: Oturum içinde kurum yöneticisi / süper kullanıcı tüm şubeler arasında geçiş yapabilir; personel yalnızca yetkili şubeleri görür.

## Backend API'ler

| Endpoint | Amaç |
|----------|------|
| `GET /personel/api/my-kurumlar/` | Erişilebilir kurumlar, `needs_kurum_picker` |
| `GET /personel/api/my-subeler/?kurum_id=` | Erişilebilir şubeler, `requires_login_sube_selection`, `needs_sube_picker` |

Kaynak: `backend/shared/kurum_access.py`, `backend/shared/sube_access.py`

## Migrasyon kontrol listesi

Her operasyonel API için:

- [ ] Liste/oluşturma/güncelleme `sube_id` zorunlu mu?
- [ ] QuerySet `sube_id` ile filtreleniyor mu?
- [ ] Session/header `X-Sube-ID` yoksa 400 dönüyor mu?
- [ ] Kullanıcının `get_allowed_subeler_for_user` ile erişimi doğrulanıyor mu?
- [ ] Frontend istekleri `X-Sube-ID` header gönderiyor mu?

### Öncelikli modüller

1. **Ölçme değerlendirme** — sınav listesi kurum/şube filtresiz (en acil sızıntı); `Exam.sube` FK mevcut
2. **Koçluk** — atamalar, görüşme, study-program; eligibility altyapısı var, API zorunluluğu yok
3. **Ödev / kaynak** — operasyonel atamalar `student.sube` join ile filtrelenebilir (migration gerekmez)
4. **Akademik** — `Sinif.sube` FK var; API'ler optional şube + bir kısmı `AllowAny`
5. **Kütüphane** — ürün kararı: salon/masa kurum-geneli mi şube bazlı mı? (`SubeDersProgrami` kısmen şube-aware)
6. Finans — gider create/list null-şube kayıtları; cari hareket listesi
7. Takvim — EventType, ReminderSetting, AppNotification endpoint'leri

### Tamamlanan / kısmen tamamlanan

- `GiderKategorisi` — `sube_id` zorunlu (ağaç, dropdown)
- `GiderKaydi` listesi (`GET /finans/api/giderler/`) — `sube_id` zorunlu (query, header veya session)
- `my-subeler` / `my-kurumlar` — erişim politikası
- Giriş akışı — `/kurum-sec`, `/sube-sec` yönlendirmesi
- **Öğrenci list API** (`GET /ogrenciler/api/list/`, `export/`, `filter-options/`, `search/`) — zorunlu şube + rol erişimi (`shared/sube_context.py`, `apps/ogrenci/interfaces/sube_context.py`)
- **Öğrenci kayıt oluşturma** (`POST /api/ogrenci-kayit/register/`, `GET .../packages/`) — zorunlu şube; wizard metadata şube listesi kullanıcı yetkisine göre filtrelenir
- **Personel list/stats API** (`GET /personel/api/list/`, `stats/`, `gorevlendirmeler/`, `koclar/`, `finans-yetkililer/`) — zorunlu şube + görevlendirme tabanlı filtre (`apps/personel/interfaces/sube_context.py`)
- **Personel detay/mutasyon API** (`GET/PUT/DELETE /personel/api/<id>/`, full detail, görevlendirme CRUD) — kayıt düzeyinde şube doğrulama
- **Finans cari hesap** (`GET/POST /finans/api/cari-hesaplar/`, detay/mutasyon) — `sube` FK, liste filtresi, kayıt düzeyinde erişim
- **Finans gelir kaydı** (`GET/POST /finans/api/gelirler/`, detay/tahsilat) — zorunlu şube atama, `allow_null_sube` kaldırıldı
- **Takvim etkinlik API** (`GET/POST /takvim/api/etkinlikler/`, detay/taşı/resize/durum) — zorunlu şube (`apps/takvim/interfaces/sube_context.py`)
- **Ölçme sınav API** (`GET/POST /api/coaching/olcme-degerlendirme/exams/`, detay/mutasyon, nested answer-keys/results/analysis) — zorunlu şube + kayıt düzeyinde erişim
- **Koçluk atama API** (`GET/POST /api/coaching/assignments/`, bulk-assign, change-coach, student-history) — `student.sube_id` filtresi
- **Koçluk öğrenci BFF** (`GET /api/coaching/students/`, profil) — zorunlu şube
- **Görüşme API** (`GET/POST /api/coaching/gorusmeler/`, detay/mutasyon) — `ogrenci.sube_id` filtresi + kayıt gate
- **Study program API** (`GET/POST /api/coaching/study-program/programs/`) — zorunlu şube + kayıt gate
- **Öğrenci kaynak ataması** (`GET/POST /api/student-resources/assignments/`, purchase-lists) — zorunlu şube
- **Manuel ödev** (`GET/POST /api/coaching/manual-assignments/assignments/`) — zorunlu şube
- **İletişim operasyonel API** (`/api/communication/conversations/`, kampanyalar, şablonlar, kategoriler, ekler, SSE) — zorunlu şube + kayıt düzeyinde erişim; WhatsApp WABA config kurum düzeyi

## Audit — pending modules (2026-07-02)

Kaynak: [Modül şube izolasyon audit](02bf6478-2f8b-4820-b6f3-95e10186121e)

| Modül | Backend app(ler) | `sube` FK | API durumu | Kritik gap |
|-------|------------------|-----------|------------|------------|
| **Ölçme** | `coaching/olcme_degerlendirme` | `Exam.sube` (nullable FK) | **Tamamlandı** — list/create/detail/mutasyon + nested resources | Eski kayıtlarda `sube=NULL` → 403; müfredat (curriculum) global |
| **Koçluk** | `coaching` (+ study-program, gorusme) | Dolaylı (`ogrenci`) | **Tamamlandı** — assignments, students, gorusme, study-program | Koç detay/stats endpoint'leri şube filtresiz (kurum-geneli profil) |
| **Ödev / Kaynak** | `resources`, `student_resources`, `coaching/assignment_manual` | Operasyonel: dolaylı (`student`) | **Kısmen** — operasyonel API'ler şube zorunlu; katalog kurum düzeyi | `resources` katalog testleri header/izin uyumu; assignment_manual paket CRUD |
| **Kütüphane** | `kutuphane` | Salon/masa: kurum only; `SubeDersProgrami`: `sube_id` | Kurum header; koç kurum-geneli (testli) | Ürün kararı + olası schema migration |
| **Akademik** | `academic`, `sinif` | `Sinif.sube` zorunlu; `ScheduleTemplate.sube` opsiyonel | Sınıf listesi şube opsiyonel; academic CRUD `AllowAny` | Auth + mandatory şube eksik |

**Önerilen sıra:** Akademik → Kütüphane → Finans gider null-şube

**Test:** `test_sube_isolation` — finans, personel, öğrenci, takvim, ölçme, koçluk, student_resources modüllerinde mevcut.

## Test

```bash
cd backend && DJANGO_ENV=test python manage.py test apps/finans/tests
cd backend && DJANGO_ENV=test python manage.py test apps/takvim/tests
cd backend && DJANGO_ENV=test python manage.py test apps/ogrenci/tests/test_sube_isolation
cd backend && DJANGO_ENV=test python manage.py test apps/personel/tests
cd backend && DJANGO_ENV=test python manage.py test apps/coaching/tests
cd backend && DJANGO_ENV=test python manage.py test apps/student_resources/tests
cd backend && DJANGO_ENV=test python manage.py test apps/communication/tests/test_sube_isolation
```
