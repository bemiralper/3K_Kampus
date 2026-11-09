# Tek deneme satışının sözleşme ekranına sızması — 9 Kasım 2026

## Neden

`record_deneme_ucreti` tek deneme satışını `gunu_birlik_deneme_ucreti` işaretli
bir Sozlesme satırıyla izliyordu. Tahsilat GelirKaydi/GelirTahsilat üzerinden
kasaya bir kez yazılıyordu. Sözleşme listesi teknik izleri ayırmadığı için satışlar
sözleşme gibi görünüyordu. Sözleşmenin toplam_odenen hesabı yalnız sözleşme
Tahsilat tablosuna bakarak sıfır döndürüyordu; sözleşme alacak raporuna da
olmayan bir borç ekleniyordu. Önceki kayıt testleri geliri doğruluyor fakat
sözleşme listesi ve dashboard ayrımını doğrulamıyordu.

## Düzeltme

- Ortak eğitim sözleşmesi kapsamı yalnız tek deneme işaretli satış izlerini dışlar.
  Yıllık deneme kulübü/paketi sözleşmeleri kapsamda kalır.
- Sözleşme listesi, öğrenci bazlı sözleşme sorgusu, detay/işlem erişimi ve
  sözleşme dashboard/risk raporları bu kapsamı kullanır.
- Tek deneme öğrencisi sözleşmesiz öğrenci uyarısına düşmez.
- Teknik izde ödeme tutarı bağlı gelirdeki gerçek tamamlanmış tahsilatlardan
  okunur; kısmi/iptal/eksik tahsilat tamamlandı statüsünden ödenmiş varsayılmaz.
- Öğrenci finans kartının deneme bölümünde gerçek gelir tahsilatları gösterilir.
  Ücretli fakat tahsilatsız kayıt "Tahsilat yok", sıfır tutar "Ücretsiz" görünür.
- Ek tahsilat veya kasa hareketi oluşturulmaz. Kayıt/iptal işlemi aynı gelir
  yolunu kullanır.

Bu düzeltme depolama modelini değiştirmez: teknik izler mevcut Sozlesme
tablosunda korunur, eğitim sözleşmesi arayüz ve raporlarından ayrılır. Bu sayede
eski satırları silmek, taşımak veya tahsilatı tekrar kaydetmek gerekmez.
Öğrenci kartındaki deneme geçmişi, son ücret hatırlama, kayıt iptali ve
kurum kaydına geçen öğrencinin deneme listesinde kalması çalışmaya devam eder.

## Canlı kontrol

Kod henüz bu çalışma kapsamında canlıya dağıtılmadı; canlı kayıtlar incelenmedi.
Dağıtımdan sonra eski işaretli kayıtlar da aynı kuralla listeden ayrılır.
Veri migration'ı gerekmez. Yalnız bu konuya ait dosyalar dağıtıma dahil edilmeli;
çalışma ağacındaki personel/akademik değişiklikleri bu düzeltmeye ait değildir.

Gerçek tahsilatı eksik kayıtları belirlemek için aşağıdaki komut salt okunurdur:

```sh
cd backend
DJANGO_ENV=production python manage.py audit_deneme_satislari \
  --kurum-id KURUM_ID --sube-id SUBE_ID --egitim-yili-id EGITIM_YILI_ID
```

Çıktı satış izi, öğrenci ve gelir kimlikleri, gerçek tahsilat ve farkı içerir.
Fark varsa ödeme alınmış varsayılarak otomatik para girişi yapılmaz; ilgili
makbuz/gelir/kasa hareketi incelenir. Komut hiçbir kayıt değiştirmez.

## Regresyonlar

Yeni testler: gerçek satış sonrası sözleşme listesi ve dashboard'dan ayrılma,
kasada yalnız bir tahsilat, doğrudan sözleşme detayına erişimin engellenmesi,
yıllık deneme kulübü sözleşmesinin görünürlüğü, kısmi/iptal/kayıp gelirde gerçek
ödeme, öğrenci kartında sahte ödenmiş gösterilmemesi, salt okunur ve şube
sınırlı canlı kontrol komutu. Mevcut testler kayıt/iptal/ücret hatasında geri
alma senaryolarını da kapsar.

Doğrulama: `apps.ogrenci_kayit.tests apps.odeme_takip.tests apps.ogrenci.tests`
267/267 başarılı. Değişen öğrenci finans bileşeni için hedefli ESLint ve
`git diff --check` başarılı.

Son geniş kontrol: kayıt, öğrenci, sözleşme, finans, koçluk uygunluğu ve koçluk
yaşam döngüsünde **622/622 test başarılı**. Mevcut
`test_live_bad_credentials_are_rejected` testi canlı Uyumsoft'a bağlantı
istediğinden dış ağ kapalı koşuda hariç tutuldu (623 test keşfedildi).
Diğer sağlayıcı çağrıları offline runner ile engellendi. Bu seçim için yalnız
`/tmp/lms_deneme_runner.py` kullanıldı; depo test runner'ı değiştirilmedi.
