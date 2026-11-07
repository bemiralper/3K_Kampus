# Finans modülü incelemesi — 7 Kasım 2026

Son durum: Kalan 11 mantık hatası da düzeltildi; bu belgedeki 14 bulgu testinin
tamamı artık başarılı. Güncel uygulama/test/migration durumu için
[mantık düzeltmeleri raporuna](finans-mantik-duzeltmeleri-2026-11-07.md) bakın.

Güncelleme: Bu belge ilk incelemenin bulgularını kaydeder. F01–F02 güvenlik
açıkları daha sonra kodda düzeltildi; üç güvenlik regresyonu artık geçiyor.
Güncel değişiklikler ve gerçek veri denetimi sonucu için
[güvenlik ve veri denetimi raporuna](finans-guvenlik-denetimi-2026-11-07.md) bakın.

## Sonuç

Modül için “bütün fonksiyonlar her senaryoda eksiksiz çalışıyor” sonucu verilemez.
Mevcut finans paketindeki **283 test geçti**, fakat bu incelemede eklenen **14 uç
senaryo testinin tamamı beklenen davranışa aykırı sonuç verdi**. İki test aynı
çek/senet erişim açığının okuma ve yazma tarafını doğruluyor; toplam **13 ayrı
problem** var. Uygulama davranışına düzeltme yapılmadı; inceleme raporu ve
tekrar üretim testleri eklendi.

## Yöntem ve sınırlar

- Güncel Django backend (`backend/manage.py`, `config.settings`, `DJANGO_ENV=test`)
  kullanıldı. Canlı veritabanında finans işlemi veya migration çalıştırılmadı.
- Finans modelleri, bakiye/cari hareketleri, gelir ve gider servisleri, tahsilat ve
  ödeme endpoint'leri, dönem açma/kapatma/devir, çek/senet, masraflar, dönem
  raporları, nakit akışı ve ilgili frontend API/form bağlantıları incelendi.
- Testler PostgreSQL üzerinde çalıştı. Son bulgu testleri için ayrı
  `test_finans_audit_final_20261107` test veritabanı kullanıldı; `--keepdb` ile
  bırakıldı. Django TestCase her senaryonun verisini geri alır.
- Sözleşme/ödeme takip ve iletişim paketlerinde **752 test çalıştı: 749 başarılı,
  3 başarısız**. Başarısızlıklar aşağıda ayrı listelendi.
- Frontend `npm run lint` başarılı; finans alanında dört hook bağımlılığı uyarısı
  var. Repo talimatındaki eski lint hatası bu çalıştırmada görülmedi.
- Frontend `npm exec tsc -- --noEmit --incremental false` başarılı; TypeScript
  hata vermedi. Production build çalıştırılmadı.
- Canlı oturumla tarayıcıda uçtan uca tıklama testi, gerçek PDF/Chromium çıktısı,
  Uyumsoft'a gerçek gönderim, WhatsApp gönderimi ve eşzamanlı yük testi yapılmadı.
  Mevcut otomatik testlerde bu alanların kontrol edilmesi gerçek servis
  entegrasyonunun doğrulandığı anlamına gelmez.
- Bu bir kapsamlı kaynak kodu ve senaryo incelemesidir; her fonksiyonun tüm
  olası durumlarının kapsandığına ilişkin garanti veya ölçülmüş tam kod kapsamı yoktur.

## Doğrulanan bulgular

### F01 — Kritik: Çek/senet detayında şube sınırı uygulanmıyor

**Senaryo:** Bir şubeye ait manuel çek oluşturulup başka şube başlığıyla aynı
kaydın GET ve PATCH uçlarına gidildi. İki istek de **200** döndü; PATCH açıklamayı
değiştirdi. Beklenti 403 veya 404.

**Neden:** `interfaces/views/cek_senet_views.py:94` ve `:105` kayıt erişimi için
`assert_record_sube_access` çağırmıyor. `application/cek_senet/cek_senet_service.py:298`
yalnızca PK ile sorguluyor. Genel `finans.read/manage` izni kayıt düzeyinde
kurum/şube doğrulamasının yerine geçmiyor. Timeline, dosyalar ve aksiyon uçları
da aynı erişim desenine sahip; onların her biri ayrıca negatif API testi almalı.

**Testler:** `test_cheque_detail_rejects_other_branch`,
`test_cheque_edit_rejects_other_branch`.

### F02 — Kritik: Başka kurumun mali hesabına tahsilat yazılabiliyor

**Senaryo:** A kurumundaki gelire, B kurumunun kasa ve ödeme yöntemi kimliğiyle
100 TL tahsilat gönderildi. Servis hata döndürmeden kabul etti.

**Neden:** `application/gelir_tahsilat_service.py` doğrulamasında mali hesap ve
ödeme yönteminin yalnızca varlık alanları kontrol ediliyor; kurum, şube,
aktiflik ve birbirine bağlılık denetlenmiyor. Tahsilat view'ının gelir kaydına
erişim kontrolü, gövdede gelen hesabın sahipliğini doğrulamıyor.
`BakiyeHareketiService` de verilen hesap ile kurum/şube eşleşmesini doğrulamıyor.

**Etki:** Başka hesabın bakiyesi değişirken hareket yanlış kurum bilgisi taşıyabilir.
**Test:** `test_collection_rejects_foreign_institution_account`.

### F03 — Yüksek: Hata dönen tahsilat geri alınmıyor

**Senaryo:** Nakit kasaya tahsilatta uygun olmayan havale masrafı gönderildi.
Servis `(None, hata)` döndürdü, fakat tahsilat ve bakiye/cari etkileri kaydedildi.
Testte gelir altında tahsilat sayısı **0 yerine 1** oldu.

**Neden:** `gelir_tahsilat_service.py:115` masraf hatasında normal `return`
yapıyor. `transaction.atomic` normal dönüşte işlemi commit eder; hata tuple'ı
rollback sağlamaz. View da bu dönüşü 400'e çeviriyor.
Aynı hata deseni gider ödeme, serbest ödeme ve virman servislerinde de bulunuyor;
bu diğer yollar için ayrı tekrar üretim testi henüz eklenmedi.

**Etki:** Kullanıcı “başarısız” gördüğü işlemi yeniden deneyip mükerrer ödeme
oluşturabilir. **Test:** `test_rejected_fee_leaves_no_collection_or_balance`.

### F04 — Yüksek: Kuruşlu tutarlar kasa defterinde kayboluyor

**Senaryo:** 100,75 TL gelir tahsilatı başarılı oldu; tahsilat **100,75**, bağlı
`BakiyeHareketi.tutar` veritabanından yeniden okununca **100 TL**.

**Neden:** Tahsilat/gider alanları Decimal, kasa hareketi ve dönem alanları
Integer. Frontend tahsilat formu ise 0,01 TL adımına izin veriyor. Masrafta
ayrıca `islem_masrafi_service.py:187` tam TL'ye yuvarlama yapılıyor.

**Etki:** Cari bakiye, kasa ve raporlar birbirini tutmaz. Uçtan uca tek bir para
birimi hassasiyeti belirlenmeli. **Test:** `test_collection_preserves_cents_in_cash_ledger`.

### F05 — Yüksek: Tahsilattan sonra cari değiştirmek bakiyeleri ayırıyor

**Senaryo:** A müşterisine 1.000 TL gelir, ardından 100 TL tahsilat girildi.
Gelirin carisi B'ye taşındı. A'nın bakiyesi **0 yerine -100 TL** kaldı; B'ye
satış taşınırken önceki tahsilat hareketi taşınmıyor.

**Neden:** `application/gelir_service.py:97` satışın tersini ve yeni satış
hareketini oluşturuyor, mevcut tahsilatın cari etkisini yeniden bağlamıyor.
Tahsilat iptali de artık gelirin güncel carisini kullanacağından hata büyüyebilir.

**Çözüm yönü:** Ödemeli kayıtta cari değişikliğini engellemek veya bütün bağlı
hareketleri atomik olarak yeniden muhasebeleştirmek.
**Test:** `test_changing_customer_after_collection_keeps_balances_consistent`.

### F06 — Yüksek: Mahsup iptali avansı geri vermek yerine tekrar azaltıyor

**Senaryo:** 1.000 TL serbest ödeme → 400 TL mahsup → mahsup iptali → yeniden
1.000 TL mahsup. Son işlem “serbest bakiye **200 TL**” hatasıyla reddedildi.
İptal sonrası kullanılabilir bakiye 1.000 TL olmalı.

**Neden:** `application/gider_odeme_service.py:360` bütün `islem_turu='mahsup'`
satırlarını yönlerine bakmadan topluyor. İptal hareketinin türü de mahsup;
400 TL kullanım ve 400 TL iptal toplam 800 TL tüketim sayılıyor.
**Test:** `test_cancelled_offset_restores_available_advance`.

### F07 — Yüksek: Dönem devri canlı kasa bakiyesini ikiye katlıyor

**Senaryo:** 100 TL giriş → dönem kapat → sonraki yıla devret. Canlı kasa
bakiyesi **100 TL yerine 200 TL** oldu.

**Neden:** `application/donem_bakiye_service.py:225` yeni döneme gerçek giriş
hareketi ekliyor. `BakiyeHareketiRepository.son_bakiye` bütün yıllardaki
hareketleri topluyor; eski paranın üzerine devir tekrar ekleniyor.

**Çözüm yönü:** Devirin dönemler arası sınıflama olduğu model ile bütün
yılları kapsayan canlı para bakiyesi hesabı uyumlu hale getirilmeli.
**Test:** `test_rollover_does_not_create_extra_cash`.

### F08 — Yüksek: Kapalı dönem yeni tahsilatla değiştirilebiliyor

**Senaryo:** Dönem kapatıldıktan sonra o eğitim yılına yeni tahsilat yapıldı;
işlem kabul edildi.

**Neden:** `application/bakiye_hareketi_service.py:116` dönem durumunu kontrol
etmeden dönem toplamlarını güncelliyor. Kapanıştaki `devir_tutari` ise eski
kalabilir; kapanış snapshot'ı ve sonraki yıl devri ayrışır.
**Test:** `test_closed_period_rejects_new_collection`.

### F09 — Yüksek: Kısmi tahsil edilen gelir beklenen raporundan kayboluyor

**Senaryo:** 1.000 TL gelirden 100 TL alındığında beklenen listesinde kalan
900 TL satırı bulunamadı.

**Neden:** `application/period/period_service.py:717` yalnızca `ONAYLANDI`
durumunu alıyor; tahsilat kaydı `KISMI_TAHSIL` yapıyor. Özet ve yöntem dağılımı
sorgularında da aynı dar durum filtresi var.
**Test:** `test_expected_period_keeps_partially_collected_income`.

### F10 — Yüksek: Beklenen gelir raporu KDV'yi eksik gösteriyor

**Senaryo:** 1.000 TL + %20 KDV gelirin beklenen tutarı **1.200 yerine 1.000 TL**.

**Neden:** `period_service.py:729` ve özet tarafı `net_tutar` yerine
`brut_tutar` kullanıyor. **Test:** `test_expected_period_includes_vat`.

### F11 — Orta: KDV dahil kayıtta yalnızca oran değişirse tutar küçülüyor

**Senaryo:** KDV dahil 1.200 TL / %20 gelirde yalnızca oran %10 yapıldı.
Net tutar **1.200 TL yerine 1.000 TL** oldu.

**Neden:** `gelir_service.py:140` civarında, istekte tutar yoksa saklanan
KDV hariç taban yeniden KDV dahil kullanıcı girdisi gibi işleniyor. Gider
servisinde de aynı hesaplama deseni var. Frontend düzenleme formu tutarı da
gönderdiği için normal form kullanımı bu API kısmi güncelleme hatasını gizleyebilir.
**Test:** `test_partial_vat_change_preserves_inclusive_total`.

### F12 — Yüksek: Manuel alınan çek oluşturuluyor, tahsil edilemiyor

**Senaryo:** Desteklenen sözleşmesiz “alınan çek” oluşturuldu. Tahsil et
çağrısı **“Taksit bağlantısı yok”** ile reddedildi.

**Neden:** `cek_senet_service.py:728` manuel sözleşmesiz kayda izin veriyor,
`:553` tahsilat için sözleşme taksidini zorunlu tutuyor. Sözleşmesiz çekin
kasa ve cari etkisini oluşturacak tahsilat yolu eksik.
**Test:** `test_manual_received_cheque_can_be_collected`.

### F13 — Yüksek: Nakit akışı raporu serbest ödemeleri dışarıda bırakıyor

**Senaryo:** Kasadan tedarikçiye 1.000 TL serbest ödeme yapıldı.
“Nakit Akışı” raporundaki çıkış **1.000 TL yerine 0 TL** oldu.

**Neden:** `application/finans_v2/rapor_service.py:345` yalnızca
`GelirTahsilat` ve `GiderOdeme` topluyor. Sözleşme tahsilatları, serbest cari
hareketleri ve doğrudan çek ödemeleri bu veri kaynağında yok. Ayrıca mahsup
ödemeleri nakit çıkışı olmadığı halde `GiderOdeme` sorgusundan dışlanmıyor.
Bu ek kaynakların her biri ayrı rapor tutarlılığı testi almalı.
**Test:** `test_cash_flow_report_includes_free_advance`.

## Kaynak kodunda görülen, henüz eşzamanlı testle doğrulanmayan riskler

- Gelir/gider ödeme validasyonu sırasında ana gelir/gider satırında kilit yok.
  Mali hesap kilidi daha sonra alınıyor. İki istek aynı kalan borcu okuyup ayrı
  tahsilat/ödeme kabul edebilir; kasa satırını kilitlemek borç sınırını korumaz.
- Çek/senet tahsil/ödeme akışında ve serbest ödeme iptalinde durum okumasını
  koruyan `select_for_update` yok. Çift istek senaryosu gerçek paralel
  bağlantılarla doğrulanmalı.
- Zıt yönlü eşzamanlı virmanlar hesapları kaynak/hedef sırasıyla kilitliyor;
  sabit kimlik sırası kullanılmadığından deadlock ihtimali var.
- Eğitim yılı olmayan masrafların iptalinde, `islem_masrafi_service.py:257`
  ters kasa kaydı için eğitim yılını şart koşuyor. Oluşturma tarafı null yıla
  izin veriyor. Bu senaryo için ek test gerekli.

## Diğer test sonuçları

752 sözleşme/iletişim testinde başarısız olan üç test:

1. `apps.communication.tests.test_binding_system_usage.BindingSystemUsageTests.test_lms_binding_shows_as_system_usage`
   — “Yoklama” beklenen etikette “Kütüphane — gelmedi (Veli)” dönüyor.
2. `apps.communication.tests.test_notification_bindings.BindingServiceTest.test_catalog_lists_every_event_with_slots`
   — gizlenmesi beklenen `devamsizlik` katalogda yer alıyor.
3. `apps.communication.tests.test_template_group.TemplateGroupHelperTest.test_list_excludes_hidden_legacy`
   — aynı eski modül görünürlüğü beklentisi bozuluyor.

Bunlar finans bakiyesi hatası olarak sayılmadı. Beklenti mi uygulama mı
güncellenmeli ayrıca incelenmeli.

## Tekrar çalıştırma

```bash
cd backend
LMS_TEST_DB_NAME=finans_audit_final_20261107 DJANGO_ENV=test \
  venv/bin/python manage.py test apps.finans.tests.test_finans_audit_regressions --noinput --keepdb
```

Eklenen testler doğru davranışı talep ettiği için mevcut kodda kırmızıdır;
`skip` veya `expectedFailure` ile gizlenmedi. Bu dosya standart finans test
keşfine de dahildir. Başlangıçtaki 283 başarılı teste eklenen 14 bulgu testi,
düzeltme yapılana kadar toplam finans paketini başarısız yapacaktır.

## Düzeltme önceliği

1. Kurum/şube erişimi ve ilişkili hesap doğrulaması (F01–F02).
2. Hata yollarında atomiklik, para hassasiyeti, cari değişimi ve mahsup (F03–F06).
3. Dönem kapanış/devir tutarlılığı (F07–F08).
4. Raporların durum, KDV ve para hareketi kaynakları (F09–F10, F13).
5. Kısmi KDV güncellemesi ve manuel çek tahsilat bağlantısı (F11–F12).
6. Gerçek paralel istek, tarayıcı, PDF ve harici servis senaryoları.
