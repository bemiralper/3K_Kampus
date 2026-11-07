# Finans: kalan 11 mantık hatasının düzeltmeleri

Sonraki çalışma: Finans paketi uzak üretime de uygulandı ve üretimdeki 87
kuruş farkı onarıldı. [Üretim onarım raporu](finans-uretim-onarimi-2026-11-07.md).
Bu belgenin üretime deploy yapılmadığı ve geçmiş veriye dokunulmadığı ifadeleri
önceki aşamanın tarihsel durumunu anlatır.

7 Kasım 2026. Önceki incelemedeki 11 başarısız davranış senaryosu düzeltildi.
Güvenlik düzeltmeleri korunuyor. Geçmiş tutarlara otomatik veri onarımı yapılmadı.

## Değişen davranışlar

| Hata | Düzeltme |
|---|---|
| Hata dönen tahsilatın kayıtta kalması | `(sonuç, hata)` dönen servisler `atomic_result` ile çalışıyor. Hata tuple'ı normal dönüş olsa da transaction/savepoint geri alınıyor. Gelir, gider, serbest ödeme, virman, masraf ve sözleşme tahsilat/iade yollarına uygulandı. |
| Kuruş kaybı | Kasa hareketi tutarı, öncesi/sonrası bakiyesi, dönem alanları ve virman tutarı iki ondalıklı Decimal alanlar oldu. Masraf ve serbest ödemelerde tam TL dönüşümü kaldırıldı. API/listeler, dönem/gün sonu/dashboard toplamları ve para biçimleri kuruşları koruyor. |
| Tahsilattan sonra cari değişikliğinde bakiye bozulması | Ödemesi/tahsilatı olan gelir veya giderin carisini değiştirme isteği reddediliyor. Önce ilgili ödemeler iptal edilmeli. |
| Mahsup iptalinin avansı yeniden azaltması | Mahsup kullanımı ve iptali cari hareket yönüne göre netleştiriliyor. 1.000 TL avans → 400 TL mahsup → iptal sonrası kullanılabilir avans 1.000 TL. |
| Dönem devrinin kasayı artırması | Devir hareketi dönem açılış işareti olarak kalıyor; canlı kasa toplamına dahil edilmiyor. Yeni devir hareketinin canlı bakiye snapshot'ı da parayı yeniden artırmıyor. Önceden açılmış hedef dönemin açılış bakiyesi doğru devir tutarına ayarlanıyor. Negatif/kuruşlu devir destekleniyor. |
| Kapalı döneme işlem yapılması | Merkezi kasa servisi kapalı/devredilmiş döneme yazmayı engelliyor. Üst işlem kontrollü hata döndürüyor ve tahsilat/ödeme/cari etkiler geri alınıyor. Kapanış/devir hesap kilidiyle yeni hareketlerle sıraya giriyor. |
| Kısmi tahsil edilmiş gelirin beklenen raporundan kaybolması | Dönem raporunun gelir sorguları onaylı, kısmi tahsil edilmiş ve tamamlanmış kayıtları birlikte ele alıyor. Vade dönemindeki toplam/alınan/kalan değerler korunuyor. |
| Beklenen tutardan KDV'nin eksik olması | KDV hariç `brut_tutar` yerine ödenecek `net_tutar` kullanılıyor. Özet ve detay kuruş hassasiyetiyle hesaplanıyor. |
| KDV dahil kayıtta kısmi oran güncellemesi | İstekte yeni tutar yoksa, kaydın mevcut KDV moduna uygun kullanıcı tutarı temel alınıyor. Gelir ve giderde yalnız oran değiştirilince KDV dahil toplam yanlışlıkla taban tutara düşmüyor. |
| Manuel alınan çekin tahsil edilememesi | Sözleşmesiz çek için kasa girişi ve varsa cari alacak hareketi oluşturuluyor; çek tahsil edilmiş işaretleniyor. Yeniden tahsil reddediliyor. Dönem/gün sonu/nakit akışına dahil ediliyor; carili tahsilat çift sayılmıyor. |
| Nakit akışında serbest ödemelerin görünmemesi | Raporun kaynağı gerçek `BakiyeHareketi` satırları oldu. Serbest ödeme, sözleşme tahsilatı, çek ve ters para hareketleri kapsanıyor. Kasadan para çıkarmayan mahsup rapora nakit çıkışı olarak girmiyor. Devir/açılış ve kurum içi virman gerçek dönem nakit akışı toplamından dışlanıyor. |

## Doğrulama

- **438/438 backend testi başarılı:** tüm finans paketi ve sözleşme/ödeme takip testleri.
- Önceki 14 bulgu regresyonunun tamamı başarılı; bunların üçü önceki güvenlik
  aşamasında, kalan 11'i bu aşamada düzeltildi.
- 12 ek test; kuruşlu ödeme/iptal, masraf hatasında gider ve virmanın geri
  alınması, eğitim yılı olmayan 0,25 TL masrafın iptali, ödemeli giderde cari
  değişikliğinin engellenmesi, giderde KDV dahil kısmi güncelleme, kapalı dönemde
  rollback, negatif/kuruşlu devir, özet/detay tutarlılığı, manuel çekin bir kez
  sayılması ve liste/JSON/HTML çıktısında kuruş korunmasını kontrol ediyor.
- Frontend lint ve TypeScript kontrolü başarılı. Lint'teki mevcut hook
  bağımlılığı uyarıları devam ediyor.
- Model/migration kontrolü finans için eksik migration göstermedi.
- Gerçek tarayıcı tıklama, production build, gerçek Chromium PDF oluşturma,
  Uyumsoft/WhatsApp gönderimi ve paralel yük testi bu çalışmada yapılmadı.

```bash
cd backend
LMS_TEST_DB_NAME=finans_logic_20261107 DJANGO_ENV=test \
  venv/bin/python manage.py test apps/finans apps.odeme_takip.tests --noinput --keepdb
```

## Migration ve mevcut veri

`finans.0040_alter_bakiyehareketi_bakiye_oncesi_and_more` yalnızca tutar
alanlarını genişleten şema migration'ıdır; `RunPython`, bakiye onarımı veya
eski hareketleri yeniden yazan adım içermez.

Migration önce izole PostgreSQL test veritabanında test edildi, ardından planı
kontrol edilerek **yerel Docker veritabanına** uygulandı:

```bash
./scripts/docker-manage.sh migrate finans 0040 --noinput
```

Yerel veritabanı host üzerinden `127.0.0.1:5433/lms_db`, container içinden
`db:5432/lms_db` olarak erişilen aynı Docker verisidir. Homebrew veritabanına
migration yapılmadı. Uzak üretim ortamına deploy/migration yapılmadı.

Migration sonrasında yeniden **1.768 kayıt salt okunur tarandı**:

- Önceki **51 gider ödeme–kasa hareketi uyuşmazlığı** aynen duruyor.
- Bu kayıtların ödeme toplamı 96.275,91 TL, kasa hareketleri 96.249,00 TL;
  net fark **26,91 TL**.
- Migration öncesi ve sonrası ilgili kayıt kimlikleri ve iki taraftaki tutarlar
  karşılaştırıldı; hepsi aynı.
- Diğer denetim kontrolleri bu snapshot'ta bulgu üretmedi.

Son JSON raporu: `/tmp/finans-data-audit-after-logic-20261107.json`.
Yeni işlemler kuruşları doğru saklar; eski 51 fark için ayrıca kontrollü veri
onarımı gerekir. Daha önce kaybolmuş kuruşlar şema genişletilince kendiliğinden
geri gelmez. Salt okunur denetimde, artık desteklenen manuel çek ve doğru
devir işaretlerini hata adayı sayan eski kontroller kaldırıldı.
