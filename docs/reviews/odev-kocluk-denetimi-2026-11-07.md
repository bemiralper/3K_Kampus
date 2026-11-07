# Ödev verme, kontrol ve koçluk bağlantıları denetimi — 7 Kasım 2026

> Bu belge düzeltme öncesi incelemeyi kaydeder. Uygulanan değişiklikler ve son test sonuçları için [düzeltme raporuna](odev-kocluk-duzeltmeler-2026-11-07.md) bakın.

## Sonuç ve kapsam

Normal akışların önemli bölümü çalışıyor; bütün bağlantılar ve yetki kapıları için “sorunsuz” sonucu verilemez. En önemli açıklar standart ders/görev CRUD yolları, koçluk hizmetinin kaldırılması ve koç uygunluğu sorgusunda.

İncelenen zincir: admin/koç ödev verme → öğrenci ve kitap seçimi → içerik/kota/taslak/paket → atama → kontrol/toplu kontrol/sıfırlama/not → rapor/PDF → bildirim önizleme/kuyruk; koç atama/değiştirme/sonlandırma; sözleşme hizmet erişim senkronu. Ortak React bileşenleri, API yardımcıları, Django router/view/serializer/model/servisleri ve ilgili testler incelendi.

Canlı sunucuya giriş, gerçek öğrenci verisinde işlem, Meta gönderimi, cron/Redis/Celery servis kontrolü yapılmadı. Safari motoru çalıştırılmadı; tarayıcı testleri Chromium ve sentetik API verileriyle yapıldı. Kodun her satırının bütün olası durumlarda çalıştığı iddia edilmez. Uygulama kodu değiştirilmedi.

## Test kanıtı

- İlgili mevcut backend paketleri: **304/304 başarılı**. Ödev, çalışma programı, öğrenci kaynakları, koç değişikliği/atama/görünürlük/şube, hizmet uygunluğu ve sözleşme erişim senkronu kapsandı. Dış HTTP, `OfflineLmsTestRunner` ile engellendi.
- Mevcut `frontend/e2e/homework-reliability.spec.ts`: **9/9 başarılı**. 390/768/1440 px toplu kontrol; önizleme yeniden deneme; plan/rapor gerçek print bileşenlerinden PDF; gecikmiş öğrenci/kitap yanıtı; belirsiz teslimde alıcı seçimi; not/sıfırlama işlemlerinde gereksiz detay ağacının yüklenmemesi.
- Ayrı geçici denetim betiği: `/tmp/lms_homework_audit.py`. Aşağıdaki **dokuz olumsuz davranışı** izole test veritabanında doğrular. Bu testlerde başarılı assertion, uygulamanın doğru çalıştığı anlamına gelmez; sorunlu mevcut davranışın tekrar üretildiği anlamına gelir.
- Ana ödev API rotaları Django router ile kontrol edildi. Standart not yolu `evaluation_note/` şeklindedir; tireli `evaluation-note/` geçerli değildir ve istemci hatası olarak raporlanmamıştır. Admin/koç verme, liste, detay, rapor ve paket sayfa dosyaları mevcut.

## P1 — Önce düzeltilmesi gerekenler

### 1. Kontrol kilidi standart görev API'sinden aşılabiliyor; özet değerler bayat kalıyor

Kaynak: `backend/apps/coaching/assignment_manual/views.py:2241`, `serializers.py:18`.

Özel `update_task_status`, `reset_task_status`, `evaluation_note` işlemleri kilidi kontrol ediyor. Ancak ViewSet, ModelViewSet'in standart PATCH/PUT/DELETE yollarını da açıyor. Bu yollar aynı kilit kontrolünü, ortak üst kayıt kilidini ve tamamlanma hesaplamasını uygulamıyor.

Doğrulama: kontrol günü geçmiş/değerlendirilmiş görevde normal koç ile PATCH **200** döndü, görev PENDING/%0 oldu; ödevin toplamı **%100 kaldı**. Aynı kilitli görevde DELETE **204** döndü ve görev fiziksel silindi. Ders bloğunun standart silme yolu da aynı yapısal riski taşıyor.

Sonuç: değerlendirme kilidi, rapor yüzdeleri ve silme geçmişi güvenilirliğini kaybedebilir. Çözüm: ihtiyaç olmayan standart yazma rotalarını kapatmak; gerekli olanları tek yetki/kilit/doğrulama/hesaplama servisine bağlamak.

### 2. Başka öğrencinin ödevine standart POST ile görev eklenebiliyor

Kaynak: `assignment_manual/views.py:2199`, `:2241`; `serializers.py:18`, `:106`.

Oluşturmada parent `lesson_block` veya `assignment` kimliği serializer tarafından genel queryset üzerinden çözülüyor. Var olan nesneye erişimde çalışan `get_object()` kapısı, POST sırasında çağrılmıyor. Permission yalnız IsAuthenticated.

Doğrulama: kendisine ait olmayan öğrencinin ders bloğu kimliğiyle görev POST eden kullanıcı **201** aldı. Arayüzde düğme görünmemesi bu API açığını kapatmaz. Parent ilişkisini değiştiren standart güncellemeler de aynı kapsamda denetlenmeli.

Çözüm: parent ilişkisini kurum/şube/rol/aktif koç atamasıyla doğrulamak; kapalı/tamamlanmış/silinmiş ödevlerde yazmayı engellemek.

### 3. Grup dersi sözleşmesi, koçluk uygunluğu sorgusunu bozuyor

Kaynak: `backend/apps/coaching/services/eligibility.py:112`; `backend/apps/ogrenci_kayit/application/services.py:214`.

`resolve_grup_dersi_inclusions()` üç liste döndürüyor: ek hizmet, deneme, yayın. Çağıran koçluk servisi iki değişkene açıyor: `dahil_ids, _ = ...`.

Doğrulama: aktif grup dersi sözleşmesi bulunan kapsamda `get_kocluk_ogrenci_ids()` → **ValueError: too many values to unpack (expected 2)**. Koça atanabilir öğrenci listesi ve toplu atama bu servisi çağırıyor; etkilenen kapsamda 500 üretme riski doğrudan bu bağlantıdan kaynaklanıyor.

Çözüm: üçlü dönüş sözleşmesini düzeltmek; ardından koçluk uygunluğunu canlı paket kataloğu yerine sözleşmenin sabitlenmiş hizmet kapsamıyla tutarlı yapmak. İkinci nokta kod incelemesi bulgusudur; mevcut çalışma anında önce unpack hatası oluşuyor.

### 4. Sözleşmeden koçluk kaldırılınca koç ataması ve erişim açık kalabiliyor

Kaynak: `backend/apps/odeme_takip/application/services/sozlesme_erisim_sync.py`; `backend/apps/coaching/services/coach_student_visibility.py`; `coach_access.py`.

Hizmet senkronu koçluk OgrenciEkHizmet satırını kapatıyor. Fakat görünürlük sorgusu güncel koçluk hakkını aramıyor: aktif öğrenci, aktif kayıt ve iptal edilmemiş başka sözleşme kalması görünürlük için yetebiliyor.

Doğrulama: koçluk+kütüphane sözleşmesinden koçluk çıkarıldı. Uygunluk kümesinden öğrenci düştü; mevcut birincil atama kapanmadı ve `get_active_coach_student_ids()` öğrenciyi döndürmeye devam etti. Bu, yeni atamaya uygunluk ile mevcut koç erişiminin farklı sonuç vermesi demek.

Çözüm: son koçluk hakkının kaybolmasını yıl/kapsam bazında senkronize etmek. Başka geçerli sözleşmeden aynı hak sürüyorsa atama korunmalı; geçmiş ödevler silinmemeli. Hizmet yeniden eklenince otomatik koç geri açılacak mı yoksa manuel atama mı gerekecek, açık politika olmalı.

### 5. Koç ataması sonlanan eski koç ödevleri okumaya devam edebiliyor

Kaynak: `backend/apps/coaching/services/coach_access.py`, `filter_manual_assignments()` ve `filter_by_assignment_scope()`.

Öğrenci kapsamı boşalsa da `Q(coach=user)` alternatifi eski sahiplik üzerinden erişim bırakıyor.

Doğrulama: atama sonlandırılınca `user_can_access_student()` false oldu; eski koçun ödevi ise ödev queryset'inde kaldı. Bazı işlem rotaları öğrenci erişimini ayrıca kontrol ettiği için “ödev görünüyor ama işlem yapılamıyor” tutarsızlığı da oluşuyor.

Doğrudan koç değişikliğinde ilgili eski koçun ödevleri yeni koça aktarılıyor; bu normal akış testleri geçti. Açık özellikle atama kaldırma/hizmet kapanma ve devredilmemiş eski sahiplik durumlarında.

Çözüm: geçmiş okuma hakkını bilinçli iş kuralına bağlamak; güncel işlem hakları ile geçmiş görüntülemeyi açıkça ayırmak.

### 6. Koç değişikliğinde yeni koçun kurum/şube eşleşmesi doğrulanmıyor

Kaynak: `backend/apps/coaching/api/serializers.py:327`; `api/views.py:821`; `services/coach_change.py:189`.

API öğrencinin kapsamını kontrol ediyor; yeni koç için aktiflik/varlık/kapasite kontrolü var. Öğrenci ile yeni koçun kurum/şube eşleşmesi için karşılık gelen kontrol yok.

Doğrulama: servis aynı kurumun farklı şubesindeki koçu kabul etti. Kurumlar arası eşleşmeyi de önleyen açık bir servis şartı bulunmuyor; bu ikinci durum ayrıca çalıştırılmadı.

Çözüm: kurum/şube eşleşmesi, `is_coach`, öğrenci aktifliği ve hizmet uygunluğunu sunucu tarafında doğrulamak. Şubeler arası koçluk desteklenecekse açık yetki/atanabilir şube tanımı kullanılmalı.

## P2 — Kapsam, gösterim ve işletim sorunları

### 7. Alt görev listeleri ve yan menü sayacı seçili şube ile tutarsız

Kaynak: `assignment_manual/views.py:2206`, `:2248`, `:796`.

Görev/ders liste sorgularında kurum filtresi var; seçili şube filtresi yok. Nesne detayındaki şube kontrolü listeyi korumuyor.

Doğrulama: yönetici, seçili şubeden farklı şubenin görevini liste yanıtında aldı. Ayrı testte yalnız diğer şubede bugün kontrol edilecek ödev varken liste istatistiği **0**, yan menü sayacı **1** döndü.

Ekran görüntüsündeki **Kontrol günü 17 / menü 27** farkını açıklayabilecek doğrulanmış bir kapsam farkıdır. Canlı farkın kesin nedeni ayrıca ölçülmedi; önbellek/yenileme zamanları da incelenmeli.

### 8. Sıralama bütün ödevlerde değil, mevcut 50 satırda çalışıyor

Kaynak: `frontend/components/odev/OdevKontrolListClient.tsx:301`; `assignment_manual/views.py:396`.

Sunucu sayfayı en yeni oluşturulma sırasıyla seçiyor; frontend öğrenci, kontrol tarihi ve ilerleme sıralamasını yalnız o sayfanın içinde yapıyor. Bugün kontrol edilecekleri öne alma da aynı 50 satırla sınırlı. 1183 kayıt için “Öğrenci” veya “Kontrol tarihi” seçmek bütün listede beklenen sıralamayı sağlamaz.

Çözüm: sıralama parametresi sunucuya gitmeli ve sayfalama öncesinde uygulanmalı; eşitliklerde ID gibi sabit ikinci anahtar kullanılmalı.

### 9. Aktif eğitim yılı, ödev geçmişi ve hizmet geçerliliği için tek kapsam kuralı yok

Ödev modeli/liste filtresi, hizmet hakkındaki yıl filtresiyle aynı yapıda değil. Üst bardaki yıl değişince eski ödevlerin kalması mümkün. Bu durum tek başına hata ilan edilmedi: ödev geçmişi ömür boyu gösterilecekse arayüz bunu açıkça söylemeli; yıllık liste bekleniyorsa model/sorgu tasarımı gerekir.

Dondurulmuş/tamamlanmış sözleşmeler mevcut koçluk uygunluğu servisinde hak veren durumlara dahil. Tarih aralığı ve dondurma davranışı ürün kuralı olarak ayrıca karara bağlanmalı.

### 10. Bildirim ve idempotency özelliklerinin canlıda etkinliği doğrulanmadı

Kaynak: `backend/config/settings/base.py:67`; `assignment_manual/views.py:2070`; `frontend/components/odev/OdevVerWizard.tsx:1467`.

`ASSIGNMENT_OPERATION_LEDGER_ENABLED` varsayılanı false. Açıkken kalıcı iş/idempotency/toplu oluşturma yolu, kapalıyken eski oluşturma ve senkron PDF gönderim yolu kullanılıyor. Dolayısıyla kodun bulunması, canlı ortamda aynı garantilerin aktif olduğu anlamına gelmez.

Celery yoksa `process_assignment_jobs` ve `process_communication_queue` işçilerinin cron üzerinden çalışması gerekir. Gerçek teslim için Meta yapılandırması/webhook ayrıca gerekli. Yerel testte bunların gerçek servis durumu veya WhatsApp teslimi kanıtlanmadı.

Ek kod bulguları: rutin kota güncellemesi hataları frontend'de sessizce yutuluyor; önceki bildirim sayısı son 15 kayıtla sınırlı. Ana ödev kaydı başarılıyken yan işlem başarısızlığı kullanıcıya açıkça sunulmalı.

## Çalıştığı doğrulananlar ve sınırlar

- Normal birincil koç değişikliği: eski atama kapanması, yeni atama ve ödev/program/görüşme/kaynak devri için mevcut testler geçti.
- Sözleşme erişim satırlarının açılması/kapanması, tekrar senkronun mükerrer satır açmaması ve kapsama ilişkin mevcut testler geçti. Yukarıdaki koç atamasını kapatma eksikliği bu başarılı sonuçlardan ayrıdır.
- Özel ödev kontrol rotalarında tamamlanma yüzdesi, toplu işlem, kontrol kilidi, sıfırlama ve not akışları mevcut testlerde başarılı.
- Önizleme tekrar deneme, alıcı seçimi, plan/rapor print bileşenlerinin PDF çıktısı ve mobil taşma testleri başarılı.
- Başarılı testler, standart CRUD ve hizmet/koç bağlantılarındaki açıkları kapsamadığı için sistemin bütünü için garanti değildir.

## Önerilen düzeltme sırası

1. Ders/görev standart yazma rotalarını kapat veya ortak erişim/kilit/hesaplama servisine al.
2. Grup dersi üçlü dönüş uyumsuzluğunu düzelt; uygunluk sorgusunu sözleşme kapsamıyla birleştir.
3. Son koçluk hakkı kaybında atamayı kapat; eski koç erişimini ve yeniden ekleme politikasını düzenle.
4. Yeni koçun kurum/şube ve hizmet uygunluğunu doğrula; atama/devri tek transaction içinde koru.
5. Şube kapsamını listeler/sayaçlarda eşitle; sıralamayı sunucuya taşı.
6. Staging'de gerçek worker, özellik bayrağı, PDF ve Meta sandbox zincirini doğrula.

Bu rapor inceleme sonucudur; düzeltme, migration, deploy veya canlı veri onarımı yapılmadı.
