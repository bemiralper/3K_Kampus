# Akademik operasyonlar ve personel hakedişleri denetimi

## 9 Kasım 2026 — uygulanan düzeltmeler

**Aşağıdaki 19 doğrulanmış kod hatası düzeltildi ve canlıya uygulandı.** İlk denetim
bulguları, tarihsel kanıt olarak sonraki bölümlerde korunmuştur; aşağıdaki eski
test başarısızlıkları düzeltme öncesini anlatır.

- İlk 20 sınır senaryosundaki `expectedFailure` işaretleri kaldırıldı ve testler
  normal akademik test keşfine taşındı. Yetkisiz yazma/ilişki değiştirme, geçerli
  CSRF, iki PostgreSQL bağlantısıyla eşzamanlı aktarım ve tarihsel tarife koruması
  senaryoları eklendi: **25 yeni regresyon testi başarılı**.
- İlgili modüllerin son ortak çalıştırmasında **910 test geçti** (42,365 saniye).
  `academic`, `personel`, `ozel_ders` model/migration tutarlılık kontrolü başarılı.
- Sözleşme detay/değiştirme/silme/durum/print, bordro oluşturma ve avans yollarında
  nesne kapsamı güçlendirildi. Sözleşme ilişkisini sonradan başka şubeye taşıma da engellendi.
- Personel ve birebir yazma uçlarının CSRF muafiyetleri kaldırıldı. Ön yüzdeki
  ortak `apiFetch` zaten CSRF tokenı gönderiyor; geçerli tokenın kabulü ayrıca test edildi.
- Onaylı/ödenmiş bordrolar toplu oluşturmada korunuyor. Ortak aylık hazırlama
  servisi sözleşmeyi ve bordroyu kilitliyor, maaş planı ve avansı iki yolda da kullanıyor.
  Birebir aktarımında başka şube, eğitim yılı ve ders tarihini kapsamayan sözleşmeye düşülmüyor.
- Öğretmen yoklaması, ücret tipi, dakika bazlı para hesabı, sözleşme seçimi,
  mesai öncesi ders, gelecek tarih, dönem aralığı ve tarihli öğrenci yerleşimi düzeltildi.
  Günlük sınıf yoklaması da yerleşim tarihini kullanıyor.
- Takvimler arası öğretmen çakışması gerçek saat kesişimiyle kontrol ediliyor.
  Eksik `0025_sync_notify_status_choices` migrationı üretildi ve canlıya uygulandı.

### Canlı aktarım ve doğrulama

15 backend dosyası hash manifestiyle doğrulanarak aktarıldı. Paket SHA-256:
`6a151616107958b97b279c4b1609930f19754865c87f0a8e067f8e27c3843f95`.
Backend ve frontend aktif; bakım kapalı. Kimlik durum ucu 200, üç oturumsuz
akademik/hakediş ucu 401, frontend 200 döndü. Aktarım sonrası salt okunur
denetimde bekleyen migration, bordro aritmetik farkı ve aktarılmış birebir
hakediş/bordro toplam farkı **0**.

Kod ve veritabanı yedeği **yalnız sunucuda**:
`/var/backups/lms/academic-fixes-20261109/`.
`db-before.dump` içerik listesiyle doğrulandı; `code-before.tar.gz`,
`new-files.json` ve `manifest.json` geri dönüş kanıtını içeriyor.
Bu bir dosya bazlı hotfix aktarımıdır; Git HEAD `4255bf33` olarak kaldı.
Sonraki normal Git deployundan önce bu çalışma alanındaki düzeltmeler repoya alınmalıdır.

### Tarihsel kayıtların durumu — kullanıcının seçtiği politika

**Ders tarihindeki doğrulanmış tarifeyi koru; belirsizleri incelemeye ayır.**
Bu nedenle geçmiş kayıtlar güncel tarifeyle topluca yeniden yazılmadı. Saklanan
7 taslak tarife ve ödenmiş bordro korundu. Sunucuda, 0600 izinli bir inceleme planı üretildi:
`/var/backups/lms/academic-fixes-20261109/history-review-plan.json`.
Plan yalnız `READ ONLY` işlemle oluşturuldu, **otomatik veri düzeltmesi yok**.

Son planda **36 eksik hakediş adayı, 7 taslak tarife farkı ve 1 ödenmiş bordro
avans farkı** var. Bunlar doğrulanmış eksik ödeme sayısı değildir. İlk kesitten
sonra canlı kayıtlar da değişmiştir; son salt okunur kesitte 3.419 birebir oturum,
57 hakediş ve 60 birebir program vardı. Yeni aday sayısı, yeni hesap kurallarının
da kullanıldığı güncel kesittir; artışın tek bir nedene bağlı olduğu ileri sürülmez.
Tarihsel tarife kanıtı ve ödeme mutabakatı olmadan bu adayların tutarını değiştirmek
kullanıcının seçtiği politikaya aykırı olur.

Plan SHA-256: `978cf11b54c9ccb540bccbb819401b0671af71aa06e6cc1eb4200a546fa59aab`.
Kayıt kimlikleri ve tutarlar sunucudan çıkarılmadı.

Geçmişteki **61 sınıf / 82 öğretmen çakışması çifti** otomatik silinmedi;
hangi dersin gerçekten gerçekleştiği doğrulanmadan geçmiş plan/yoklama verisi
değiştirilemez. Yeni kontroller aynı hataların tekrarını engellemeye yöneliktir.

**Açık ürün işleri:** Otomatik Program Oluşturucu, Çakışma Merkezi ve Program
Kuralları ekranları bu 19 hata düzeltmesinin dışında yeni özelliklerdir; placeholder
durumları değiştirilmedi. Normal ders puantajını otomatik bordroya aktaran yeni
bir özellik de eklenmedi. Bu rapor bu özellikleri tamamlanmış saymaz.

---

**Canlı veri kesiti:** 8 Kasım 2026, Türkiye saati. **Raporun tamamlanması:** 9 Kasım 2026. **İncelenen sürüm:** `4255bf33`.

## Sonuç

Modül için “her şey doğru çalışıyor” onayı verilemiyor. **20 sentetik senaryoyla 19 ayrı hata yeniden üretildi.** Mevcut uygulama testlerinden **885 test geçti**; bu sonuç yeni sınır senaryolarını kapsamadığı için hatalarla çelişmiyor.

En yüksek öncelik: sözleşmelerde şube sınırının atlanması, başka şube sözleşmesine hakediş oluşturulabilmesi ve ödenmiş/onaylanmış bordronun toplu oluşturma sırasında yeniden yazılması. Hakediş motoru ile aylık bordro oluşturma yolları arasında da hesaplama farkları var.

Canlı veri denetiminde geçmiş ders çakışmaları ve hakediş/avans mutabakat adayları bulundu. **Canlıya kod yüklenmedi; kayıt, sözleşme, bordro veya ödeme değiştirilmedi.**

## Kapsam ve yöntem

- Akademik planlama: zaman şablonları, çalışma takvimleri, uygunluk, sınıf ders planları, elle yerleştirme, program sürümleri, oturum üretimi ve durum geçişleri.
- Yoklama: öğretmen, yedek öğretmen, öğrenci ve günlük sınıf yoklaması; sınıf yerleşimleri ve kütüphane izin bağlantıları.
- Birebir/özel ders: haftalık şablon, oturum senkronizasyonu, telafi, kota/premium, tatil kararları, ücret motoru, hakediş onayı ve bordroya aktarım.
- Personel: sözleşme, maaş planı, dönemsel ücret, mesai, avans, aylık bordro, onay/ödendi akışları ve rapor bağlantıları.
- Bağlantılar: takvim, dönem, sınıf, öğrenci, eğitim paketleri, finans ve tahsilat testleri; akademik ön yüzün API ve ekran eşleşmeleri.

Canlı sunucu SSH üzerinden kontrol edildi. Yerel ve canlı commit aynı; incelenen akademik/personel/birebir kod dizinlerinde sunucuya özgü değişiklik görülmedi. Backend ve frontend servisleri aktifti. Akademik oturum, birebir hakediş ve personel hakediş uçlarına oturumsuz isteklerin üçü de **401** döndü.

Veri denetimi PostgreSQL **REPEATABLE READ, READ ONLY** işlemlerinde yapıldı; salt okunurluk ayrıca sorgulanarak doğrulandı. Sunucudan yalnız anonim toplamlar alındı. Kişisel veri, kayıt kimlikleri, kişi ücretleri veya tutarlar çıkarılmadı. Üretim üzerinde durum değiştiren API, oturum üretimi, bildirim veya test çalıştırılmadı.

## Canlı veri bulguları

| İncelenen veri | Kayıt sayısı |
|---|---:|
| Sınıf ders oturumu | 1.368 |
| Birebir ders oturumu | 3.408 |
| Birebir öğrenci programı | 59 |
| Birebir hakediş | 51 |
| Personel sözleşmesi | 32 |
| Aylık bordro | 142 |
| Avans kaydı | 10 |
| Program hücresi | 1.730 |
| Öğrenci sınıf yerleşimi | 164 |
| Günlük sınıf yoklama oturumu / öğrenci kaydı | 783 / 2.822 |

### 1. Geçmiş ders çakışmaları

- **61 sınıf çakışması çifti:** 40 aynı program sürümünde, 21 farklı sürümlerde. İki tarafın program sürümü de aktif.
- **82 öğretmen çakışması çifti:** 57 sınıf–sınıf, 25 sınıf–birebir. Sınıf–sınıf çiftlerinin 40'ı aynı, 17'si farklı program sürümünde.
- Tamamı geçmiş tarihlerde; bugün ve ileri tarihler için bu sorguda çakışma bulunmadı.
- Birebir dersler arasında öğrenci ve oda çakışması bulunmadı.

Sayılar **çakışan çift sayısıdır**, etkilenen tekil ders sayısı değildir. Kontrol aktif kayıtları kapsar, iptal/ertelenen sınıf derslerini ve iptal birebirleri dışlar; öğretmenin yerine giren personeli dikkate alır. Aynı sürümde de çakışma bulunduğu için sonuçların tamamı eski sürüm artığıyla açıklanamıyor. Geçmiş plan kaydı gerçek dersin iki kez yapıldığını veya çift ödeme yapıldığını tek başına kanıtlamaz.

### 2. Tamamlanan birebirlerde hakediş eksikliği adayları

**667 tamamlanmış birebir oturum** içinde güncel ücret motoruna göre ödenebilir olan **35 oturumun hakediş kaydı yok**. Bunların **33'ünde sözleşme ders tarihinden sonra oluşturulmuş**. Bu nedenle 35 kaydın tamamına “hakedişi yanlışlıkla silindi/eksik ödendi” denilemez. Geçmişe sözleşme girildikten sonra yeniden hesaplama/geri doldurma akışının olmaması güçlü bir açıklama; kalan 2 adayın da sözleşme ve işlem geçmişiyle doğrulanması gerekir.

### 3. Güncel tarifeyle uyuşmayan taslak hakedişler

**7 taslak hakedişte** saklanan tutar güncel motor sonucundan farklı. Yedisinde de birim ücret farklı, süre farkı tespit edilmedi. Eski tarifenin korunması ile güncellenmesi beklentisi netleştirilmeli; sözleşme revizyon geçmişi olmadan geçmiş tutarın yanlış olduğu sonucuna varılmamalı. Onaylı veya bordroya aktarılmış hakedişler bu karşılaştırmayla değiştirilmedi.

### 4. Ödenmiş bordroda avans mutabakat farkı

**1 “ODENDI” bordrosunun** avans alanı, ilgili aya mahsup edilen avans kayıtlarının toplamıyla farklı. Bu bordro için avans kayıtları mevcut. Nedeni manuel düzeltme, sonradan kayıt veya hesaplama yolu farkı olabilir; ödeme geçmişiyle mutabakat gerekir. Tek başına fazla ödeme kanıtı değildir.

### 5. Akışların canlı kullanım farkı

Sınıf `LessonSession` kayıtlarında **tamamlanmış oturum ve ders bazlı öğrenci yoklaması 0**; buna karşılık günlük sınıf yoklamasında **2.822 kayıt** var. Günlük yoklama kullanılıyor, ders gerçekleşme/hakediş katmanı aynı düzeyde beslenmiyor. “Ders Ücretleri” ekranı tamamlanan ders oturumlarından hesap yaptığı için günlük yoklama girmek tek başına bu özeti doldurmaz.

Personel puantajında normal ders saatleri manuel düzenleniyor; sınıf ders ücret özetinden aylık bordroya otomatik aktarım bu incelenen akışta yok. Birebir hakedişlerin ayrıca onay/aktarım yolu var. Otomatik puantaj beklentisi varsa bu bir **entegrasyon eksikliği** olarak ele alınmalı.

### Temiz çıkan veri kontrolleri

Uygulanmamış mevcut migration: **0**. Kontrol edilen kurum/şube bağları, ters saat aralıkları, ters sözleşme tarihleri, öğretmen/tarih hakediş eşleşmeleri, tamamlanmamış derse bağlı aktif hakedişler ve pozitif hakediş tutarı kontrollerinde ihlal bulunmadı. Bordroya aktarılmış hakedişlerde eksik bordro bağlantısı, öğretmen/şube/ay farkı veya özel ders toplam farkı bulunmadı. 142 bordronun saklanan brüt/net aritmetiğinde fark, ödendi olup ödeme tarihi bulunmayan bordro ve ileri tarihte tamamlanmış ders bulunmadı.

Bugün sözleşme tarih aralığının dışında kalmasına rağmen durumu aktif olan **1 sözleşme** var. Bu bir durum/tarih uyumsuzluğu adayıdır; gelecekte başlayacak sözleşme de olabilir. Tarih kontrolünü atlayan bordro yolları nedeniyle ayrıca incelenmeli.

## Testle doğrulanan 19 hata

Örnek tutarların tamamı sentetik test verisidir. Öncelik: **P0** ödeme bütünlüğünü bozan acil hata; **P1** yüksek; **P2** orta. Şube kapsamı testleri yönetim yetkili, süper kullanıcı olmayan bir hesapla çalıştırıldı.

| No | Öncelik | Hata ve yeniden üretim sonucu | Kod / test |
|---|---|---|---|
| 1 | P1 | Sözleşme detayında seçili şube sınırı uygulanmıyor. A şubesi bağlamında B şubesinin sözleşmesi **200** ile okunabildi. Aynı detay akışının güncelleme/silme ve durum uçlarında da nesne kapsamı kontrolü eksik; bu diğer fiiller ayrıca exploit testiyle doğrulanmadı. | `personel/interfaces/sozlesme_views.py:221`; `test_contract_detail_denies_other_branch` |
| 2 | P1 | Tekil bordro oluşturmada sözleşmenin bağlamı kontrol edilmiyor. Başka şube sözleşmesine **201** ile bordro oluşturuldu. | Aynı dosya `:543`; `test_payroll_create_denies_foreign_branch_contract` |
| 3 | P2 | Oturum çereziyle çalışan personel bordro POST ucu CSRF denetimini atlıyor. `enforce_csrf_checks=True` ve tokensız istek **201** döndü. Modül izin kontrolü CSRF yerine geçmiyor. Canlıda uçtan uca harici saldırı denenmedi; SameSite gibi tarayıcı savunmaları ayrıca dikkate alınmalı. | `@csrf_exempt`, `shared/permissions.py:393`; `test_payroll_create_requires_csrf` |
| 4 | **P0** | Toplu bordro oluşturma, mevcut satırın onay/ödendi kilidini korumuyor. **Ödendi** bordrosundaki 700, sözleşme değeri 1.000 ile yeniden yazıldı; ödendi durumu kaldı. | `personel/infrastructure/sozlesme_repository.py:273`; `test_bulk_creation_preserves_paid_payroll` |
| 5 | P1 | Toplu bordroda sözleşmenin başlangıç/bitiş ayı süzülmüyor. 2025'te başlayan sözleşmeye 2024 için bordro oluştu. | Aynı metot; `test_bulk_creation_rejects_month_outside_contract` |
| 6 | P1 | Birebir bordro aktarımı, uygun şube sözleşmesi yoksa başka şubenin sözleşmesine düşebiliyor. Hata vermesi gereken aktarım başarılı oldu. | `ozel_ders/services/bordro_bridge.py:55`; `test_bridge_rejects_other_branch_contract` |
| 7 | P1 | Aynı aktarımda tarih filtresiz yedek seçim var. Süresi bitmiş fakat durumu aktif sözleşmeye yeni ay bordrosu oluşturuldu. | Aynı dosya; `test_bridge_rejects_expired_contract` |
| 8 | P1 | Birebir aktarımı yeni bordro oluştururken aylık maaş planını kullanmıyor. O ayın planı 700 iken sözleşme ana tutarı **1.000** yazıldı. Normal toplu oluşturma farklı hesaplıyor. | Aynı dosya `:79`; `test_bridge_uses_salary_plan` |
| 9 | P1 | Birebir aktarımıyla açılan yeni bordro, kaydedilmiş avansı mahsup etmiyor. Kayıtlı 100 avansa rağmen bordro avansı **0** kaldı. | Aynı bölüm; `test_bridge_deducts_recorded_advance` |
| 10 | P1 | “Sadece mesai dışı” kuralı mesai başlangıcını dikkate almıyor. 08.30'da mesaisi başlayan öğretmenin 07.00–08.00 dersi mesai içinde sayılarak ücretsiz kaldı. | `ozel_ders/services/ucret_engine.py:109`; `test_lesson_before_work_start_is_outside_work` |
| 11 | P1 | Genel ders ücreti özeti, öğretmen filtresi yokken tamamlandı+gelmedi oturumunu ücretli sayıyor. Tamamlanan dersin yoklaması sonradan gelmedi yapılınca da özetten düşmedi. **İki ayrı test** aynı hata ailesini doğruluyor. | `academic/services/lesson_session_service.py:665,833`; `test_completed_absent_teacher_is_not_paid`, `test_completed_attendance_absent_removes_from_pay` |
| 12 | P1 | Ücret özeti sözleşmeyi yalnız personel ve en son ID ile seçiyor. Başka şubedeki pasif sözleşmenin **900** tarifesi, geçerli **300** yerine kullanıldı. Tarih/yıl/durum/şube ve ders ayrımı yok. | Aynı dosya `:900`; `test_summary_uses_valid_contract_not_latest_inactive` |
| 13 | P2 | Sözleşmenin ana `ders_birim_ucret` alanı ücret özetinde okunmuyor. Ana ücret 300 olup alt ücret satırı yoksa birim ücret **null** dönüyor. | Aynı bölüm; `test_summary_reads_main_contract_rate` |
| 14 | P1 | Ders başına ücret saat başına gibi hesaplanıyor. 40 dakikalık tek dersin bedeli 300 iken **201** gösterildi. | Aynı bölüm; `test_per_lesson_rate_is_not_prorated_as_hourly` |
| 15 | P2 | Saat önce iki haneye yuvarlanıp sonra ücretle çarpılıyor. 40 dk × 300/saat = 200 olması gerekirken **201** çıktı. | Aynı bölüm; `test_hourly_summary_rounds_money_after_minutes` |
| 16 | P1 | Sınıf dersi gelecekte olsa da tamamlanabiliyor. 10 gün sonraki oturum tamamlandı; birebir akışındaki gelecek tarih engeli burada yok. | Aynı dosya `:601`; `test_future_class_cannot_be_completed` |
| 17 | P2 | Oturum üretiminde dönem tarih aralığı korunmuyor. Ocakta biten dönem için mart ayında oturum üretimi kabul edildi. | Aynı dosya `:191`; `test_materialize_rejects_date_outside_term` |
| 18 | P2 | Ders yoklama listesi yerleşimin başlangıç/bitiş tarihini uygulamıyor. Sınıfa bir hafta sonra başlayacak öğrenci önceki dersin listesinde çıktı. | Aynı dosya `:718,763`, `academic/domain/placement_queries.py`; `test_roster_respects_placement_start_date` |
| 19 | P1 | Elle yerleştirmede öğretmen çakışması aynı gün/slot kimliği ve aynı sürümle sınırlı. Ayrı çalışma takviminde 08.20–09.00 hücresi, öğretmenin mevcut 08.00–08.40 dersiyle çakışmasına rağmen engellenmedi. | `academic/services/manual_placement_service.py:68`; `test_manual_teacher_conflict_across_calendars` |

Bu liste kaynakta görülen her olası riski “kesin hata” saymaz. Örneğin eşzamanlı onay/aktarımda aylık bordro satırının kilitlenmemesi ayrıca yarış koşulu riski oluşturur; bu denetimde çok bağlantılı yarış testiyle yeniden üretilmediği için 19'a dahil edilmedi.

## Eksik özellikler ve bakım açıkları

1. `frontend/components/akademik/akademikTabPages.tsx:70` içinde **Otomatik Program Oluşturucu**, **Çakışma Merkezi** ve **Program Kuralları** açıkça placeholder. Backend'de temel scheduler kodu mevcut; uçtan uca tamamlanmış otomatik planlama ürünü olduğu söylenemez.
2. Merkezî, takvimler arası öğretmen/sınıf/birebir çakışma mutabakatı eksik. Mevcut uyarılar ve yerel kontroller aynı kapsamda değil.
3. Hakediş–sözleşme geçmişi için tarifeyi hangi tarihte donduracağımız ve sonradan girilen sözleşmenin geçmişi nasıl tamamlayacağı net bir akışa bağlanmalı. Canlıdaki 35/7 aday bunun önemini gösteriyor.
4. Model–migration farkı var: `ClassScheduleNotifyLog.status` için `0025_alter_classschedulenotifylog_status` öneriliyor. Bu denetimde migration üretilmedi. Mevcut migrationların hepsi uygulanmış olması, model dosyasıyla birebir eşitlik anlamına gelmiyor. Fark alan seçenekleri düzeyinde; kayıp tablo/kolon iddiası değil.
5. Normal ders özeti, aylık puantaj ve birebir aktarımı farklı hesap yolları kullanıyor. Ortak sözleşme seçimi, ücretlendirme ve bordro oluşturma servisi gerektiriyor.

## Test sonuçları ve sınırlar

| Kontrol | Sonuç |
|---|---|
| Akademik + birebir + personel mevcut testleri | **284 geçti** |
| Takvim + dönem + sınıf + paket + öğrenci + finans + ödeme takip mevcut testleri | **601 geçti** |
| Yeni sentetik sınır senaryoları, strict çalıştırma | **20 assertion hatası, 0 kurulum hatası** |
| Yeni senaryolar, bilinen hata işaretleriyle | `OK (expected failures=20)`; **düzeldi anlamına gelmez** |
| Canlı mevcut migration planı | 0 bekleyen |
| Yerel model–migration tutarlılığı | Academic status seçeneklerinde fark |
| Ön yüz TypeScript kontrolü | 9 Kasım son doğrulaması: `tsc --noEmit --incremental false` **başarılı**, çıkış kodu 0 |

Regresyonlar `backend/audit_checks/` altında ve yalnız açık etiketle çalıştırılır. Mevcut uygulama testlerine sessizce eklenmedi. Yeniden üretim:

```bash
cd backend
LMS_TEST_DB_NAME=academic_audit_20261108 DJANGO_ENV=test venv/bin/python -m audit_checks.run_regressions --strict
```

Canlı kullanıcı hesabıyla bütün ekranlara tıklanarak tarayıcı kabul testi yapılmadı; gerçek mesaj gönderimi, gerçek hakediş onayı, ödeme, PDF'nin gerçek kişisel verilerle dışa aktarımı ve üretim yük/stres testi uygulanmadı. Mevcut testler bazı export/bildirim yollarını sentetik verilerle kapsıyor. Harici mesaj sağlayıcı teslimatı, tüm olası tarayıcı durumları, eşzamanlı kullanıcı yarışları ve muhasebe kayıtlarının gerçek banka hareketleriyle mutabakatı bu sonuçlarla garanti edilmez. Her fonksiyonun her olası girdide eksiksiz çalıştığı iddia edilmiyor.

## Önerilen düzeltme ve onarım sırası

1. Önce sözleşme/bordro nesne kapsamını kapat; CSRF'yi oturum tabanlı yazma uçlarında uygula; onaylı/ödenmiş satırları bütün toplu yollarda kilitle.
2. Sözleşmenin şube/yıl/tarih seçimini ve maaş/avans hesabını tek serviste birleştir. Aktarımın bu servisi kullanmasını sağla; bordro satırını işlem içinde kilitle.
3. Ders başı/saat başı, dakika bazında son adımda para yuvarlama, mesai başlangıcı ve yoklama koşullarını düzelt.
4. Takvimler arası zaman kesişimini ortaklaştır; dönem/gelecek tarih/yerleşim tarihlerini doğrula.
5. Bu 20 senaryoyu hatasız geçir; ilgili 885 mevcut testi tekrar çalıştır. Kullanıcı rolleriyle staging tarayıcı kabulü ve eşzamanlı aktarım testi ekle.
6. Ardından canlıdaki 35 eksik aday, 7 taslak fark, 1 ödenmiş bordro avans farkı ve geçmiş çakışmalar için **sunucuda** kayıt bazlı açıklama/onarım planı üret. Tarihsel tarifeyi veya ödenmiş bordroyu güncel hesapla doğrudan ezme; neden ve denetim iziyle ilerle.

Bu rapor bir onarım uygulaması değildir. Üretim kayıtlarında değişiklik yapılmadan önce doğrulanmış düzeltmeler, yedek ve kayıt bazlı kontrollü onarım planı gerekir.
