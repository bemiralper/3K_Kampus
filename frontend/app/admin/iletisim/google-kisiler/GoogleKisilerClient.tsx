"use client";

import { useCallback, useEffect, useState } from "react";
import { CommunicationPageShell } from "@/components/communication";
import "@/components/communication/communication.css";
import {
  connectGoogleContacts,
  disconnectGoogleContacts,
  fetchGoogleContactsStatus,
  GoogleContactsAccountStatus,
  GoogleContactsStatus,
  saveGoogleContactsCredentials,
  syncGoogleContacts,
} from "@/lib/communication-api";

function formatWhen(value: string | null): string {
  if (!value) return "Henüz yok";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Henüz yok";
  return date.toLocaleString("tr-TR");
}

export default function GoogleKisilerClient() {
  const [status, setStatus] = useState<GoogleContactsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await fetchGoogleContactsStatus();
      setStatus(data);
      const override = (data.redirect_uri_override || "").trim();
      const path = data.redirect_path || "/api/communication/google-contacts/oauth/callback/";
      setRedirectUri(override || `${window.location.origin}${path}`);
      setClientId((current) => current || data.client_id || "");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Durum yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    if (google === "connected") {
      const email = params.get("email");
      setMessage(email ? `${email} bağlandı. Rehberi aktarmak için eşitleyin.` : "Google hesabı bağlandı.");
    } else if (google === "error") {
      setError(params.get("message") || "Google bağlantısı tamamlanamadı.");
    }
    if (google) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    load();
  }, [load]);

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setMessage("Yönlendirme adresi kopyalandı.");
    } catch {
      setError("Adres kopyalanamadı. Elle seçip kopyalayın.");
    }
  };

  const handleSaveCredentials = async () => {
    setBusy("credentials");
    setError(null);
    setMessage(null);
    try {
      await saveGoogleContactsCredentials({
        client_id: clientId.trim(),
        client_secret: clientSecret,
      });
      setClientSecret("");
      setMessage("Google istemci bilgileri bu kuruma kaydedildi.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "İstemci bilgileri kaydedilemedi");
    } finally {
      setBusy(null);
    }
  };

  const handleConnect = async () => {
    setBusy("connect");
    setError(null);
    setMessage(null);
    try {
      const result = await connectGoogleContacts(window.location.origin);
      window.location.href = result.authorization_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bağlantı başlatılamadı");
      setBusy(null);
    }
  };

  const handleSync = async (account: GoogleContactsAccountStatus) => {
    setBusy(`sync-${account.id}`);
    setError(null);
    setMessage(null);
    let enqueue = true;
    let retryFailed = true;
    let remaining = 1;
    const totals = { created: 0, updated: 0, deleted: 0, failed: 0 };
    try {
      while (remaining > 0) {
        const result = await syncGoogleContacts({
          account_id: account.id,
          enqueue,
          retry_failed: retryFailed,
          limit: 25,
        });
        enqueue = false;
        retryFailed = false;
        remaining = result.remaining;
        totals.created += result.created;
        totals.updated += result.updated;
        totals.deleted += result.deleted;
        totals.failed += result.failed;
        setProgress(
          remaining > 0
            ? `${account.email}: ${remaining} kişi kaldı`
            : null,
        );
        if (result.failed && result.error && remaining > 0 && result.processed === 0) {
          throw new Error(result.error);
        }
      }
      const failNote = totals.failed ? ` ${totals.failed} kayıt yazılamadı.` : "";
      setMessage(
        `${account.email}: ${totals.created} eklendi, ${totals.updated} güncellendi, ${totals.deleted} silindi.${failNote}`,
      );
      if (totals.failed) {
        setError("Bazı kişiler Google'a yazılamadı. Bir süre sonra yeniden eşitleyin.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eşitleme başarısız");
    } finally {
      setProgress(null);
      setBusy(null);
    }
  };

  const handleDisconnect = async (account: GoogleContactsAccountStatus, purge: boolean) => {
    const question = purge
      ? `${account.email} bağlantısı kesilsin ve bu hesaptaki kurum kişileri Google rehberinden silinsin mi?`
      : `${account.email} bağlantısı kesilsin mi? Rehberdeki kişiler Google'da kalır.`;
    if (!confirm(question)) return;
    setBusy(`off-${account.id}`);
    setError(null);
    setMessage(null);
    try {
      let result = await disconnectGoogleContacts(account.id, purge);
      while (purge && !result.disconnected && result.remaining > 0 && result.failed === 0) {
        setProgress(`${account.email}: rehberden siliniyor, ${result.remaining} kaldı`);
        result = await disconnectGoogleContacts(account.id, true);
      }
      if (purge && !result.disconnected) {
        setError(result.error || "Kişiler tamamen silinemedi. Bağlantı duruyor.");
      } else {
        setMessage(purge ? "Hesap ayrıldı ve kurum kişileri rehberden silindi." : "Hesap ayrıldı. Kişiler Google'da duruyor.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bağlantı kesilemedi");
    } finally {
      setProgress(null);
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <CommunicationPageShell
        title="Google Kişiler"
        subtitle="Öğrenci ve veli telefonlarını kurumun Google rehberine yazar"
        icon="👤"
        breadcrumbs={[{ label: "İletişim" }, { label: "Google Kişiler" }]}
      >
        <p style={{ color: "#667781" }}>Yükleniyor…</p>
      </CommunicationPageShell>
    );
  }

  const accounts = status?.accounts || [];
  const connected = accounts.filter((account) => account.connected);

  return (
    <CommunicationPageShell
      title="Google Kişiler"
      subtitle="Merkez Google hesabına öğrenci ve veli numaralarını isimle yazar. İleride başka hesaplar da bağlanabilir."
      icon="👤"
      breadcrumbs={[{ label: "İletişim" }, { label: "Google Kişiler" }]}
      actions={
        status?.oauth_configured ? (
          <button type="button" className="comm-btn-primary" onClick={handleConnect} disabled={busy !== null}>
            {connected.length ? "Başka hesap bağla" : "Google ile bağlan"}
          </button>
        ) : null
      }
    >
      {message && <div className="comm-alert comm-alert-success">{message}</div>}
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}
      {progress && <div className="comm-alert">{progress}</div>}

      <section className="comm-card">
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>Nasıl görünür?</h2>
        <p style={{ margin: "0 0 0.75rem", color: "#667781" }}>
          Aktif öğrenciler ve velileri rehbere şu adlarla düşer. Pasif öğrenci ve numarası silinen kayıt rehberden de kalkar.
        </p>
        <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "#3b4a54" }}>
          <li>Ali Yılmaz [Öğrenci]</li>
          <li>Fatma Yılmaz [Ali Yılmaz - Anne]</li>
          <li>Gruplar: 3K - Öğrenciler ve 3K - Veliler</li>
        </ul>
      </section>

      <section className="comm-card">
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>Google istemcisi</h2>
        <p style={{ margin: "0 0 0.75rem", color: "#667781" }}>
          Client ID ve Client secret buraya yapıştırılır. Sunucu dosyasına yazmanız gerekmez.
          Sır kaydedildikten sonra tekrar gösterilmez.
        </p>
        {status?.credential_source === "environment" && (
          <p style={{ margin: "0 0 0.75rem" }}>
            Şu an sunucu ayarından okunuyor. Kaydet derseniz bu kurumun kaydına geçer.
          </p>
        )}
        {status?.has_client_secret && status.credential_source === "database" && (
          <p style={{ margin: "0 0 0.75rem" }}>İstemci sırrı kayıtlı. Değiştirmek için yenisini yazın.</p>
        )}
        <div className="comm-form-grid">
          <div className="comm-form-field">
            <label htmlFor="google-client-id">Client ID</label>
            <input
              id="google-client-id"
              type="text"
              autoComplete="off"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              placeholder="....apps.googleusercontent.com"
            />
          </div>
          <div className="comm-form-field">
            <label htmlFor="google-client-secret">Client secret</label>
            <input
              id="google-client-secret"
              type="password"
              autoComplete="new-password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              placeholder={status?.has_client_secret ? "Kayıtlı — değiştirmek için yazın" : "GOCSPX-..."}
            />
          </div>
        </div>
        <div className="comm-btn-row">
          <button
            type="button"
            className="comm-btn-primary"
            onClick={handleSaveCredentials}
            disabled={busy !== null}
          >
            {busy === "credentials" ? "Kaydediliyor…" : "İstemciyi kaydet"}
          </button>
        </div>
        <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, margin: "1rem 0 0.35rem" }}>
          Google Cloud’a yazılacak yönlendirme adresi
        </label>
        <div className="comm-btn-row" style={{ alignItems: "center" }}>
          <code style={{ flex: 1, wordBreak: "break-all" }}>{redirectUri}</code>
          <button type="button" className="comm-btn-secondary" onClick={copyRedirect}>
            Kopyala
          </button>
        </div>
      </section>

      {status?.oauth_configured && accounts.length === 0 && (
        <section className="comm-card" style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ color: "#667781", margin: "0 0 1rem" }}>
            Henüz bağlı hesap yok. Kurumun resmi Workspace adresiyle bağlayın; telefon da aynı hesapla açık olsun.
          </p>
          <button type="button" className="comm-btn-primary" onClick={handleConnect} disabled={busy !== null}>
            Google ile bağlan
          </button>
          <p style={{ margin: "1rem 0 0", fontSize: "0.8125rem", color: "#667781" }}>
            Google Cloud yönlendirme adresi: {redirectUri}
          </p>
        </section>
      )}

      {accounts.map((account) => (
        <section key={account.id} className="comm-card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
                {account.email}
                {account.is_default && (
                  <span className="comm-account-default-badge" style={{ marginLeft: "0.5rem" }}>Varsayılan</span>
                )}
              </h2>
              <p style={{ margin: "0.25rem 0 0", color: "#667781" }}>
                {account.account_type_label}
                {account.connected ? " · Bağlı" : " · Bağlantı kapalı"}
              </p>
            </div>
            <span className={account.connected ? "comm-connection-badge connected" : "comm-connection-badge off"}>
              <span className="comm-connection-dot" />
              {account.connected ? "Aktif" : "Pasif"}
            </span>
          </div>
          <dl className="comm-account-meta" style={{ marginTop: "1rem" }}>
            <div>
              <dt>Son eşitleme</dt>
              <dd>{formatWhen(account.last_synced_at)}</dd>
            </div>
            <div>
              <dt>Rehberde</dt>
              <dd>{account.counts?.synced ?? 0}</dd>
            </div>
            <div>
              <dt>Bekleyen</dt>
              <dd>{(account.counts?.pending ?? 0) + (account.counts?.pending_delete ?? 0) + (account.counts?.removing ?? 0)}</dd>
            </div>
            <div>
              <dt>Hatalı</dt>
              <dd>{account.counts?.failed ?? 0}</dd>
            </div>
          </dl>
          {account.last_sync_error && (
            <p style={{ color: "#b91c1c", margin: "0.75rem 0 0" }}>{account.last_sync_error}</p>
          )}
          {account.connected && (
            <div className="comm-btn-row">
              <button
                type="button"
                className="comm-btn-primary"
                disabled={busy !== null}
                onClick={() => handleSync(account)}
              >
                {busy === `sync-${account.id}` ? "Eşitleniyor…" : "Tüm rehberi eşitle"}
              </button>
              <button
                type="button"
                className="comm-btn-secondary"
                disabled={busy !== null}
                onClick={() => handleDisconnect(account, false)}
              >
                Bağlantıyı kes
              </button>
              <button
                type="button"
                className="comm-btn-danger"
                disabled={busy !== null}
                onClick={() => handleDisconnect(account, true)}
              >
                Rehberden de sil
              </button>
            </div>
          )}
        </section>
      ))}
    </CommunicationPageShell>
  );
}
