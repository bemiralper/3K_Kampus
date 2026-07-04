# Coach Portal — Product Decisions (Track A Backend)

Bu belge Koç Portalı MVP backend kararlarını özetler. Uygulama planı dosyası değildir.

## Risk Bildir (MVP)

- **Aksiyon:** Koç “Risk Bildir” dediğinde `CoachingEvent` kaydı `event_type=RISK` olarak oluşturulur.
- **Opsiyonel:** Aynı akışta görüşme taslağı (`GorusmeKaydi`, `durum=planlandi`) oluşturulabilir; MVP’de zorunlu değil.
- **Kaynak:** `event_source=risk_report`, koç profili ve öğrenci atamasından türetilir.

## Hedef (Hedef) alanı

Profil BFF’de gösterilecek hedef metni için **öncelik sırası**:

1. **Aktif manuel ödev** — En güncel `ManualAssignment` (`is_active=True`, `status` ∈ ASSIGNED/IN_PROGRESS/OVERDUE) üzerindeki `coach_notes`.
2. **Haftalık çalışma programı** — Mevcut haftayı kapsayan `WeeklyProgram.coach_note` (yoksa `is_template=False`, `week_start ≤ bugün ≤ week_end`).

İkisi de boşsa `hedef: null`, `source: "none"`.

## Veli İletişimi v1

- **Tel:** `OgrenciVeli.telefon` → `tel:` linki (birincil / ilk veli kaydı).
- **Notlar:** Sadece `GorusmeKaydi` içinde `gorusme_turu=veli` görüşme notları listelenir; ayrı CRM modülü yok.

## Belgeler v1

- **Kapsam:** Yalnızca `GorusmeDosya` (görüşmeye eklenen dosyalar).
- Öğrenci genel belge arşivi / evrak modülü bu fazda dahil değil.

## Multi-coach

- Koç, **atanmış öğrencilerinin tüm görüşme geçmişini** okuyabilir (önceki koçların kayıtları dahil).
- **Düzenleme:** Koç yalnızca **kendi** oluşturduğu / kendisine ait (`koc=coach_profile`) görüşmeleri güncelleyebilir.
- Liste API ve profil BFF erişimi `scoped_student_ids` / `user_can_access_student` ile sınırlandırılır.

## Admin / süper kullanıcı

- `is_resource_admin` → kurum bağlamında (`get_secili_kurum_id`) tüm aktif öğrenciler.
- Koç → atama + manuel ödev + kaynak ataması kapsamındaki öğrenciler (`coach_access.scoped_student_ids`).

## Ana uygulama ile uyum (paralellik)

Koç portalı ayrı bir UI kabuğudur (`/coach/*`); veri ve iş kuralları admin koçluk modülü ile **aynı backend** üzerinden çalışır:

| Alan | Ana uygulama | Koç portalı |
|------|----------------|-------------|
| Öğrenci kapsamı | `coach_access.scoped_student_ids`, kurum header | Aynı — `GET /api/coaching/students/` |
| Risk skoru | `RiskEngine` → `intelligence/risk-list` | Aynı motor — liste API `risk_label` / `risk_score` |
| Görüşme | `GorusmeKaydi` + `/api/coaching/gorusmeler/` | Aynı API (MeetingsClient drawer'ları paylaşılır) |
| Geciken ödev | `ManualAssignment` + `StudentResourceAssignment` OVERDUE | Aynı sayım — `overdue_homework_count` |
| Veli tel | `OgrenciVeli`, varsayılan veli önceliği | Aynı — profil BFF + liste API |
| Kurum bağlamı | `X-Kurum-ID` header / `KurumProvider` | Aynı — tüm istekler `/api` proxy + context header |
| Görüşme takibi | `RiskEngine.INACTIVITY_DAYS_CRITICAL` (14 gün) | Aynı — `needs_meeting` backend alanı |

**Portal-özel (senkron değil):** sabitlenen öğrenci, son ziyaret, hatırlatma erteleme → `localStorage` (cihaz bazlı MVP).

**Bilerek farklı:** koç portalı `/admin/*` yerine sadeleştirilmiş CRM akışı sunar; finans / tam admin menüsü yok.

## Kütüphane (fiziksel salon) — koç erişimi

Koç portalında tam kütüphane modülü `/coach/kutuphane/*` altında; admin sayfaları `KutuphanePathProvider` ile paylaşılır.

| Yetki | Admin (`is_resource_admin`) | Koç |
|-------|----------------------------|-----|
| Salon/masa/dolap altyapısı CRUD | Evet | Hayır (403) |
| Salon listesi, koltuk haritası, yoklama oturumları | Evet | Evet (kurum geneli okuma + yoklama yazma) |
| Masa/dolap ataması, izin, geçici oturma | Tüm öğrenciler | Tüm öğrenciler (kurum geneli) |
| Öğrenci kaynak özeti / atama listeleri | Kurum geneli | Kurum geneli |
| Ders programı | CRUD | Salt okunur |
| Analitik dashboard | Evet | Evet (kurum geneli okuma) |

Backend: `apps/kutuphane/coach_scope.py` — `is_kutuphane_operational_coach`, `require_kutuphane_operational_access`, `filter_kutuphane_assignments_qs`.
Öğrenci araması koç modunda da kurum geneli (`/ogrenciler/api/list/` ve `/search/`).
