# Ödev ve koçluk düzeltmeleri — 7 Kasım 2026

Bu belge [inceleme raporunun](odev-kocluk-denetimi-2026-11-07.md) ardından uygulanan değişiklikleri ve test kanıtlarını kaydeder. Canlı sisteme dağıtım veya canlı öğrenci kayıtlarında değişiklik yapılmadı.

## Uygulanan davranış

- Ders ve görev API'lerinin standart oluşturma/güncelleme/kalıcı silme yolları kapatıldı. Görev değerlendirme, sıfırlama ve not işlemleri ortak erişim/kilit denetimli özel rotalardan; taslak içerik düzenlemesi ana ödev serializer'ından yapılır. Kullanılmayan eski frontend görev güncelleme yardımcısı kaldırıldı.
- Alt görev/ders listeleri kurum ve seçili şube ile sınırlandı; silinmiş ödevlerin alt kayıtları listelenmez. Yan menü sayacı liste istatistiğiyle aynı şube kapsamını kullanır.
- Eski ödev sahipliği, gerçek koç profili bulunan kullanıcıya aktif birincil atama dışında erişim vermez. Pasif koçun `is_staff` alanı onu yönetici kapsamına yükseltmez. Açık yönetici rolleri/süper kullanıcı erişimi korunur.
- Koçluk uygunluğu canlı grup kataloğu yerine sözleşmenin sabitlenmiş kapsamından okunur. Üçlü dönüşü ikili açma hatası kaldırıldı. Kataloğa sonradan hizmet eklemek eski sözleşmelere kendiliğinden hak vermez.
- Sözleşme erişimi senkronlanırken son koçluk hakkı kalkarsa koç ataması kapanır, kapasite boşalır ve sohbet yönlendirmesi güncellenir. Başka geçerli sözleşme aynı hakkı veriyorsa atama korunur. Geçmiş ödevler silinmez.
- Koçluk hizmetini yeniden eklemek eski koçu otomatik açmaz; öğrenci yeniden atanabilir hale gelir. Yeniden atandığında sonlandırılmış önceki birincil koçtaki işler yeni koça devredilir.
- Tekli/toplu atama, devir ve yeniden açılan atamalarda ortak kontrol uygulanır: kurum/şube eşleşmesi, aktif öğrenci/koç/personel/kullanıcı, koç niteliği, kapanmış kayıt ve sözleşmeye bağlı hizmet uygunluğu.
- Öğrenci/koç satırları transaction içinde kilitlenir; kapasite ve mevcut birincil atama kilit alındıktan sonra tekrar kontrol edilir. Toplu listede yinelenen öğrenci kimlikleri reddedilir. Atama ve iş devri birlikte geri alınabilir; takvim veya sohbet devri hatası sessiz başarı sayılmaz.
- İleri tarihli anlık devir ve mevcut atamanın başlangıcından önce bitiş oluşturacak devir reddedilir.
- Ödev oluştururken başka öğrenciye ait kaynak ataması, başka kuruma ait ödev paketi, erişilemeyen kitap/içerik ve kitapla eşleşmeyen içerik reddedilir. Hatalı görev/içerik verileri doğrulama hatası verir.
- Öğrenci/kontrol tarihi/ilerleme sıralaması sunucuda sayfalama öncesinde yapılır; eşitliklerde ID ile sabit sıra sağlanır. Liste, ödev geçmişinin bütün eğitim yıllarını kapsadığını belirtir.
- Rutin hedef güncellemesi başarısızsa ödevin kaydedildiği açıkça belirtilir. Kullanıcı yalnız hedefleri yeniden deneyebilir; ödev tekrar oluşturulmaz. Uyarı kaybolacak otomatik yönlendirmeden önce form güvenle sıfırlanır.
- Bildirim geçmişi son 15 satırla sınırlı kalırken toplam gönderim kaydı sayısı ayrıca hesaplanır ve arayüzde doğru toplam gösterilir. Sayı teslim edilmiş mesaj sayısı olarak sunulmaz.
- Genel TypeScript kontrolünü engelleyen mevcut sınav analizi test fixture'ına eksik seri alanları eklendi; tip denetimi dışında dosya bırakılmadı.

## Ek senaryolar ve sonuçlar

| Senaryo | Beklenen sonuç | Kanıt |
|---|---|---|
| Kilitli göreve standart PATCH/PUT/DELETE | 405; değerlendirme ve ödev özeti değişmez | Backend |
| Başka öğrencinin dersine görev veya ders bloğu POST | 405; kayıt oluşmaz | Backend |
| Silinmiş ödevin alt kayıtları | Listeye girmez | Backend |
| Diğer şubenin görevleri | Seçili şubeye sızmaz | Backend |
| Diğer şubede bugün kontrol edilecek ödev | Seçili şube menü sayacını artırmaz | Backend |
| Ataması kaldırılmış eski koç | Ödev listesinden çıkar; detay/ders/görev 404 | Backend |
| Pasif koç ve `is_staff=True` | Eski sahiplikten veya staff alanından erişim kazanmaz | Backend |
| Yanlış şubeden koç | Servis ve tekli atama API'si reddeder | Backend |
| Pasif öğrenci, koç olmayan profil, pasif personel | Atama reddedilir | Backend |
| Devirde hata | Eski ilişki ve ödev sahipliği korunur | Backend |
| Takvim devri, ödev taşındıktan sonra hata verir | Ödev devri de geri alınır | Backend |
| Elle kaldırma sonrası başka koça atama | Son eski koçtaki ödev yeni koça geçer | Backend |
| İki bağlantı, tek boş kapasite, iki öğrenci | Bir 201, bir 400; kapasite aşılmaz | Gerçek iki DB bağlantısı |
| Toplu atamada aynı öğrenci iki kez | 400; yeni atama oluşmaz | Backend |
| Son koçluk hizmetini kaldırma | Atama kapanır, kapasite boşalır | Backend |
| Başka sözleşmede koçluk devam ediyor | Atama açık kalır | Backend |
| Hizmeti yeniden ekleme | Eski atama kapalı kalır; öğrenci atanabilir | Backend |
| Paket kataloğuna sonradan koçluk ekleme | Eski sözleşme otomatik hak kazanmaz | Backend |
| Sözleşme kapsamını açıkça yenileme | Yeni hak görünür olur | Backend |
| `dry_run=True` hizmet senkronu | Hak veya koç ataması kapanmaz | Backend |
| Kaynak ataması başka öğrenciye ait | 400; ödev oluşmaz | Backend |
| Kitap başka kuruma ait | 400; ödev oluşmaz | Backend |
| Hatalı içerik kimliği/görev listesi | 400; yarım ödev oluşmaz | Backend |
| Sıralama ve ikinci sayfaya geçiş | Sıralama sunucuya gider ve korunur | Backend + Chromium |
| Rutin hedef API'si hata verir | Uyarı görünür; tekrar deneme ikinci ödev oluşturmaz | Chromium |
| 20 gönderim kaydı | Toplam 20; detay geçmişi 15 satır | Backend + Chromium |
| Mobil/tablet/masaüstü toplu kontrol | Tek batch; detay ağacı yeniden yüklenmez | Chromium, 390/768/1440 px |
| Plan ve rapor print bileşenleri | Dolu gerçek PDF çıktısı | Chromium + sentetik API |
| Geç gelen öğrenci/kitap yanıtı | Güncel seçimi değiştirmez | Chromium |
| Belirsiz önceki teslim | Kullanıcının açık alıcı seçimi gerekir | Chromium |

## Test sonuçları

- Geniş backend regresyonu: **506/506 başarılı**. Öğrenci, sözleşme, kaynak, ödev, çalışma programı ve ilgili koçluk paketleri. Dış HTTP `OfflineLmsTestRunner` ile kapalı.
- **28 yeni backend regresyon testi** eklendi. Yeni test dosyalarındaki 26 test ve liste sıralamasındaki iki ek test dahil. Bunlar sorun davranışını kabul eden geçici inceleme testlerinin yerini alan, düzeltilmiş sonucu bekleyen kalıcı testlerdir.
- Tarayıcı: **12/12 başarılı**; mevcut 9 teste üç yeni senaryo eklendi.
- Genel `npx tsc --noEmit --incremental false`: başarılı.
- Hedefli ESLint: başarılı.
- `npm run build`: başarılı. Repoda mevcut hook/font/Browserslist uyarıları var; Google font optimizasyonu ağ kısıtı nedeniyle atlanabildi. Derleme çıkış kodu 0.
- Yeni model alanı veya migration yok.

Backend tekrar çalıştırma:

```bash
cd backend
DJANGO_ENV=test venv/bin/python manage.py test \
  apps.coaching.assignment_manual.tests apps.coaching.study_program.tests \
  apps.student_resources.tests \
  apps.coaching.tests.test_homework_access_lifecycle \
  apps.coaching.tests.test_assignment_capacity_concurrency \
  apps.coaching.tests.test_coach_change apps.coaching.tests.test_coach_student_api \
  apps.coaching.tests.test_coach_portal_visibility apps.coaching.tests.test_student_eligibility \
  apps.coaching.tests.test_sube_isolation apps.odeme_takip.tests apps.ogrenci.tests \
  --testrunner=config.offline_test_runner.OfflineLmsTestRunner --keepdb --noinput
```

Frontend:

```bash
cd frontend
npx playwright test e2e/homework-reliability.spec.ts --workers=1 --output=/tmp/lms-homework-final-e2e
npx tsc --noEmit --incremental false
npm run build
```

## Korunan kurallar ve canlı ortam sınırı

Ödev geçmişi yıllar arasıdır. Koç ataması modelinde eğitim yılı alanı yoktur; son hakkın kalkması kontrolü öğrencinin diğer geçerli sözleşmelerini de dikkate alır. Yıllık öğrenci seçimi, eğitim yılı parametresiyle ayrıca daraltılabilir. Mevcut dondurulmuş/tamamlanmış sözleşme politikası değiştirilmedi.

Sözleşmesi hiç olmayan eski/manual öğrenciler için açık atama akışı korundu. Sözleşme tabanlı öğrencilerde koçluk uygunluğu denetlenir. Taslak sözleşme tek başına mevcut atamayı kapatmaz.

Geçmişte oluşmuş tutarsız atamalar için canlı veri onarımı yapılmadı. Dağıtım sonrasında ilgili kurumun mevcut sözleşmelerini erişim senkronundan geçirerek geriye dönük koçluk kapanışları uygulanabilir. Mevcut yönetim komutunun dry-run çıktısı esas olarak açılacak hizmet/paketleri gösterir; bütün koç kapanışlarının ayrıntılı önizlemesi sayılmamalıdır.

`ASSIGNMENT_OPERATION_LEDGER_ENABLED` değeri veya üretim varsayılanı bu çalışmada değiştirilmedi. Kalıcı iş/idempotency garantilerinin etkinliği canlı ayara bağlıdır; bu bayrakla ilgili mevcut iki modlu regresyon testleri geçti. Gerçek Celery/cron, Meta hattı, webhook ve teslim zinciri burada doğrulanmadı. Canlı/staging hesabına erişim, deploy ve gerçek mesaj gönderimi yapılmadı. Bu testler gerçek sağlayıcı teslim garantisi değildir.

## Ek kontrol: sözleşmesiz öğrenciye ilk sözleşme yapılması

Kullanıcının bildirdiği geçiş ayrıca gerçek `SozlesmeService.create` → `change_status` üzerinden denetlendi. İlk aktif sözleşmede koçluk kalemi yoksa önceden elle atanmış koçun kapanabildiği doğrulandı; önceki genel kapanış kuralı bu durumu ayırmıyordu.

Düzeltme: ilk taslak aktivasyonu mevcut koç atamasını korur; erişim senkronu öncesinde koçluk hakkı yokken sırf sözleşme oluşturuldu diye koç kapatılmaz. Ön kayıttan gelen hizmet satırları bulunsa da ilk aktivasyonda atama korunur. Mevcut aktif sözleşmeden gerçekten son koçluk hakkının kaldırılması ve açık iptal/fesih davranışı ayrı kalır.

Dört yeni kalıcı test eklendi: ilk taslak, koçluk içeren ilk aktif sözleşme, koçluk içermeyen ilk aktif sözleşme, ön kayıttan hizmet satırları bulunan ilk aktivasyon. Son ilgili regresyon: **144/144 başarılı** (tüm sözleşme testleri, koç görünürlüğü ve yaşam döngüsü). Bu ek düzeltme de canlıya dağıtılmadı.
