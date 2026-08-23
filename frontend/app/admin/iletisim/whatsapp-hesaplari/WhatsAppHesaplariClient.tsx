"use client";

import { useCallback, useEffect, useState } from "react";
import { CommunicationPageShell } from "@/components/communication";
import "@/components/communication/communication.css";
import {
  AccountDeleteBlockedError,
  deleteWhatsAppAccount,
  fetchWhatsAppAccounts,
  fetchWhatsAppConfig,
  syncWhatsAppAccountTemplates,
  testWhatsAppAccount,
  WhatsAppAccount,
  WhatsAppAccountDependencies,
  WhatsAppConfig,
} from "@/lib/communication-api";
import AccountFormDrawer from "./AccountFormDrawer";
import WebhookInfoCard from "./WebhookInfoCard";

function formatDependencies(deps: WhatsAppAccountDependencies): string {
  const lines: string[] = [];
  if (deps.meta_templates) lines.push(`• ${deps.meta_templates} Meta şablonu (silinir)`);
  if (deps.notification_bindings) {
    lines.push(`• ${deps.notification_bindings} bildirim eşlemesi (silinir)`);
  }
  if (deps.conversations) {
    lines.push(`• ${deps.conversations} sohbet (hesap bağlantısı kopar)`);
  }
  if (deps.campaigns) {
    lines.push(`• ${deps.campaigns} kampanya (hesap bağlantısı kopar)`);
  }
  return lines.join("\n");
}

function StatusBadge({ account }: { account: WhatsAppAccount }) {
  if (!account.configured) {
    return (
      <span className="comm-connection-badge off">
        <span className="comm-connection-dot" />
        Yapılandırılmamış
      </span>
    );
  }
  if (!account.has_token) {
    return (
      <span className="comm-connection-badge disconnected">
        <span className="comm-connection-dot" />
        Token eksik
      </span>
    );
  }
  if (!account.is_active) {
    return (
      <span className="comm-connection-badge off">
        <span className="comm-connection-dot" />
        Pasif
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

export default function WhatsAppHesaplariClient() {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [config, setConfig] = useState<WhatsAppConfig>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<WhatsAppAccount | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchWhatsAppAccounts();
      setAccounts(data.accounts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hesaplar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetchWhatsAppConfig().then(setConfig).catch(() => setConfig({}));
  }, [load]);

  const handleTest = async (account: WhatsAppAccount) => {
    setActionId(`test-${account.id}`);
    setMessage(null);
    setError(null);
    try {
      const result = await testWhatsAppAccount(account.id);
      setMessage(
        `${account.name || account.display_phone}: ${
          result.message || (result.success ? "Bağlantı başarılı" : "Bağlantı başarısız")
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test başarısız");
    } finally {
      setActionId(null);
    }
  };

  const handleSync = async (account: WhatsAppAccount) => {
    setActionId(`sync-${account.id}`);
    setMessage(null);
    setError(null);
    try {
      const result = await syncWhatsAppAccountTemplates(account.id);
      if (result.success) {
        setMessage(
          `${account.name || account.display_phone}: ${result.upserted ?? result.templates?.length ?? 0} şablon senkronize edildi.`,
        );
        await load();
      } else {
        setError(result.error || "Şablon senkronizasyonu başarısız");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şablon senkronizasyonu başarısız");
    } finally {
      setActionId(null);
    }
  };

  const handleDeactivate = async (account: WhatsAppAccount) => {
    if (!confirm(`"${account.name || account.display_phone}" hesabını pasifleştirmek istediğinize emin misiniz?`)) {
      return;
    }
    setActionId(`deactivate-${account.id}`);
    setError(null);
    setMessage(null);
    try {
      await deleteWhatsAppAccount(account.id);
      setMessage(`${account.name || account.display_phone} pasifleştirildi.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem başarısız");
    } finally {
      setActionId(null);
    }
  };

  const handlePermanentDelete = async (account: WhatsAppAccount) => {
    const label = account.name || account.display_phone || "WhatsApp hesabı";
    if (
      !confirm(
        `"${label}" hesabını kalıcı olarak silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz.`,
      )
    ) {
      return;
    }
    setActionId(`delete-${account.id}`);
    setError(null);
    setMessage(null);
    try {
      try {
        await deleteWhatsAppAccount(account.id, { permanent: true });
      } catch (err) {
        if (!(err instanceof AccountDeleteBlockedError)) throw err;
        const detail = formatDependencies(err.dependencies);
        const ok = confirm(
          `${err.message}\n\n${detail}\n\nYine de kalıcı silinsin mi?`,
        );
        if (!ok) return;
        await deleteWhatsAppAccount(account.id, { permanent: true, force: true });
      }
      setMessage(`"${label}" kalıcı olarak silindi.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme başarısız");
    } finally {
      setActionId(null);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (account: WhatsAppAccount) => {
    setEditing(account);
    setDrawerOpen(true);
  };

  if (loading) {
    return (
      <CommunicationPageShell
        title="WhatsApp Hesapları"
        subtitle="Aynı numarayı birden fazla şubeye bağlayın; token tekrar girilmez"
        icon="📱"
        breadcrumbs={[{ label: "İletişim" }, { label: "WhatsApp Hesapları" }]}
      >
        <p style={{ color: "#667781" }}>Hesaplar yükleniyor…</p>
      </CommunicationPageShell>
    );
  }

  return (
    <CommunicationPageShell
      title="WhatsApp Hesapları"
      subtitle="Aynı numarayı birden fazla şubeye bağlayın. Token, WABA ve şablon ayarlarını her şube için tekrar girmeniz gerekmez."
      icon="📱"
      breadcrumbs={[{ label: "İletişim" }, { label: "WhatsApp Hesapları" }]}
      actions={
        <button type="button" className="comm-btn-primary" onClick={openCreate}>
          + Yeni Hesap
        </button>
      }
    >
      {message && <div className="comm-alert comm-alert-success">{message}</div>}
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}

      <WebhookInfoCard config={config} />

      {accounts.length === 0 ? (
        <div className="comm-card" style={{ textAlign: "center", padding: "2.5rem" }}>
          <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.75rem" }}>📭</span>
          <p style={{ color: "#667781", margin: "0 0 1rem" }}>Henüz WhatsApp hesabı tanımlanmadı.</p>
          <button type="button" className="comm-btn-primary" onClick={openCreate}>
            İlk hesabınızı oluşturun
          </button>
        </div>
      ) : (
        <div className="comm-account-grid">
          {accounts.map((account) => (
            <div key={account.id} className="comm-account-card">
              <div className="comm-account-card-head">
                <div>
                  <h3 className="comm-account-card-title">
                    {account.name || account.display_phone || "WhatsApp Hesabı"}
                    {account.is_default && <span className="comm-account-default-badge">Varsayılan</span>}
                  </h3>
                  <p className="comm-account-card-phone">{account.display_phone || "—"}</p>
                </div>
                <StatusBadge account={account} />
              </div>

              <dl className="comm-account-meta">
                <div>
                  <dt>Phone Number ID</dt>
                  <dd>{account.phone_number_id || "—"}</dd>
                </div>
                <div>
                  <dt>WABA ID</dt>
                  <dd>{account.waba_id || "—"}</dd>
                </div>
                <div>
                  <dt>Son senkron</dt>
                  <dd>
                    {account.last_synced_at
                      ? new Date(account.last_synced_at).toLocaleString("tr-TR")
                      : "Henüz yok"}
                  </dd>
                </div>
              </dl>

              <div className="comm-account-chip-row">
                <span className="comm-scope-chip">
                  {account.scope_type === "ALL_SUBES" ? "Tüm şubeler" : "Seçili şubeler"}
                </span>
                {account.scope_type === "SELECTED_SUBES" &&
                  (account.sube_names || []).map((name) => (
                    <span key={name} className="comm-scope-chip muted">
                      {name}
                    </span>
                  ))}
                {(account.role_names || []).length === 0 ? (
                  <span className="comm-scope-chip muted">Tüm roller</span>
                ) : (
                  account.role_names.map((name) => (
                    <span key={name} className="comm-scope-chip muted">
                      {name}
                    </span>
                  ))
                )}
              </div>

              <div className="comm-account-actions">
                <button type="button" className="comm-btn-secondary" onClick={() => openEdit(account)}>
                  Düzenle
                </button>
                <button
                  type="button"
                  className="comm-btn-secondary"
                  disabled={actionId === `test-${account.id}`}
                  onClick={() => handleTest(account)}
                >
                  {actionId === `test-${account.id}` ? "Test ediliyor…" : "Bağlantıyı Test Et"}
                </button>
                <button
                  type="button"
                  className="comm-btn-secondary"
                  disabled={actionId === `sync-${account.id}`}
                  onClick={() => handleSync(account)}
                >
                  {actionId === `sync-${account.id}` ? "Senkronize ediliyor…" : "Şablonları Senkronize Et"}
                </button>
                {account.is_active ? (
                  <button
                    type="button"
                    className="comm-btn-secondary comm-btn-danger"
                    disabled={actionId === `deactivate-${account.id}`}
                    onClick={() => handleDeactivate(account)}
                  >
                    {actionId === `deactivate-${account.id}` ? "…" : "Pasifleştir"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="comm-btn-secondary comm-btn-danger"
                    disabled={actionId === `delete-${account.id}`}
                    onClick={() => handlePermanentDelete(account)}
                  >
                    {actionId === `delete-${account.id}` ? "…" : "Kalıcı Sil"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AccountFormDrawer
        open={drawerOpen}
        account={editing}
        existingAccounts={accounts}
        onClose={() => setDrawerOpen(false)}
        onSaved={load}
      />
    </CommunicationPageShell>
  );
}
