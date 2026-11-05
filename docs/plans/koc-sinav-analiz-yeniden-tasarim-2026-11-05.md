# Koç sınav analiz ekranı — yeni tasarım

## Kapsam

Öğrenci çalışma merkezindeki Sınavlar sekmesinin Genel Bakış ve Derin Analiz görünümleri yeniden tasarlandı. Ödev üretme veya otomatik çalışma planı oluşturma eklenmedi. Mevcut Sınavlarım listesi, karne açma ve PDF indirme akışları korundu.

## Veri ve hesaplama

- Kaynaklar: mevcut `studentExamApi.results` ve `studentExamApi.development` yanıtları. Yeni servis, bağımlılık, veritabanı yazma işlemi veya migration eklenmedi.
- TYT, AYT ve diğer sınav türleri ayrı incelenir. Tarih aralığı ve son 1/3/5/10/tüm sınav kapsamı birlikte uygulanır.
- Konu önceliği seçili dönemdeki **yanlış + boş** cevap sayısına göre azalır; eşitlikte yanlış ve gözlem sayısı kullanılır. Bu sayı net kaybı veya garanti telafi edilebilir net olarak etiketlenmez.
- Konu sayıları mevcut backend konu gruplarından alınır. Alt kazanımlar ayrıca ders/konu toplamına tekrar eklenmez.
- Ders ve konu listeleri backend `score_included` bilgisini dikkate alır.
- Net eğrisi aynı türdeki sınavları tarih sırasıyla gösterir. İlk/son farkı tek sınavda hesaplanmaz. Sınavların soru sayıları ve zorlukları farklı olabilir; grafik bunları eşitleyen bir model değildir.
- Kazanım grafiği backend doğru oranını kullanır. Gözlem bulunmayan sınav boş kalır; sıfır başarı gibi gösterilmez. Soru içeriği ve gerçek çözüm süresi çıkarımı yoktur.

## Kullanım

Genel Bakış: net alan grafiği, açılıp kapanabilen yanlış/boş serileri, dönem metrikleri, seçilen sınavdan karne açma ve öncelikli konular.

Derin Analiz: ders filtresi, konu araması, kayıp sıralaması, konu seçimi, kazanım/alt kazanım gözlem sayısı ve veri güveni, açılan kazanımın etkileşimli doğru oranı grafiği ve sınav geçmişi tablosu, ders × sınav kayıp ısı haritası.

Genel Bakış ile Derin Analiz arasında kapsam korunur. Sınavlarım listesindeki inceleme düğmesi seçilen sınavı tek sınav kapsamıyla açar. Öğrenci/kurum/şube/eğitim yılı değişiminde bu seçim sıfırlanır.

Grafikler filtre ve seçimlere anında tepki verir. Yeni sınav sonuçlarını sunucudan almak mevcut Yenile işlemiyle yapılır; websocket veya sürekli sunucu yayını eklenmedi.

## Güvenilirlik

Analiz isteği değiştiğinde önceki istek iptal edilir. Yanıtlar güncel istek kimliğiyle eşleştirilir; eski kapsamın verisi yeni kapsamda gösterilmez. Unmount sonrası yanıtlar etkisiz kalır. 30 saniye timeout, hata ve yeniden deneme görünümü vardır. Eşleme eksikliği öğrenci başarısızlığı olarak gösterilmez.

## Dosyalar

- `frontend/components/coach/student360/ExamAnalyticsWorkspace.tsx`: yeni iki görünüm ve etkileşimler.
- `frontend/components/coach/student360/ExamAnalyticsWorkspace.module.css`: responsive tasarım.
- `frontend/components/coach/student360/examAnalyticsModel.ts`: tür/tarih/kapsam seçimi ve kayıp sıralaması.
- `frontend/components/coach/student360/SinavlarTab.tsx`: yeni bileşenin entegrasyonu, Derin Analiz sekme adı ve tek sınav geçişi.
- `frontend/components/olcme/types.ts`: backend'in zaten döndürdüğü isteğe bağlı müfredat kimlikleri.
- `frontend/e2e/exam-analytics.spec.ts`: sentetik veriyle hesaplama ve tarayıcı kontrolleri.

## Doğrulama ve sınırlar

Testler gerçek öğrenci kaydı değiştirmeden, API yanıtları tarayıcıda mock edilerek çalıştırılır. Bu doğrulama backend hesaplarının gerçek veri üzerindeki doğruluğu, canlı sunucu performansı veya PDF içerik regresyonu ölçümü değildir. Bu çalışma için üretim deploy, migration veya restart yapılmadı.

Geri dönüş: yeni analiz bileşeni entegrasyonu kaldırılarak önceki görünüm geri bağlanabilir; veritabanı değişikliği bulunmaz. Çalışma öncesinde mevcut olan diğer dosya değişiklikleri bu geri dönüş kapsamına dahil edilmemelidir.

### Test sonuçları

- Playwright: **7/7 başarılı**. Kayıp sıralaması ve tür/tarih ayrımı; 390/768/1440 px etkileşim ve taşma kontrolü; hata sonrası tekrar deneme ve hızlı tür değişimi; listeden tek sınav kapsamına geçiş; 30 saniye timeout ve ardından tekrar deneme.
- Değişen frontend bileşenleri ve test dosyası için hedefli ESLint: başarılı.
- `git diff --check`: başarılı.
- Görsel kontroller: Her iki görünümün üç ekran boyutunda sentetik verili ekran görüntüleri üretildi; masaüstü Genel Bakış ve mobil Derin Analiz ayrıca görsel olarak incelendi.
- TypeScript: `npx tsc --noEmit --incremental false` başarılı.
