"use client";

import { useState } from "react";
import { WhatsAppConfig } from "@/lib/communication-api";

interface WebhookInfoCardProps {
  config: WhatsAppConfig;
}

export default function WebhookInfoCard({ config }: WebhookInfoCardProps) {
  const [open, setOpen] = useState(false);
  const [ngrokBase, setNgrokBase] = useState("");

  const ngrokCallbackUrl = ngrokBase.trim()
    ? `${ngrokBase.trim().replace(/\/$/, "")}/api/communication/webhook/`
    : "";

  return (
    <div className="comm-card comm-webhook-card">
      <button
        type="button"
        className="comm-webhook-card-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          <strong>Webhook &amp; genel bilgi</strong>
          <span className="comm-webhook-card-subtitle">
            Gelen mesaj bağlantısı tüm hesaplar için ortaktır — Meta bunu telefon numarasına göre yönlendirir.
          </span>
        </span>
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="comm-webhook-card-body">
          <p>
            Meta&apos;daki Callback URL <strong>doğrudan Django backend</strong> adresinize işaret
            etmeli (Next.js proxy değil). Yerel geliştirmede ngrok / Cloudflare Tunnel gerekir.
          </p>
          <p>
            Örnek: <code>https://api.sizinkurum.com/api/communication/webhook/</code>
          </p>
          <p>
            Verify Token, hesabınızdaki &quot;Webhook Verify Token&quot; ile Meta&apos;daki aynı
            olmalı. Abone alanları: <code>messages</code>, <code>message_status</code>.
          </p>

          <div className="comm-form-field">
            <label htmlFor="wh-ngrok-base">Yerel geliştirme — ngrok adresi (opsiyonel)</label>
            <input
              id="wh-ngrok-base"
              type="url"
              value={ngrokBase}
              onChange={(e) => setNgrokBase(e.target.value)}
              placeholder="https://abc123.ngrok-free.app"
            />
            <p className="comm-webhook-hint">
              Meta Callback URL için kopyalayın. Detay: <code>docs/deployment/whatsapp-local-dev.md</code>
            </p>
            {ngrokCallbackUrl && (
              <div className="comm-webhook-copy-row">
                <code>{ngrokCallbackUrl}</code>
                <button
                  type="button"
                  className="comm-btn-secondary"
                  onClick={() => navigator.clipboard.writeText(ngrokCallbackUrl)}
                >
                  Kopyala
                </button>
              </div>
            )}
          </div>

          {config.configured && (
            <div
              className={`comm-alert ${config.webhook_event_count ? "comm-alert-success" : "comm-alert-info"}`}
            >
              {config.webhook_event_count ? (
                <>
                  Son webhook:{" "}
                  {config.webhook_last_received_at
                    ? new Date(config.webhook_last_received_at).toLocaleString("tr-TR")
                    : "—"}{" "}
                  ({config.webhook_event_count} olay)
                </>
              ) : (
                <>
                  Henüz webhook alınmadı — WhatsApp&apos;tan gelen cevaplar inbox&apos;a düşmez.
                  Meta Developer Console&apos;da Callback URL ve verify token&apos;ı kontrol edin.
                </>
              )}
              {config.webhook_last_error ? (
                <div className="comm-webhook-error">Son hata: {config.webhook_last_error}</div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
