# Sınav karneleri veri ve hesaplama incelemesi — 5 Kasım 2026

İncelenen türler: AYT (`YKS_AYT`), 11. sınıf AYT (`AYT_11`), TYT (`YKS_TYT`), 11. sınıf TYT (`TYT_11`), LGS ve 7. sınıf LGS. İnceleme mevcut çalışma ağacını kapsar; önceden değiştirilmiş dört karne dosyası korunmuştur. Aşağıdaki bulgular ilk denetim anını belgeler; ardından yapılan düzeltmeler ve son doğrulama bu belgenin son bölümündedir.

Bu bir kaynak kodu, test ve kontrollü örnek veri incelemesidir. Canlı sunucu/veritabanı okunmadı; ekran görüntüsündeki öğrencinin kayıtları sorgulanmadı. Aşağıdaki koşullu hataların canlıda hangi öğrencileri etkilediği ayrıca ölçülmelidir. Katsayıların dış kaynaklarla/ÖSYM yayınlarıyla doğruluğu bu çalışmada tasdik edilmedi.

## Sonuç

Veri akışının ana omurgası doğru: karne önizlemesi, PDF ve gönderim `build_student_detail_payload` kullanıyor. Ancak bağlı TYT kimliği ve kayıt seçimi, alan/toplam net kapsamı, puan ortalaması, iptal sorular ve çalışma önerilerinde hatalar var. Özellikle bağlı TYT sonucunun başka öğrenciye bağlanması öncelikli düzeltilmeli.

## Veri kaynakları

| İçerik | Kaynak | Değerlendirme |
|---|---|---|
| Öğrenci ve kurum | `StudentAnswer.student`, sınavın kurumu | Ana bağlantı doğru; optik eşleşmemişse ham ad/no kullanılıyor. |
| Alan ve sınıf | Sınavın eğitim yılındaki aktif `OgrenciKayit`, kayıt alanı veya sınıf alanı | Sınav yılı kullanılması doğru. Alan yoksa SAY varsayılıyor. |
| Net, doğru/yanlış/boş | `StudentAnswer`, `StudentSectionScore` | Üst/alt ders ayrımı mevcut; bazı görünümlerde kapsamlar karışıyor. |
| Puan | `StudentStoredScore.by_year`, seçilen puan yılı | TYT, AYT, 11 TYT/AYT ve LGS ayrı formüllere yönleniyor. |
| Kurum sırası | Tamamlanmış oturumlardaki son öğrenci kayıtları; eşleşmemiş optikler de dahil | Puan türü havuzu kullanılıyor. Ortalama havuzu bundan farklı. |
| Kazanım | Birincil cevap anahtarı, bağlı kazanım/alt kazanım, içe aktarılan metin/kod çözümleme | Genel yol doğru; eksik B eşlemesi ve iptal durumu hatalı. |
| Zorluk | Kurumun eşleşmiş sonuçlarındaki doğru oranı, en az 20 katılımcı | B→A dönüşümü ve iptal dışlama var. AYT kolay bandı tüm testleri kapsıyor. |
| Geçmiş | Aynı kurum ve sınav türündeki tamamlanmış sonuçlar | Tarih ve tekrar yükleme seçiminde açıklar var. |
| PDF/önizleme | Sunucu HTML'i; hata halinde eski PDF üreticisi | Ortak veri var; PDF fallback durumunda görünüm birebir aynı olmayabilir. |

## Bulgular

### 1. P1 — Bağlı TYT sıralaması başka öğrencinin sonucunu gösterebilir

Kaynak: `backend/apps/coaching/olcme_degerlendirme/views/analysis_views.py:1623`, `:1633`.

TYT sıralama indeksi her dolu `raw_student_id` değerini kabul ediyor. Öğrenci kimliğiyle sonuç bulunamazsa `0`, `1` gibi ortak optik sıra numaralarıyla da eşleştiriyor. Aynı ham numara birden fazla kişide varsa en yüksek puanlı kişi seçiliyor. Oysa puana TYT katkısını getiren `scoring.is_reliable_tyt_link_code` bu zayıf numaraları özellikle reddediyor.

**Doğrulama:** Mock veride TYT öğrencileri 101 ve 102'nin ham numarası `0`, puanları 200 ve 350. TYT kaydı olmayan öğrenci 999'un ham numarası da `0` verildiğinde `_tyt_siralama_for` başka öğrencinin **50 net, 350 puan, kurum 1.si** sonucunu döndürdü.

Ayrıca puan tarafı ad/normalize ad/TC ile eşleştirme yapabilirken sıralama tarafında ad ve TC fallback'i yok. TYT katkısı ve dersler bulunduğu halde bağlı TYT özetinin boş kalması da mümkün.

**Öneri:** Kimlik çözümlemesini tek yerde yap; seçilmiş TYT `answer_id` üzerinden ders, puan ve sıra üret. Zayıf ham numaralarla fallback yapma; belirsiz adları otomatik seçme.

### 2. P1 — Yeniden yüklenen TYT'de eski sonuç AYT puanına girebilir

Kaynak: `services/scoring.py:602–611`, `:696–705`; `views/analysis_views.py:610–644`, `:857–865` (aynı `olcme_degerlendirme` dizini altında).

Analiz listesi öğrenci başına en yüksek `StudentAnswer.id` kaydını seçiyor. Buna karşılık `LinkedTytIndex` kayıtları artan oturum/id ile okuyup `setdefault` kullanıyor; ilk/eski kayıt korunuyor. İndekssiz TYT çözümleyici de `.first()` kullanıyor. Bağlı TYT ders ortalaması ise tekrar yüklemeleri tekilleştirmeden topluyor.

**Etki:** TYT sonucu düzeltildikten sonra AYT puanı eski TYT netiyle hesaplanabilir; bağlı TYT sıralama satırı yeni sonucu gösterebilir. Aynı karne içinde puan, ders ve bağlı TYT özeti ayrışır. Tekrar yüklenen kişiler ortalamada birden fazla ağırlık kazanır.

**Öneri:** Puan, ders, sıra ve ortalamada aynı son tamamlanmış cevap kaydı havuzunu kullan.

### 3. P1 — EA/Sözel puanının yanında SAY kurum ortalaması gösteriliyor

Kaynak: `views/analysis_views.py:1700–1715`, `:1935–1944`; `application/olcme_karne_html.py:712–714`.

`build_exam_payload_context`, AYT ve 11 AYT için genel `kurum_scores` listesine her zaman SAY puanını koyuyor. Öğrencinin üstteki puanı kendi alanından seçilse de `kurum_avg_puan` bu SAY listesinden hesaplanıp HTML'e taşınıyor. Alt puan tablosundaki `puan_turleri_avgs` ise ayrı ve doğru tür bazında hesaplanıyor.

**Etki:** EA öğrencisi kendi EA puanını SAY ortalamasıyla karşılaştırır; üst kart ve alt EA satırı farklı kurum ortalamaları gösterebilir. Aynı sorun Sözel AYT için de var.

**Öneri:** Üst kart ortalamasını `puan_turleri_avgs[alan_puan_turu]` üzerinden seç; ayrı türlerin ortalamasını karıştırma.

### 4. P2 — AYT alan neti, bütün testlerin kurum netiyle karşılaştırılıyor

Kaynak: `views/analysis_views.py:1658–1659`, `:1769–1773`, `:1878–1880`; `application/olcme_karne_html.py:680–687`.

AYT kapaktaki net alan neti, `kurum_avg_net` ise `StudentAnswer.total_net` ortalaması. Geçmiş yoksa karşılaştırma kartı bunları aynı soru sayısı üzerinden karşılaştırıyor. Geçmiş varsa grafik toplam neti çiziyor; kapaktaki önceki sınav farkı da toplam net farkı olmasına rağmen alan netinin yanında gösteriliyor.

**Doğrulama:** Alan neti 16, toplam net 40 ve kurum toplam net ortalaması 45 olan 80 soruluk alan örneğinde kart **16 − 45 = −29 net** fark üretti. Önceki toplam net 30 olduğunda kapak farkı **+10** oldu; alan netinin önceki değeri hiç kullanılmadı.

**Öneri:** Toplam net ve alan neti için ayrı alanlar/ortalamalar/geçmiş serileri üret. Kapaktaki farkın hangi nete ait olduğunu açıkça belirt.

### 5. P2 — Alan dışı kolay sorular AYT hedef netini şişiriyor

Kaynak: `services/difficulty_bands.py:117–150`; `application/olcme_karne_html.py:439–448`, `:746–750`.

Zorluk özetinde kolay sorular tüm kitapçıktan, orta/zor sorular alandan geliyor. HTML bu karma kapsamdaki kolay+orta kayıpları doğrudan öğrencinin **alan netine** ekliyor. Alan dışı kolay soru çözmek öğrencinin seçili alan netini artırmaz.

**Doğrulama:** 80 soruluk alanı ve 16 alan neti olan kontrollü örnekte, tüm testlerden gelen 100 kolay boş soru hedefe katıldığında **116 net** hedefi oluştu. Örnek, kapsam hatasının soru tavanını bile aşabildiğini gösterir; canlıdaki öğrencinin hedefi değildir.

**Öneri:** Hedef kazancını sadece seçili puana giren soru kümesinden hesapla. Genel kolay soru analizi ayrıca sunulabilir.

### 6. P2 — İptal sorular kazanımda boş, cevaplarda eksik, tekrarda kayıp sayılıyor

Kaynak: `views/result_views.py:410–431`; `services/topic_blocks.py:217–224`; `application/olcme_karne_html.py:545–546`, `:559–564`.

Skorlama iptal soruyu doğruya ekliyor; zorluk analizi dışlıyor. Ancak kazanım tablosu `cancelled` sonucunu `else` ile boş sayıyor. HTML cevap tablosu da boş renklendiriyor; tekrar listesi doğru/yanlış dışındaki ve anahtarı olan her soruyu boş kabul ediyor. Bu nedenle iptal soru çalışma önerisine ve net kazancı tahminine de girebiliyor.

**Doğrulama:** `result='cancelled'`, doğru cevap `A` olan soru, HTML'de `cls='empty'` ve tekrar listesinde `empty=[1]` üretti.

**Öneri:** İptal durumunu bütün içerikte açıkça ele al; boş/yanlış kaybına ve çalışma önceliğine katma. Puanlama politikasını ayrıca koru.

### 7. P2 — 11 AYT'de puana girmeyen dersler “puanını en hızlı artıracak” önerisine giriyor

Kaynak: `services/scoring.py:453–482`; `views/analysis_views.py:276–286`; `application/olcme_karne_html.py:389–413`.

11 AYT puanı SAY için Matematik/Fizik/Kimya/Biyoloji, EA için Türk Dili/Tarih/Coğrafya/Matematik üzerinden hesaplanıyor. Felsefe ve Din toplam nette bulunuyor ama iki puana da girmiyor. Buna karşılık `_mark_alan_inclusion`, `AYT_11` için bütün dersleri dahil işaretliyor. Çalışma önceliği bu işareti kullandığından puana etkisiz dersler de öneriliyor.

**Doğrulama:** SAY 11 AYT örneğinde Felsefe'nin 5 boş sorusu **Felsefe ≈ +5 net** önceliği üretti. Bu toplam neti artırır; seçili SAY puanını artırmaz. Bu nedenle toplam netin gösterilmesi kendi başına hata değildir; önerinin puan iddiası yanlıştır.

**Öneri:** Toplam net kapsamını puan kapsamından ayır; 11 AYT önerilerini SAY/EA ders kümesiyle filtrele.

### 8. P2 — Yanlış cezası sınav ayarından alınmadığı için yanlış açıklanabiliyor

Kaynak: `models/exam.py:114–119`; `views/result_views.py:436–454`; `application/olcme_karne_html.py:346–358`.

Payload `wrong_answer_count` ve `per_section_penalty` taşımıyor. HTML cezayı bölüm doğru/yanlış/netinden tahmin ediyor. Bölüm düzeltmesi kapalıysa bölüm neti doğruya eşit, genel net ise yanlış cezasını içeriyor. HTML bu durumda “yanlışlar neti düşürmez” ve sıfır kayıp net gösteriyor.

**Doğrulama:** 10 doğru, 4 yanlış, bölüm neti 10 ve genel neti 9 olan örnekte **“yanlışlar neti düşürmez”, 0 net kaybı** çıktı. Ayrıca hiç yanlış yapmayan öğrencide özel sınav cezası çıkarılamıyor; türe göre 3/4 varsayılıyor.

**Öneri:** Cezayı ve uygulanma düzeyini açık alanlarla taşı; tahmin etme. Davranış ve kazanılabilecek net hesabını bu politikaya bağla.

### 9. P2 — Geçmiş serisi aynı gün sonraki sınavı ve farklı yüklemeleri karıştırabilir

Kaynak: `views/analysis_views.py:393–435`, `:1893–1914`; `application/olcme_karne_html.py:453–484`, `:639–641`.

`_karne_net_history` yalnız `exam_date <= current.exam_date` sınırı koyuyor. Aynı gün daha sonra oluşturulmuş sınav dışlanmıyor; mevcut sınav listede son sırada olmayabiliyor. Bu durumda kapak delta vermeyebilir ama yorum kodu serinin son iki kaydını mevcut sınav sanarak değerlendirebilir. Tarihsiz sınavda tarih sınırı hiç yok.

Ayrıca geçmişte aynı sınavın birden fazla yüklemesinden hangisinin seçileceğini belirleyen `answer.id` sıralaması yok. Ders sparkline sorgusu da son cevap kaydını seçmeden sonuçları sınav/ders adına yazıyor. Genel geçmiş neti ile ders geçmişi farklı yüklemelerden gelebilir. Eğitim yılı sınırı da yok; farklı yılın/soru sayısının aynı tür sınavları kıyaslamaya girebilir.

**Öneri:** Sınav tarihi+oluşturma zamanı+kimlik ile mevcut sınavda biten kesin bir sıra kur; her sınavda aynı son cevap kaydını seç. Eğitim yılı ve değişen soru sayısı politikasını açıklaştır.

### 10. P2 — Eksik B eşlemesinde yanlış kazanıma başarı atanabilir

Kaynak: `services/topic_blocks.py:189–191`; karşılaştırma için `views/analysis_views.py:2420` ve `tests/test_olcme_analysis_booklet.py:test_unpaired_question_skips_b_students`.

Kazanım bloğu B karşılığı olmayan A sorusunda doğrudan aynı sayılı B sorusuna düşüyor. Kısmi B eşlemesi olan bir sınavda bu numara başka soruya ait olabilir. Soru analizi tarafı eşlenmeyen soruyu atlama davranışını test ediyor; karne kazanımı aynı güvenceyi kullanmıyor.

**Etki:** Öğrencinin başka sorudaki doğrusu/yanlışı yanlış kazanıma yazılabilir; öncelik ve kazanım haritası hatalı olur.

**Öneri:** Hiç eşleme yok durumu ile kısmi eşleme durumunu ayır. Kısmi eşlemede karşılığı olmayan soruyu bilinmiyor say; aynı numaraya otomatik düşme.

### 11. P2 — AYT davranış kartının doğruluğu ve sayıları farklı kapsamdan geliyor

Kaynak: `views/analysis_views.py:1922–1924`; `application/olcme_karne_html.py:361–366`, `:756–759`; `templates/olcme/karne/karne.html:183–185`.

AYT doğru/yanlış/boş sayıları HTML'de alan derslerinden toplanıyor. “İşaretlediği her 100 sorudan ... doğru” oranı ise bütün testlerin `answer.total_correct/attempted` hesabından geliyor. Alan dışı test çözen öğrencide aynı kartta gösterilen doğru/yanlış sayıları bu oranı vermez. Yorum üreticisi de toplam sayıları kullandığından alanla sınırlı kapakla farklı boş/yanlış değerlendirmesi yapabilir.

**Öneri:** Davranış kartındaki tüm değerleri tek kapsamdan üret veya genel/alan davranışını açıkça ayrı göster.

## Ekran görüntüsüne ilişkin notlar

- Görünen **19 doğru − 12/4 = 16 net** hesabı doğru; 19+12+49=80 de tutarlı.
- **+0,25 net** ile “neti aynı seviyede” metni farklı eşiklerden geliyor: HTML tam farkı gösteriyor, yorum üreticisi mutlak farkı 0,5'in altındaysa aynı seviye diyor (`olcme_karne_pdf.py:1709–1714`). Hesap hatası değil, anlatım tutarsızlığı; “yaklaşık aynı seviyede (+0,25)” şeklinde uyumlanabilir.
- 120 katılımcı ile 85 sonuç öğrencisinin görünmesi tek başına hata kanıtı değil; yoklama/katılım ile sonuç havuzu farklı olabilir.
- Türkiye tahminindeki yüzde kodda “geride bıraktığı oran” olarak hesaplanıyor ve HTML “önünde” diyor; bu ifade bakımından ters yüzde hatası saptanmadı. Ulusal tahmin tablolarının dış veri doğruluğu ayrıca denetlenmeli.

## Test ve doğrulama

1. Veritabanı gerektirmeyen 39 görünüm/puan/yönlendirme testi: **39 geçti**.
2. Ayrı geçici PostgreSQL test veritabanında 7 modülden 101 test: **98 geçti, 3 başarısız**. Test veritabanı sonunda silindi. Canlı veritabanına migrate yapılmadı.
3. Başarısız üç test `OLCME_KARNE_HTML=0` ile tekrar çalıştırıldı: **3 geçti**.
4. Yukarıda belirtilen yanlış kişi eşleme, iptal soru, alan/toplam karşılaştırması, hedef net, 11 AYT öncelik ve ceza açıklaması kontrollü Python örnekleriyle tekrar üretildi. Örnekler veritabanına öğrenci/sonuç yazmadı.

Başarısız testler:

| Test | Ayrım |
|---|---|
| `test_pdf_hides_unattempted_optional_and_class_columns` | Doğrudan renderer'a verilen fixture `karne_insights.hidden_section_ids` taşımıyor. HTML gizlemeyi payload'daki bu alanlara bırakırken eski renderer kendisi ayıklıyor. Normal endpoint insights üretiyor; bu başarısızlık tek başına canlı endpoint'in seçmeliyi gösterdiğini kanıtlamaz. Renderer sözleşmesi/test uyumu düzeltilmeli. |
| `test_pdf_has_new_summary_blocks` | Eski PDF'in büyük harf `BOŞ` metnini bekliyor; HTML `boş` kullanıyor. Görünüm beklentisi güncel değil. |
| `test_pdf_prints_the_table_and_skips_it_when_absent` | Eski `Zorluk Seviyesi` başlığını bekliyor; HTML `Soru zorluğuna göre` kullanıyor. Görünüm beklentisi güncel değil. |

Mevcut testler standart formüller, TYT üst/alt bölüm çift sayımının önlenmesi, LGS 90 soru/500 puan yönlendirmesi, 11 AYT şablonu, bağlı TYT'nin temel yolu, HTML ve gerçek PDF üretimi için güvence veriyor. Ancak bu rapordaki sınır durumlarını kapsamıyor; testlerin geçmesi bu bulguları ortadan kaldırmıyor.

## Düzeltme sırası

1. Bağlı TYT için ortak kimlik çözümü ve tek son-kayıt politikası; yanlış kişi/tekrar yükleme testleri.
2. Puan türüne göre kurum puan/net ortalamaları; alan ve toplam geçmişinin ayrılması.
3. İptal, bilinmeyen ve eksik B eşleme durumlarının içerikte ortak ele alınması.
4. Alan bazlı hedef/öneri, 11 AYT puan kapsamı ve sınav cezasının payload'a eklenmesi.
5. Geçmiş ve davranış kapsamının tutarlı hale getirilmesi; eski/yeni PDF test sözleşmelerinin ayrılması.


## Düzeltme ve son doğrulama — 5 Kasım 2026

11 bulgunun tamamı için düzeltme uygulandı. Önceden bulunan karne görünüm/sıralama değişiklikleri korundu.

| Bulgu | Uygulanan düzeltme |
|---|---|
| 1 | Puan, dersler ve sıra aynı TYT çözümleyicisini ve `answer_id` kaydını kullanır. Zayıf ortak numara, belirsiz isim/kod ve farklı kayıtlı öğrenci kimliği üzerinden eşleşme engellendi. |
| 2 | TYT çözümleyicisi, analizdeki son tamamlanmış cevap havuzunu kullanır. Ders ortalamasında tekrar yüklemeler tekilleştirildi. |
| 3 | Üst kart puan ortalaması öğrencinin SAY/EA/SÖZ türünden seçilir. |
| 4 | AYT kurum net ortalaması ve geçmiş serisi seçili alan netinden üretilir. Grafik ve önceki sınav farkı aynı seriyi kullanır. |
| 5 | Geniş kolay soru analizi korunur; hedef net için ayrıca tüm bantları alanla sınırlanmış özet üretilir. Hedef soru tavanını aşmaz. |
| 6 | İptal sorular kazanım/öncelik/tekrar kaybına katılmaz; HTML, klasik frontend ve eski PDF cevap tablolarında “İptal” gösterilir. |
| 7 | 11 AYT'nin SAY/EA puan kapsamı işaretlenir; puan önerilerine alan dışı dersler girmez. Genel toplam net ve tüm derslerin sonuç tablosu korunur. |
| 8 | Yanlış cezası ve bölüm düzeltmesi ayarları payload'a taşınır. Davranış kaybı ile bölüm/puan önerisindeki ceza uygulaması ayrılır. |
| 9 | Geçmiş aynı eğitim yılı, tür ve soru sayısıyla sınırlıdır. Tarih/oluşturma zamanı/kimlik sınırı mevcut sınavda biter; her sınavın son cevabı seçilir. Ders geçmişi aynı kayıtların netlerinden alınır. |
| 10 | Kısmi B eşlemesinde karşılığı olmayan soru aynı numaralı başka soruya bağlanmaz. Bilinmeyen cevap sonucu kazanıma boş olarak yazılmaz. |
| 11 | AYT doğruluk oranı ve davranış sayıları aynı alan kapsamındadır; klasik frontend dağılım/KPI sayıları da buna uyar. |

Ek olarak +0,25 gibi küçük değişimler yorumda açıkça belirtilir. Renderer'a doğrudan verilen, önceden insights hesaplanmamış veride de seçmeli ders gizleme uygulanır. Eski PDF'e özel üç test eski renderer'ı açıkça seçer; HTML/gerçek PDF testleri yeni renderer'ı ayrıca doğrular.

**Kayıtlı puanların geçişi:** Eski AYT puan bloklarına sürüm kontrolü eklendi. Önceki sürümden kalan puanlar ilk erişimde sınav başına yenilenir; sonraki okumalar yeniden hesaplama yapmaz. Bu davranış ayrıca test edildi. İlk erişimde kurumun öğrenci sayısına bağlı ek hesaplama olabilir. Şema migration'ı gerekmez.

**Son kontroller:**

- 13 ilgili test modülünde **172/172 test geçti**; bunların **18'i yeni regresyon testi**.
- Gerçek Chromium PDF üretimi ve eski PDF yolu ilgili testlerde doğrulandı.
- Değişen iki frontend dosyasında ESLint: **hata/uyarı yok**.
- Frontend `tsc --noEmit --incremental false`: **başarılı**.
- `git diff --check`: **başarılı**.
- Testler ayrı `test_karne_fix_20261105` PostgreSQL veritabanında çalıştırıldı. Canlı veri sorgulanmadı/değiştirilmedi; deploy yapılmadı.

Dış kaynak katsayı doğrulaması ve canlı öğrenciler üzerindeki dağılım/etki ölçümü ilk denetimdeki sınırlar olarak kalır; bu çalışma uygulamadaki tespit edilmiş bağlantı ve hesaplama hatalarını düzeltir.
