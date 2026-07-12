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

Kurum bazlı token/numara override: Admin panel → **İletişim → Ayarlar** (`CommunicationChannelConfig`).

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

```cron
# Her dakika — giden mesaj kuyruğu
* * * * * cd /var/www/lms/backend && DJANGO_ENV=production /var/www/lms/venv/bin/python manage.py process_communication_queue >> /var/log/lms/comm_queue.log 2>&1

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

## 8. Sorun Giderme

| Belirti | Olası neden | Çözüm |
|---------|---------------|--------|
| Webhook verify başarısız | Token uyuşmazlığı | `WHATSAPP_VERIFY_TOKEN` Meta console ile aynı mı kontrol edin |
| POST webhook 403 | HMAC imza hatası | `WHATSAPP_APP_SECRET` doğru mu; nginx body'yi değiştiriyor mu |
| Mesaj kuyrukta kalıyor | Cron/worker çalışmıyor | `process_communication_queue` cron veya Celery worker |
| Meta rate limit | Çok hızlı batch | `COMMUNICATION_QUEUE_THROTTLE_MS=500` artırın; batch size düşürün |
| Koç inbox güncellenmiyor | SSE kopuk | `/api/communication/events/stream/` nginx buffering kapalı mı; fallback 20s polling devreye girer |
| Ödeme hatırlatma 400 "zaten gönderildi" | Idempotency | Aynı taksit için tekrar gönderim engellenir (by design) |
| Veli mesaj almıyor | Opt-out | Veli `sms_bildirimleri` içinde `odeme`/`duyuru` kategorisi açık mı |

---

## 9. Doğrulama Checklist

- [ ] Meta webhook verify (GET) 200 + challenge
- [ ] Test mesajı gönder → Meta dashboard'da delivered
- [ ] Gelen mesaj → koç inbox'ta görünür
- [ ] `process_communication_queue --dry-run` pending sayısı raporlar
- [ ] Admin WABA test endpoint: `POST /api/communication/config/whatsapp/test/`
- [ ] Ödeme planı → "WhatsApp Hatırlat" butonu çalışır
- [ ] Görüşme formu → WhatsApp checkbox ile kontrol

---

## 10. İlgili Dosyalar

| Bileşen | Konum |
|---------|--------|
| Communication app | `backend/apps/communication/` |
| Webhook | `backend/apps/communication/interfaces/views/webhook.py` |
| Kuyruk komutu | `backend/apps/communication/management/commands/process_communication_queue.py` |
| Zamanlanmış kampanya komutu | `backend/apps/communication/management/commands/process_scheduled_campaigns.py` |
| Ödeme hatırlatma komutu | `backend/apps/communication/management/commands/send_payment_reminders.py` |
| Celery tasks | `backend/apps/communication/tasks.py` |
| Frontend inbox | `frontend/app/coach/mesajlar/` |
| Plan dokümanı | `docs/plans/whatsapp-communication-center.md` |
