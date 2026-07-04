"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CommunicationPageShell } from "@/components/communication";
import "@/components/communication/communication.css";
import MetaTemplateSelect from "@/components/communication/MetaTemplateSelect";
import {
  fetchWhatsAppConfig,
  saveWhatsAppConfig,
  testWhatsAppConnection,
  WhatsAppConfig,
} from "@/lib/communication-api";

function ConnectionBadge({ config }: { config: WhatsAppConfig }) {
  if (!config.configured) {
    return (
      <span className="comm-connection-badge off">
        <span className="comm-connection-dot" />
        Yapılandırılmamış
      </span>
    );
  }
  if (!config.has_token) {
    return (
      <span className="comm-connection-badge disconnected">
        <span className="comm-connection-dot" />
        Token eksik
      </span>
    );
  }
  if (!config.is_active) {
    return (
      <span className="comm-connection-badge disconnected">
        <span className="comm-connection-dot" />
        Pasif — &quot;Aktif&quot; kutusunu işaretleyin
      </span>
    );
  }
  return (
    <span className="comm-connection-badge connected">
      <span className="comm-connection-dot" />
      Aktif
    </span>
  );
}

export default function IletisimAyarlarClient() {
  const [config, setConfig] = useState<WhatsAppConfig>({});
  const [form, setForm] = useState({
    phone_number_id: "",
    waba_id: "",
    access_token: "",
    webhook_verify_token: "",
    display_phone: "",
    is_active: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetaTemplate, setSelectedMetaTemplate] = useState("");
  const [ngrokBase, setNgrokBase] = useState("");

  const ngrokCallbackUrl = ngrokBase.trim()
    ? `${ngrokBase.trim().replace(/\/$/, "")}/api/communication/webhook/`
    : "";

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchWhatsAppConfig();
      setConfig(data);
      setForm({
        phone_number_id: data.phone_number_id || "",
        waba_id: data.waba_id || "",
        access_token: "",
        webhook_verify_token: data.webhook_verify_token || "",
        display_phone: data.display_phone || "",
        is_active: data.is_active || false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yapılandırma yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.access_token) delete payload.access_token;
      await saveWhatsAppConfig(payload);
      await load();
      setMessage("WhatsApp yapılandırması kaydedildi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const result = await testWhatsAppConnection();
      setMessage(result.message || (result.success ? "Bağlantı başarılı" : "Credentials eksik"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test başarısız");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <CommunicationPageShell
        title="WhatsApp Yapılandırması"
        subtitle="Meta Cloud API ayarları"
        icon="⚙️"
        breadcrumbs={[{ label: "İletişim" }, { label: "Ayarlar" }]}
      >
        <p style={{ color: "#667781" }}>Yapılandırma yükleniyor…</p>
      </CommunicationPageShell>
    );
  }

  return (
    <CommunicationPageShell
      title="WhatsApp Yapılandırması"
      subtitle="Meta WhatsApp Business Cloud API ayarları. Production için env değişkenleri de kullanılabilir."
      icon="⚙️"
      breadcrumbs={[{ label: "İletişim" }, { label: "Ayarlar" }]}
      actions={<ConnectionBadge config={config} />}
      maxWidth={720}
    >
      {message && <div className="comm-alert comm-alert-success">{message}</div>}
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}

      {!config.configured && (
        <div className="comm-alert comm-alert-info">
          Bu kurum için henüz WhatsApp yapılandırması yok. Aşağıdan oluşturabilirsiniz.
        </div>
      )}

      <form onSubmit={handleSubmit} className="comm-card">
        <div className="comm-form-grid">
          <div className="comm-form-field">
            <label htmlFor="phone_number_id">Phone Number ID</label>
            <input
              id="phone_number_id"
              type="text"
              value={form.phone_number_id}
              onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })}
              placeholder="Meta phone_number_id"
            />
          </div>
          <div className="comm-form-field">
            <label htmlFor="waba_id">WABA ID</label>
            <input
              id="waba_id"
              type="text"
              value={form.waba_id}
              onChange={(e) => setForm({ ...form, waba_id: e.target.value })}
              placeholder="WhatsApp Business Account ID"
            />
          </div>
          <div className="comm-form-field">
            <label htmlFor="access_token">Access Token</label>
            <input
              id="access_token"
              type="password"
              value={form.access_token}
              onChange={(e) => setForm({ ...form, access_token: e.target.value })}
              placeholder={config.has_token ? "•••••••• (değiştirmek için yeni token)" : "System user token"}
            />
          </div>
          <div className="comm-form-field">
            <label htmlFor="webhook_verify_token">Webhook Verify Token</label>
            <input
              id="webhook_verify_token"
              type="text"
              value={form.webhook_verify_token}
              onChange={(e) => setForm({ ...form, webhook_verify_token: e.target.value })}
            />
          </div>
          <div className="comm-form-field">
            <label htmlFor="display_phone">Görünen Numara</label>
            <input
              id="display_phone"
              type="text"
              value={form.display_phone}
              onChange={(e) => setForm({ ...form, display_phone: e.target.value })}
              placeholder="+90 5XX XXX XX XX"
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Aktif</span>
          </label>
        </div>

        <div className="comm-btn-row">
          <button type="submit" className="comm-btn-primary" disabled={saving}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <button
            type="button"
            className="comm-btn-secondary"
            onClick={handleTest}
            disabled={testing}
            aria-label="WhatsApp bağlantısını test et"
          >
            {testing ? "Test ediliyor…" : "🔗 Bağlantıyı Test Et"}
          </button>
        </div>
      </form>

      <div className="comm-card" style={{ marginTop: "1rem" }}>
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.9375rem" }}>Onaylı Meta Şablonları</h3>
        <MetaTemplateSelect
          value={selectedMetaTemplate}
          onChange={setSelectedMetaTemplate}
          label="Şablon listesi (salt okunur)"
        />
      </div>

      <div className="comm-card" style={{ marginTop: "1rem" }}>
        <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.9375rem" }}>Webhook (gelen mesajlar)</h3>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "#667781" }}>
          Meta&apos;daki Callback URL, <strong>doğrudan Django backend</strong> adresinize işaret etmeli
          (Next.js proxy değil). Yerel geliştirmede ngrok / Cloudflare Tunnel gerekir.
        </p>
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "#667781" }}>
          Örnek:{" "}
          <code style={{ background: "#f0f2f5", padding: "2px 6px", borderRadius: 4 }}>
            https://api.sizinkurum.com/api/communication/webhook/
          </code>
        </p>
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "#667781" }}>
          Verify Token: ayarlardaki &quot;Webhook Verify Token&quot; ile Meta&apos;daki aynı olmalı.
          Abone alanları: <code>messages</code>, <code>message_status</code>.
        </p>

        <div className="comm-form-field" style={{ marginTop: "0.75rem" }}>
          <label htmlFor="ngrok_base">Yerel geliştirme — ngrok adresi (opsiyonel)</label>
          <input
            id="ngrok_base"
            type="url"
            value={ngrokBase}
            onChange={(e) => setNgrokBase(e.target.value)}
            placeholder="https://abc123.ngrok-free.app"
          />
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.8125rem", color: "#667781" }}>
            Meta Callback URL için kopyalayın. Detay:{" "}
            <code>docs/deployment/whatsapp-local-dev.md</code>
          </p>
          {ngrokCallbackUrl && (
            <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <code style={{ background: "#f0f2f5", padding: "6px 8px", borderRadius: 4, fontSize: "0.8125rem" }}>
                {ngrokCallbackUrl}
              </code>
              <button
                type="button"
                className="comm-btn-secondary"
                style={{ fontSize: "0.8125rem", padding: "0.35rem 0.65rem" }}
                onClick={() => navigator.clipboard.writeText(ngrokCallbackUrl)}
              >
                Kopyala
              </button>
            </div>
          )}
        </div>
        {config.configured && (
          <div
            className={`comm-alert ${config.webhook_event_count ? "comm-alert-success" : "comm-alert-warning"}`}
            style={{ marginTop: "0.75rem", marginBottom: 0 }}
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
              <div style={{ marginTop: "0.35rem", fontSize: "0.8125rem" }}>
                Son hata: {config.webhook_last_error}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </CommunicationPageShell>
  );
}
