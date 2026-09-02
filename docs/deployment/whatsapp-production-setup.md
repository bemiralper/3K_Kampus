# WhatsApp İletişim Merkezi — Production Kurulum Rehberi

Bu doküman, 3K Kampüs LMS **İletişim Merkezi** modülünün (`apps.communication`) production ortamında Meta WhatsApp Business Cloud API ile çalıştırılması için adım adım kurulum talimatlarını içerir.

> **Veli portalı:** Tam veli web portalı henüz yoktur. Veliler mesajları doğrudan WhatsApp uygulaması üzerinden alır ve yanıtlar.

---

## 1. Meta Developer Console Kurulumu

### 1.1 Uygulama ve WABA

1. [Meta for Developers](https://developers.facebook.com/) → **My Apps** → **Create App** → tip: **Business**.
2. Ürün olarak **WhatsApp** ekleyin.
3. **WhatsApp → API Setup** bölümünden:
   - **Phone number ID** (`WHATSAPP_PHONE_NUMBER_ID`)
   - **WhatsApp Business Account ID** / WABA (`WHATSAPP_WABA_ID`)
   - **Temporary / Permanent Access Token** (`WHATSAPP_ACCESS_TOKEN`)
4. Test numarası veya onaylı iş numarasını bağlayın.

### 1.2 Webhook

Meta webhook URL'i **doğrudan Django backend'e** gitmelidir — Next.js proxy üzerinden **değil**.

```
https://api.sizinkurum.com/api/communication/webhook/
```

| Alan | Değer |
|------|--------|
| Verify Token | `WHATSAPP_VERIFY_TOKEN` env ile aynı (rastgele güçlü string) |
| Subscribe fields | `messages`, `message_status` (status updates) |

**Callback URL doğrulama:** Meta GET isteği gönderir; Django `hub.verify_token` eşleşmesi ile `hub.challenge` döner.

### 1.3 App Secret

**Settings → Basic → App Secret** → `WHATSAPP_APP_SECRET` env değişkeni. Webhook POST imzası (`X-Hub-Signature-256`) doğrulaması için zorunludur.

---

## 2. Ortam Değişkenleri

```bash
# Meta WhatsApp
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=        # Webhook doğrulama
WHATSAPP_APP_SECRET=          # HMAC imza doğrulama

# Kuyruk
COMMUNICATION_QUEUE_BATCH_SIZE=20
COMMUNICATION_QUEUE_THROTTLE_MS=200
COMMUNICATION_QUEUE_DRAIN_SECONDS=50            # tek cron çalışmasında boşaltma bütçesi (0 → tek batch)
COMMUNICATION_QUEUE_BACKGROUND_DRAIN_SECONDS=900 # toplu gönderim sonrası arka plan boşaltma
COMMUNICATION_QUEUE_LOCK_TIMEOUT_SECONDS=600     # bu süreden eski kilitler yeniden alınır
COMMUNICATION_WHATSAPP_COST_USD=0.0009

# Opsiyonel — Celery (boş bırakılırsa cron kullanılır)
CELERY_BROKER_URL=redis://127.0.0.1:6379/0
CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/0

# Opsiyonel — AI asistan (varsayılan kapalı)
COMMUNICATION_AI_ENABLED=False

# Django genel
SECRET_KEY=
DJANGO_ENV=production
FRONTEND_URL=https://app.sizinkurum.com
```

Kurum bazlı token/numara override (çoklu hesap): Admin panel → **İletişim → WhatsApp Hesapları** (`CommunicationChannelConfig`). Her hesabın kendi `phone_number_id`, `access_token`, `webhook_verify_token` değerleri olabilir; tek bir webhook URL'si tüm hesaplar için ortaktır (Meta, gelen olayı `phone_number_id`'ye göre yönlendirir).

---

## 3. Nginx — Webhook Doğrudan Django'ya

Next.js frontend proxy webhook'u **buffer'layabilir**; Meta webhook'u backend'e yönlendirin:

```nginx
# Meta webhook — Django'ya doğrudan
location /api/communication/webhook/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 30s;
    client_max_body_size 10m;
}

# Diğer API + frontend
location / {
    proxy_pass http://127.0.0.1:3000;  # Next.js
    ...
}
```

SSE (`/api/communication/events/stream/`) için buffering kapatın:

```nginx
location /api/communication/events/stream/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400s;
    chunked_transfer_encoding off;
}
```

---

## 4. SSL ve Güvenlik

- Production'da **HTTPS zorunlu** (Meta webhook HTTPS gerektirir).
- `WHATSAPP_APP_SECRET` boş bırakılırsa imza doğrulama atlanır — **production'da asla boş bırakmayın**.
- Access token log'larda maskelenir; yine de log dosyalarına erişimi kısıtlayın.
- Session cookie: production settings'te `Secure=True`, uygun `SameSite` değerleri.

---

## 5. Arka Plan İşleri

### 5.1 Cron (varsayılan — Celery yok)

`backend/` dizininden:

> **Kuyruk cron'u zorunludur.** Kurulmazsa toplu gönderimlerin ilk partisi
> gider, kalanı kalıcı olarak "Bekliyor" durumunda kalır. Kurulu olup olmadığını
> `crontab -l -u lms | grep process_communication_queue` ile doğrulayın.

```cron
# Her dakika — giden mesaj kuyruğu (tek çalışmada kuyruğu ~50 sn boyunca boşaltır)
* * * * * cd /var/www/lms/backend && DJANGO_ENV=production /var/www/lms/venv/bin/python manage.py process_communication_queue >> /var/log/lms/comm_queue.log 2>&1

# Her dakika — sınav karne / cevap anahtarı yayın saati
* * * * * cd /var/www/lms/backend && DJANGO_ENV=production /var/www/lms/venv/bin/python manage.py process_olcme_publish >> /var/log/lms/olcme_publish.log 2>&1

# Her 5 dakika — zamanlanmış toplu gönderim kampanyaları
*/5 * * * * cd /var/www/lms/backend && DJANGO_ENV=production /var/www/lms/venv/bin/python manage.py process_scheduled_campaigns >> /var/log/lms/scheduled_campaigns.log 2>&1

# Her gün 09:00 — otomatik ödeme hatırlatmaları
0 9 * * * cd /var/www/lms/backend && DJANGO_ENV=production /var/www/lms/venv/bin/python manage.py send_payment_reminders --days-ahead=3 >> /var/log/lms/payment_reminders.log 2>&1

# Takvim hatırlatmaları (mevcut)
* * * * * cd /var/www/lms/backend && DJANGO_ENV=production /var/www/lms/venv/bin/python manage.py process_reminders >> /var/log/lms/reminders.log 2>&1

# Yedekleme — UI saat/dakika penceresi için her dakika
* * * * * cd /var/www/lms/backend && set -a && . /etc/lms/env && set +a && /var/www/lms/venv/bin/python manage.py run_scheduled_backups >> /var/log/lms/backups.log 2>&1
0 4 * * * cd /var/www/lms/backend && set -a && . /etc/lms/env && set +a && /var/www/lms/venv/bin/python manage.py purge_expired_backups >> /var/log/lms/backups.log 2>&1
```

Yedekleme cron’unu tek komutla kurmak için: `sudo ./backend/scripts/install-backup-cron.sh` ([backup-restore.md](./backup-restore.md)).

### 5.2 Celery + Redis (opsiyonel)

`CELERY_BROKER_URL` ayarlandığında kampanya onayı ve manuel ödeme hatırlatması kuyruk işlemeyi Celery'ye devreder.

```bash
# Worker
celery -A config worker -l info -Q celery

# Beat (opsiyonel — cron yerine)
celery -A config beat -l info
```

Beat schedule örneği (`config/settings/production.py` veya celery beat config):

- `communication.process_outbound_queue` — her 60 saniye
- `send_payment_reminders` — günlük 09:00 (management command wrapper task ile)

Celery yoksa sistem **cron fallback** ile çalışmaya devam eder.

---

## 6. RBAC — İletişim İzinleri

Kurulum sonrası rolleri seed edin:

```bash
cd backend
DJANGO_ENV=production python manage.py shell -c "from apps.roller.seed import seed_permissions; seed_permissions()"
```

| İzin | Açıklama |
|------|----------|
| `communication.read` | Konuşmaları görüntüleme |
| `communication.write` | Mesaj gönderme, ödeme hatırlatma |
| `communication.manage` | Tüm kurum konuşmaları, log, AI stub |
| `communication.config` | WABA yapılandırma |
| `communication.bulk` | Toplu gönderim |

Koç rolüne tipik: `communication.read`, `communication.write`, `communication.bulk` (toplu gönderim stüdyosu).
Finans / ödeme hatırlatma butonu: `communication.write` veya `finans.manage`.

---

## 7. Stub Modu (Credentials Yok)

`WHATSAPP_*` env boş veya kurum config eksikse:

- Giden mesajlar **stub modunda** kuyruğa alınır ve `stub_*` provider ID ile SENT işaretlenir.
- Meta API çağrısı yapılmaz; geliştirme/staging için güvenlidir.
- Log'da `WhatsApp stub send — credentials missing` görülür.

SMS/EMAIL kanalları da log-only stub'dır (`SmsStubClient`, `EmailStubClient`).

---

## 8. Bildirim şablonları — hangi olayda hangi şablon?

Modüller artık şablon adı seçmez; her gönderim bir **olay anahtarı** (`odev.plan`, `yoklama.gelmedi`, `odeme.gecikme` …) ile yapılır ve hangi şablonun kullanılacağı **Admin → İletişim → Bildirim Şablonları** ekranından yönetilir.

### Ekranın kullanımı

`/admin/iletisim/bildirim-sablonlari`

1. Üstten kapsam seçin: kurum varsayılanı, aktif şube ve/veya belirli bir WhatsApp hesabı.
2. Soldan modül ve olay seçin; sağda o olayın alıcı rolleri (Veli / Öğrenci / Personel) listelenir.
3. Her rol için Meta şablonu, LMS şablonu ve gönderim modunu seçin. **Önizle** ile mesajın son hali görünür.
4. Bir satırda tanım yoksa rozet hangi kuralla çözüldüğünü söyler (şube eşlemesi, kurum varsayılanı, Meta şablon adından otomatik, kod varsayılanı).

Gönderim modları: `AUTO` (24 saat kuralına göre otomatik seç), `META_ONLY`, `FREEFORM_ONLY`, `DISABLED`.

### 24 saatlik pencere ve akıllı gönderim

WhatsApp, kişinin son mesajından itibaren **24 saat** boyunca serbest metne izin verir; pencere kapalıyken yalnızca onaylı şablon iletilir (Meta hata kodu `131047`). Kullanıcı bu kuralı bilmek zorunda değildir, sistem gönderim anında karar verir:

| Durum | Davranış |
|-------|----------|
| Pencere açık (`AUTO`) | Uygulama şablonu serbest mesaj olarak gider, Meta şablonu kullanılmaz |
| Pencere kapalı (`AUTO`) | Aynı mesajın Meta şablonu otomatik kullanılır |
| Toplu gönderim | Her zaman Meta şablonu — serbest metin toplu gönderilmez |
| Pencere kapalı + şablon yok | Gönderim Meta'ya hiç gitmez; ekranda gerekçe gösterilir |

Pencere durumu `Conversation.last_customer_message_at` alanından hesaplanır (her inbound mesajda yazılır) ve tek yerden okunur: `backend/apps/communication/application/session_window.py`.

Serbest mesaj yine de Meta tarafında `131047` alırsa kuyruk aynı içeriği bir kez onaylı şablonla dener (`send_options.session_fallback`); şablon yoksa kayıt kalıcı hatalı işaretlenir, boşuna yeniden denenmez.

İlgili ayarlar:

| Ayar | Varsayılan | Etki |
|------|-----------|------|
| `COMMUNICATION_SESSION_WINDOW_HOURS` | `24` | Pencere süresi |
| `COMMUNICATION_ENFORCE_SESSION_WINDOW` | `True` | Kapalı pencerede serbest mesajı baştan durdur |
| `COMMUNICATION_CAMPAIGN_REQUIRE_TEMPLATE` | `True` | Toplu gönderimde şablon zorunluluğu |

### Şablon kullanım alanı (`usage_scope`)

Meta şablonları hangi ekranda seçilebileceklerine göre etiketlenir: `SYSTEM` (otomatik bildirimler), `PERSONAL` (sohbet — kişisel mesaj), `CAMPAIGN` (toplu duyuru), `ALL` (her yerde). Sohbet ekranındaki şablon seçici yalnızca `PERSONAL`/`ALL`, toplu gönderim ekranı yalnızca `CAMPAIGN`/`ALL` şablonları listeler.

Uygulama şablonu (`MessageTemplate`) bir Meta şablonuna bağlanabilir (**Meta Karşılığı** alanı). Toplu gönderimde uygulama şablonu seçildiğinde bağlı Meta şablonu otomatik kullanılır; `{{ogrenci_ad}}` gibi adlandırılmış değişkenler Meta'nın beklediği `{{1}}` sırasına gönderim anında dönüştürülür.

### Kullanıcı ne görür?

- **Sohbet ekranı:** mesaj kutusunun üstünde yeşil “Normal mesaj gönderilebilir” veya kırmızı “24 saatlik süre dolmuş” rozeti. Kapalıyken kutu pasif olmaz; gönderim denemesi otomatik olarak **Kişisel Mesaj Şablonları** seçicisini açar.
- **Toplu gönderim:** serbest metin alanı yoktur; onaylı duyuru şablonu seçilir, alıcı başına çözülmeyen değişkenler forma girilir.
- **Otomatik bildirimler:** kullanıcı hiçbir seçim yapmaz; olay eşlemesi ve pencere durumu kararı verir.

### Çözümleme sırası

Sistem en özelden en genele doğru arar:

1. Şube + WhatsApp hesabı eşlemesi
2. Şube eşlemesi
3. WhatsApp hesabı eşlemesi
4. Kurum varsayılanı
5. Eski modül ayarları (`AssignmentNotificationConfig`, `AttendanceNotificationConfig`) — geçiş dönemi, mevcut kurulumlar migration ile otomatik taşındı
6. Olayın önerilen Meta şablon adıyla APPROVED şablon araması (`odev_plani_veli` gibi)
7. Koddaki varsayılan metin

### Olay katalogu

Olaylar `backend/apps/communication/application/notification_events.py` içinde tanımlıdır:

| Modül | Olaylar | Alıcı | PDF |
|-------|---------|-------|-----|
| Ödev | `odev.plan`, `odev.rapor` | Veli, Öğrenci | ✓ |
| Ödev | `odev.atama` | Veli | — |
| Yoklama | `yoklama.gelmedi`, `yoklama.gec`, `yoklama.cikis` | Veli | — |
| Ödeme | `odeme.hatirlatma`, `odeme.gecikme` | Veli | — |
| Ödeme | `odeme.plan` / `odeme.makbuz` / `odeme.sozlesme` | Veli, Öğrenci | ✓ |
| Görüşme | `gorusme.hatirlatma` | Veli, Öğrenci | — |
| Sınav | `sinav.sonuc` | Veli | — |
| Takvim | `takvim.etkinlik` | Veli, Öğrenci | — |
| Devamsızlık | `devamsizlik.bildirim` | Veli | — |
| Finans | `finans.gun_sonu` | Personel | ✓ |
| Duyuru | `duyuru.genel` | Veli, Öğrenci, Personel | — |

### API

| Uç | Amaç |
|----|------|
| `GET /api/communication/notification-events/?sube_id=&channel_config_id=` | Katalog + mevcut eşlemeler + çözümleme gerekçesi |
| `PUT /api/communication/notification-bindings/` | Kapsam + olay + rol için eşlemeyi kaydet |
| `DELETE /api/communication/notification-bindings/` | Eşlemeyi kaldır (varsayılana dön) |
| `POST /api/communication/notification-bindings/preview/` | Gönderim yapmadan önizleme |
| `GET /api/communication/conversations/<id>/template-messages/` | Sohbet için kişisel şablonlar + pencere durumu |
| `POST /api/communication/conversations/<id>/template-messages/` | Seçilen şablonu değişkenleriyle gönder |

---

## 8.1 Haftalık ödev PDF — Meta Document Template

Ödev planı / kontrol raporu WhatsApp’a gittiğinde veli veya öğrenci **aynı mesajda** hem metni hem PDF’yi görmeli. Bu, Meta’nın **DOCUMENT header**’lı message template’i ile yapılır.

### Akış

1. Sistem ödev plan/rapor PDF’ini sunucuda üretir (Playwright → React print route).
2. PDF `communication/attachments/` altında saklanır, gönderimde Meta’ya `upload_media` ile yüklenir.
3. Onaylı Meta şablonuna `header: DOCUMENT` + body değişkenleri ile `send_template` çağrılır.
4. Meta şablon yoksa eski davranışa düşülür: 24 saatlik pencerede serbest `document` mesajı (caption + PDF).

### Meta’da şablon oluşturma

En kolay yol: Bildirim Şablonları ekranında ilgili satırdaki **“Bu olay için şablon oluştur”** bağlantısı — Meta Şablonlar sayfası önerilen ad, DOCUMENT başlık ve kurallara uygun örnek gövde ile önceden dolu açılır. Elle oluşturmak için Admin → İletişim → **Meta Şablonlar** (veya Meta Business Manager):

| Alan | Öneri |
|------|--------|
| Ad | `odev_plani_veli` / `odev_plani_ogrenci` / `odev_raporu_veli` / `odev_raporu_ogrenci` |
| Kategori | UTILITY |
| Header | **DOCUMENT** (örnek PDF yükleyin) |
| Body | örn. `Sayın {{veli_ad}}, {{ogrenci_ad}} için {{hafta}} ödev planı ektedir. Teslim tarihi: {{teslim_tarihi}}. İyi çalışmalar dileriz.` |

Desteklenen body değişkenleri: `ogrenci_ad`, `veli_ad`, `hafta`, `hafta_no`, `odev_baslik`, `teslim_tarihi`, `pdf_baslik`, `kurum_ad`.

**Meta metin kuralları** (uymayan şablon `Invalid parameter` ile reddedilir; panel bunları göndermeden önce uyarır):

- Body bir değişkenle **başlayamaz** ve **bitemez** — başına/sonuna sabit metin ekleyin.
- İki değişken **yan yana** olamaz (`{{ogrenci_ad}} {{hafta}}` ✗ → `{{ogrenci_ad}} için {{hafta}}` ✓).
- Alt bilgide (footer) değişken kullanılamaz; başlık metninde en fazla bir değişken olabilir.
- Metin başlığında **yeni satır, emoji, yıldız (*) ve biçimlendirme** (`*_~\``) kullanılamaz.

Onay sonrası sistem bu isimleri otomatik tanır. Farklı bir ad kullanacaksanız şablonu Bildirim Şablonları ekranından ilgili olaya bağlayın.

### Kontrol

Ödev → WhatsApp gönder önizlemesinde yeşil kutu: “Meta Document şablonu ile gönderilecek”. Yoksa serbest PDF yolu kullanılır (Meta şablon APPROVED + DOCUMENT header eksik demektir).

---

## 9. Sorun Giderme

| Belirti | Olası neden | Çözüm |
|---------|---------------|--------|
| Webhook verify başarısız | Token uyuşmazlığı | `WHATSAPP_VERIFY_TOKEN` Meta console ile aynı mı kontrol edin |
| POST webhook 403 | HMAC imza hatası | `WHATSAPP_APP_SECRET` doğru mu; nginx body'yi değiştiriyor mu |
| Mesaj kuyrukta kalıyor | Cron/worker çalışmıyor | `process_communication_queue --dry-run` ile bekleyen sayısını görün; cron kurulu değilse bölüm 5.1. Gönderim detay sayfasındaki "Kuyruğu şimdi işle" elle tetikler |
| Toplu gönderimin ilk 20'si gitti, kalanı beklemede | Eski davranış: her çalışma tek batch | Güncel sürümde cron tek çalışmada kuyruğu `COMMUNICATION_QUEUE_DRAIN_SECONDS` boyunca boşaltır |
| Deploy/restart sonrası mesajlar "Gönderiliyor"da kaldı | Kilit (`locked_at`) temizlenmeden süreç düştü | `COMMUNICATION_QUEUE_LOCK_TIMEOUT_SECONDS` (varsayılan 10 dk) sonrasında otomatik geri alınır |
| Kampanya "Onaylandı"da kaldı, alıcı üretilmedi | Materialize thread'i restart'ta düştü | `process_scheduled_campaigns` cron'u ya da detay sayfasında "Kuyruğu şimdi işle" |
| Meta rate limit | Çok hızlı batch | `COMMUNICATION_QUEUE_THROTTLE_MS=500` artırın; batch size düşürün |
| Koç inbox güncellenmiyor | SSE kopuk | `/api/communication/events/stream/` nginx buffering kapalı mı; fallback 20s polling devreye girer |
| Ödeme hatırlatma 400 "zaten gönderildi" | Idempotency | Aynı taksit için tekrar gönderim engellenir (by design) |
| Veli mesaj almıyor | Opt-out | Veli `sms_bildirimleri` içinde `odeme`/`duyuru` kategorisi açık mı |
| Ödev PDF ayrı mesaj / sadece caption | Meta DOCUMENT şablonu yok | Bölüm 8.1: `odev_plani_veli` APPROVED + DOCUMENT header |
| Bir olay hiç mesaj göndermiyor | Eşlemede gönderim modu `DISABLED` | Bildirim Şablonları ekranında ilgili satırı `AUTO` yapın |
| Yanlış şablon gidiyor | Daha özel kapsamda eski bir eşleme var | Ekranda kapsamı şube/hesap yapıp satırı kontrol edin; “Varsayılana dön” ile temizleyin |
| Sohbette “24 saatlik süre dolmuş” yazıyor ama kişi az önce yazdı | Webhook düşmüş, `last_customer_message_at` güncellenmemiş | Webhook loglarını kontrol edin; gerekirse `backfill_conversation_names` sonrası inbound akışını doğrulayın |
| Sohbette şablon listesi boş | `PERSONAL`/`ALL` kapsamında APPROVED şablon yok | Meta Şablonlar ekranından kapsamı “Sohbet — kişisel mesaj” olan şablon oluşturup onaylatın |
| Toplu gönderimde “şablon seçilmelidir” hatası | Serbest metinle toplu gönderim kapalı | Onaylı duyuru şablonu seçin veya uygulama şablonuna Meta karşılığı bağlayın |
| Mesaj `#131047` ile başarısız | Pencere kapalı, yedek şablon yok | Olaya `AUTO` modda bir Meta şablonu bağlayın |

---

## 10. Doğrulama Checklist

- [ ] Meta webhook verify (GET) 200 + challenge
- [ ] Test mesajı gönder → Meta dashboard'da delivered
- [ ] Gelen mesaj → koç inbox'ta görünür
- [ ] `process_communication_queue --dry-run` pending sayısı raporlar
- [ ] Admin WABA test endpoint: `POST /api/communication/config/whatsapp/test/`
- [ ] Ödeme planı → "WhatsApp Hatırlat" butonu çalışır
- [ ] Görüşme formu → WhatsApp checkbox ile kontrol
- [ ] Sohbet ekranında oturum rozeti doğru (kişi yazınca yeşile döner)
- [ ] Pencere kapalıyken serbest mesaj denemesi şablon seçicisini açar
- [ ] Toplu gönderim şablonsuz gönderime izin vermiyor

---

## 11. İlgili Dosyalar

| Bileşen | Konum |
|---------|--------|
| Communication app | `backend/apps/communication/` |
| Bildirim olay katalogu | `backend/apps/communication/application/notification_events.py` |
| Şablon çözümleyici | `backend/apps/communication/application/notification_template_resolver.py` |
| Gönderim dispatcher | `backend/apps/communication/application/notification_dispatcher.py` |
| 24 saatlik pencere | `backend/apps/communication/application/session_window.py` |
| Sohbette şablon gönderimi | `backend/apps/communication/interfaces/views/conversation_template_send.py` |
| Sohbet şablon seçici (UI) | `frontend/components/communication/MetaTemplateSendDrawer.tsx` |
| Bildirim şablonları ekranı | `frontend/app/admin/iletisim/bildirim-sablonlari/` |
| Webhook | `backend/apps/communication/interfaces/views/webhook.py` |
| Kuyruk komutu | `backend/apps/communication/management/commands/process_communication_queue.py` |
| Zamanlanmış kampanya komutu | `backend/apps/communication/management/commands/process_scheduled_campaigns.py` |
| Ödeme hatırlatma komutu | `backend/apps/communication/management/commands/send_payment_reminders.py` |
| Celery tasks | `backend/apps/communication/tasks.py` |
| Frontend inbox | `frontend/app/coach/mesajlar/` |
| Plan dokümanı | `docs/plans/whatsapp-communication-center.md` |
