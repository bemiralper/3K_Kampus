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

function queueSize(account: GoogleContactsAccountStatus | undefined): number {
  if (!account?.counts) return 0;
  return (account.counts.pending ?? 0) + (account.counts.pending_delete ?? 0) + (account.counts.removing ?? 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function purgeConfirmed(value: string): boolean {
  return value.trim().toLocaleUpperCase("tr-TR").replace(/İ/g, "I") === "SIL";
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
  const [purgeAccountId, setPurgeAccountId] = useState<string | null>(null);
  const [purgeText, setPurgeText] = useState("");

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

  const anySyncing = (status?.accounts || []).some((account) => account.syncing);
  useEffect(() => {
    if (!anySyncing) return;
    const timer = window.setInterval(() => {
      load();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [anySyncing, load]);

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
    setProgress(`${account.email}: kuyruk sunucuda yazılıyor. Bu sayfadan çıksanız da devam eder.`);
    try {
      const result = await syncGoogleContacts({
        account_id: account.id,
        enqueue: true,
        retry_failed: true,
        background: true,
      });
      if (result.error && !result.started && !result.already_running) {
        throw new Error(result.error);
      }
      const startedAt = Date.now();
      let previous = queueSize(account);
      let quietPolls = 0;
      while (Date.now() - startedAt < 25 * 60 * 1000) {
        await sleep(4000);
        const data = await fetchGoogleContactsStatus();
        setStatus(data);
        const current = data.accounts.find((item) => item.id === account.id);
        const pending = queueSize(current);
        const synced = current?.counts?.synced ?? 0;
        setProgress(
          pending === previous
            ? `${account.email}: liste taranıyor. Rehberde ${synced}, kuyrukta ${pending}.`
            : `${account.email}: rehberde ${synced}, kuyrukta ${pending}. Sayfadan çıksanız da yazma sürer.`,
        );
        if (current && !current.syncing && pending === 0) {
          setMessage(`${account.email} eşitlendi. Rehberde ${synced} kişi var.`);
          return;
        }
        if (current && !current.syncing && pending > 0) {
          quietPolls += 1;
          if (quietPolls < 3) continue;
          if (current.last_sync_error) setError(current.last_sync_error);
          setMessage(`Durdu. Rehberde ${synced}, kuyrukta ${pending}. Tekrar başlatınca kaldığı yerden sürer.`);
          return;
        }
        quietPolls = 0;
        if (pending >= previous && Date.now() - startedAt > 3 * 60 * 1000) {
          setMessage(`Yazma sürüyor. Rehberde ${synced}, kuyrukta ${pending}.`);
        }
        previous = pending;
      }
      setMessage("Eşitleme uzun sürdü. Sayıları yenileyip gerekirse yeniden başlatın.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eşitleme başarısız");
    } finally {
      setProgress(null);
      setBusy(null);
      await load();
    }
  };

  const handleDisconnect = async (account: GoogleContactsAccountStatus, purge: boolean) => {
    if (!purge && !confirm(`${account.email} bağlantısı kesilsin mi? Rehberdeki kişiler Google'da kalır.`)) {
      return;
    }
    setBusy(`off-${account.id}`);
    setError(null);
    setMessage(null);
    try {
      let result = await disconnectGoogleContacts(account.id, purge);
      while (purge && !result.disconnected && result.remaining > 0 && result.failed === 0) {
        const wait = result.retry_after_seconds || 0;
        setProgress(
          wait
            ? `${account.email}: Google limiti doldu, ${wait} sn sonra silmeye devam`
            : `${account.email}: rehberden siliniyor, ${result.remaining} kaldı`,
        );
        if (wait) await sleep(wait * 1000);
        result = await disconnectGoogleContacts(account.id, true);
      }
      if (purge && !result.disconnected) {
        setError(result.error || "Kişiler tamamen silinemedi. Bağlantı duruyor.");
      } else {
        setMessage(purge ? "Hesap ayrıldı ve kurum kişileri rehberden silindi." : "Hesap ayrıldı. Kişiler Google'da duruyor.");
        setPurgeAccountId(null);
        setPurgeText("");
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
        subtitle="Öğrenci, veli ve personel telefonlarını kurumun Google rehberine yazar"
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
      subtitle="Merkez Google hesabına öğrenci, veli ve personel numaralarını isimle yazar. Varsa profil fotoğrafı kartın fotoğrafı olur; öğretmen branşı da yazılır."
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
            <>
              {queueSize(account) >= 20 && !account.syncing && (
                <p style={{ margin: "0.75rem 0 0", color: "#3f6212" }}>
                  Takılmadı. Rehberde {account.counts?.synced ?? 0} kişi yazıldı, {queueSize(account)} kişi
                  kuyrukta kaldı. Tur yarım kesilmiş; devam edince sunucu kalanını kendi yazar.
                </p>
              )}
              {account.syncing && (
                <p style={{ margin: "0.75rem 0 0", color: "#1d4ed8" }}>
                  Eşitleniyor. Rehberde {account.counts?.synced ?? 0}, kuyrukta {queueSize(account)}.
                  Bu sayfadan çıksanız da yazma sürer.
                </p>
              )}
              <div className="comm-btn-row">
                <button
                  type="button"
                  className="comm-btn-primary"
                  disabled={busy !== null || Boolean(account.syncing)}
                  onClick={() => handleSync(account)}
                >
                  {busy === `sync-${account.id}` || account.syncing
                    ? "Eşitleniyor…"
                    : queueSize(account) > 0
                      ? `Eşitlemeye devam et (${queueSize(account)})`
                      : "Tüm rehberi eşitle"}
                </button>
                <button
                  type="button"
                  className="comm-btn-secondary"
                  disabled={busy !== null || Boolean(account.syncing)}
                  onClick={() => handleDisconnect(account, false)}
                >
                  Bağlantıyı kes
                </button>
              </div>
              <p style={{ margin: "0.4rem 0 0", color: "#667781", fontSize: "0.85rem" }}>
                Bağlantıyı kesmek Google’daki kişilere dokunmaz. Yalnızca yeni kayıtların yazılması durur.
              </p>
              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.85rem 1rem",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  background: "#fffafa",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                  <div>
                    <strong style={{ color: "#991b1b" }}>Rehberden sil</strong>
                    <p style={{ margin: "0.25rem 0 0", color: "#7f1d1d", fontSize: "0.9rem" }}>
                      Yalnızca bu uygulamanın eklediği öğrenci, veli ve personel kartları silinir. Kişisel rehberinize dokunulmaz.
                    </p>
                  </div>
                  {purgeAccountId !== account.id && (
                    <button
                      type="button"
                      className="comm-btn-danger"
                      disabled={busy !== null || Boolean(account.syncing)}
                      onClick={() => {
                        setPurgeAccountId(account.id);
                        setPurgeText("");
                      }}
                    >
                      Rehberden sil…
                    </button>
                  )}
                </div>
                {purgeAccountId === account.id && (
                  <div style={{ marginTop: "0.75rem" }}>
                    <p style={{ margin: "0 0 0.75rem", color: "#7f1d1d" }}>
                      Google’da yazılmış {account.counts?.synced ?? 0} kişi silinir.
                      Henüz yazılmamış {queueSize(account)} kayıt yalnızca kuyruktan düşer.
                      İş bitince {account.email} bağlantısı da kapanır.
                    </p>
                    <label style={{ display: "block", fontSize: "0.85rem", color: "#7f1d1d" }}>
                      Onay için SİL yazın
                      <input
                        value={purgeText}
                        onChange={(event) => setPurgeText(event.target.value)}
                        autoComplete="off"
                        style={{
                          display: "block",
                          marginTop: "0.35rem",
                          padding: "0.45rem 0.6rem",
                          border: "1px solid #fecaca",
                          borderRadius: "6px",
                          width: "8rem",
                        }}
                      />
                    </label>
                    <div className="comm-btn-row" style={{ marginTop: "0.75rem" }}>
                      <button
                        type="button"
                        className="comm-btn-danger"
                        disabled={busy !== null || !purgeConfirmed(purgeText)}
                        onClick={() => handleDisconnect(account, true)}
                      >
                        Sil ve bağlantıyı kes
                      </button>
                      <button
                        type="button"
                        className="comm-btn-secondary"
                        disabled={busy !== null}
                        onClick={() => {
                          setPurgeAccountId(null);
                          setPurgeText("");
                        }}
                      >
                        Vazgeç
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      ))}
    </CommunicationPageShell>
  );
}
