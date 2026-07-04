# WhatsApp — Yerel Geliştirme (ngrok)

Giden mesajlar `localhost` üzerinde doğrudan çalışır. **Gelen cevaplar** için Meta'nın bilgisayarınıza webhook POST atabilmesi gerekir; bunun için geçici bir HTTPS tüneli kullanın.

## Hızlı kurulum

### 1. Backend

```bash
cd backend
python3 manage.py runserver 0.0.0.0:8000
```

### 2. ngrok (ayrı terminal)

```bash
ngrok http 8000
```

Örnek adres: `https://abc123.ngrok-free.app`

Alternatif: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) (`cloudflared tunnel --url http://localhost:8000`).

### 3. LMS ayarları

**İletişim → Ayarlar**:

- **Webhook Verify Token** — rastgele güçlü bir string (Meta'da da aynısı)
- **Aktif** kutusu işaretli
- Phone Number ID, WABA ID, Access Token dolu

### 4. Meta Developer Console

**WhatsApp → Configuration → Webhook**:

| Alan | Değer |
|------|--------|
| Callback URL | `https://SIZIN-NGROK/api/communication/webhook/` |
| Verify Token | LMS'teki Webhook Verify Token ile aynı |
| Subscribe | `messages`, `message_status` |

> URL **Django backend'e** (port 8000 / ngrok) gitsin. `localhost:3000` frontend proxy kullanmayın.

### 5. Doğrulama

```bash
curl "https://SIZIN-NGROK/api/communication/webhook/?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=12345"
# Beklenen: 12345
```

LMS **İletişim → Ayarlar** sayfasında "Son webhook: …" görünmeli.

### 6. Kuyruk (giden toplu / kampanya)

Celery yoksa periyodik olarak:

```bash
cd backend && python3 manage.py process_communication_queue
```

Kampanya onayı Celery olmadan da kuyruğu senkron işler; yine de cron önerilir.

## Sık sorunlar

| Belirti | Çözüm |
|---------|--------|
| Verify 403 | Verify token LMS ile Meta'da eşleşmiyor |
| Webhook gelmiyor | ngrok URL güncel mi? Meta Callback URL doğru mu? |
| İmza hatası | `WHATSAPP_APP_SECRET` env yanlış; dev'de boş bırakılabilir |
| Mesaj inbox'ta yok | `messages` alanına abone olun; phone_number_id LMS ile aynı olsun |
| Test numarası | Meta sandbox'ta alıcı numarası test listesinde olmalı |

## Production

Production kurulum için: [whatsapp-production-setup.md](./whatsapp-production-setup.md)
