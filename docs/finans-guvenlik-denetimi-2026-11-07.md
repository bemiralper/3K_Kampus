# Finans güvenlik düzeltmeleri ve salt okunur veri denetimi

Son durum: Bu belgeden sonraki çalışmada kalan 11 mantık hatası da düzeltildi.
[Güncel düzeltme ve migration raporu](finans-mantik-duzeltmeleri-2026-11-07.md).
Bu belgedeki 11 başarısız test bilgisi güvenlik aşamasının tarihsel sonucudur;
son pakette 438 testin tamamı başarılıdır.

7 Kasım 2026. Bu çalışma, önceki finans incelemesindeki kritik kurum/şube
güvenliği açıklarını ve mevcut verideki etkilerin salt okunur araştırmasını kapsar.
Üretim deploy'u, migration ve veri onarımı yapılmadı.

## Düzeltilen erişim ve ilişki kontrolleri

- Çek/senet detay, düzenleme, timeline, dosya listeleme/yükleme/silme, ciro,
  protesto, iade, iptal, durum geçişi, tahsil ve ödeme uçları aynı kayıt erişim
  kapısından geçiyor. İzin kontrolünden sonra kullanıcının kurum/şube erişimi ve
  kaydın aktif şubeye aitliği doğrulanıyor. Reddedilen istek işlem servisine ulaşmıyor.
- Çek oluştururken gövdede şube verilmesi erişim kontrolünü atlatmıyor.
- Gelir tahsilatı ve gider ödemesinde mali hesabın ve ödeme yönteminin kurum,
  şube, aktiflik ve silinme durumu doğrulanıyor. Hesaba bağlı yöntemin seçilen
  hesapla eşleşmesi de zorunlu.
- Çek oluşturma, cari değiştirme ve ciro sırasında bağlı carinin kurum/şubesi
  kontrol ediliyor. Çek tahsil/ödeme işlemleri yabancı kurum/şube hesabına yazamıyor.
- Serbest ödeme iptaline kayıt erişim kontrolü eklendi; başka şubeden iptal
  yapılamıyor. Serbest ödeme ve virman yollarında da hesap/yöntem ilişkileri kontrol ediliyor.
- Sözleşme tahsilatı ve öğrenciye iade yollarına da aynı hesap/yöntem doğrulaması
  eklendi. Mevcut tahsilattaki hesap kontrolüne ek olarak ödeme yöntemi ve iade
  hedef hesabı korunuyor.

Ortak ilişki doğrulaması `backend/apps/finans/application/tenant_validation.py`
içinde. Çek/senetin kuruma bağlı, mali hesapsız portföy yöntemi desteklenmeye
devam eder; ödeme anında seçilen gerçek hesabın kapsamı ayrıca doğrulanır.

## Testler

- 14 yeni güvenlik test metodu: ayrıca alt senaryolarla 13 çek/senet kayıt
  endpoint işlemi, yabancı kurum, kardeş şube, yabancı/uyuşmayan ödeme yöntemi,
  pasif/silinmiş hesap, cari bağlama, çek tahsili/ödemesi, serbest ödeme iptali,
  sözleşme tahsilatı ve iade kontrol ediliyor. Geçerli okuma/yazma ve ödeme
  senaryoları da test ediliyor.
- 4 veri denetimi testi: bozuk ve temiz örnekler, filtre, örnek sınırının gerçek
  bulgu sayısını değiştirmemesi, yalnız SELECT sorguları, JSON çıktı ve PostgreSQL'in
  salt okunur işlem içinde INSERT'i gerçekten reddetmesi doğrulandı.
- Güvenlik + veri denetimi + sözleşme/ödeme takip paketi: **129/129 başarılı**.
- Tüm finans paketi: **315 test, 304 başarılı, 11 başarısız**. Başarısızların
  tamamı önceki incelemeden kalan kapsam dışı davranış testleri; mevcut 283
  finans testi ve bu çalışmadaki yeni güvenlik/denetim testleri başarılı.
- Önceki 14 bulgu testinin üçü artık geçiyor: yabancı kurum hesabına tahsilat,
  başka şubedeki çek/senetin okunması ve değiştirilmesi.
- Önceki incelemenin kalan 11 davranış testi bu çalışmanın kapsamı dışındaki
  hataları göstermeye devam ediyor. Bunlar gizlenmedi veya atlanmadı.
- Çek timeline testindeki pozitif istek, yeni zorunlu şube bağlamını taşıyacak
  şekilde güncellendi.

```bash
cd backend
LMS_TEST_DB_NAME=finans_security_20261107 DJANGO_ENV=test \
  venv/bin/python manage.py test \
  apps.finans.tests.test_finans_tenant_security \
  apps.finans.tests.test_finans_data_audit \
  apps.odeme_takip.tests --noinput --keepdb
```

## Salt okunur denetim nasıl çalışır?

```bash
cd backend
DJANGO_ENV=development venv/bin/python manage.py audit_finans_data --sample-limit 100
# Sadece belirli kurum/şube:
DJANGO_ENV=development venv/bin/python manage.py audit_finans_data \
  --kurum-id 1 --sube-id 2 --sample-limit 100
```

Docker içinde: `./scripts/docker-manage.sh audit_finans_data --sample-limit 100`.
Sunucu/üretim verisi için aynı komut ilgili ortamda ayrıca çalıştırılmalıdır.
Yerel tarama uzak üretim veritabanının denetlendiği anlamına gelmez.

Komut PostgreSQL'de `REPEATABLE READ, READ ONLY` transaction açar ve
`transaction_read_only=on` değerini kontrol eder. Böylece tarama tutarlı bir
snapshot okur; kendi transaction'ında herhangi bir yazma denemesi veritabanınca
reddedilir. Başka bir transaction içinden çalıştırılması da engellenir.
Finans servisleri, düzeltme/seed komutları veya kayıtlara yazan rapor
senkronizasyonları çağrılmaz.

Kontroller:

- Hareket, tahsilat, gider, çek/senet ve sözleşme tahsilatlarının ilişkili
  kurum/şube/hesap/yöntem/cari eşleşmeleri.
- Aktif tahsilat/ödeme toplamı ile kaydın toplam alanının eşitliği ve fazla ödeme.
- Ödeme ile bağlı kasa hareketinin tutar/hesap eşitliği, eksik kasa hareketi.
- İptal edilmiş ödeme için eksik ters kayıt adayları.
- Cari borç/alacak toplamlarının hareketlerden hesaplanan değerle eşitliği.
- Aynı kaynak için birden fazla kasa hareketi, manuel çek tahsilat bağlantısı,
  dönem snapshot farkı ve devirin canlı bakiyeye etkisi için inceleme adayları.

`review` ve `gap` kodları kesin hata hükmü değildir; iş bağlamıyla incelenir.
Örnek sınırı yalnız JSON'daki örnek sayısını kısar; tüm satırlar taranır ve
toplam bulgu sayısı korunur. Çıktı ad, telefon, TCKN, IBAN veya parola içermez;
inceleme için model/kayıt kimliği, tutar ve ilişki kimlikleri kullanılır.
Bir saldırının geçmişte gerçekleşip gerçekleşmediğini ya da aynı görünen iki
işlemin mükerrer işlem niyeti taşıyıp taşımadığını bu komut tek başına kanıtlayamaz.

## Çalıştırılan yerel veri denetiminin sonucu

Projenin otomatik veritabanı yönlendirmesiyle **127.0.0.1:5433 / lms_db**,
yani Docker'daki yerel veri tarandı. Homebrew 5432 veritabanı kullanılmadı.

| Veri | Taranan kayıt |
|---|---:|
| Kasa/banka hareketi | 451 |
| Cari hareket | 548 |
| Gelir tahsilatı | 93 |
| Gelir kaydı | 93 |
| Gider ödemesi | 154 |
| Gider kaydı | 168 |
| Sözleşme tahsilatı | 199 |
| Cari hesap | 30 |
| Çek/senet | 3 |
| Dönem bakiyesi | 29 |
| **Toplam** | **1.768** |

**51 adet `GiderOdeme` kaydında ödeme–kasa hareketi tutarı uyuşmazlığı bulundu.**

| Toplam | Tutar |
|---|---:|
| Bu 51 ödemenin toplamı | 96.275,91 TL |
| Bağlı kasa hareketlerinin toplamı | 96.249,00 TL |
| Net fark | **26,91 TL** |

49 kayıtta kasa tutarı ödeme tutarından düşük, ikisinde yüksek. Bu desen,
önceki incelemedeki Decimal ödeme / Integer kasa alanı ve masraf yuvarlaması
uyuşmazlığıyla uyumludur. Toplam fark bu 51 kaydın mutabakat farkıdır; fiziksel
kasa sayımı veya bütün finansal sonucun doğrulandığı anlamına gelmez.

Örnekler:

- Gider ödeme #148: 469,75 TL; kasa hareketi #424: 469 TL.
- Gider ödeme #145: 2.273,49 TL; kasa hareketi #418: 2.273 TL.

Diğer kontroller mevcut snapshot'ta bulgu üretmedi. Bu sonuç, kapsam dışı
senaryoların ve bütün tarihsel olayların hatasız olduğu anlamına gelmez.

Tam JSON raporu: `/tmp/finans-data-audit-20261107.json`.
Raporda tüm 51 kayıt yer alıyor. **Hiçbir kayıt/bakiye düzeltilmedi.** Veri
onarımı; para hassasiyeti düzeltmesi ve geçmiş hareketlerin muhasebe etkisi
netleştirilerek, önizleme ve ayrı onayla hazırlanmalı.

## Kalan sınırlar

Bu değişiklikler önceki rapordaki mahsup, devir, kuruş hassasiyeti, hatalı
masraf sonrası rollback, KDV/raporlama ve manuel çek tahsilatı sorunlarını
çözmez. Onlar için önceki başarısız testler yerinde duruyor. Gerçek paralel
istek, tarayıcı, PDF ve harici servis testleri bu çalışmada yapılmadı.
