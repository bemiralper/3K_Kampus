# Koç öğrenci profili — Sınavlar sekmesi incelemesi

Tarih: 5 Kasım 2026. Kapsam: **Genel Bakış, Sınavlarım, Gelişim**, bunların API/veri kaynakları, karne/PDF bağlantısı ve sınav önerilerinin koçluk–ödev akışına entegrasyonu.

Aşağıdaki denetim bulguları uygulama öncesindeki durumu anlatır. Kullanıcı onayıyla yapılan düzeltmeler ve son doğrulamalar belgenin sonundaki uygulama bölümündedir. İlk denetimde uygulama kodu değiştirilmedi. Canlı sunucuya veya ekrandaki öğrencinin gerçek verilerine erişilmedi. Ekran görüntüsü, mevcut kaynak kodu, bağımsız hesap örnekleri ve izole PostgreSQL test veritabanı kullanıldı. Kodla doğrulanan davranışlar ile ürün/UX önerileri aşağıda ayrıldı.

## Genel değerlendirme

Sayfa temel olarak iyi bir analitik altyapıya sahip: tür bazlı ayrım, kayıtlı puan okuma, ders grafikleri, konu/kazanım detayı, gelişim sınıflandırması, karne ve PDF erişimi var. Asıl sorun, bu katmanların ortak bir veri sözleşmesi kullanmaması ve koçun **“Bugün neye müdahale edeceğim?”** sorusunun uzun ders listesinin altında kalması.

Önerileri göstermek için dördüncü bir ana sekmeye ihtiyaç yok. **Genel Bakış'ta kısa çalışma gündemi, Sınavlarım'da sınava özel öneriler, Gelişim'de kanıt ve geçmiş takibi** kullanılmalı. Ancak aşağıdaki kapsam ve hesaplama sorunları önce giderilmeli.

## Kod referansları

- **FE:** `frontend/components/coach/student360/SinavlarTab.tsx` — sayfanın üç alt görünümü ve yerel hesapları.
- **API:** `frontend/components/olcme/api.ts:1121–1149` — sonuç/gelişim istekleri.
- **BE:** `backend/apps/coaching/olcme_degerlendirme/views/student_exam_views.py` — iki öğrenci endpoint'i.
- **DA:** `backend/apps/coaching/olcme_degerlendirme/services/development_analysis.py` — gelişim, kazanım ve öncelik hesabı.
- **DT:** `backend/apps/coaching/olcme_degerlendirme/services/development_thresholds.py` — grup ve eşikler.
- **SS:** `backend/apps/coaching/olcme_degerlendirme/services/stored_scores.py` — kayıtlı puan/sıra.
- **HTML:** `backend/apps/coaching/application/olcme_karne_html.py` — mevcut karne öncelikleri/hedefleri.
- **360:** `frontend/app/coach/ogrenciler/[id]/Student360Client.tsx` — ana profil ve yenileme davranışı.

Satır referansları bu inceleme anındaki çalışma ağacına aittir.

## Veri ve hesaplama bulguları

### 1. P1 — Öğrenci endpoint'lerinde kurum/şube kayıt sınırı ayrıca doğrulanmıyor

**Kaynak:** BE:85–106, 275–291; `backend/apps/coaching/services/coach_access.py:49–65,123–164`.

`user_can_access_student` normal koçta atama kapsamını kontrol ediyor. Ancak yönetici/staff dalı tüm öğrencilere erişim kabul ediyor; endpoint ardından öğrenciyi yalnız PK ile getiriyor. Öğrencinin kurumu/şubesi ile kullanıcının erişebildiği kurum/şube karşılaştırılmıyor. Ölçme sınavı endpoint'lerinde bulunan `get_exam_or_response` kayıt kontrolü burada yok.

**Etki:** Kuruma bağlı yönetici hesabında başka kurum öğrencisinin kimliğiyle istek yapılması için bir kapsam açığı bulunuyor. “Koç erişim kontrolü var” demek, yönetici dalındaki kurum kontrolünün de var olduğu anlamına gelmiyor.

**Doğrulama:** Yalnız ilk kuruma bağlı Personel kaydı olan, süper kullanıcı olmayan staff hesabında kurum erişim politikası ikinci kurumu reddetti. Buna rağmen ikinci kurum öğrencisinin sonuç ve gelişim endpoint’leri ayrı ayrı HTTP 200 döndürdü. Deneme yalnız test veritabanındaki sahte kayıtlarla yapıldı.

**Düzeltme:** Öğrenci erişimini rol/koç ataması + kurum + şube katmanlarıyla doğrula. Süper kullanıcı için global politika açık kalsın; yerel yöneticiyi global kabul etme. Sonuç, gelişim, öneri, karne ve ödev eylemleri aynı kapsamı uygulasın.

### 2. P1 — Seçili eğitim yılı sonuç ve gelişim sorgularına uygulanmıyor

**Kaynak:** BE:102–110; DA:474–532; FE:357–405; API:1121–1149.

İki sorgu da öğrencinin tamamlanmış bütün kayıtlarını okuyor. Seçili eğitim yılı filtresi yok. Üstteki “2026 YKS” seçimi eğitim yılı değil, puan katsayısı/sıralama referans yılıdır. “Tüm dönem” seçeneği ise gerçekte bütün yılları içerebilir.

**Doğrulama:** Farklı eğitim yıllarındaki iki TYT sonucu gelişimde birlikte sayıldı.

**Düzeltme:** Varsayılan kapsamı aktif eğitim yılı yap; geçmiş yıllar bilinçli seçimle açılsın. Başlıkta “2026–2027 eğitim yılı” ve “2026 puan referansı” ayrı gösterilsin. Öğrencinin farklı kurum/şubeye ait geçmiş sonuçlarının dahil edilme politikası da açık olsun.

### 3. P1 — Tekrar yüklenen sınavlar listede çoğalıyor, gelişimde tekilleşiyor

**Kaynak:** BE:102–117,172–197; DA:497–512; FE:425–438,1128–1140.

Sonuç endpoint'i bütün cevap kayıtlarını döndürüyor. Gelişim ise sınav başına tek kayıt seçiyor. Frontend liste/filtre/grafik anahtarları `exam_id` olduğundan tekrar yükleme hem istatistikleri hem React anahtarlarını etkiliyor. Tek sınav seçimi `find` ile ilk kayda düşebilir.

**Doğrulama:** Aynı sınav iki kez yüklendiğinde sonuç listesi 2, gelişim 1 sınav döndürdü.

**Düzeltme:** Sınav başına son tamamlanmış `answer_id` bütün ekranlarda ortak seçilsin. Eski yükleme geçmişi ayrı bir inceleme işlevi olsun.

### 4. P2 — Eşit puanda kurum sırası karneyle farklılaşabiliyor

**Kaynak:** BE:39–50; SS:134–177; `views/analysis_views.py` içindeki karne `_competition_rank` kullanımı.

Koç listesi kayıtlı sıra numarasını kullanıyor. Kayıtlı sıralar `enumerate` ile 1,2,3 yazılıyor; karne eşit puanlarda aynı yarışma sırasını veriyor. Eşitlik halinde aynı öğrenci liste ve karnede farklı sırada görünebilir.

**Doğrulama:** Eşit puanlı ikinci öğrenci koç sonuç endpoint’inde 2., karne payload’ında 1. sırada döndü.

**Düzeltme:** Ortak eşitlik kuralı seç; örneğin 1,1,3. Kayıtlı sıraları da aynı kuralla üret. Geçişte eski kayıtlar için sürümleme/yenileme planı yap.

### 5. P1 — AYT alan puanı ile tüm kitapçığın neti yan yana, kapsam açıklaması olmadan gösteriliyor

**Kaynak:** BE:39–50,163–187; FE:698–730,861–870,1178–1184.

Puan öğrencinin alanından geliyor; `total_net` bütün testlerden geliyor. Genel bakış, net trendi, sıralama ve sınav kartı bu değerleri birlikte sunuyor. Karne alan netini gösterdiği için karne ile bu sekmedeki “Net” de farklı olabilir.

**Düzeltme:** `alan_net`, `toplam_net`, `alan_soru`, `alan_puan_turu` ve kapsam etiketini ayrı taşı. Varsayılan AYT özeti alan netini kullansın; bütün testlerin sonucu detayda açık adla görülsün.

### 6. P2 — Her sınavın kendi alanı yerine son sınavın alanı bütün geçmişe uygulanıyor

**Kaynak:** BE:39–43,248–254; DA:932–938; FE:147–197,288–304.

Backend her puanı sınavın kendi eğitim yılındaki alanla seçiyor. Ancak response tek bir `alan` döndürüyor; frontend bunu bütün eski sınavların ders ve puan türü seçiminde kullanıyor. Gelişim de son seçili sınavdan aldığı alanla bütün pencereyi filtreliyor.

**Etki:** Alan değiştirmiş öğrencide geçmişin puanı, dersleri ve sıralaması farklı alanlardan gelebilir.

**Düzeltme:** Her sınavın alanını response'a ekle. “Sınav tarihindeki alan” ve “bugünkü hedef alana göre yeniden inceleme” ayrı seçenekler olsun. Alan bilinmiyorsa sessiz ve farklı varsayımlar yapılmasın; karne SAY'a düşerken bu sayfanın tüm AYT derslerini açması da önlensin.

### 7. P2 — 11 AYT'de toplam sonuç ile seçili puana katkı ayrımı görünür değil

**Kaynak:** DA:17–25; FE:182–197,237–252; BE:46–49.

11 AYT gelişimi bütün dersleri kabul ediyor. Bu, genel akademik takibe uygundur; fakat SAY/EA puanını artırma önerileri için aynı kapsam kullanılamaz. Felsefe/Din gibi dersler toplam nette bulunup puana girmeyebilir. Liste tür etiketi de seçili SAY/EA'yı göstermiyor; `examRank` yalnız normal AYT'yi ele alıyor.

**Düzeltme:** “Genel ders gelişimi” korunurken puana yönelik öneriler ayrıca alanla sınırlandırılsın. 11 AYT puanının SAY/EA türü ve 60/80 soruluk hesap kapsamı belirtilsin.

### 8. P2 — Güçlü/zayıf ders ham netle seçiliyor

**Kaynak:** FE:705–716,755–756; BE:223–234.

40 soruluk dersteki 20 net, 5 soruluk dersteki 5 netten yüksek kabul ediliyor. Kısa testte tam başarı olsa da uzun test “güçlü” seçilebiliyor. Bütün dersler başarılı olsa bile bir ders zorunlu olarak “zayıf” oluyor.

**Doğrulama:** Frontend'in mevcut hesap bloğu çalıştırıldığında Türkçe 20/40, Felsefe 5/5 örneğinde güçlü ders Türkçe seçildi.

**Düzeltme:** Soru sayısına göre normalize başarı, yeterli örnek ve eşik kullan. “En düşük başarı oranı” ile “destek gereken ders” ayrı kavramlar olsun; destek gerekmiyorsa bunu açıkça söyle.

### 9. P2 — Gelişim grupları bazı karşılaştırılamaz sınavları birleştiriyor

**Kaynak:** DT:7–17; DA:492–514; FE:82–89.

LGS 7 ve LGS 8 aynı grupta; manuel grupta deneme, kurum içi, konu tarama, kazanım ve özel sınavlar birlikte. Aynı ders adı üzerinden farklı kapsam ve soru sayıları tek seri olabiliyor. Mevcut test LGS 7/8 birleşimini özellikle bekliyor; bu bir uygulama kazası değil, yeniden değerlendirilmesi gereken ürün politikası.

**Düzeltme:** Tür yanında sınıf, müfredat bandı, sınav kapsamı ve karşılaştırılabilir soru yapısını kullan. Uyuşmayan testleri otomatik gelişim teşhisine katma veya oran grafiğinde açık uyarıyla sun.

### 10. P2 — Puan yılı validasyonu eksik

**Kaynak:** BE:97–98; SS:`blocks_for_answers`; `services/scoring_settings.py:110–115`.

Metin değer doğrudan `int` edildiği için hatalı parametre 500 üretir. Desteklenmeyen sayısal yıl da kabul edilir; kayıtlı puan bloğu bulunamaz, yenileme denense bile o yıl üretilmez ve sıfır puan sunulabilir.

**Doğrulama:** `ranking_year=bad` HTTP 500 üretti. `ranking_year=2030` ise HTTP 200 ile `puan=0` döndürdü.

**Düzeltme:** Desteklenen yılları doğrula; 400 ve anlaşılır hata döndür. Bulunmayan puanı gerçek 0 gibi göstermemek için `null`/durum alanı kullan.

### 11. P2 — Tarihsiz ve aynı tarihli sınavlarda son sınav seçimi tutarlı değil

**Kaynak:** BE:110,248; DA:485–493,505–512; FE:425–438,692–696.

Backend veritabanı tarih sıralaması, gelişimin `date.min` yaklaşımı ve frontend'in boş metin sıralaması farklı. Aynı tarihte frontend yalnız tarihe bakıyor; ikinci anahtar yok. Son sınavın hangi kayıt olduğu, alan seçimi ve önceki sınav farkı etkilenebilir.

**Düzeltme:** Tarih/oluşturma zamanı/sınav kimliği için ortak sıralama anahtarı döndür; tarihsizi açıkça işaretle. Liste, grafik ve gelişim aynı sırayı kullansın.

## Filtre, durum ve yükleme bulguları

### 12. P2 — “Son 5” önce bütün türlere uygulanıyor, sonra Genel Bakış grubu seçiliyor

**Kaynak:** FE:425–438,680–696.

Beş en yeni kayıt 4 AYT+1 TYT ise Genel Bakış'ta TYT'ye geçildiğinde son beş TYT yerine yalnız bir TYT kalır. Aynı filtre başlığı farklı alt sayfalarda farklı pencere anlamına geliyor.

**Düzeltme:** Önce eğitim yılı ve karşılaştırılabilir tür/grup, sonra son N sınav filtresi uygulansın. Gerçek kullanılan sınav sayısı/tarih aralığı gösterilsin.

### 13. P2 — Özel seçim boşken son beş sınav analiz ediliyor

**Kaynak:** FE:1375–1380; API:1142–1145; DA:65–70,519–524.

Frontend boş seçimi göndermiyor ve `custom` pencereyi de parametreye yazmıyor. Backend varsayılan beş sınava dönüyor. Kullanıcı kutuların hepsini kaldırsa bile analiz kalıyor.

**Doğrulama:** Boş özel kimlik listesiyle çağrı bir sınavı analiz etti ve response filtresinde `window='5'` döndü.

**Düzeltme:** Özel seçim modunu açık gönder; boş listeyi “Henüz sınav seçilmedi” kabul et. Seçim yapılana kadar analiz isteği atma. Tür değişiminde `openId` gibi bağlı durumları da sıfırla.

### 14. P1 — Sonuç isteğinde eski yanıtın yeni öğrenci/yılı ezmesine karşı koruma yok

**Kaynak:** FE:375–405.

`load` için istek kimliği, abort veya cleanup kontrolü yok. Hızlı yıl değişiminde eski istek sonradan dönerse yeni seçimin verisini ezer. Sessiz yüklemede yeni yıl seçiliyken eski puanlar görünür kalır. Aynı bileşenin farklı öğrenciyle yeniden kullanılması durumunda da eski öğrenci verisi geçici olarak tutulabilir. Gelişim isteğinde ise `cancelled` koruması mevcut.

**Düzeltme:** Anahtar `student+kurum+şube+eğitim yılı+puan yılı+filtreler` olsun. Önceki isteği iptal et; kimlik/kapsam değişiminde eski veriyi gizle. Yenileme sürerken yıl/sonuç uyuşmazlığına izin verme.

### 15. P2 — Profildeki yenile düğmesi açık Sınavlar verisini yenilemiyor

**Kaynak:** 360:335–343; FE:403–406.

Üst düğme yalnız `loadProfile` çağırıyor. Sınavlar alt bileşenine yenileme anahtarı gelmiyor; sonuç ve gelişim yükleyicileri tetiklenmiyor. Yeni sınav yüklenince koç yenilediğini sanıp eski analizi görebilir.

**Düzeltme:** Ortak cache invalidation/refresh sinyaliyle hem sonuç hem gelişim hem öneriler yenilensin; “son güncelleme” ve yükleme durumu görünsün.

### 16. P2 — Alt sayfa ve filtre durumu korunmuyor; iki ayrı filtre mantığı var

**Kaynak:** FE:357–373,610–627,1335–1362; 360:342.

Genel Bakış/Sınavlarım filtreleri ile Gelişim filtreleri ayrı state tutuyor. Profilin başka sekmesine geçip dönünce alt görünüm ve seçimler sıfırlanıyor. Karne/ödev dönüşünde koç inceleme bağlamını kaybedebilir.

**Düzeltme:** Alt görünüm, tür, pencere ve seçili sınavı URL'ye veya öğrenci bazlı state'e taşı. Üç görünümün ortak filtrelerini tek bar üzerinden yönet; yalnız ilgili kontrolleri göster.

### 17. P2 — Puan yılı Gelişim görünümünde etkisiz ama pahalı bir kontrol

**Kaynak:** FE:575–593,610–611,1370–1396,1296–1321.

Gelişim puan yılı parametresi kullanmıyor. Buna rağmen üstteki seçim sonuç listesini yeniden yüklüyor. Genel Bakış'ta aynı seçim ayrıca sıralama kartında tekrar var. LGS ve 11. sınıfta da seçenekler “YKS” diye adlandırılıyor.

**Düzeltme:** Gelişimde kontrolü kaldır veya etkisini açıkla; puan kullanılan yerde tek kontrol bulunsun. Etiketi sınav türüne uygun yap.

### 18. P2 — Hata/boş durumları farklı nedenleri aynı mesajla gösteriyor

**Kaynak:** FE:1397–1405,1463–1469,1532–1535.

Öncelik yoksa da “Yeterli veri yok” yazılıyor. Oysa bütün kazanımlar başarılı olabilir, eşleme yok olabilir veya alan filtresi her şeyi çıkarmış olabilir. Gelişim hatasında tekrar deneme düğmesi ve filtreler görünmüyor; yüklemede de filtreler kaldırılıyor.

**Düzeltme:** `no_exams`, `no_selection`, `no_mapping`, `insufficient_sample`, `no_priority_needed`, `filtered_out`, `request_failed` nedenleri ayrışsın. Filtreler sabit kalsın; retry ve eşleme kapsamı bilgisi gösterilsin.

## Gelişim analizinin açıklanabilirliği

### 19. P2 — “En çok yükselen” yüzde puanla seçilip net farkıyla gösteriliyor

**Kaynak:** DA:839–875; FE:1486–1503.

Üst kart seçimi `first_last_change` yani net/soru başarı oranındaki yüzde puan değişimiyle yapılıyor. Kartın alt sayısı `net_change`. Ekran görüntüsünde Türkçe +7,3 görünürken Kimya +3,5'in “en çok yükselen” olması bu nedenle mümkün; tek başına aritmetik hata değildir.

**Düzeltme:** Kart “Başarı oranı en çok artan” desin; `+50 yüzde puan · +3,50 net` gibi iki birim açık yazılsın. “Son sınava göre” ile “seçili pencerenin ilk sınavına göre” farkı belirtilsin.

### 20. P2 — Soru sayısı değişince yükseliş etiketi ile kırmızı net farkı birlikte çıkabiliyor

**Kaynak:** DA:648–660,733–742; FE:1741–1756.

Gelişim oranla, sağdaki renk ham netle belirleniyor. 20/40'tan 15/20'ye geçiş başarı oranında +25 yüzde puan, nette −5'tir. UI yükseliyor deyip kırmızı düşüş gösterir.

**Doğrulama:** Mevcut analiz fonksiyonu bu örnekte `improving` ve `net_change=-5` döndürdü.

**Düzeltme:** Farklı soru sayılarında varsayılan trend birimi yüzde puan olsun. Net farkını ikincil bilgi yap; karşılaştırılamayan sınavlarda net artışı teşhisi üretme.

### 21. P2 — Ders özetlerinin saydığı küme ile ekranda gösterilen küme farklılaşabilir

**Kaynak:** DA:839–906; FE:1409–1417,1474–1481,1864–1881.

Backend bütün `subjects` üzerinden özet üretiyor; frontend sonradan ebeveyn dersleri ve bazı seçmelileri gizliyor. Eski/yeni bölüm yapıları birlikteyse üstte sayılan ders ekranda bulunmayabilir; highlight neti `byName` içinde bulunamazsa çizgi gösterir.

**Düzeltme:** Görünür analiz kümesini backend belirlesin ve özeti aynı kümeden üretsin. Sayaçlar “4 yükselen ders” diye birimini taşısın. Görüntüdeki 4+2+4'ün üç sınava değil ders sayısına ait olduğu açıklansın.

### 22. P2 — Tek sınav/üç sorudan “yüksek” öncelik üretilebiliyor

**Kaynak:** DA:327–339,763–807; DT:59–76; FE:1890–1911.

Veri eşiği toplam üç soru. Tek sınavdaki üç yanlışta süreklilik bileşeni 100 kabul ediliyor. Sonuç gelişim için “yeterli veri yok” derken öncelik 70/yüksek olabiliyor. Bu mevcut formülün sonucu; tekrarlayan eksik kanıtı değildir.

**Doğrulama:** Bir sınav, üç soru ve sıfır doğru örneği `insufficient_data`, `priority_score=70`, `high` üretti.

**Düzeltme:** Tek sınavda “ilk kontrol önerisi”, çok sınavda “tekrarlayan kayıp” ayrımı yap. Soru sayısı, bağımsız ölçüm sayısı, tarih ve güven düzeyini göster; tek ölçümü süreklilik sayma.

### 23. P2 — Kazanım dönem ortalamalarında soru ağırlığı dikkate alınmıyor

**Kaynak:** DA:632–645,763–800.

Toplam kazanım başarısı doğru/toplam soruyla ağırlıklı hesaplanırken dönem ve son iki ölçüm hesabı yüzdelerin basit ortalamasını kullanıyor. Bir soruluk %100 ile dokuz soruluk %0 eşit ağırlık alıyor. Toplam başarı ile dönem yorumu bu nedenle farklı yöne gidebilir.

**Düzeltme:** Amaç soru bazlı başarıysa dönem içinde D/S toplamından hesapla. Ölçüm bazlı ortalama korunacaksa ayrı adla ve soru sayısıyla sun. Az örnekli dönem farkını kesin yorumlama.

### 24. P2 — Kazanım kimliği ve eşleme kapsamı öneri entegrasyonu için yetersiz

**Kaynak:** `services/topic_blocks.py` row yapısı; DA:580–627,763–837,941–974.

Kazanımlar `(ders adı, konu metni, kazanım metni)` ile birleştiriliyor. Response'ta kalıcı müfredat ders/konu/kazanım/alt kazanım kimliği yok. Aynı metin farklı sınıflarda birleşebilir; metin düzenlemesi geçmişi bölebilir. Ayrıca etiketlenmemiş sorular analiz dışındadır ama kapsam oranı görünmez.

**Düzeltme:** Kalıcı kimlik ve müfredat sürümü taşı. İçe aktarılan eşleşmemiş metin için ayrı kaynak kimliği kullan. “120 sorunun 75'i kazanımla eşleşti” bilgisini göster. Eşleme yokluğunu öğrenme eksikliği gibi sunma.

### 25. P2 — Ebeveyn dersin kısmi çocuk verisi olduğunda veri kaybı yaşanabilir

**Kaynak:** DA:385–415; FE:1864–1877.

Bir ebeveynin herhangi bir çocuğu varsa ebeveyn tümüyle atılıyor. Örneğin Fen üst neti varken yalnız Fizik alt skoru mevcutsa Kimya/Biyoloji kapsaması yok olur. Bu çift sayımı önler ama eksik bölüm skorunda sessiz veri kaybıdır.

**Düzeltme:** Alt bölüm kapsamasını doğrula; eksikse ebeveyn toplamını “alt kırılım eksik” etiketiyle koru. Eksik parçayı sıfır/boş kabul etme.

### 26. P2 — “Risk” adı ve eşikleri net değil

**Kaynak:** DA:342–350; DT:73–76; FE:1884–1911.

Backend öncelik düzeyleri 40/60/80, frontend renkleri 50/75 eşikleriyle değişiyor. UI ise hesaplanmış çalışma önceliğine “Risk” diyor. Profilin üstündeki öğrenci risk modülüyle aynı kavrammış gibi algılanabilir. Neden o puanın verildiği, güven ve bileşenler tabloda görünmüyor.

**Düzeltme:** “Çalışma önceliği” adını kullan; eşikleri tek sözleşmeden al. Düşük başarı, yakın dönem kaybı ve tekrar sıklığı gibi gerekçeleri göster. Bunu öğrenci psikolojisi/terk riskiyle birleştirme.

### 27. P2 — Öncelik en önemli eylem olmasına rağmen bütün derslerin altında kalıyor

**Kaynak:** FE:1519–1554; CSS:12265–12269.

Dersler tek sütunda uzun kartlar halinde listeleniyor, çalışma tablosu en sonda. Ekran görüntüsünde ilk ders bile ancak ekranın alt kısmında başlıyor. Koçun işlem yapacağı bölüm fazla kaydırma gerektiriyor.

**Öneri:** En üstte üç kısa “Bu hafta odaklan” kartı göster. Ders kartları ardından gelsin; kapsamlı öncelik tablosu detayda açılabilsin. Sıralama seçenekleri: öncelik, gerileyen, alfabetik.

### 28. P2 — Kazanım detayına erişim yalnız fareyle üzerine gelmeye dayanıyor

**Kaynak:** FE:1624–1703,1789–1807.

Konu kutuları `div` ve yalnız `onMouseEnter/onMouseLeave` kullanıyor. Dokunmatik cihaz ve klavyede kazanım kırılımına güvenilir erişim yok. Tooltip düşük ekran yüksekliğinde en az 220 px dayattığı için taşıp sıkışabilir.

**Düzeltme:** Konuyu buton yap; tıklama/Enter ile kalıcı panel veya drawer aç. Escape, odak yönetimi ve `aria-expanded` ekle. Mobilde alt panel kullan; hover sadece hızlı önizleme olsun.

### 29. P3 — Grafikler örnek sayısı ve eksik ölçüm konusunda yanıltıcı olabilir

**Kaynak:** FE:844–920,1560–1589,1819–1849.

Mini grafikler kendi min/max aralığına ölçekleniyor; 0,25 net de büyük hareket gibi görünebilir. `null` noktalar çıkarılarak çizgi birleştiriliyor; ölçülmeyen aralık kesintisiz trend gibi görünür. Büyük grafikte toplam ve küçük dersler aynı net ekseninde olduğundan küçük ders hareketleri sıkışır. Tooltip fareye bağımlı, SVG etiketi puan modunda da “Net trendi”.

**Düzeltme:** Eksik ölçümde çizgiyi kes; örnek sayısı ve birimi göster. Derslerde sabit/net-soru oranı ekseni, toplam için ayrı görünüm veya seçili ders odağı kullan. Tablo erişimini ve klavye/touch veri seçimini koru.

### 30. P3 — Net hassasiyeti ve KPI farklarının anlamı açık değil

**Kaynak:** FE:50–52,309–313,752–756,1750–1761.

Netler tek ondalığa yuvarlanıyor; örneğin 7,25 değeri 7.3 görünebilir. “Ort. net” altındaki fark ortalamanın farkı değil son iki sınavın farkı. Ders kartındaki fark da son iki sınav değil pencerenin ilk/son farkı. “Orta” etiketi gelişim güveniyle karıştırılabilir; gerçekte ortalama başarı seviyesidir.

**Düzeltme:** Neti gerekli yerde iki ondalık ve Türkçe biçimle göster. “İlk sınava göre”, “önceki sınava göre”, “ort. başarı seviyesi” etiketlerini ekle. Göstergenin ölçmediği şeyi ima etme.

### 31. P2 — Ulusal tahmin olmayan türlerde anlamsız sıralama alanları var; yüzde ters anlamlandırılabilir

**Kaynak:** FE:1258–1322,1183–1191; `services/scoring.py:estimate_ranking`.

11 AYT/TYT'de ulusal tahmin bilinçli olarak yok; kart yine “Önceki deneme yok” diyebilir. Asıl neden türün ulusal tahmin üretmemesi. `yuzdelik_dilim` backend'de geride bırakılan aday oranıdır; UI yalnız “yüzdelik dilim” yazıyor, bar ise `100-pct` kullanıyor. Özellikle LGS'de üst dilim yüzdesiyle karışabilir.

**Düzeltme:** Tür uygunluğuna göre kartı değiştir. “Adayların %72'sinin önünde” ve gerekiyorsa “üst %28” ayrı adlarla gösterilsin. Kullanılan gerçek referans yılı ve tahmini olduğu açık olsun.

### 32. P2 — Alan/geçmiş türünden yapılan lise tahmini bazı kayıtları görünmez kılıyor

**Kaynak:** FE:162–167,412–422,680–685,1346–1354.

Herhangi bir lise sınavı veya alan bilgisi varsa öğrenci lise kabul ediliyor ve LGS seçenekleri gizleniyor. Yanlış tür yüklemesi veya yıllar arası geçmişte koçun kontrol etmek istediği kayıt seçeneklerden kaybolabilir. Bazı liste seçeneklerinde kayıt dururken alt grup seçeneğinin gizlenmesi de tutarsızlık yaratıyor.

**Düzeltme:** Sınıf/dönem kayıt bilgisini kullan; uyumsuz geçmişi tamamen gizlemek yerine “geçmiş/diğer türler” altında açık erişim ver.

## Performans ve entegrasyon boşlukları

### 33. P2 — Gelişime ulaşmak için önce bütün sonuç/puan geçmişi yükleniyor

**Kaynak:** FE:375–405,480–516,610–611; BE:102–197; DA:474–488,580–584.

Sayfa önce puan ayarını, ardından bütün sonuçları bekliyor; gelişim isteği daha sonra başlıyor. Kullanıcı yalnız gelişime baksa bile her sınavın puanı okunuyor. Sonuç response'u kullanılmayan backend KPI ve `net_trend` verilerini de taşıyor; frontend bunları yeniden hesaplıyor. Gelişim “son 5” istese bile geçmişin tamamını ORM'e alıp Python'da seçiyor. Kazanım oluşturma da sınav başına anahtar/müfredat sorguları yapıyor.

**Düzeltme:** Hafif sınav kataloğu + ihtiyaca göre sonuç/gelişim endpoint'leri kullan. Tekilleştirme/filtre/pencereyi mümkün olduğunca DB'de uygula; seçili sınavların anahtarlarını toplu yükle. Öğrenci ve veri sürümü bazlı cache kullan; görüntüleme için öğrenci başına tam karne hesaplamasını seri çağırma. Canlı p50/p95 ve sorgu sayısı henüz ölçülmedi; bunlar koddan görülen büyüme noktalarıdır.

### 34. P2 — Mevcut öneriler iki ayrı kuralla üretiliyor

**Kaynak:** HTML:388–413,647 sonrası; `application/olcme_karne_pdf.py:1956`; DA:763–807,941–976.

Karne güncel sınavdaki yanlış/boş sorulardan kazanılabilir nete göre öncelik çıkarıyor. Gelişim ise çok sınavlı başarı/gerileme/yakın dönem/süreklilik ağırlıklı puan kullanıyor. Ayrıca HTML'in çalışma önceliği `karne_insights.focus` ile birebir aynı servis değil. Yalnız mevcut `priorities` tablosunu görünür kılmak, karnedeki önerileri entegre etmek anlamına gelmez.

**Düzeltme:** Ortak, sayısal ve kimlikli bir öneri servisi kur. “Bu sınavın kayıpları” ve “tekrarlayan kazanım kayıpları” ayrı gerekçeler olarak sunulsun; çelişmeden birbirini tamamlasın. Formatlanmış HTML metinlerini parse ederek entegrasyon yapma.

### 35. P2 — Analizden koç kararına ve ödeve izlenebilir bağlantı yok

**Kaynak:** FE:`PriorityRow`, `DevelopmentCard`; `assignment_manual/models.py:427–450,518–557`; `frontend/components/odev/OdevVerWizard.tsx:88–90,495,912–930`.

Öncelik satırında yalnız bilgi var; seç/onayla/ödeve aktar/sonra kontrol et aksiyonu yok. Wizard öğrenci ve ders/kitap ön seçimini destekliyor ama sınav önerisiyle ilişkili bir kimlik sözleşmesi yok. Sınav müfredatı ile kitap içeriklerinin konu kimlikleri de farklı alan modellerine ait.

**Düzeltme:** Aşağıdaki koç onaylı akışı kur. Sırf konu adları aynı diye kitap içeriğini otomatik eşleştirme. Ders/konu/alt kazanım ile kaynak içerikleri arasında doğrulanabilir eşleme veya koç seçimi kullan.

## Önerilerin üç alt görünümde yerleşimi

1. **Genel Bakış:** Son karşılaştırılabilir sınav + kısa gelişim özeti + en fazla üç “Koçun çalışma gündemi” kartı. Her kart ders, konu, gerekçe, veri güveni ve durumu gösterir. Kaynak sınava ve gelişim detayına gidiş bulunur.
2. **Sınavlarım:** Her sınavın altında açılır “Bu sınavdan çıkan öneriler”. Doğru alan kapsamındaki yanlış/boş, tekrar soru numaraları, sonuca etkisi ve karne bağlantısı aynı kaynaktan gelir. Önceki öneri durumları görünür olur.
3. **Gelişim:** Öncelikler üstte, ders/konu/kazanım kanıtı altta. Sonuç odaklı kayıp ile çok sınavlı tekrar bilgisi ayrı belirtilir. Bir dersin ayrıntısına girildiğinde ilgili öneriler de görülebilir.
4. **Büyük yeşil/kırmızı/turuncu kartlar:** Tamamen kaldırılması gerekmiyor; daha kısa ve ölçü birimi açık hale getirilsin. Aynı üst bilgiyi KPI, highlight ve ders anlatımında üç kez tekrar etmek yerine bir bölüm kısa özet, diğeri kanıt, diğeri eylem sunsun.
5. **Tek sınavlı öğrenci:** Gelişim teşhisi yerine güncel sonuç ve kontrol önerisi gösterilsin. “Yetersiz” sayaçlarıyla bütün ekran doldurulmasın.
6. **Tam başarılı öğrenci:** Yapay zayıflık ve yüksek risk üretilmesin. “Öncelikli kayıp yok; kazanımı koruma” durumu ve koçun isteğine bağlı pekiştirme aksiyonu sunulsun.

## Öneri → koç kararı → ödev → tekrar ölçüm sözleşmesi

### A. Ortak öneri veri modeli

En az şu alanlar gerekli:

- Öğrenci, kurum, şube, eğitim yılı; sınav türü, öğrenci alanı ve kapsam.
- Kaynak `exam_id`, `answer_id`, `answer_key_item_id`/soru numaraları, kitapçık; geçmiş ölçüm kimlikleri.
- Müfredat `subject_id`, `topic_id`, `outcome_id`, `sub_outcome_id` ve sürüm; eşleşmemiş metinse açık kaynak durumu.
- Öneri türü: güncel kayıp, tekrarlayan kayıp, yeniden kontrol, başarıyı koruma.
- Doğru/yanlış/boş, ölçülen soru ve sınav sayısı, ilk/son tarih, eşleme oranı ve veri güveni.
- Gerekçe kodları, hesaplama sürümü; biçimlendirilmemiş sayısal öncelik ve varsa kazanılabilir net.
- Oluşturulma/güncellenme zamanı, veri sürümü, geçerlilik/eski veri durumu.

Kazanılabilir net bir garanti değildir. Güncel sınavdaki soru kaybı üzerinden, sınavın gerçek yanlış düzeltmesiyle hesaplanmalı. Farklı sınavların kayıpları toplanıp tek sınav hedefi yapılmamalı; aynı soru/kazanımdan gelen öneriler iki kez sayılmamalı.

### B. Koç kartı örneği — temsili veri

> **TYT Matematik · Problemler**  
> Bu sınavda: 2 yanlış, 1 boş. Son üç ölçümde de kayıp var.  
> Kanıt: 8 soru / 3 sınav; veri güveni orta.  
> Bu sınav için geri kazanılabilir alan: yaklaşık +3,50 net (4 yanlış düzeltmesi varsa).  
> **İncele · Çalışma planına al · Ödeve dönüştür · Ertele**

Örnekteki hesap `2 × 1,25 + 1 = 3,50` net potansiyelidir; önerinin uygulanmasıyla kesin kazanılacak net değildir. Soru sayısı ve çok sınavlı kanıt farklı kapsamlar olarak açık yazılmalıdır.

### C. Koç kararları ve durumlar

`Yeni → Koç inceledi → Plana alındı → Ödev oluşturuldu → Çalışma tamamlandı → Tekrar ölçüm bekleniyor → Tekrar ölçüldü`.

Alternatif durumlar: ertelendi, gerekçeyle uygun bulunmadı, veri değişti/eski öneri. Koç tek tıklamayla öneriyi inceleyebilmeli; ders/kaynak/yük/tarih değişikliği yapabilmeli. Kendiliğinden öğrenciye ödev veya veliye mesaj gönderilmemeli.

### D. Mevcut ödev sihirbazını kullan

Yeni ödev ekranı kurmak yerine mevcut `OdevVerWizard` öneri kimliği ve öğrenci bağlamıyla açılsın. Öğrenci kilitli, ders ve doğrulanmış konu eşlemesi ön seçili olsun. Koç mevcut kaynaklardan içerik seçsin. Kaydetme öncesi kitap sahipliği, açık aynı konu ödevi, önceki tamamlanma ve haftalık yük gösterilsin.

Öneriden tekrar tıklama/istek tekrarı aynı ödevi çoğaltmamalı. Öneri→ödev ilişkisi kalıcı tutulsun; yalnız URL veya serbest metin notuyla yetinilmesin. Kısmi başarısızlıkta yalnız başarısız işler tekrar denensin.

### E. Görev tamamlanması ile öğrenme sonucu ayrımı

Ödevin tamamlanması kazanımın öğrenildiği anlamına gelmez. Sonraki sınavda aynı kazanım sorulmamışsa durum “ölçülmedi”; soru doğruysa örnek sayısıyla birlikte iyileşme kanıtı gösterilsin. “Önce 2/8, sonra 3/4” gibi ölçüm ve tarih bilgisi korunsun. Eşdeğer zorluk ve örnek sayısı olmadan kesin “ödev sayesinde arttı” iddiası kurulmasın.

### F. Koç notu ve hata nedeni

Yanlış cevaptan kendiliğinden dikkatsizlik/bilgi eksikliği/süre baskısı teşhisi üretme. Koç/öğrenci incelemesinde işaretlenebilen nedenler ve kısa not eklenebilir. Kaynak ataması bu karara göre değişebilir. Süre verisi yoksa zaman yönetimi skoru sunulmasın.

### G. Tek motor, iki sunum

Aynı öneri servisi karneye kısa öğrenci/veli açıklaması, koç ekranına kanıt+durum+eylem döndürsün. Karne HTML'i ve Gelişim frontend'i ayrı öneri formülleri taşımamalı. Sonuç anahtarı/cevap/alan değişince sayısal öneri yenilensin; koçun geçmiş kararı ve bağlı ödev kaydı silinmesin. Eski kararın hangi veriye dayandığı saklansın.

### H. Erişim ve performans

Öneri görme/onaylama/ödeve dönüştürme işlemleri aynı öğrenci ve kurum kapsamına tabi olsun. Koç ataması kapanınca yeni eylem yetkisi de kapansın. Kaynak sınav değişmişse eylem öncesi tekrar doğrula. Ekran açılışında her sınav için tam karne/PDF üretme; sayısal ortak özeti toplu/önbellekli al.

## Uygulama sırası

1. **Önce veri güveni:** Kurum/şube/dönem sınırı, son kayıt seçimi, puan eşitliği, alan/toplam net ve yıl validasyonu.
2. **Sonra ekran tutarlılığı:** Ortak filtre, boş özel seçim, istek yarışı, yenileme, birimler ve gerçek veri yokluğu durumları.
3. **Ortak öneri motoru:** Kimlikli güncel kayıp ve geçmiş tekrar kanıtı; veri güveni ve alan politikası.
4. **Koç ekranı:** Genel Bakış'ta üç gündem kartı; Gelişim'de üst öncelikler; sınav bazlı öneri açılımı.
5. **Ödev bağlantısı:** Koç onayı, mevcut sihirbaz, kaynak eşlemesi, işlem tekrarına karşı koruma ve kalıcı ilişki.
6. **Sonuç takibi:** Tamamlanan çalışma ve sonraki gerçek ölçümün ayrı izlenmesi.

## Kabul ve doğrulama senaryoları

- Kuruma bağlı yönetici başka kurum öğrencisini okuyamaz; normal koç yalnız yetkili öğrenciyi görür.
- Tekrar yükleme üç görünümde de tek sınavdır; karne aynı `answer_id` kullanır.
- Eşit puan sıra kuralı liste, karne ve kayıtlı puanda aynıdır.
- Eğitim yılı değişimi doğru kapsamı getirir; puan yılı bununla karışmaz.
- AYT/11 AYT/LGS/LGS 7/manuel sınavlar doğru alan ve karşılaştırılabilir grupta kalır.
- Boş özel seçim hiçbir sınavı analiz etmez. Hatalı yıl 400 olur; bulunmayan puan 0'a dönüşmez.
- Hızlı öğrenci/yıl değişiminde eski yanıt yeni state'i ezmez; üst yenileme bütün aktif veriyi yeniler.
- Yüzde puan/net, önceki sınav/ilk sınav farkı ve soru sayısı değişimi açık gösterilir.
- Tam başarıda sahte zayıf alan yoktur; tek ölçümde tekrarlayan kayıp teşhisi yoktur.
- Eksik kazanım eşlemesi başarı eksikliği sayılmaz; iptal ve B kitapçığı aynı kuralları kullanır.
- Dokunmatik/klavye ile bütün kazanım kanıtları açılır; mobilde panel taşmaz.
- Öneriden ödev tekrar tıklamayla çoğalmaz; tamamlanan ödev otomatik “öğrenildi” sayılmaz.
- Sonraki sınavda kazanım sorulmadıysa “ölçülmedi”; öneri kaynağı değiştiyse “veri güncellendi” görünür.


## Bu incelemede yapılan doğrulamalar

- Mevcut gelişim analizi ve kayıtlı puan modüllerinden **21 test geçti**.
- `/tmp` altında hazırlanan **10 ek denetim senaryosu**, mevcut hatalı/sınırlı davranışları beklenen sonuç olarak doğruladı. Bunlar düzeltme testleri değildir; hataların tekrar üretilebildiğinin kanıtıdır. Uygulama test dosyalarına eklenmedi.
- Son denetim turu toplam **31/31 doğrulama** ile tamamlandı. Bu, sayfanın hatasız olduğu anlamına gelmez; yukarıdaki mevcut davranışların doğrulandığını gösterir.
- Ek senaryolar: kurum sınırı, tekrar yükleme, eğitim yılı karışımı, hatalı yıl/500, desteklenmeyen yıl/sıfır puan, boş özel seçim, değişen soru sayısında oran/net ayrışması, eşit puanda karne/liste sırası, 11 AYT kapsam etiketi, tek ölçüm/yüksek öncelik.
- Frontend'deki gerçek hesap bloğu TypeScript'ten çalıştırılarak ham netle güçlü ders seçimi ayrıca doğrulandı.
- Testler ayrı `test_coach_exam_audit_20261105` veritabanında çalıştı; test veritabanı sonunda silindi.
- Canlı tarayıcı oturumu, gerçek öğrenci verisi, mobil cihaz etkileşimi ve canlı performans ölçümü yapılmadı. Mobil/klavye bulguları olay işleyicilerinin kod incelemesine dayanır. İstek yarışı koddan görülen bir risktir; kontrollü gecikmeli browser testiyle henüz çalıştırılmadı.
- Uygulama kodunda veya canlı veride değişiklik yapılmadı; yalnız bu rapor eklendi.


## Uygulama — 5 Kasım 2026

Kullanıcının uygulama talebiyle çalışma merkezi tamamlandı. Yukarıdaki kod/satır referansları ve ilk denetim sonuçları tarihsel kayıttır.

- **Hızlı bakış:** Genel Bakış ilk üç çalışma önceliğini, eksik/tekrarlayan/yeniden ölçülecek/atanmış çalışma sayılarını gösterir. Gelişim görünümünde tüm gündem aranabilir ve türüne göre süzülebilir. Sınavlarım’dan tek sınavın önerilerine geçilir.
- **Kanıta dayalı gündem:** Güncel kayıplar, birden fazla ölçümde tekrarlayan eksikler, geçmiş eksiklerin yeniden kontrolü ve kazanım eşleşmesi eksik veriler ayrı gösterilir. 11. sınıfta seçili puan alanına katılmayan akademik dersler takipte kalır; puana katkı vaadi verilmez. Tek ölçüm güçlü kalıcılık kanıtı sayılmaz.
- **Koç kararı:** Planlandı/incelendi/ertelendi/gündemden çıkarıldı kararları, notları ve değişiklik geçmişi kalıcıdır. Kaynak değişince eski karar güncelmiş gibi gösterilmez.
- **Ödev bağlantısı:** Öneri mevcut ödev sihirbazına taşınır; öğrenci ve kaynak kanıtı korunur. Kaynak/kitap seçimini koç yapar: müfredat kimlikleri kaynak bankası kimlikleri yerine kullanılmaz. Aynı öneriden tekrar aktif ödev oluşturulmaz. Ödevin tamamlanması kazanımın öğrenildiği anlamına gelmez; sonraki gerçek ölçüm beklenir.
- **Veri doğruluğu:** Kurum/şube/eğitim yılı/yetki kapsamı, yinelenen sonuçlarda son kayıt, desteklenmeyen puan yılı, boş özel seçim, AYT alanı ve 11. sınıf kapsamı, LGS 7/8 ayrımı, ağırlıklı kazanım oranları, kısmi ders ayrışması ve eşit puanda ortak sıra düzeltildi. Karne ve koç gündemi kayıp hesabını ortak servisten alır.
- **Ekran davranışı:** Ortak filtreler ve görünüm öğrenci/bağlam bazında korunur. Eski isteklerin yeni bağlamı ezmesi önlenir; yenileme sınav sekmesini de yeniler. Mobil yerleşim ve klavye ile ayrıntı erişimi düzenlendi.
- **Açılış:** Çalışma gündemi hafif sonuç kataloğuyla açılır. Puan/sıralama hesapları Sınavlarım veya puan geçmişi istendiğinde yüklenir; yüklenmeyen puan sıfır gösterilmez. Canlı süre ölçümü yapılmadı.

### Son doğrulama

- İlgili backend modülleri: **201/201 test geçti**; kapsamda karne, puan/sıra, gelişim, yeni çalışma gündemi ve ödev entegrasyonu var.
- Frontend üretim derlemesi başarılı. Değişen dört ekran/bileşende hedefli lint uyarısız geçti.
- Gerçek React bileşeni, kontrollü API verileriyle Chromium’da sınandı: özet/tüm gündem, arama, karar kaydı, sınavdan gündeme geçiş, boş özel seçim, görünüm/filtre kalıcılığı, klavye ayrıntısı ve 390 px mobil taşma kontrolü geçti; tarayıcı hatası yok.
- `0052` ve `0053` migration’ları **yerel lms-dev Docker veritabanına (5433) uygulandı**. Yeni tablolar çalışma kararlarını ve olay geçmişini tutar. Üretim ortamında da dağıtım sırasında migration gerekir.
- Canlı sunucuya dağıtım ve gerçek öğrenci oturumuyla uçtan uca doğrulama yapılmadı. Tarayıcı kontrolü kontrollü verilerle yapıldı; üretim veri dağılımı ve performansı hakkında ölçüm sonucu değildir.
