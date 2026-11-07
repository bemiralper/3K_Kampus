# Uzak üretim finans onarımı — 7 Kasım 2026

Kullanıcının açık onayıyla uzak üretim sunucusunda uygulandı. Bu çalışma,
yerel Docker veritabanındaki 51 kayıtla değil üretimin kendi denetim sonucuyla
çalışır.

## Sonuç

- Üretimde **87 gider ödemesinin bağlı kasa hareketindeki kuruş farkı** düzeltildi.
- Kaynak ödeme belgelerinin tutarı değiştirilmedi: toplam **882.944,91 TL**.
- Bağlı kasa hareketlerinin eski toplamı **882.900,00 TL** idi; net **44,91 TL**
  fark giderildi. Kasa çıkışı net 44,91 TL arttı, ilgili hesapların toplam
  bakiyesi net aynı tutarda azaldı.
- Etkilenen 7 hesapta **684 hareketin önceki/sonraki bakiye alanları** yeniden
  hesaplandı. Tutarı değişen hareket sayısı 87'dir; 684 hareketin tamamının
  işlem tutarı değiştirilmedi.
- **7 açık dönem özeti** yeniden hesaplandı. Kapalı dönemi değiştirecek
  aday bulunmadı; onarım kodu kapalı/belirsiz dönemde çalışmayı reddeder.
- Değişen alanların eski/yeni değerleri **7 değişmez FinansIslemLog** kaydına
  ve sunucudaki önizleme dosyasına yazıldı.
- Son salt okunur taramada kuruş uyuşmazlığı kalmadı; onarım önizlemesi
  yeniden çalıştırıldığında **0 aday** döndü.
- Bakım modu kapatıldı; backend ve frontend aktif. Frontend HTTP 200,
  auth kontrol ucu HTTP 200, oturumsuz finans isteği HTTP 401 döndü.

## Tek kalan bulgu

**Tahsilat #241:** Kayıtta mali hesap #10 seçiliyken ödeme yönteminin bağlı
olduğu hesap #6. Seçili hesap için aynı türde tekil bir ödeme yöntemi
belirlenemedi. Kullanıcının onayladığı kapsam gereği **bu kayıt değiştirilmedi**.
Kaynak dekont/makbuz veya işlem sahibi doğrulamasıyla hangi yöntem/hesabın
doğru olduğu belirlenmeli; para hareketi hesabı tahminle taşınmamalı.

Son denetim toplam bulgu sayısı **1**; bu bulgu tutar farkı değildir.

## Güvence ve uygulama

1. Üretim şeması ve kayıtları önce PostgreSQL `READ ONLY` işleminde incelendi.
2. Yalnızca kaynak ödeme, yön, kaynak kimliği, hesap/kurum/şube/yıl ve işlem
   günü eşleşen; eski tam TL kesme/yuvarlama davranışıyla açıklanan farklar
   kabul edildi. 87 adayın tamamı bu kontrollerden geçti.
3. **444 test** ve yerel frontend üretim derlemesi başarılı oldu. Altı onarım
   testi; salt okunur önizleme, idempotans, geri alma, veri kayması, yanlış
   kaynak, kapalı dönem ve öncesi/sonrası denetim izini kontrol eder.
4. Üretim veritabanı ve değişecek kod dosyaları **sunucuda** yedeklendi.
   Yaklaşık 34,6 MB custom-format PostgreSQL yedeği `pg_restore --list` ile
   doğrulandı. Veritabanı yedeği bu bilgisayara indirilmedi.
5. 48 dosyalık, yalnız finans düzeltmeleri ve ilgili sözleşme servisini içeren
   paket hazırlandı. Her dosyanın başlangıç ve paket SHA256 değeri kontrol
   edildi; ilgisiz coaching değişiklikleri pakete alınmadı.
6. Yeni frontend üretimde ayrı dizinde derlendi; mevcut servisler hazırlık
   sırasında çalışmaya devam etti.
7. Kısa bakım sırasında kod ve `finans.0040` kuruş şeması uygulandı. Önizleme
   tekrar oluşturuldu; 87 kaydın kimlikleri ve eski/yeni tutarları onaylı liste
   hash'iyle karşılaştırıldı.
8. Onarım, yazmaları sıraya alan tablo kilitleri altında tek atomik işlemde
   yapıldı. Son mutabakat başarısız olsaydı değişiklikler geri alınacaktı.
9. Son denetim, tekrar onarım önizlemesi, denetim log sayısı ve servis/HTTP
   kontrolleri doğrulandı.

## Kayıtlar ve geri alma

- Onarım kimliği: `a4601b82-4a33-48a7-9bb7-73695627078a`
- Önizleme digest'i: `6782c4adae3b5f66f8e604cb65cd81ce8375c9fe42e72f2afa056ba6c3eadf43`
- Üretim yedek/plan dizini: `/var/backups/lms/finans-repair-20261107`
- Tam veritabanı yedeği: `database-before.dump`
- Kod yedeği: `code-before.tar.gz`
- Uygulanan eski/yeni değerler: `repair-plan.json`
- Sonuç: `repair-result.json`, `audit-after.json`, `completion.json`
- Kullanıcının izin verdiği yerel rapor: `/tmp/finans-production-audit-20261107.json`

Onarım komutu normalde yalnızca önizleme yapar:

```bash
python manage.py repair_finans_precision
python manage.py repair_finans_precision --apply --expected-digest PLAN_DIGEST
```

Hedefli geri alma `--rollback-id` ile mümkündür; kod, onarım sonrasında yeni
hareket veya değişen kayıt görürse otomatik geri almayı engeller. Böyle bir
durumda eski veritabanı yedeğini doğrudan canlı verinin üzerine yüklemek yeni
işlemleri kaybettirebilir; geri alma ayrıca değerlendirilmelidir.

## Kodun dağıtım durumu

Üretimde finans paketi hedefli olarak uygulandı; Git HEAD hâlâ
`9c36fa491e2c41fda039b095d53dbc3eade21fe5`. Bu çalışma Git commit/push yapmadı.
Sonraki standart `git pull` deploy'undan önce yereldeki finans değişiklikleri
depoya alınmalı ve üretimdeki hedefli paketle uzlaştırılmalıdır. Paket
manifest'i yedek dizinindeki `release/finans-release-manifest.json` dosyasında
her dosyanın önceki ve sonraki hash'ini içerir.

Yerel Docker verisi ayrı tutuldu; bu üretim onarımı yereldeki geçmiş 51
uyuşmazlığı değiştirmedi.
