# Koçluk / ödev akışları incelemesi — 3 Kasım 2026

Bu dosya değişiklik öncesi bulguları kaydeder. Uygulanan düzeltmeler, ölçümler,
test sonuçları, kapalı özellik bayrağı ve manuel yayın planı için
[uygulama raporuna](kocluk-odev-iyilestirme-uygulama.md) bakın.

## Kapsam ve kanıt sınırı

Koç portalı oturum kontrolü, dashboard, ortak ödev oluşturma/kontrol/detay/rapor bileşenleri, Django manual-assignment API, alıcı önizleme, PDF üretimi ve iletişim kuyruğu kodu incelendi. Ekran görüntüsünde admin menüsü görünüyor; admin ve koç rotalarının kullandığı ortak ödev bileşenleri de kapsamdadır.

Bu bir kaynak kod incelemesidir. Canlı sunucuya giriş yapılmadı; canlı SQL planı, ağ kaydı, CPU/bellek ve Gunicorn/Celery durumu ölçülmedi. Dolayısıyla aşağıdaki kod davranışları doğrulanmıştır; bunların canlı gecikmedeki payları ölçülmesi gereken bulgulardır. Uygulama kodu değiştirilmedi, test çalıştırılmadı. Önceden mevcut öğretmen portalı değişikliklerine dokunulmadı.

Öncelikler: P1 = önce ele alınmalı; P2 = takip eden düzeltmeler. Süreler kodda tanımlı bekleme sınırlarıdır, ölçülmüş yanıt süreleri değildir.

## Alıcılar yükleniyor / WhatsApp önizleme

1. **P1 — Önizleme okuma işlemi ağır şablon kurulumunu tetikliyor.** `assignment_template_seed.py:110` içindeki `get_pdf_message_template`, her çağrıda dört rol için `ensure_assignment_pdf_templates` çalıştırıyor. `notification_service.py:253` ve devamında her veli ve öğrenci için mesaj oluşturulduğundan bu iş tekrarlanıyor. Her rol şube bulma, kategori hazırlama, şablon ve config sorguları yapıyor. Önizleme maliyeti yalnızca telefon listesi kadar değil. Kurulumu migration/kurum hazırlama adımına taşı; önizlemede salt okuma ve istek içi ortak sonuç kullan.

2. **P1 — Şablon okumak config'e tekrar tekrar UPDATE yazıyor.** `assignment_template_roles.py:89` içindeki `set_config_template`, değer aynı olsa da `save` ediyor; `ensure_role_template` bunu her rol için çağırıyor. V veli için yalnızca bu zincirde normal başarılı akışta 4×(V+1) config kaydetme çağrısı oluşuyor; diğer sorgular buna dahil değil. Eşzamanlı modal açılışları aynı kurum config satırında bekleşebilir. Değişmediyse yazma; okuma yolundan yazmayı kaldır.

3. **P1 — Önizleme özel şablon eşlemesini değiştirebiliyor.** Aynı kurulum zinciri varsayılan rol şablonunu koşulsuz config alanına bağlıyor. Önceden seçilmiş başka bir metin şablonu üzerine varsayılan şablon yazılabilir; ayrıca pasif varsayılan şablon tekrar aktif ediliyor (`assignment_template_seed.py:75`). Varsayılanı yalnızca eksik config için kur; kullanıcının seçimini/pasifleştirmesini koru.

4. **P2 — Normal isteklerde tablo varlığı veritabanından keşfediliyor.** `_config_table_available` (`assignment_template_roles.py:65`) `connection.introspection.table_names()` çalıştırıyor; şablon/config yardımcıları bunu tekrar çağırıyor. Migration uyumluluğu kontrolü yoğun önizleme yoluna taşınmış. Şema durumunu başlangıçta kontrol et veya kontrollü önbellekle.

5. **P2 — Önizleme aynı ödevi iki ayrı yoldan yüklüyor.** `views.py:1807` önce `get_object()` ile ders/görev ağacını getiriyor; servis `notification_service.py:233` içinde `_get_assignment` ile yeniden getiriyor. Telefon/şablon önizlemesi için kullanılmayan görev ilişkileri de yükleniyor. Yetki kontrolü yapılmış nesneyi servise aktar; önizlemeye özel dar queryset kullan.

6. **P2 — Gönderim geçmişi her alıcı için ayrı sorgu.** `notification_service.py:202` her alıcı için Message sorguluyor. Kaynak kodundaki Message indekslerinde `source_module + source_ref_id` indeksi yok (`communication/domain/models.py:1134`); canlı DB'de ek indeks bulunup bulunmadığı kontrol edilmeli. Tüm alıcı geçmişlerini birlikte çek; EXPLAIN ile uygun indeksi doğrula.

7. **P2 — Geçmiş sayacı gerçek toplamı göstermiyor.** Geçmiş yalnızca son 15 kayıt, `send_count=len(history)` (`notification_service.py:225,278`). 16 veya daha fazla kayıt da 15 kez görünür. Ayrıca başarısız/kuyrukta mesajlar da bu sayıya dahildir. Gerçek toplamı ayrı hesapla veya 'son 15 kayıt' de; durumları ayır.

8. **P2 — Önizleme hatasından geri dönüş yeniden yüklemiyor.** Modalın 'Geri dön' düğmesi yalnızca `setError("")` yapıyor (`AssignmentNotifySendModal.tsx:279`). İlk önizleme başarısızsa boş alıcı ekranına dönülüyor. Aynı bileşende fetch için süre sınırı ve AbortController da yok; kapatmak yalnızca state güncellemesini engelliyor. Gerçek yeniden dene eylemi, iptal ve sonlu bekleme ekle.

9. **P2 — Önizlemenin şablon kapsamı gerçek gönderimden farklı.** `notification_service.py:321` Meta şablonunu `sube_id` vermeden çözüyor; gerçek `dispatch_event` öğrenci şubesini alıyor (`:367,397`). Şubeye özgü eşlemelerde modalın gösterdiği şablon/gönderim modu gerçekle uyuşmayabilir. İki yolda aynı çözümleme bağlamını kullan.

## PDF ve mesaj gönderimi

10. **P1 — PDF üretimi HTTP isteğini uzun süre meşgul ediyor.** `views.py:1953` içindeki gönderim, Playwright PDF üretimini cevap dönmeden yapıyor. `report_pdf_service.py:21` React print rotasına gidiyor; print bileşeni yeniden API çağırıyor (`OdevPlanPrintClient.tsx:35`). Zincir: gönderim API → Chromium → Next print → API proxy → Django. Kapasite daraldığında iç API isteği de aynı backend kapasitesini bekleyebilir. PDF işini kalıcı arka plan görevi yap; istemciye iş kimliği dön.

11. **P1 — Kuyruk transaction tamamlanmadan başlatılıyor.** `AssignmentNotificationService.send` `@transaction.atomic` altında (`notification_service.py:402`); çıkmadan `dispatch_process_outbound_queue()` çağrılıyor. Celery worker veya ayrı DB bağlantısı henüz commit edilmemiş mesajı göremeyebilir. Aynı projede bulunan `dispatch_outbound_queue_after_commit` benzeri commit sonrası başlatmayı kullan (`communication/application/celery_dispatch.py:64`).

12. **P1 — Celery yoksa bu gönderim bütün bir kuyruk batch'ini aynı istekte işliyor.** Çağrı `background=True` vermiyor. `celery_dispatch.py:18` varsayılanı senkron; `outbound_processor.py:848` varsayılan 20 kayıt işliyor ve yalnız bu ödeve filtrelemiyor. Kullanıcı başka bekleyen mesajların ağ/Meta işlemlerini de bekleyebilir. Commit sonrası bağımsız işçiyle çalıştır; işlem kimliği ve teslim durumunu takip et.

13. **P1 — Kuyruğa alma, gönderildi diye sunuluyor.** Servis dispatch sonucuna göre `sent` artırıyor, sonrasında kuyruk işlem sonucunu yanıta bağlamıyor; kuyruk dispatch hatası da sessizce geçiliyor (`notification_service.py:558`). `AssignmentNotifySendModal.tsx:37` durum ne olursa olsun 'gönderildi' diyor. Kuyruğa alındı, sağlayıcıya gönderildi, teslim edildi ve başarısız durumlarını ayrı göster.

14. **P1 — Belirsiz sonuçtan sonra tekrar gönderim mükerrer mesaj üretebilir.** `views.py:2040` yorumunda yeniden gönderimin bilerek engellenmediği belirtiliyor. Ağ kesildiğinde ilk isteğin başarıyla kuyruğa alınıp alınmadığı bilinmeden ikinci tıklama yeni gönderim oluşturabilir. Bilinçli yeniden gönderme korunmalı, aynı kullanıcı eyleminin tekrarı idempotency anahtarıyla birleştirilmeli.

15. **P2 — Geçersiz gönderim bile önce pahalı PDF üretimini yapıyor.** `notify_send`, servis `preview` doğrulamasından önce render ediyor (`views.py:2000`). Taslak/tamamlanmamış rapor veya gönderilebilir alıcısı olmayan istek PDF maliyetini ödeyip sonra reddedilebilir. Önce durum, kapsam ve seçili alıcıları doğrula.

16. **P2 — Her PDF için yeni Chromium açılıyor; indirme ve gönderme çıktıyı paylaşmıyor.** `html_to_pdf.py:229` her çağrıda tarayıcı başlatıp kapatıyor; plan/rapor endpoint'lerinde çıktı önbelleği yok. Aynı ödev için ardışık indirme/gönderme yeniden render ediyor. Ödev sürümü, rapor bağımlılıkları ve yön bilgisiyle güvenli çıktı önbelleği; sınırlı eşzamanlı render kapasitesi uygula.

17. **P2 — Print hatası asıl nedeni göstermeden uzun süre bekletiyor.** `html_to_pdf.py:234` navigasyon için 90 saniye, ardından hazır selector için ayrı 90 saniye sınır veriyor. `OdevPlanPrintClient.tsx:65` hata durumunda hazır işareti üretmiyor; renderer hata metnini okumadan selector timeout bekliyor. Ayrı hata işareti, HTTP yanıt kontrolü ve toplam süre bütçesi ekle. Bu, her isteğin 180 saniye sürdüğü anlamına gelmez.

18. **P2 — Gönderim aşaması gerçeği yansıtmıyor.** Modal tek kez 'PDF hazırlanıyor' diyor, şablon çözümleme ve kuyruk işlemleri boyunca aynı yazı kalıyor (`AssignmentNotifySendModal.tsx:157`). PDF, kuyruğa alma ve teslim aşamalarını iş durumu üzerinden göster.

## Portal girişi, liste ve rapor açılışı

19. **P1 — Dashboard ihtiyaç fazlası ödev verisi indiriyor.** `coach/dashboard/page.tsx:100` sayfalama olmadan tüm geciken ödevleri çekip tarayıcıda ilk 10'u alıyor (`:128`). Backend sayfa parametresi yoksa sınırsız dönüyor (`views.py:411`) ve ders/görev ilişkilerini de yüklüyor. Sayfalı, dar bir özet endpoint'i kullan.

20. **P2 — Dashboard birbirinden bağımsız beş sonucu birlikte bekliyor.** Aynı `loadOps` içinde beş çağrı `Promise.all` ile ortak yükleme durumuna bağlı (`dashboard/page.tsx:98`). En yavaş çağrı diğer operasyon verilerinin state'e yazılmasını da geciktiriyor. Kartları bağımsız yükle; görünmeyen sekmenin ağır verisini gerektiğinde çek. Menü rozeti de ayrıca aynı ödev rozetini istiyor (`useCoachNavBadges.ts:39`); mevcut hook kendi aboneleri arasında birleştirme yapıyor fakat dashboard çağrısını paylaşmıyor.

21. **P1 — Liste ve istatistik okuması aynı kurum için tekrar tekrar UPDATE çalıştırıyor.** Liste ve stats paralel çağrılıyor (`OdevKontrolListClient.tsx:231`); her ikisi `refresh_manual_assignment_overdue` çalıştırıyor (`views.py:403,625`). Yardımcı üç UPDATE deniyor (`student_resources/services/overdue_status.py:29`). Dashboard ve öğrenci kontrol uyarıları gibi sayfasız liste çağrıları da aynı işe giriyor. Gecikme güncellemesini planlı işe al veya kurum/gün bazında güvenli şekilde birleştir.

22. **P2 — Stats sayacı tek sorgu yerine çok sayıda COUNT çalıştırıyor.** `views.py:639–662` her durum için ayrı count yapıyor. Tek koşullu aggregate ile hesapla. Liste serializer'ındaki eski sayaç N+1 problemi ise prefetch ile ele alınmış; mevcut `test_list_query_count.py` bunu kapsıyor. Bu iyileştirmeyi bozmadan özet veri hacmini azalt.

23. **P2 — Oturum ve genel API çağrılarında uygulama tarafından konan sonlu bekleme yok.** `AuthContext.tsx:141` ve `api.ts:320` fetch çağrıları varsayılan süreli abort kullanmıyor; koç layout çocukları oturum sonucunu bekliyor (`coach/layout.tsx:118`). Ayrıca GET 502/503 hem proxy hem API istemcisinde bir kez tekrarlanıyor: tek kullanıcı çağrısı dört backend denemesine kadar çıkabilir. Endpoint'e göre süre bütçesi ve tek retry katmanı belirle; kimlik kontrolünde geçici sunucu hatasını oturum kaybından ayır.

24. **P2 — Rapor görüntülemek veri yazıyor ve bütün öğrenci geçmişini hesaplıyor.** `views.py:1564` GET raporunda completion yeniden hesaplanıp kaydediliyor, kaynak ilerlemesi senkronize ediliyor; ardından öğrencinin tüm aktif, taslak olmayan ödev/görevleri yükleniyor. PDF raporu da bu yolu kullanıyor. Görüntülemeyi salt okuma yap; özetleri değişiklik sırasında güncelle, tarihçe hesaplarını sınırla/önbellekle.

## Ödev oluşturma ve kontrol etkileşimleri

25. **P1 — Toplu kontrol N ayrı POST ve N kez bütün ödev hesabı yapıyor.** `OdevKontrolDetailClient.tsx:455` tüm hedef görevleri `Promise.all` ile gönderiyor. Her endpoint bütün ödevin görevlerini yeniden sayıyor, ağırlıklı yüzde hesaplıyor ve kaynak ilerlemesini senkronize ediyor (`views.py:2238,131`). Ardından detay tekrar yükleniyor. Tek transaction içinde toplu güncelleme ve bir kez hesaplama yap.

26. **P1 — Paralel kontrol güncellemelerinde yarış riski var.** `update_task_status` görev kaydetme + ödev aggregate + ödev kaydetme dizisini ortak ödev kilidi altında yürütmüyor. Farklı istekler farklı görev snapshot'larıyla ödev yüzdesini/durumunu sonradan ezebilir. Özellikle toplu işlem bunu tetikleyebilir; canlıda oluştuğu henüz gösterilmedi. Ödev düzeyinde transaction/kilit ve kontrollü yarış testi ekle.

27. **P2 — Tek görev işaretlemesinden sonra bütün detay yeniden indiriliyor.** `OdevKontrolDetailClient.tsx:422` her başarılı kontrolden sonra `fetchAssignment` yapıyor. `ManualAssignmentDetailSerializer.get_report_summary` prefetch edilmiş görevleri kullanmayıp yeniden queryset açıyor (`serializers.py:358`). Mutasyon yanıtında güncel görev + ödev özeti dön; state'i buradan güncelle.

28. **P2 — Öğrenci/kitap değiştirirken eski yanıt yeni seçimi ezebilir.** `OdevVerWizard.tsx:640,697,708` kaynak/geçmiş/kitap yükleyicilerinde istek kimliği veya abort kontrolü yok. Hızlı A → B geçişinde geç dönen A verisi B seçiliyken gösterilebilir. Detay yüklemesinde de benzer koruma yok (`OdevKontrolDetailClient.tsx:269`); liste bileşeninde ise sequence koruması zaten var. Aynı yaklaşımı bu yükleyicilere uygula.

29. **P2 — Oluşturma ekranında gereksiz seri bekleme ve yinelenen yük var.** `OdevVerWizard.tsx:640` önce öğrenci kaynak detayını, sonra iki rutin kitap katalog çağrısını bekliyor; katalog sonuçları yalnız mevcut kaynakların metadata'sını zenginleştirmek için kullanılıyor. Çoklu öğrenci kaynak açığı kontrolü her sepet değişiminde diğer öğrencilerin tüm detaylarını yeniden çekiyor (`:414`); kontrol uyarısı her öğrencinin tüm ödevlerini istiyor (`:354`). Kaynak kimlikleri ve açık kontrol özetlerini toplu endpoint ile al, öğrenci bazında önbellekle ve yarış koruması ekle.

30. **P1 — Çoklu öğrenciye kaydetme seri; backend görevleri tek tek yazıyor.** `OdevVerWizard.tsx:1376` öğrencileri sırayla kaydediyor, her öğrenci sonrası kota isteklerini bekliyor. `_create_lessons` her içerik için ayrı SELECT ve her görev için ayrı INSERT yapıyor (`serializers.py:722,749`). Öğrenci ve görev sayısıyla süre büyüyor. İçerikleri toplu çöz, uygun yerlerde bulk_create kullan; çoklu öğrenci işini kontrollü toplu görev yap.

31. **P2 — Kaydetmenin bir kısmı başarısızsa tekrar denemek başarılı öğrencileri çoğaltabilir.** Çoklu atama döngüsü öğrenci başına bağımsız kayıt yapıyor; bazıları başarılı olsa da tekrar gönderimde başarıyla kaydedilmiş öğrenciler için kalıcı bir işlem anahtarı kullanılmıyor (`OdevVerWizard.tsx:1380`). Sonuçları öğrenci bazında koru, yalnız başarısızları yeniden dene ve sunucuda işlem anahtarı uygula.

32. **P2 — Bildirim yapılmış bayrağı teslimi ve rapor türünü doğrulamıyor.** `serializers.py:392` yalnız ödev prefix'li herhangi bir Message var mı diye bakıyor; FAILED/QUEUED veya yalnız plan mesajı, kontrol raporu hatırlatmasını yanlış etkileyebilir. Plan/rapor ve kabul/gönderim/teslim durumunu ayrı tut.

33. **P2 — Kaynak ilerlemesi geri alınırken COMPLETED durumundan çıkmıyor.** `services/progress_sync.py:57` kaynak COMPLETED ise sonraki düşük ilerlemede IN_PROGRESS'e geçirmiyor; `completed_at` de temizlenmiyor. Ödev yeniden kontrol edilip sonucu düşürüldüğünde kaynak tamamlandı görünmeye devam edebilir. Geriye geçiş kuralını açıkça uygula ve test et.

## Ek hata ve erişim bulguları

34. **P1 — Proxy oturum cookie değerlerini logluyor.** `frontend/app/api/[...path]/route.ts:281` gelen Cookie başlığını, ayrıca Set-Cookie değerlerini yazıyor. Bu performans teşhisinde gerekli olmayan oturum verisi üretir. Değerleri kaldır; request-id, rota, süre ve durum kodu logla.

35. **P2 — Legacy HTML→PDF endpoint'inde nesne erişim kontrolü eksik.** `views.py:1929` içindeki `render_report_pdf`, diğer PDF endpoint'leri gibi `get_object`/öğrenci erişimi kontrolü yapmadan gelen HTML'i render ediyor. IsAuthenticated mevcut; bu, anonim erişim demek değildir. Ancak normal nesne kapsamı ve pahalı render kullanım sınırı bu yolda atlanıyor. Ortak nesne kontrolü ve render kapasite sınırı uygula veya kullanılmayan yolu kaldır.

## Düzeltme ve doğrulama sırası

1. Önizlemeden şablon kurulumu/config yazmalarını çıkar; seçili şablonları koru. 1/2 veli ile önizleme sorgu ve UPDATE sayılarını ölç.
2. Kuyruk başlatmayı commit sonrasına taşı; Celery açık/kapalı ve çoklu bağlantı senaryolarında doğrula. Teslim durumunu yanıttan ayrı takip et.
3. PDF'yi kalıcı arka plan işine taşı; hata işareti, toplam süre bütçesi, render kapasitesi ve çıktı önbelleği ekle.
4. Toplu kontrolü tek endpoint/tek hesap yap; eşzamanlı görev güncellemeleri için transaction testi ekle.
5. Dashboard ve wizard için sayfalı/dar/toplu API, geçmiş özetleri ve öğrenci bazlı istek koruması uygula.
6. İstemci/proxy retry ve timeout politikasını birleştir; kısmi başarı ve idempotency senaryolarını doğrula.

Canlı doğrulamada ayrı ayrı oturum kontrolü, dashboard, ödev listesi/stats, detay, notify-preview, PDF render, notify-send ve kuyruk tesliminin p50/p95 süreleri; SQL sayısı/süresi; payload boyutu; worker/thread doluluğu; render CPU/belleği; 502/503 ve zaman aşımı oranları kaydedilmeli. Gunicorn'un gerçekten gthread/8 thread çalışıp çalışmadığı ve SSE kapasitesi koddan değil çalışan servis üzerinden doğrulanmalı. Mevcut kod yapısı tek başına canlı yapılandırmanın hatalı olduğunu kanıtlamaz.
