# Koç analiz ekranı: 13 eksikliğin tamamlanması

## Kapsam ve güvenlik

Çalışma, mevcut öğrenci Sınavlar ekranındaki Genel Bakış ve Derin Analiz görünümleriyle sınırlıdır. Mevcut veri modelleri, yetki kontrolleri, kurum/şube/eğitim yılı kapsamı, karne/PDF hesapları ve tasarımları korunmuştur. Yeni servis, bağımlılık veya migration eklenmemiştir. Üretimde deploy, migration, restart ya da gerçek öğrenci verisiyle test yapılmamıştır.

Çalışmaya başlanırken depoda mevcut olan diğer değişiklikler korunmuştur. Aşağıdaki tablo bu çalışmanın katkısını açıklar; `git diff` içinde görünen tüm değişiklikler bu çalışmaya ait değildir.

## Öncelik ve uygulama eşlemesi

| # | Eksik | Uygulanan çözüm |
|---|---|---|
| 1 | Yalnız yanlış + boş sayısıyla sıralama | Öncelik sıralaması önce en az 5 gözlemli ve son iki sınavda kayıp görülen konuları öne alır; ardından toplam kayıp, kayıp oranı ve tekrar sayısını kullanır. Sayı, oran ve dönem kötüleşmesi sıralamaları ayrıca seçilebilir. Kural arayüzde açıklanır; kapalı bir yapay puan yoktur. |
| 2 | Önceliğin gerekçesi yok | Konu detayında gözlem/ölçüm sayısı, kayıp görülen sınav sayısı, yanlış/boş dağılımı, oran, son ölçüm ve dönem farkı açıklanır. |
| 3 | Kalıcı eksiklik / tekil düşüş ayrımı yok | Sınırlı veri, yeni düşüş, iyileşen fakat süren kayıp, tekrarlayan kayıp, tekil/dağınık kayıp, yeniden ölçülmeyen ve gözlenen kaybı olmayan alanlar ayrılır. Bunlar inceleme işaretleridir; öğrenme tanısı değildir. |
| 4 | Dönem kıyası yok | Eşit uzunlukta, kesişmeyen son 3 / önceki 3; 4–5 sınavda son 2 / önceki 2 karşılaştırılır. Her dönemde en az 2 ölçüm ve 5 gözlem yoksa fark üretilmez. Oranlar cevap sayısına göre ağırlıklıdır. Eksik gözlem sıfıra çevrilmez. |
| 5 | Karne verileri kullanılmıyor | Grafikte net, kayıp oranı, puan, kurum sırası ve tahmini yüzdelik seçilebilir. Puan/sıralama gerektiğinde mevcut tam sonuç isteği yapılır. Seçili sınav için mevcut karne endpoint'inden kurum/sınıf ortalamaları, sıralamalar ve varsa zorluk grupları okunur. Her grafik noktası için ayrı karne sorgusu yapılmaz. |
| 6 | Hiyerarşi ve üst seviyeye katkı eksik | Ders kartlarında kayıp/oran/dönem sınav kaybındaki pay; konularda ders kaybındaki pay; üst kazanım gruplarında konu/ders kaybındaki pay; alt kazanımda grup kaybındaki pay gösterilir. Backend mevcut yaprak satırlarına üst kazanım adını ekler; sayıları değiştirmez. Altlar üst toplama tekrar eklenmez. |
| 7 | Eşleme kapsamı belirsiz | Eşlenen / toplam cevap ve ders bazında kapsam gösterilir. Payda nominal sınav kapasitesi yerine kayıtlı doğru + yanlış + boş cevap sayısıdır. %100 üzeri tutarsızlık uyarılır. Üst/alt ders ayrımı eksik olduğunda olası çakışan ders toplamlarından toplu kapsam çıkarılmaz. |
| 8 | İlk bakışta karar özeti yok | Genel Bakış'ta en büyük kayıp, son dönemde kötüleşen konu ve tekrarlayan eksiklik kartları bulunur. Karttan ilgili konuya geçilir. Derin Analiz'de aynı kartlar tekrarlanmayarak ayrıntıya alan bırakılır. |
| 9 | Grafik etkileşimleri sınırlı | Birden çok ders aynı grafikte karşılaştırılır. İki sınav bağımsız seçilerek yan yana kıyaslanır. Grafik altındaki aralık seçimi mouse/touch veya ok tuşlarıyla değiştirilip seçili sınavlar Derin Analiz kapsamına aktarılır. |
| 10 | Isı haritası ve ölçek anlamı belirsiz | Renk ve büyük değer aynı kayıp oranını kullanır; altında yanlış + boş sayısı yer alır. Renk ölçeği ve ölçüm yok işareti açıklanır. Net grafiği varsayılan olarak sıfırı içerir; dikey yakınlaştırma açıkça seçilir. Kayıp/yüzdelik ölçeği 0–100, kurum sırası ters yöndedir. |
| 11 | Seçim davranışları tutarsız | Tüm dersler seçiliyken ilk ders otomatik açılmaz. Isı haritası hücresi hem dersi hem sınavı seçer; seçili sınavın karne bağlamı açılır ve tek sınav kapsamına geçilebilir. Yenileme aynı öğrenci/kapsamda filtreleri korur. |
| 12 | Okunabilirlik / mobil yoğunluk | Temel açıklama ve veri yazıları büyütüldü, başlık alanı küçültüldü, iç içe dikey liste kaydırması kaldırıldı. Mobilde konu seçilince liste gizlenir, detay odaklanır; geri düğmesi listeye döner. |
| 13 | Hata / sıfır / eksik veri karışıyor | Hata, yükleme, eşleme yokluğu, filtreye uyan konu yokluğu ve gerçek sıfır kayıp ayrılır. Ders verisi gelmeden toplamlar sıfır gösterilmez. Analiz ve karne bağlamı isteklerinde 30 saniye timeout, iptal, eski yanıt koruması ve yeniden deneme bulunur. |

## Dosyalar ve uyumluluk

- `frontend/components/coach/student360/examAnalyticsModel.ts`: kayıp oranları, açıklanabilir öncelik, dönemler, ölçüm durumu, kapsam ve hiyerarşi. Aynı sınavdaki birden fazla satır tek ölçüm olarak sayılır; cevaplar korunarak birleştirilir. Konu serileri önceden gruplanarak tekrar taramalar azaltılır.
- `frontend/components/coach/student360/ExamAnalyticsWorkspace.tsx`: bağlantılı grafikler, filtreler, konu/kazanım incelemesi, mobil odak ve hata durumları.
- `frontend/components/coach/student360/ExamAnalyticsPanels.tsx`: karar özeti, kapsam, dönem, iki sınav kıyası ve seçili karne bağlamı.
- `frontend/components/coach/student360/ExamAnalyticsWorkspace.module.css`: yeni paneller ve responsive görünüm.
- `frontend/components/coach/student360/ExamCoachWorkspace.module.css`: başlık alanının küçültülmesi.
- `frontend/components/coach/student360/SinavlarTab.tsx`: referans yılı/tam puan yükleme bağlantısı ve yenilemede kapsam koruma.
- `frontend/components/olcme/api.ts`: `studentDetail` için geriye uyumlu, isteğe bağlı dördüncü `AbortSignal` parametresi.
- `frontend/components/olcme/types.ts`: isteğe bağlı `parent_outcome_name` alanı.
- `backend/apps/coaching/olcme_degerlendirme/services/topic_blocks.py`: zaten yüklenen ilişkilerden üst kazanım adı.
- `backend/apps/coaching/olcme_degerlendirme/services/development_analysis.py`: üst kazanım adının analiz yanıtına taşınması. Mevcut alanlar ve hesaplar korunur.
- `backend/apps/coaching/tests/test_olcme_development_analysis.py`: üst/alt kazanım adı ve sayım regresyonu.
- `frontend/e2e/exam-analytics-model.spec.ts`, `frontend/e2e/exam-analytics.spec.ts`: matematik, hata, kapsam, etkileşim ve responsive kontroller.

## Yorumlama sınırları

- Kayıp yanlış + boştur; net kaybı veya garanti telafi edilecek net değildir.
- 5 gözlem, 2 ölçüm, 10/15 yüzde puan gibi eşikler açıklanabilir ürün kurallarıdır; istatistiksel anlamlılık veya kesin öğrenme tanısı iddiası taşımaz.
- Aynı konu farklı sınavlarda farklı zorluk/kapsamla ölçülebilir. Oran karşılaştırması sınav zorluğunu standartlaştırmaz. Kurum ortalaması da tek başına zorluk ölçüsü değildir.
- Sıralama katılımcı grubuna, puan referans yılına ve AYT puan alanına bağlıdır. Eksik puan/sıra/yüzdelik üretilmez; eksik değerler çizilmez.
- Soru metni, çözüm içeriği veya gerçek çözüm süresi bulunmadığı için bunlara dayalı analiz eklenmez.
- Grafikler filtre ve seçimlerle güncellenir; yeni sonuçlar Yenile ile alınır. Yeni websocket/polling servisi eklenmez.

## Test ve görsel kontrol

Son çalıştırma sonuçları:

- **58/58 backend testi başarılı:** gelişim analizi, karne regresyonları ve koç çalışma merkezi. İzolasyon, salt okunur GET, mevcut puan/net ve üst/alt kazanım sayımları bu kapsamdadır.
- **22/22 sentetik frontend testi başarılı:** 7 model testi ve 15 mevcut/yeni hesaplama-tarayıcı senaryosu. Tür/tarih/kapsam, dönem oranları, eksik ölçüm, tekrarlı satır, hiyerarşi, karar özeti, çoklu ders/puan grafikleri, iki sınav kıyası, karne hatası ve retry, ısı haritası odağı, yenilemede kapsam koruma, timeout, klavye aralık seçimi ve üç ekran boyutu.
- `npm run build`: başarılı; derleme, tip kontrolü ve build lint aşamaları tamamlandı.
- Ayrı TypeScript ve değişen dosyalara yönelik ESLint: başarılı.
- `git diff --check`: başarılı.
- Genel Bakış ve Derin Analiz'in 390/768/1440 px ekran görüntüleri üretildi; son masaüstü Genel Bakış ve mobil Derin Analiz görsel olarak da incelendi.

Build, mevcut Browserslist verisinin eskiliği ve ağ kısıtı nedeniyle Google Fonts optimizasyonunun atlanması için uyarı verdi; bunlar build'i başarısız kılmadı. Backend çalıştırmasında mevcut DRF Decimal `min_value` uyarısı görüldü; testler başarılıdır.
 Backend testleri `DJANGO_ENV=test` ile izole PostgreSQL test veritabanında; tarayıcı testleri yalnızca sentetik/mocked API yanıtlarıyla çalıştırılmıştır. Gerçek kullanıcı verisi değiştirilmemiştir.

Telefon/tablet/masaüstü kontrolleri 390, 768 ve 1440 px tarayıcı boyutlarında yapılır; fiziksel cihaz testi değildir. Genel Bakış ve Derin Analiz ekran görüntüleri üretilir. Backend testleri mevcut karne hesaplarını ve kurum/eğitim yılı erişimini de kapsar. Gerçek PDF renderer süreleri veya canlı sunucu performansı ölçülmemiştir; hızlanma yüzdesi/p95 sonucu ileri sürülmez.

## Yayın ve geri dönüş

Bu değişiklik için migration yoktur. Backend yeni alanı önce sunabilir; eski frontend bu ilave alanı yok sayar. Yeni frontend eski backend ile de çalışır; üst kazanım adı bulunmazsa mevcut kimlikle açık bir etiket gösterir. Veritabanı/worker dönüşümü gerekmez. Normal manuel onaylı yayın prosedürü kullanılmalıdır.

Geri dönüş yalnız bu değişikliklere ait frontend entegrasyonu ve ek yanıt alanlarının geri alınmasıyla yapılır; veri temizleme veya kuyruk işlemi gerekmez. Çalışma öncesinde depoda bulunan migration ve diğer değişiklikler bu kapsamla karıştırılmamalıdır.
