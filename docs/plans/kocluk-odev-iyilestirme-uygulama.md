# Koçluk ödev iyileştirme uygulama kaydı

## Kapsam ve bağımlılıklar

| Sorun | Gerçek çağrı zinciri | Doğrulama |
|---|---|---|
| 1–2 | AssignmentNotifySendModal → resources-api.previewAssignmentNotify → views.notify_preview → notification_service.preview → build_pdf_attachment_message → get_pdf_message_template → ensure_assignment_pdf_templates | SQL yazma sayısı, özel/pasif şablon ve kurum izolasyonu |
| 3,15 | notify_send → report_pdf_service → html_to_pdf.render_url_to_pdf → React print → retrieve/report | mock renderer hatası, toplam timeout, kaynak kapanışı |
| 4–5 | notification_service.send (atomic) → celery_dispatch → outbound_processor | commit/rollback ve broker kapalı testleri |
| 6–7 | dispatch_event → integration_hooks → Message/OutboundQueue → Meta/webhook → modal | durum sırası ve işlem anahtarı tekrar testleri |
| 8–9 | detail.handleBulkUpdateTasks → tasks.update_task_status → completion/progress_sync → full refetch | batch yetki/rollback, tek hesap, minimal yanıt |
| 10 | dashboard.loadOps → fetchAssignments → list/get_queryset | backend limit, bağımsız kartlar |
| 11 | list/stats → refresh_manual_assignment_overdue | salt okuma ve tarih/saat dilimi doğruluğu |
| 12 | report → update_assignment_completion_from_tasks → progress_sync → tüm geçmiş | salt okuma, mevcut toplamlarla regresyon |
| 13 | wizard.fetchResources/fetchTaskHistory/fetchBook | ters sıralı yanıt, öğrenci/kitap değiştirme |
| 14 | wizard kaydetme döngüsü → serializer.create/_create_lessons | öğrenci bazında tekrar ve kısmi başarı |

Sınırlar: mevcut API alanları korunacak; yeni alan/endpoint eklenebilir. Öğretmen portalındaki önceden mevcut değişiklikler kapsam dışında. Gerçek Meta çağrısı yapılmayacak. Testler yalnız `DJANGO_ENV=test` veritabanında çalıştırılacak. Üretim deploy/migration/restart yapılmayacak.

## Başlangıç

- 9 mevcut şablon testi geçti: `DJANGO_ENV=test ./venv/bin/python manage.py test apps.coaching.assignment_manual.tests.test_assignment_notify_templates --keepdb --noinput` (0.248s test süresi; HTTP ölçümü değildir).
- Sandbox yerel PostgreSQL bağlantısını engelledi; aynı test komutu yetkili yerel çalıştırmada başarılı oldu.
- Önceki inceleme usage counter yazmasını atlamış: `build_pdf_attachment_message` ayrıca `TemplateService.increment_usage` çalıştırıyor. Salt okuma için bu yan etki de ayrılmalı.
- Performans karşılaştırması, aynı sentetik fixture üzerinde CaptureQueriesContext ile yapılacak; canlı p95 ölçülmedi.

## Test ve geri dönüş planı

Her aşamada önce hedef regresyon testleri, ardından ilgili modül testleri çalıştırılır. Veritabanı kilidi testleri PostgreSQL üzerinde ayrı bağlantılarla yapılır. Frontend tip kontrolü ve mock API ile Playwright etkileşimleri kullanılır. Renderer/Meta çağrıları mock edilir; gerçek PDF kontrolü yapılabiliyorsa ayrıca raporlanır.

Rollback: uygulama değişiklikleri kendi dosya diff'leriyle geri alınabilir; kullanıcıya ait mevcut değişiklikler geri alınmaz. Eklemeli migration varsa yalnız yeni iş kayıtları/kolonları eklenir; iş kuyruğu boşaltılmadan tablo kaldırılmaz. Çalıştırılmayan testler ve eksik ölçümler tamamlanmış sayılmaz.

## A. Uygulanan çözümler ve kök nedenler

Durum: kod ve yerel doğrulamalar hazır; üretime uygulanmadı. **Kalıcı işlem defteri varsayılan kapalıdır:** `ASSIGNMENT_OPERATION_LEDGER_ENABLED=False`. Asenkron PDF, gönderim anahtarı ve çoklu kayıt defteri ancak 0021–0022 migration'ları ve worker/cron hazırlandıktan sonra manuel açılır. Kullanıcı/ödev açıkça silinirse defter geçmişi kalır; eksilen referanslar NULL olur ve bekleyen iş yetki kontrolünde durur. Bu sırada eski istemcilerin API sözleşmeleri korunur. Özellik kapalıyken mevcut senkron PDF ve öğrenci başına oluşturma yolu kullanılır; yeni tablo sorgulanmaz. Bu nedenle üretimde 15 sorunun tamamının giderildiği iddia edilmemektedir.

| # | Neden / ilgili fonksiyon | Risk | Çözüm ve etki |
|---|---|---|---|
| 1 | `get_pdf_message_template` her alıcıda dört şablonu kuruyor; `build_pdf_attachment_message` kullanım sayacını artırıyordu | Yüksek | `get_pdf_message_templates` dört slotu tek sorguda okur. Önizleme `templates` snapshot'ı ve `count_usage=False` kullanır. Önizleme için gereksiz görev prefetch ve ikinci ödev yüklemesi kaldırıldı. Config kaydı olmayan eski kurulumdaki aktif, adıyla bulunan özel şablon da salt okunarak korunur. |
| 2 | `ensure_role_template` mevcut eşlemeyi tekrar bağlayıp pasif şablonu aktifleştiriyordu | Yüksek | Kurulum mevcut eşlemeyi/pasifliği korur; kurum ve config satır kilidiyle serileştirilir. Var olan config benzersizliği korunur. Yalnız açık `recreate_default_template_for_role` işlemi yeniden aktifleştirip eşler. |
| 3 | `notify_send` → Chromium → React print → Django bağımlılık zinciri HTTP içinde çalışıyordu | Yüksek | Bayrak açıkken `AssignmentOperation` oluşturulur, commit sonrası Celery tetiklenir; yoksa kalıcı kayıt cron'u bekler. PDF doğrulanmadan Message/OutboundQueue oluşturulmaz. Eski yol korunur. |
| 4 | İletişim hook'ları transaction içinden `process_immediately=True` çalıştırıyordu | Kritik | Ödev kaynaklı mesajlar yalnız kalıcı kuyruğa alınır. `schedule_outbound_after_commit` commit sonrasında broker'a haber verir; rollback callback'i iptal eder. Mevcut OutboundQueue ve yeni PDF işlem defteri kalıcı outbox işlevi görür. |
| 5 | Celery dispatch'in varsayılan fallback'i HTTP içinde genel batch tüketiyordu | Yüksek | Ödev yolu bu fallback'i çağırmaz. Broker kapalı/hatalıysa kayıt korunur; `process_communication_queue` ve `process_assignment_jobs` HTTP dışında işler. Diğer modüllerin senkron dispatch sözleşmeleri değiştirilmedi. |
| 6 | Yerel kabul/success, teslim edilmiş gibi gösteriliyordu | Yüksek | Modal PENDING=kuyrukta, SENDING=işleniyor, SENT=sağlayıcıya iletildi, DELIVERED=teslim edildi, READ=okundu, FAILED=başarısız gösterir. İş sorgusu Message kayıtlarından güncel durumu okur. Mevcut webhook sıra/tekrar korumaları korunup test edildi. |
| 7 | Ağ kopmasıyla aynı kullanıcı eylemi ikinci iş/mesaj oluşturabiliyordu | Kritik | Kurum+aktör+işlem türü+anahtar için DB unique constraint ve payload SHA-256 kontrolü eklendi. Aynı anahtar aynı sonucu, farklı payload 400/409 döndürür. Yeni bilinçli gönderim yeni anahtar alır. Meta read/write bağlantı belirsizliği otomatik yeniden gönderilmez. Belirsiz geçmişi olan alıcı varsayılan seçilmez, çift teslim riski açıklanır. |
| 8 | Toplu kontrol N POST ve N bütün-ödev hesabı yapıyordu | Kritik | `tasks/batch-status/`: en fazla 200 görev, tek ödev, tek transaction, ortak parent satır kilidi, bir ilerleme hesabı. Politika tamamen başarılı veya tamamen reddedilmiş. Tekil endpoint durur; aynı hedefe tekrar batch salt sonuç döndürür. |
| 9 | Tek görev değişiminden sonra bütün detay yeniden isteniyordu | Orta | Tekil yanıt eski `data` görevini korur, ek `assignment_summary` verir. Frontend durum değişimi, tek görev sıfırlaması ve not işlemlerinde yalnız görevleri ve etkilenen özeti birleştirir. Eski backend'de summary yoksa uyumluluk için refetch yapılır. Yerel mutasyonlar çakıştırılmaz. |
| 10 | Dashboard bütün geciken ödevleri indirip ilk 10'u seçiyor ve beş kaynağı birlikte bekliyordu | Yüksek | `page=1&page_size=10` DB sayfalaması kullanılır. Her bölüm kendi yanıtı geldiğinde güncellenir, ayrı yükleme/hata bilgisi verir. Geciken yanıt/unmount koruması eklendi. |
| 11 | Liste/stats/rozet/öğrenci listesi görüntülemesi üç overdue UPDATE tetikliyordu | Yüksek | `with_effective_status` tarih ve yüzde kurallarını SQL CASE ile salt okuma sırasında uygular. Liste filtreleri/sayaçları/JSON status'u aynı projeksiyonu kullanır. Kalıcı bakım komutu silinmedi. Stats durumları koşullu aggregate ile hesaplanır. |
| 12 | Rapor GET completion kaydetme ve kaynak senkronizasyonu yapıyordu; aynı geçmiş tekrar sorgulanıyordu | Yüksek | Okuma yolundan yazma çıkarıldı. Önceden yüklenmiş görev/lesson cache'i ve trend için ortak geçmiş kullanılır. Tarihçe toplamları yaşam boyu olduğundan keyfi tarih kesintisi yapılmadı; mevcut rapor kapsamı korunur. |
| 13 | Öğrenci/kitap/geçmiş/kota yanıtları seçim değiştikten sonra state'e yazılabiliyordu | Yüksek | Wizard yükleyicilerinde request epoch ve unmount kontrolü, öğrenci/kitap değişiminde bağımlı seçimlerin geçersizleştirilmesi eklendi. Detay ve önizlemede AbortController kullanılır. |
| 14 | Öğrenci başına seri HTTP, içerik başına SELECT ve kısmi tekrarda mükerrer kayıt riski vardı | Kritik | Bayrak açıkken en fazla 50 öğrencilik batch-create kullanılır. Öğrenci başına atomik ve kalıcı anahtarlı sonuç tutulur; başarılılar replay edilir. Öğrenci satır kilidi duplicate-content kontrolünü serileştirir. İçerikler serializer içinde `in_bulk` ile okunur. Save/signal/takvim davranışları korunur; bunları atlayacak bulk_create uygulanmadı. |
| 15 | Önizleme süresiz, retry yalnız hatayı siliyor, print hatası ready timeout'unu bekliyordu | Yüksek | Önizleme 20 sn, iş sorgusu 15 sn, asenkron iş kabulü 30 sn bütçelidir. Modalın 120 sn takibi sonunda kalıcı iş devam edebilir; tekrar aynı işi kontrol eder. URL PDF üretiminde toplam 90 sn alt süreç sınırı ve süreç grubu temizliği vardır. React hata işareti/JS hata yakalama ve gerçek retry eklendi. |

Ek olarak ortak kaynak atamasına bağlı farklı ödevler eşzamanlı güncellendiğinde kaynak yüzdesinin ezilmesini önlemek için `sync_source_assignment_progress` kaynak satırını kilitler. Mevcut kaynak tamamlanma/geçiş kuralları değiştirilmedi. Eski HTML PDF endpoint'ine de mevcut öğrenci/kayıt erişim kontrolü eklendi; yetkisiz/yok kayıt için renderer çalıştırılmaz. API proxy'nin Cookie/Set-Cookie ve query string logları kaldırıldı; print token ve oturum çerezleri loglanmaz. PDF indirmesi kurum/şube/eğitim yılı header'larını merkezi yardımcıdan alır.

## B. Değiştirilen dosyalar

Tüm yollar repo köküne göredir. Aşağıdakiler bu çalışmaya aittir; önceden değiştirilmiş `frontend/app/ogretmen/**`, `frontend/components/teacher/**`, `frontend/lib/teacher-web.tsx` ve öğretmen e2e dosyası kapsam dışındadır.

| Dosya | Değişiklik / gerekçe | Uyumluluk |
|---|---|---|
| `backend/apps/coaching/assignment_manual/assignment_template_seed.py` | Salt okuma snapshot'ı; açık kurulumda mevcut seçimleri koruma ve kilit | Fonksiyon adları korunur; okuma artık seed yapmaz |
| `backend/apps/coaching/assignment_manual/assignment_template_roles.py` | Açık reset eylemini otomatik başlangıçtan ayırma | Kullanıcının açık reset işlevi korunur |
| `backend/apps/coaching/assignment_manual/assignment_notify_utils.py` | Snapshot/count_usage seçenekleri | Mevcut parametreler ve mesaj metni korunur |
| `backend/apps/coaching/assignment_manual/notification_service.py` | Hafif önizleme, şube bağlamı, mesaj ID/durum takibi, senkron genel kuyruk çağrısını kaldırma | Eski sent/skipped/errors alanları korunur; sent yerel kabul sayısıdır |
| `backend/apps/coaching/assignment_manual/models.py` | Eklemeli AssignmentOperation | Mevcut modeller/kayıtlar değiştirilmez |
| `backend/apps/coaching/assignment_manual/migrations/0021_assignment_operation.py` | Yeni tablo, FK ve işlem anahtarı benzersizliği | Eski büyük tablolarda veri dönüşümü/index taraması yok |
| `backend/apps/coaching/assignment_manual/migrations/0022_operation_history_references.py` | Yalnız yeni defterde kullanıcı/ödev referanslarını SET_NULL yapma | Mevcut hard-delete işlevleri yeni geçmiş kaydı yüzünden engellenmez; geçmiş korunur |
| `backend/apps/coaching/assignment_manual/operations.py` | İş kabulü, replay, PDF checkpoint/revizyon doğrulaması, kuyruklama | Yeni akış; bayrak arkasında |
| `backend/apps/coaching/assignment_manual/tasks.py` | Mevcut Celery'ye yeni görev; 150/180 sn soft/hard sınırı | Eski görevler değişmez |
| `backend/apps/coaching/assignment_manual/management/commands/process_assignment_jobs.py` | Kalıcı işlerin Celery dışı tüketicisi | Yeni servis gerektirmez; cron seçeneği |
| `backend/apps/coaching/assignment_manual/read_models.py` | Overdue salt okuma projeksiyonu | Yerel takvim günü kuralı korunur |
| `backend/apps/coaching/assignment_manual/views.py` | Capabilities/job/batch endpoint'leri; parent/student kilitleri; okumalardan UPDATE kaldırma | Eski endpoint/alanlar korunur; yeni alanlar eklenir |
| `backend/apps/coaching/assignment_manual/serializers.py` | Prefetch kullanımı, içerik in_bulk, efektif liste statüsü | Çıktı alanları korunur |
| `backend/apps/coaching/assignment_manual/services/progress_sync.py` | Ortak kaynak satır kilidi | Hesaplama ve durum kuralları aynı |
| `backend/apps/communication/application/celery_dispatch.py` | Sadece commit sonrası ve senkron tüketimsiz ödev dispatch yardımcısı | Genel eski dispatch yardımcısı korunur |
| `backend/apps/communication/application/communication_service.py` | `source.module=odev` için yalnız kuyruklama | Diğer modüllerin immediate seçeneği korunur |
| `backend/apps/communication/application/integration_hooks.py` | Yalnız ödev hook'larında hata savepoint'i | Finans/yoklama/sınav hook transaction davranışı değişmez |
| `backend/apps/communication/application/outbound_processor.py` | Belirsiz sağlayıcı sonucunda otomatik retry durdurma | Mevcut status kodları korunur; açıklama belirsizliği belirtir |
| `backend/apps/communication/infrastructure/channels/whatsapp_cloud.py` | Bağlantı kurulamadı / yanıt belirsiz ayrımı, hassas olmayan log | Meta payload, şablon kimlikleri değiştirilmez |
| `backend/apps/communication/application/html_to_pdf.py` | Hazır/hata ayrımı, font/görsel bekleme, aşama süreleri, toplam timeout ve kaynak temizliği | Print tasarımı, A4/yön/margin/CSS kuralları korunur |
| `backend/config/settings/base.py` | Varsayılan kapalı operasyon bayrağı | Migration öncesi aktif kurulum yeni tabloya gitmez |
| `backend/config/offline_test_runner.py` | Mock edilmemiş HTTP'yi engelleyen isteğe bağlı test runner | Üretim runner'ını değiştirmez |
| `frontend/lib/api.ts` | Hedef isteğin abort sinyalini CSRF ön yüklemesine taşıma | Genel API süre varsayılanları değiştirilmez |
| `frontend/lib/resources-api.ts` | Yeni batch/job/capability yardımcıları ve hedefli timeout'lar | Eski yardımcılar korunur |
| `frontend/lib/request-timeout.ts` | Süre bütçesi + parent cancellation | Yeni bağımlılık yok |
| `frontend/lib/operation-key.ts` | Güvenli tekrar anahtarı; LAN HTTP için SubtleCrypto fallback | Kimlik doğrulama yerine kullanılmaz |
| `frontend/components/odev/AssignmentNotifySendModal.tsx` | Gerçek retry, durumlar, iş takibi, aynı anahtarla yeniden deneme | Düzen ve alıcı seçim işlevleri korunur |
| `frontend/components/odev/OdevKontrolDetailClient.tsx` | Tek batch, hedefli state birleştirme, abort/güncellik | Eski backend için refetch fallback'i vardır |
| `frontend/components/odev/OdevVerWizard.tsx` | Güncellik koruması ve bayrak açıkken batch/replay | Bayrak kapalıyken mevcut kayıt yolu kullanılır |
| `frontend/components/odev/OdevPlanPrintClient.tsx` | Ready/error işaretleri | Belge alanları/tasarımı değişmez |
| `frontend/components/odev/OdevKontrolReportClient.tsx` | Rapor yükleme hatası ve print hata işareti | Rapor alanları/tasarımı değişmez |
| `frontend/app/coach/dashboard/page.tsx` | Limitli liste ve bağımsız bölümler | Görsel yerleşim korunur; küçük durum satırı eklenir |
| `frontend/app/api/[...path]/route.ts` | Cookie/Set-Cookie/token query loglarını kaldırma | Proxy sözleşmesi aynı |
| `backend/apps/communication/tests/test_integration_hooks.py` | Ödev mesajı için yeni kabul kriteri PENDING; sağlayıcı çağrılmadığını doğrulama | Beklenti yeni kuyruk sözleşmesine uyar |
| `backend/apps/communication/tests/test_provider_uncertainty.py` | Read timeout, bağlantı hatası, belirsiz sonuç ve rate limit | Mock testler |
| `backend/apps/coaching/assignment_manual/tests/test_batch_create.py` | Kısmi başarı ve aynı anahtar tekrarı | Yeni regresyon |
| `backend/apps/coaching/assignment_manual/tests/test_batch_status.py` | Tek hesap, geçersiz batch rollback, ek özet | Yeni regresyon |
| `backend/apps/coaching/assignment_manual/tests/test_concurrent_control.py` | Ayrı PostgreSQL bağlantılarıyla lost update, kaynak ortalaması, paralel create/notify | Gerçek DB kilit testi |
| `backend/apps/coaching/assignment_manual/tests/test_delivery_commit.py` | Commit/rollback/broker yok/broker hata | Sağlayıcı çağrısı yok |
| `backend/apps/coaching/assignment_manual/tests/test_operations.py` | İş replay, PDF hata/checkpoint, tek Message/Queue, açık retry | Sağlayıcı mock |
| `backend/apps/coaching/assignment_manual/tests/test_pdf_lifecycle.py` | Toplam timeout, süreç temizliği, geçersiz PDF | Alt süreç mock |
| `backend/apps/coaching/assignment_manual/tests/test_performance_probe.py` | Aynı fixture ile tekrarlanabilir SQL/byte/süre probu | Test verisi geri alınır |
| `backend/apps/coaching/assignment_manual/tests/test_readonly_performance.py` | Yazmasız okuma, pasif/özel/kurum şablonu, sabit şablon sorgusu | Yeni regresyon |
| `backend/apps/coaching/assignment_manual/tests/test_rollout_safety.py` | Bayrak kapalıyken yeni tablo sorgulanmaması | Migration öncesi güvenlik |
| `frontend/e2e/homework-reliability.spec.ts` | Telefon/PC, tek batch, gerçek print PDF, ters sıralı öğrenci/kitap, retry | Tüm API'ler sentetik mock |
| `docs/plans/kocluk-odev-performans-incelemesi-2026-11-03.md` | İlk kaynak kod incelemesi | Tarihsel bulgular; güncel durum bu dosyada |
| `docs/plans/kocluk-odev-iyilestirme-uygulama.md` | Uygulama/kanıt/rollout raporu | Operasyonel referans |

## C. Ölçülen performans

Eski kod `2199bea9` tabanından `/private/tmp` altına izole kopyalandı. Aynı `PerformanceProbe` sentetik fixture'ı (bir öğrenci, bir ödev, bir blok, 20 görev) aynı yerel PostgreSQL test ortamında çalıştırıldı. Tablo süreleri tek örneklerdir; API p50/p95 veya yük testi değildir. Ardışık testlerin otomatik ID/tarih değerleri byte sayılarında birkaç byte oynatabilir.

| İşlem | SQL önce → sonra | İş verisi yazması önce → sonra | HTTP önce → sonra | Örnek süre önce → sonra |
|---|---|---|---|---|
| Liste | 15 → 12 | 3 → 0 | 1 → 1 | 12.95 → 9.52 ms |
| İstatistik | 21 → 11 | 3 → 0 | 1 → 1 | 13.47 → 8.70 ms |
| Rapor | 40 → 17 | 1 → 0 | 1 → 1 | 35.14 → 19.98 ms |
| Önizleme servisi | 50 → 17 | 5 → 0 | Servis düzeyinde ölçüldü | 83.50 → 38.42 ms |
| 20 görev kontrolü | 240 → 38 | 40 → 21 | 20 → 1 | 169.97 → 40.07 ms |

20 kontrol yanıtı toplam yaklaşık 21.3 KB iken tek batch yaklaşık 20.6 KB. Rapor yaklaşık 22.8 KB olarak kaldı: veriyi atarak küçültme yapılmadı. Dashboard artık backend'den en fazla 10 ödev ister; yüzlerce ödevli canlı veri aktarımı ölçülmedi.

Ayrı küçük önizleme fixture'ında (bir veli+öğrenci) başlangıç **79 sorgu / 10 yazma** idi. İlk düzeltmede 20/0, gereksiz ilişki yüklerinin kaldırılmasından sonra 19/0 ölçüldü. Veli sayısı arttığında şablon sorgularının artmadığı ayrıca test edildi; gönderim geçmişi gibi alıcıya özgü sorguların tamamının sabit olduğu iddia edilmez.

Gerçek Chromium, aynı yerel statik 20 görevli HTML, beş örnek:

| PDF | Önce | Sonra |
|---|---|---|
| Örnekler (ms) | 1563.13, 798.63, 786.36, 796.09, 805.95 | 893.09, 402.44, 383.77, 381.89, 496.10 |
| Ortalama | 950.03 ms | 511.46 ms |
| Ampirik p95 (5 örnekte en yüksek değer) | 1563.13 ms | 893.09 ms |
| Hata | 0/5 | 0/5 |
| Dosya boyutu | Her örnekte 23,982 byte | Her örnekte 23,982 byte |

Bu ölçüm canlı React/Django ağ zincirinin p95'i değildir; iki sürümün statik render karşılaştırmasıdır. Gerçek React plan ve rapor print bileşenleri ayrıca mock API ile Chromium PDF üreterek doğrulandı. Üretim kuyruk gecikmesi, toplu kayıt toplam süresi, yoğunluk altında bellek/CPU ve gerçek Meta teslim gecikmesi ölçülmedi.

## D. Test sonuçları

- Ödev/iletişim/kaynak geniş regresyonu: **826 test, 823 başarılı, 3 başarısız**. Dış HTTP `OfflineLmsTestRunner` ile bloke edildi. Aşağıdaki üç hata `2199bea9` eski kod kopyasında da aynı şekilde tekrarlandı; bu değişikliklerden kaynaklanan regresyon olarak sınıflandırılmadı ve gizlenmedi.
  - `test_binding_system_usage.BindingSystemUsageTests.test_lms_binding_shows_as_system_usage`: “Yoklama” etiketi beklentisi.
  - `test_notification_bindings.BindingServiceTest.test_catalog_lists_every_event_with_slots`: `devamsizlik` katalog görünürlüğü beklentisi.
  - `test_template_group.TemplateGroupHelperTest.test_list_excludes_hidden_legacy`: aynı eski modül görünürlüğü beklentisi.
- Son ödev paketi: **135/135 başarılı**; son tek görev sıfırlama/not düzenlemesinden sonra ilgili 30 test de geçti. Buna paralel HTTP idempotency, ortak kaynak ortalaması, silinen aktör/ödev referansı ve eski şablon uyumluluğu dahildir. Ayrı eşzamanlılık paketi de **4/4 başarılı**.
- Yeni sağlayıcı belirsizliği/rate-limit testleri **3/3 başarılı**.
- Telefon 390 px / tablet 768 px / PC 1440 px, tek batch ve full refetch olmaması, önizleme retry, plan/rapor gerçek print PDF, öğrenci/kitap yanıt yarışı belirsiz teslimde açık alıcı seçimi ve tek görev not/sıfırlamasında refetch olmaması: **9/9 Chromium testi başarılı**; dar ekranda yatay taşma kontrol edildi.
- TypeScript `npx tsc --noEmit --pretty false`: başarılı.
- Üretim frontend derlemesi `npm run build`: başarılı.
- Değişen temel ödev dosyalarına hedefli lint: başarılı; mevcut `removeContent` hook dependency uyarısı var.
- `makemigrations assignment_manual --check --dry-run`: son durumda eksik migration yok. 0021 ve 0022 test veritabanında uygulandı. Test ayarlarının normal DB adı mevcut olmadığından migration-history kontrolü uyarı verdi; test runner kendi izole test DB'sine 0021 ve 0022'yi uygulayarak çalıştı. Global autodetector ayrıca kapsam dışı `academic` ve `yedekleme` alan değişiklikleri bildiriyor; onlar için migration oluşturulmadı.
- Gerçek Meta gönderimi, canlı webhook/hat doğrulaması, gerçek Redis/Celery servis kesme deneyi ve üretim yük testi: **çalıştırılmadı**. Bunlar mock/test verisiyle kapsandı; gerçek servis deneyi staging'de ayrıca yapılmalı.

Tekrar çalıştırma:

```bash
cd backend
DJANGO_ENV=test ./venv/bin/python manage.py test \
  apps.coaching.assignment_manual.tests apps.communication.tests apps.student_resources.tests \
  --testrunner=config.offline_test_runner.OfflineLmsTestRunner --keepdb --noinput
```

```bash
cd frontend
npx playwright test e2e/homework-reliability.spec.ts --workers=1 --output=/private/tmp/lms-homework-e2e
npx tsc --noEmit --pretty false
npm run build
```

## E. Kalan sınırlar ve riskler

1. Meta POST sonrası yanıt kaybolursa uzak teslim için kesin exactly-once garantisi yoktur. Bu durum FAILED kodu altında belirsiz açıklamasıyla saklanır, iş/alıcı görünümünde UNKNOWN olarak gösterilir ve otomatik yeniden gönderilmez. Operatörün bilinçli yeniden göndermesi yine çift teslim oluşturabilir; önce iletişim/webhook geçmişi uzlaştırılmalıdır.
2. Kalıcı defter bayrağı kapalıyken asenkron PDF ve oluşturma idempotency garantileri aktif değildir. Flag açılmadan üretim için bu sorunların tümünün çözüldüğü söylenemez.
3. Celery/broker yokken `process_assignment_jobs` ve `process_communication_queue` cron'ları çalışmıyorsa kayıtlar güvenle bekler; kendiliğinden teslim olmaz. HTTP içinde genel kuyruk tüketimi yapılmaz.
4. PDF kapasitesi Python süreci başına iki URL render ile sınırlıdır. Worker sayısı/concurrency ve toplam bellek staging'de ölçülmeli; bu limit sistem geneli tek bir kota değildir. Cron'un `--max-seconds` değeri işler arasında kabul bütçesidir; çalışan tek render'ın hard timeout'unu kısaltmaz.
5. Raporun yaşam boyu toplamları için öğrenci tarihçesi hâlâ okunur. Sorgu tekrarları azaltıldı; çok yıllı büyük veri için üretim EXPLAIN/bellek ölçümü ve gerekirse ayrıca bir özetleme tasarımı gerekir. Ölçülmemiş indeks eklenmedi.
6. Önizlemede şablon kontrol sorguları sabittir; alıcı geçmişi hâlâ alıcı başına okunur. Canlı mesaj tablosu EXPLAIN ölçümü yapılmadan rastgele indeks eklenmedi.
7. Toplu kontrol sınırı 200, toplu oluşturma sınırı istek başına 50 öğrencidir. Daha büyük oluşturma frontend'de parçalara bölünür. Her model save/signal korunur; INSERT sayısının sıfırlandığı iddia edilmez.
8. Mevcut kurum/şube/rol filtreleri korunup regresyonlarda çalıştırıldı; kaynak/rapor modellerine bu çalışmada yeni eğitim yılı alanı veya farklı bir kapsam kuralı eklenmedi.
9. Önceden bulunan üç katalog testi ve global migration drift'i kapsam dışında kaldı. Geniş suite tamamen yeşil değildir.

## F. Manuel yayına alma ve geri dönüş

**Bu adımlar çalıştırılmadı; üretim onayı gerektirir.**

1. Staging'de aynı commit ve yeni worker kodunu hazırlayın. Başlangıçta `ASSIGNMENT_OPERATION_LEDGER_ENABLED=False` tutun. Mevcut yedekleme prosedürünü kullanın.
2. Onaylı bakım adımında `assignment_manual.0021` ve ardından `0022_operation_history_references` migration'larını uygulayın. 0021 yeni boş tablo/unique index oluşturur; 0022 yalnız bu yeni tablonun referanslarını nullable/SET_NULL yapar. Mevcut öğrenci/mesaj/ödev verisini dönüştürmez. FK DDL kısa süreli kilit gerektirebileceğinden düşük trafik seçin.
3. Mevcut Celery worker'ın `assignment_manual.process_operation` görevini keşfettiğini doğrulayın. Worker ve web kısa süre farklı sürümdeyken bayrak kapalı kalmalı. PDF işçisinin concurrency/belleğini staging ölçümüyle sınırlandırın.
4. Redis/Celery olsa da kalıcı kayıt kurtarma cron'unu hazırlayın. Mevcut `process_communication_queue` cron'u korunmalı. Örnek yeni fallback, backend dizininden uygun production ortamıyla dakikada bir: `python manage.py process_assignment_jobs --limit 10 --max-seconds 50`.
5. Sentetik staging öğrenci/veli ve mock/sandbox hat ile iş kabulü → PDF → Message/Queue → webhook durumlarını doğrulayın. Plan ve rapor PDF alanlarını mevcut belgelerle görsel olarak karşılaştırın.
6. Manuel olarak `ASSIGNMENT_OPERATION_LEDGER_ENABLED=True` açın; capabilities/önizleme yanıtında true olduğunu ve frontend'in yeni akışı kullandığını doğrulayın. Sayfa yenilemesiyle eski açık oturumları geçirin.
7. İzlenecekler: notify-preview SQL/yazma sayısı, PENDING/PROCESSING iş yaşı, FAILED iş oranı, PDF aşama süreleri ve hard timeout, Message PENDING/SENDING yaşı, belirsiz sağlayıcı sonuçları, 429, 502/503, worker/thread doluluğu, CPU/RSS, rapor ve dashboard p50/p95.
8. Rollback'te önce ilgili gönderim/kayıt trafiğini operasyonel olarak durdurun; bayrak yalnız yeni defter kabulünü kapatır, eski API yolunu engellemez. Yeni web/worker'da daha önce kabul edilmiş işleri tamamlayın veya kontrollü durdurun; tek işlemi iki sistemde yeniden oluşturmayın. Kod geri alınabilir, fakat **işlem tablosunu ve iş kayıtlarını rollback sırasında silmeyin**. Yeni tablo eski kodla yan yana durabilir. Migration geri alma ancak kuyruk boş, kayıt/artifact saklama kararı verilmiş ve ayrıca onaylanmışsa değerlendirilir. 0022 sonrası silinmiş aktöre ait NULL referanslar varsa eski NOT NULL kısıtına otomatik dönüş yapılmamalıdır; eski uygulama kodu yeni tablo yerinde bırakılarak çalışabilir.

Üretimde deploy, migration, servis restart veya gerçek öğrenci/veli verisiyle test yapılmadı.
