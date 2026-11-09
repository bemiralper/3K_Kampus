# Personel modülü — hata, eksik ve kullanım denetimi

## 9 Kasım 2026 — düzeltmeler canlıda

**Bu raporda doğrulanan personel kod hataları düzeltildi; backend ve ön yüz canlıya
uygulandı.** Aşağıdaki ilk denetim bulguları ve başarısız test sonuçları, düzeltme
öncesinin kaydı olarak korunmuştur.

### Uygulananlar

- Rol atamasında yetki/öncelik sınırı, kendine rol değiştirme engeli ve süper kullanıcı
  hesabını koruma eklendi. Standart öğretmen/koç görevlendirmesi, sınırlı eğitim
  izinleriyle çalışmaya devam ediyor. Rol eşitleme şifre değiştirme zorunluluğunu
  kaldırmıyor; personel düzenleme yetkisi sistem yöneticisi yetkisi vermiyor.
- Ana personel yazma uçlarındaki CSRF muafiyetleri kaldırıldı. Görevlendirmede kurum,
  branş/şube, rol, tarih aralığı ve pasif personele aktif görev doğrulamaları eklendi.
- Ortak e-posta tek başına hesap birleştirme nedeni olmaktan çıkarıldı; farklı
  merkezi kimlik/TCKN ilişkileri ve başka kurumdaki sahipsiz hesaplar korunuyor.
  Sıradan profil kaydı, yönetici tarafından kapatılmış giriş hesabını açmıyor.
- Yeni hesaplara rol atanıyor. Yeni/geçici şifreler rastgele üretiliyor; yeni hesap
  oluşturmadaki geçici şifre yetkili kullanıcıya bir kez gösteriliyor. Sıfırlama
  ekranı TCKN şifresi önermiyor; e-postası bulunan TCKN'siz personel de hesap açabiliyor.
- Bordro/avans geçmişi olan sözleşmenin silinmesi hem serviste hem koruyucu ilişkilerle
  engellendi. Avans güncelleme/silme ve eski/yeni mahsup ayları bordro kilidine uyuyor.
  Ödeme geçmişi seçili şubeyle sınırlı; geçersiz ay ve boş personel adı reddediliyor.
- Aktif sözleşmenin otomatik kaydı durumunu taslağa düşürmüyor. Para hesaplarında
  yarım kuruş sınırı da `ROUND_HALF_UP` ile diğer ücret hesaplarına uyumlu.
- Finans importu düzeltildi. Kategori, hesap ve ödeme yöntemi şube/kurum kapsamında
  doğrulanıyor; hesap/yöntem uyuşmazlığı reddediliyor. Gider şube ve eğitim yılını
  koruyor. Kalıcı `finans_gider` birebir bağı ve satır kilidi çift aktarımı engelliyor.
  Aktarım ayrıca finans yazma yetkisi gerektiriyor. Kategori seçimi de doğru şubeden geliyor.
- Seçmeli personel yedeğine sözleşme, maaş planı, mesai, ücret, bordro, avans ve madde
  tabloları eklendi; canlı registry'nin kullanıcı bayrakları korunarak kapsam **11 model** oldu.

### Ön yüz

- Personel ve görevlendirmeler şube/yıl değişiminde yeniden yükleniyor. Personel,
  görevlendirme, sözleşme ve bordro listelerinde eski yanıtın yeni bağlamı ezmesine
  karşı sıra kontrolü eklendi; eski satırlar yeni bağlamda kullanılmıyor.
- Personel düzenlemede doğum tarihi ISO değerinden korunuyor. Başarısız otomatik
  kayıt ve kayıt sırasında yeni düzenleme artık formu yanlışlıkla temiz saymıyor.
  “Kaydediliyor / Kaydedildi / Kaydedilemedi” ve tekrar dene durumu eklendi.
- Boş listeyi açmak otomatik bordro yazmıyor; liste hatası ile boş sonuç ayrıldı.
- Ödeme onayında serbest metin `prompt` yerine tarih seçicili onay penceresi var.
  Yerel gün tarihi kullanılıyor; kuruşlar gösteriliyor. “Ödendi işaretle” işleminin
  banka/kasa hareketi üretmediği açıklandı.
- Personel çekmecesine dialog tanımı, klavye odağı/geri dönüşü ve kaydedilmemiş
  değişiklikten vazgeçme onayı eklendi. Salt okuma kullanıcılarında temel yazma
  ve hesap düğmeleri devre dışı; sunucu izin kontrolleri de korunuyor.

### Son doğrulama

| Kontrol | Sonuç |
|---|---|
| İlgili backend test kümesi | **1.008 test geçti**, 49,933 saniye |
| Yeni personel regresyonları | **28 test**; ilk 22 senaryo artık gerçek API yollarında geçiyor; model aliası/iş mantığı mock'u kaldırıldı |
| Eşzamanlı finans aktarımı | İki PostgreSQL bağlantısı, tek gider; biri oluşturdu, diğeri mevcut bağlantıyı korudu |
| Ön yüzün gerçek kaynaklarıyla izole React/Chromium | **4 senaryo geçti** |
| Yerel üretim derlemesi | Başarılı; mevcut lint/Browserslist uyarıları var |
| Sunucuda ayrı dizinde üretim derlemesi | Başarılı; eski servisler derleme sırasında açık kaldı |
| Migration | `personel.0021_protect_payroll_history_and_link_expense` uygulandı |
| Kaynaklar | **19 dosyanın** son hash'leri sunucuda doğrulandı |

Bu 1.008 testlik kapsam, personel ve ilgili akademik/birebir/finans/kimlik/rol/takvim/
öğrenci testleri ile personeli ilgilendiren seçili koç erişim testleridir; raporun
ilk geniş çalıştırmasındaki tüm ölçme/OMR testlerinin düzeltildiği anlamına gelmez.

### Canlı kayıtlar ve kullanıcının seçimi

**Mevcut 13 hesabın şifresi korunmuştur.** Geçiş öncesi/sonrası, parolalar sunucudan
çıkarılmadan toplu parmak iziyle karşılaştırıldı: `existing_credentials_unchanged=true`.
Yetkili kullanıcılar yeni güvenli ekrandan tek tek sıfırlayabilir; otomatik mesaj gönderilmedi.

Doğru tarih/çalışma niyeti bilinmeyen eski kayıtlar otomatik değiştirilmedi. Salt
okunur işlemle sunucuda **0600 izinli** inceleme planına ayrıldı:

`/var/backups/lms/personel-fixes-20261109/data-review-plan.json`

Planda 2 ters tarihli görev, pasif personele bağlı 1 aktif görev ve 1 aktif sözleşme,
rolü boş 2 aktif görev var. Bunlar tekil kişi sayısı olarak toplanamaz. Plan hash'i:
`d39831983611d34912497c9f361ed096e638808471f3e520a15c585b321aa4ba`.
Kayıt kimlikleri ve tarihler sunucuda kaldı. Geçmiş bordrolar yeniden hesaplanmadı.

### Yedek ve aktarım kaydı

Kod, tam veritabanı ve önceki ön yüz derlemesi sunucuda:
`/var/backups/lms/personel-fixes-20261109/`.
Veritabanı yedeği içerik listesiyle doğrulandı. `manifest-final.json` son 19 kaynak
dosyasını; `rounding-model-before.py` son para kuralı kontrolü öncesindeki modeli saklar.

İlk paket SHA-256: `d2941bcb16218c6abc95f12ba6c90898614ae27b89f21f9b8f70928c6dd1f5aa`.
Son yuvarlama modeli SHA-256: `07724eca187dd45257315fdbef07a86564e35bf3388308396fcbead3f348af17`.
Aktarım dosya bazlı hotfix olarak yapıldı; normal Git deployundan önce çalışma
alanındaki düzeltmeler sürüm kontrolüne alınmalı. Git HEAD'in değişmesi, bu aktarımın
kanıtı olarak kullanılmamalı; hash manifesti ve migration kaydı esas alınmalı.

Tam ekran kullanıcı kabulü, bütün mobil boyutlar ve banka hareketi mutabakatı
tamamlanmış sayılmıyor. Eski kayıtların doğru tarihleri için kayıt bazlı inceleme
gerekiyor; bu belirsizlikler kod hatası kapatıldı diye gizlenmedi.

---

**Tarih:** 9 Kasım 2026, Türkiye saati. **Kapsam:** personel kaydı, kimlik, hesap/rol,
görevlendirme, sözleşme, maaş planı, puantaj, avans, ödeme, finans aktarımı,
rapor/PDF, seçmeli yedek ve ön yüz akışları.

## Sonuç

**Modül için “her şey doğru çalışıyor” denilemez.** Mevcut personel testleri geçse
de yeni sınır senaryoları kritik yetki ve veri kaybı açıklarını ortaya çıkardı.
Öncelikle kendi hesabına yönetici yetkisi verebilme ve ödenmiş bordroyu sözleşmeyle
birlikte silebilme kapatılmalı. Ön yüzde ise sessiz kayıt kaybı ve yanlış şube
verisi gösterimi öncelikli.

Bu çalışma **denetimdir**. Uygulama kodu düzeltilmedi, canlıya paket yüklenmedi,
üretim kayıtları değiştirilmedi. Önceki akademik düzeltmeler korunmuştur. Eklenen
dosyalar yalnız denetim testleri, izole tarayıcı senaryoları ve bu rapordur.

Altı temel backend/ön yüz dosyası SHA-256 ile canlı sunucuyla karşılaştırıldı;
fark bulunmadı. Bu doğrulama, raporun yalnız eski bir yerel kopyaya dayanmadığını gösterir.

## Nasıl doğrulandı?

| Kontrol | Sonuç ve anlamı |
|---|---|
| Personel mevcut testleri + önceki akademik hakediş regresyonları | **86 test geçti** |
| Personel, roller, kimlik, koçluk, finans, birebir ve akademik geniş mevcut test kümesi | **1.391 test: 1.380 başarılı, 2 başarısız, 9 hata**; ayrıntısı aşağıda |
| Yeni personel sınır senaryoları | **22 assertion başarısızlığı, 0 test kurulum hatası**; bunlar açık sorunların kanıtı |
| Gerçek React kaynaklarıyla izole Chromium senaryoları | **4 sorun yeniden üretildi** |
| Ön yüz TypeScript | `tsc --noEmit --incremental false` başarılı, çıkış 0 |
| Canlı veri | PostgreSQL `REPEATABLE READ, READ ONLY`; yalnız anonim sayaçlar alındı |

22 backend senaryosunun **19'u değiştirilmemiş uygulama yolunu** sınar. Maaş gideri
aktarımında yanlış import yürümeyi engellediği için **3 ek senaryo**, yalnız doğru
gerçek model sınıfını o import adında sağlayarak aşağıdaki akışı sınar. İş mantığı,
veritabanı ve gider kaydı işlemleri taklit edilmez. Bu üç sonuç **import düzeltildiğinde
ortaya çıkacak hatalardır**; bugünkü üretimde bu uçla çift gider oluşturulduğu iddiası değildir.

Chromium testleri uygulamanın gerçek `useSozlesmeForm`, `fetchPersoneller` ve
`openDrawer` kaynaklarını kullanır; API yanıtları sentetiktir. Tam uygulamaya giriş
yapılıp bütün sayfalara tıklanmış bir kabul testi veya görsel/mobil test olarak sunulmaz.

### Geniş test kümesindeki 11 başarısız sonuç

- **9 hata:** koçluk/optik okuma testlerinde eksik yerel `pymupdf`, `cv2` ve `numpy`
  bağımlılıkları veya bunları gerektiren OMR akışları. Bunlar personel iş kuralı hatası
  olarak sayılmadı; o yollar bu ortamda doğrulanmış değildir.
- **2 assertion hatası:** `BulkAssignDoesNotPolluteCurriculumTest.test_answer_key_get_heals_already_written_copy`
  ve `TokenNameMatchTest.test_single_first_name_does_not_match`. İkisi de koçluk/ölçme
  alanında; ikincisinde tek adla öğrenci eşleştirmesi beklenen biçimde reddedilmiyor.
  Personel bulgularına karıştırılmadı, fakat geniş test kümesi yeşil değildir.

## En yüksek öncelikli hatalar

### P0 — Personel yöneticisi kendisine sistem yöneticisi rolü verebiliyor

`personel.manage` yetkili, süper kullanıcı olmayan hesapla kendi personel kaydına
`sync-user-role` isteği gönderildi. Yönetici rolünün kodu verilince **UserRole gerçekten
o role değişti**. Çağıranın rol atama yetkisi, atayabileceği en yüksek rol veya kendisini
yükseltme sınırı kontrol edilmiyor. `create-user` yolunda da aynı rol seçme servisi kullanılıyor;
bu ikinci yol ayrıca yükseltme testiyle sınanmadı.

Kaynak: `backend/apps/personel/interfaces/views.py:1550`,
`backend/apps/personel/application/services.py:24` ve `assign_user_role_for_personel`.
Test: `test_manager_cannot_grant_self_system_admin`.

**Düzeltme:** personel düzenleme ile hesap/rol yönetimini ayrı izinler yap; atanabilir
rolleri sunucuda sınırla; kendine ve daha üst role yükseltmeyi engelle; istekteki
`role_code` ve görevlendirme rolünü aynı politikadan geçir; rol değişimlerini kaydet.

### P0 — Sözleşme silinince ödenmiş bordro da siliniyor

Ödenmiş bordrosu bulunan sözleşme silindiğinde API **204** dönüyor. Sözleşme silme
servisi engellemiyor; `AylikHakedis.sozlesme` ilişkisi `CASCADE`. Bordroyu doğrudan
silme yolundaki ödeme kilidi, üst sözleşme üzerinden atlanabiliyor.

Kaynak: `application/sozlesme_service.py:37`, `infrastructure/sozlesme_repository.py:193`,
`domain/sozlesme_models.py` sözleşme–hakediş ilişkisi.
Test: `test_contract_delete_preserves_paid_payroll`.

**Düzeltme:** bordro/avans/hakediş bağlı sözleşmeyi kalıcı silme; arşivle/feshet.
Veritabanı ilişkisinde de finansal geçmişi koruyan kısıt kullan. Ön yüzde etkilenecek
kayıtları göster; onaylı ve ödenmiş geçmişi silme düğmesiyle yok etme.

## Diğer backend ve bağlantı bulguları

| Öncelik | Bulgu / gözlenen sonuç | Kaynak veya test |
|---|---|---|
| P1 | Ana personel yazma uçlarında CSRF muafiyeti sürüyor. Tokensız, oturumlu profil güncellemesi **200** döndü. Önceki sözleşme/birebir CSRF düzeltmesi bu ayrı dosyayı kapsamıyordu. Harici uçtan uca saldırı denenmedi; SameSite tek başına CSRF politikasının yerine konmamalı. | `interfaces/views.py:349`; `test_profile_write_requires_csrf` |
| P1 | Görevlendirme güncellenirken `personel_id` başka kuruma ait kişiyle değiştirilebiliyor; **200** döndü. Mevcut görevin kurumu kontrol edilse de yeni ilişkinin kurumu kontrol edilmiyor. | `interfaces/views.py:1042`; `test_assignment_update_rejects_foreign_institution_person` |
| P1 | Aynı e-postayı kullanan farklı iki kişi aynı kullanıcı hesabına çözümleniyor. Kimlik/ad eşleşmesi olmadan e-posta yeterli görülüyor. Bu test doğrudan oturum ele geçirildiğini kanıtlamaz; yanlış hesap ilişkilendirmesini kanıtlar. | `domain/user_account.py:34`; `test_shared_email_does_not_merge_different_people_accounts` |
| P1 | Yönetici tarafından girişe kapatılmış kullanıcı, aktif personelin yalnız adresi güncellenince yeniden aktif oldu. Her personel `save` işlemi hesap aktifliğini personel aktifliğine eşitliyor. | `domain/models.py:148`; `test_saving_active_profile_does_not_reenable_admin_disabled_user` |
| P1 | Yeni personelde “kullanıcı hesabı oluştur” yolu kullanıcıyı açıyor ama `UserRole` oluşturmuyor. Diğer hesap oluşturma ucu farklı davranıyor. | `application/services.py:186`; `test_create_with_login_assigns_role` |
| P1 | Başlangıç/yenileme şifresi olarak TCKN kullanılıyor. Sentetik kullanıcıda doğrulandı; canlı sayıları aşağıda. İlk girişte değiştirme zorunluluğu bu tahmin edilebilir başlangıç sırrını güçlü yapmaz. | `application/services.py:186`, `interfaces/views.py:1450,1594`; `test_create_login_does_not_use_identity_number_as_password` |
| P1 | Aktif sözleşmenin taslak/otomatik kayıt ucu durumu **AKTIF → TASLAK** yapıyor. Böylece sözleşme aktif sözleşme sorgularından düşebilir. | `interfaces/sozlesme_views.py:316`; `test_active_contract_autosave_preserves_status` |
| P1 | Ödenmiş bordronun avansı **200** ile değiştirilebiliyor, **204** ile silinebiliyor. Bordro kilitli kaldığı için kayıt toplamı ile bordrodaki avans farklılaşıyor. Yeni avans planındaki kilit kontrolü update/delete yollarında yok. | `application/sozlesme_service.py:232,252`; `test_paid_payroll_advance_cannot_be_changed`, `...cannot_be_deleted` |
| P1 | Personel ödeme geçmişi, seçili şubeyle sınırlı değil. A şubesi bağlamında B sözleşmesinin maaş geçmişi döndü. | `interfaces/sozlesme_views.py:1170`; `test_payment_history_scoped_to_selected_branch` |
| P1 | Maaşı finansa aktarma ucu, `GiderKategorisi` sınıfını yanlış modülden import ediyor. Geçerli bordro ve kategoriyle **500 / “Finans modülü bulunamadı”** döndü. Finans uygulaması kurulu; mesaj yanlış yönlendiriyor. | `interfaces/sozlesme_views.py:1765`; `test_salary_export_endpoint_is_available` |
| P1, import sonrası | Doğru model aliası sağlanınca başka şubenin gider kategorisi kabul edildi. Hesap ve ödeme yöntemi de yalnız ID olarak yazılıyor; bunların tenant/şube doğrulaması ayrıca eklenmeli. | Aynı metot; `test_salary_expense_rejects_other_branch_category` |
| P1, import sonrası | Aynı ayın aynı bordrosu iki kez aktarıldığında **2 gider** oluşuyor. Bordro–gider kalıcı bağı/tekillik anahtarı yok. | Aynı metot; `test_salary_expense_is_idempotent` |
| P1, import sonrası | Oluşan giderin şube ve eğitim yılı **None**. Personel bordrosu şubeli/yıllı olmasına rağmen finans kaydı bu bağlamı kaybediyor. | Aynı metot; `test_salary_expense_keeps_branch_and_year` |
| P2 | Görevlendirmede başlangıç tarihi bitişten sonra olabiliyor; **200**. Canlıda da iki kayıt var. | `interfaces/views.py:836`; `test_assignment_create_rejects_inverted_dates` |
| P2 | Geçersiz tarih ve metin rol ID'si gibi istemci hataları **400 yerine 500** dönüyor. | Aynı metot; `test_assignment_create_invalid_date_is_client_error`, `test_invalid_assignment_role_is_client_error` |
| P2 | Tekil bordro oluşturma ay=13 değerini **201** ile kabul ediyor. Toplu hazırlamadaki ay doğrulaması burada uygulanmıyor. | `interfaces/sozlesme_views.py:581`; `test_payroll_rejects_month_thirteen` |
| P2 | Personel güncelleme boş adı **200** ile kabul ediyor. Formdaki doğrulama API kuralı yerine geçmiyor. | `interfaces/views.py:352`; `test_profile_patch_rejects_blank_name` |
| P2 | Seçmeli `personel.kayitlar` yedeği sözleşme/bordro/avans tablolarını kapsamıyor; çözümleyici yalnız tanımlı tabloları ve M2M'leri alıyor. **Tam veritabanı yedeği ayrı ve varsayılan olarak mevcut**; “sunucudaki bütün yedekler eksik” sonucu çıkarılmamalı. | `backup_resources.py`, `yedekleme/engine/handlers/database_table.py:46`; `test_selective_personnel_backup_includes_contracts` |

### Finans bağlantısında karıştırılmaması gereken iki işlem

“Ödendi olarak işaretle” bordro durumunu değiştiriyor. “Finansa gider kaydet” ise
gider belgesi oluşturmayı amaçlıyor; bunlar tek başına gerçek banka/kasa ödeme hareketi
değil. Brüt maaşın gider olması otomatik olarak hata değildir; vergi, kesinti, avans
ve net banka çıkışı ayrı mutabakat gerektirir. Kullanıcıya bu ayrım açık gösterilmeli.

## Ön yüzde doğrulanan düzeltme ihtiyaçları

| Öncelik | Senaryo | Gözlenen davranış / çözüm |
|---|---|---|
| P1 | Personel listesinde A şubesinden B'ye geçiş | Gerçek veri yükleme callback'i yalnız `showInactive` bağımlı. Chromium testinde seçili şube B iken A'nın satırı kaldı; istekler yalnız `['A']`. Kurum/şube/yıl ve initialized bağımlılıkları eklenmeli; eski istek iptal edilmeli ve satırlar bağlam değişince temizlenmeli. |
| P1 | Mevcut personelin düzenleme çekmecesini açma | Gerçek `openDrawer`, mevcut doğum tarihi dolu olsa bile `dogum_tarihi:''` kuruyor. Kaydetme bütün formu gönderiyor, backend boş tarihi None yapıyor. Doğum tarihine dokunmadan başka alan kaydederken tarih kaybı riski var. API ISO tarihi esas alınmalı; gösterim formatı ayrı tutulmalı. |
| P1 | Otomatik kayıt başarısız | Mock API `{success:false}` döndüğünde gerçek hook yine `dirty=false` yaptı. Kullanıcıya kaydedilmediği gösterilmiyor; çıkış uyarısı da kalkabilir. Yalnız başarılı yanıt sonrasında temiz sayılmalı. |
| P1 | Kayıt devam ederken yeni düzenleme | İlk isteğin payload'ı “first edit”; kullanıcı sonra yeni değer girdi. İlk yanıt gelince hook yeni değişikliği de temiz saydı. Sürüm/istek kimliği veya snapshot karşılaştırmasıyla yalnız gönderilen sürüm onaylanmalı; yeni sürüm tekrar kaydedilmeli. |

Kaynaklar: `frontend/app/personel/page.tsx:186,294,498`;
`frontend/app/admin/personel/sozlesmeler/hooks/useSozlesmeForm.ts:46`.
Aktif sözleşmeyi taslağa düşürme sorunu bu hook'un `buildPayload('TASLAK')`
kullanması ile backend'in durumu zorla değiştirmesinin birleşimidir.

### Kaynak incelemesinden çıkan ilave UI/UX işleri

Bunlar dört izole Chromium senaryosuna dahil edilmemiştir; ilgili kod yolu ve
tasarım gözlemidir, tam ekran kullanıcı testi sonucu değildir.

1. **Görevlendirmelerde de şube yenilemesi:** `GorevlendirmelerClient.tsx` liste callback'i
   yalnız eğitim yılına bağlı. Aynı yılda şube değişiminde eski görev ve yardımcı
   seçeneklerin kalmasını önlemek için aynı bağlam yönetimi uygulanmalı.
2. **Bordro ekranında hata ile boş liste ayrılmalı:** `PuantajClient.tsx:118` başarısız
   `success:false` yanıtlarını hata durumuna taşımıyor, `loaded=true` yapıyor. Liste
   boşsa otomatik oluşturma effect'i devreye girebiliyor. Listeyi açmakla bordro
   oluşturmak ayrılmalı; hata durumunda yazma isteği başlatılmamalı.
3. **Geciken istek eski şubeyi geri getirmemeli:** bordro ve sözleşme listelerinde
   AbortController/istek sıra numarası kullan; filtre/şube değişince eski yanıtı at.
   Yeni bağlam yüklenene kadar önceki veriden onay/ödeme düğmesi sunma.
4. **Tek ödeme akışı:** Puantaj ve Ödeme Onay ekranları benzer işlemleri farklı
   etkileşimlerle sunuyor. Birinde drawer, diğerinde `prompt('YYYY-MM-DD')` var.
   Aynı tarih seçici, özet ve onay bileşeni kullanılmalı.
5. **İşlem sonucu açık olmalı:** “Onaylandı”, “ödendi işaretlendi”, “finansa aktarıldı”
   ayrı durumlar; toplu işlemde kaçının başarılı/başarısız olduğu satır bazında gösterilmeli.
   Arka arkaya tıklamayı busy/idempotency ile engelle.
6. **Kaydetme durumları görünür olsun:** “Kaydediliyor / Kaydedildi / Kaydedilemedi”,
   son kayıt zamanı ve tekrar dene düğmesi. SPA içi sayfa değişiminde de kirli form
   koruması; yalnız `beforeunload` yenileme/sekme kapanmasını kapsar.
7. **Çekmece erişilebilirliği:** ana personel formu özel overlay/div yapısı kullanıyor.
   Odak tuzağı, odağı açan düğmeye geri verme, dialog adı ve klavye akışı ortak
   erişilebilir modal bileşenine taşınmalı. ESC/arka plana tıklamada kirli form uyarısı eklenmeli.
8. **Yetkiye uygun arayüz:** salt okuma kullanıcısına oluştur/sil/hesap/rol işlemlerini
   etkin göstermemek; backend kontrolünü koruyarak izinlerle düğmeleri eşlemek.
9. **Türkçe arama:** ana liste `toLowerCase`, bordro `toLocaleLowerCase('tr')` kullanıyor.
   I/İ/ı ve telefon normalizasyonu ortaklaştırılmalı; dışa aktarma filtresiyle ekran aynı sonucu vermeli.
10. **Hassas veri gösterimi:** TCKN ve giriş bilgilerini varsayılan görünümden ayır;
    yetkili kullanıcı bilinçli açabilsin. TCKN'yi parola olarak gösteren mevcut metinler,
    tek kullanımlık davet/aktivasyon akışı tasarlanırken birlikte değişmeli.
11. **Hata dili:** “Finans modülü bulunamadı” yerine gerçek bağlantı hatası; “Güncellendi”
    yerine hangi kaydın ve hangi ayın güncellendiği; form alanında düzeltilebilir hata.
12. **Form karmaşıklığı:** personel, görevlendirme, sözleşme ve ödeme için adım sırası
    açıklaştırılmalı. “Personel kimdir / bu yıl nerede ne görev yapar / hangi sözleşmeyle
    çalışır / bu ay ne ödenecek” ayrımı ekran başlıklarında anlatılmalı.

## Canlı veri denetimi

9 Kasım 2026 Türkiye saatiyle yapılan kesit. Veri, aktif kullanımla değişebilir.
İsim, TCKN, telefon, parola/hash, kimlik veya kişi tutarı sunucudan çıkarılmadı.
Parola eşleşmesi sunucuda hash karşılaştırmasıyla, setter olmadan ve salt okunur
işlem içinde yapıldı; giriş denenmedi, hesap veya parola değiştirilmedi.

| Sayaç | Sonuç |
|---|---:|
| Personel / aktif / pasif | 47 / 44 / 3 |
| Görevlendirme | 50 |
| Sözleşme / bordro / avans | 32 / 142 / 10 |
| Doğrudan bağlı kullanıcı hesabı | 13 |
| TCKN ile şifresi eşleşen bağlı hesap | **13** |
| Bu 13 hesap içinde şifre değiştirme zorunluluğu olmayan | **0** |
| Ters başlangıç/bitiş tarihli görevlendirme | **2** |
| Aktif görevli fakat personeli pasif | **1** |
| Aktif sözleşmeli fakat personeli pasif | **1** |
| Aktif görevlendirme, rolü boş | **2** |
| Aktif görünmesine rağmen tarih aralığı dışında görev adayı | **2** |
| Kurum/şube/merkezi kimlik ilişki uyuşmazlığı | **0** |
| Kullanıcı kurum/rol uyuşmazlığı veya rolü eksik bağlı kullanıcı | **0** |
| Aktif kullanıcıya bağlı pasif personel | **0** |
| Aynı kurumda ortak e-posta grubu adayı | **0** |
| Aktif görev tekrar grubu / silinmiş role bağlı aktif görev | **0 / 0** |
| Geçersiz bordro/avans ayı / pozitif olmayan avans | **0 / 0 / 0** |

Rolü boş görev ve tarih dışı aktif kayıt **inceleme adayıdır**; her biri kesin veri
hatası sayılamaz. Ters tarih ise doğrudan tutarsızlıktır. Aynı kayıt birden fazla
sayaçta yer alabilir; satırlar toplanarak etkilenen kişi sayısı çıkarılamaz.

## Doğru çalışan ve korunması gerekenler

- Önceki düzeltmelerin regresyonları yeşil: şube dışı sözleşme/bordro erişimi,
  ödenmiş bordroyu toplu yeniden hesaplama engeli, tarihli ders ücreti, avansın yeni
  bordroya yansıması ve eşzamanlı birebir aktarım kontrolü.
- Normal personel pasife alma, bağlı kullanıcı girişini kapatıyor; mevcut hesap
  testleri bunu doğruluyor. Sorun, ayrıca kapatılmış hesabın sıradan kayıtta açılabilmesi.
- Merkezi kimlik bağlantısı canlı personellerin tamamında mevcut; denetlenen
  personel/görev kurum ilişkilerinde mevcut ihlal çıkmadı. API sınırının eksik olması
  bugün canlıda mutlaka yanlış ilişki bulunduğu anlamına gelmez.
- Sözleşme raporu/dönem, hesaplama, serileştirme ve personel export testleri mevcut
  personel test kümesinde geçti. TypeScript derlenmesi de başarılı; iş kuralı hatalarını yakalamıyor.

## Önerilen çalışma sırası

1. **Acil güvenlik ve geçmişi koruma:** rol yükseltme, CSRF, kurum dışı görevlendirme,
   ödenmiş bordrolu sözleşmenin silinmesi, hesapların yanlış eşlenmesi/yeniden açılması.
2. **Veri kaybını durdurma:** otomatik kayıt durum değişimi, dirty/snapshot yarışı,
   doğum tarihi ve şube listesi; ödenmiş aya ait avans değişikliklerini kilitle.
3. **Finans bağlantısı:** önce import; sonra kategori/hesap/yöntem kapsamı,
   bordro–gider tekillik bağı, şube/yıl ve ödeme mutabakatı. Yalnız import düzeltip
   aktarımı açmak kalan üç sorunu kullanıma açar.
4. **Doğrulama ve yaşam döngüsü:** tarih/ay/rol/ad kuralları ortak servis/serializer;
   personel pasifliği, görevlendirme ve sözleşme durumlarını açık işlem akışına bağla.
5. **UX birleştirme:** kayıt durumları, ödeme/onay bileşenleri, erişilebilir çekmeceler,
   yetkiye göre düğmeler ve daha anlaşılır alan/işlem adları.
6. **Veri ve operasyon:** canlıdaki iki ters tarihi kayıt bazında düzelt; pasif personel
   bağlantılarını incele; seçmeli yedek kapsamını tamamla ve geri yükleme tatbikatı yap.
   Başlangıç şifreleri için kullanıcıya özel tek kullanımlık davet süreci planla.

## Testleri yeniden çalıştırma

Bu denetimin başarısız testleri normal uygulama keşfine eklenmedi; düzeltme
çalışmasına kanıt olarak açık etiketle çalıştırılır. Başarısız çıkış beklenir:

```bash
cd backend
LMS_TEST_DB_NAME=personel_audit_20261109 DJANGO_ENV=test \
  venv/bin/python manage.py test audit_checks.test_personel_20261109 --keepdb --noinput
```

Yerel Chromium / gerçek React fonksiyon senaryoları:

```bash
cd frontend
node audit/personel-hooks-20261109.cjs
```

Canlı anonim sorgu betiği: `backend/audit_checks/personel_live_20261109.py`.
Üretimde yalnız yetkili `manage.py shell` üzerinden, sunucu ortamında çalıştırılır.

**Sınırlar:** gerçek kullanıcılarla kullanılabilirlik oturumu, tüm mobil ekran
boyutları, bütün PDF'lerin görsel kabulü, banka hareketi mutabakatı, yedekten gerçek
geri dönüş ve üretim üzerinde saldırı/stres testi yapılmadı. Başarılı görünen
test sayısı tüm olası senaryoların eksiksiz çalıştığı garantisi değildir.
