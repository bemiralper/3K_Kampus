"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CommunicationPageShell } from "@/components/communication";
import "@/components/communication/communication.css";
import "../panel/iletisim-panel.css";
import "./kuyruk.css";
import {
  archiveOldQueueFailures,
  cancelQueueItem,
  communicationPortalPaths,
  fetchAccessibleWhatsAppAccounts,
  fetchOutboundQueue,
  formatMessageStatus,
  OutboundQueueItem,
  OutboundQueueScope,
  retryQueueItem,
  WhatsAppAccount,
  type InboxPortal,
} from "@/lib/communication-api";

const PAGE_SIZE = 40;
const REFRESH_MS = 15_000;
const STATUS_OPTIONS = [
  { value: "", label: "Tüm durumlar" },
  { value: "PENDING", label: "Bekliyor" },
  { value: "SENDING", label: "Gönderiliyor" },
  { value: "FAILED", label: "Başarısız" },
];

function statusClass(status: string | null): string {
  const map: Record<string, string> = {
    PENDING: "draft",
    SENDING: "processing",
    SENT: "confirmed",
    DELIVERED: "completed",
    READ: "completed",
    FAILED: "cancelled",
    CANCELLED: "cancelled",
  };
  return map[status || ""] || "draft";
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatClock(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function nextAttemptLabel(iso: string | null, status: string | null): string {
  if (!iso || status !== "PENDING") return "—";
  const at = new Date(iso).getTime();
  const diff = at - Date.now();
  if (Number.isNaN(at)) return "—";
  if (diff <= 0) return "sırada";
  const min = Math.round(diff / 60000);
  if (min < 60) return `${min} dk sonra`;
  return formatWhen(iso);
}

export default function KuyrukClient({ portal = "admin" }: { portal?: InboxPortal }) {
  const paths = communicationPortalPaths(portal);
  const [items, setItems] = useState<OutboundQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState<OutboundQueueScope>("live");
  const [statusFilter, setStatusFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [errorKey, setErrorKey] = useState("");
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [statusCounts, setStatusCounts] = useState({
    pending: 0, sending: 0, failed: 0, failed_live: 0, failed_archive: 0, retrying: 0,
  });
  const [errorGroups, setErrorGroups] = useState<Array<{ key: string; label: string; count: number }>>([]);
  const [oldestWait, setOldestWait] = useState<number | null>(null);
  const [generatedAt, setGeneratedAt] = useState("");
  const [liveDays, setLiveDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status) setStatusFilter(status.toUpperCase());
    const nextScope = params.get("scope");
    if (nextScope === "archive" || nextScope === "all" || nextScope === "live") {
      setScope(nextScope);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      setError(null);
      const data = await fetchOutboundQueue({
        status: statusFilter || undefined,
        channel_config_id: accountFilter || undefined,
        scope,
        q: debouncedQ || undefined,
        error: errorKey || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setStatusCounts({
        pending: data.status_counts?.pending || 0,
        sending: data.status_counts?.sending || 0,
        failed: data.status_counts?.failed || 0,
        failed_live: data.status_counts?.failed_live || 0,
        failed_archive: data.status_counts?.failed_archive || 0,
        retrying: data.status_counts?.retrying || 0,
      });
      setErrorGroups(data.error_groups || []);
      setOldestWait(data.oldest_wait_minutes ?? null);
      setGeneratedAt(data.generated_at || "");
      if (data.live_days) setLiveDays(data.live_days);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kuyruk yüklenemedi");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, accountFilter, page, scope, debouncedQ, errorKey]);

  useEffect(() => {
    fetchAccessibleWhatsAppAccounts()
      .then((res) => setAccounts(res.accounts || []))
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const waitHint = useMemo(() => {
    if (oldestWait == null) return "Bekleyen yok";
    if (oldestWait < 60) return `En eski bekleyen ${oldestWait} dk`;
    return `En eski bekleyen ${Math.round(oldestWait / 60)} sa`;
  }, [oldestWait]);

  const changeScope = (next: OutboundQueueScope) => {
    setScope(next);
    setPage(1);
    setErrorKey("");
    if (next === "archive" && statusFilter && statusFilter !== "FAILED") {
      setStatusFilter("FAILED");
    }
  };

  const runAction = async (id: string, fn: (id: string) => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn(id);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem başarısız");
    } finally {
      setBusyId(null);
    }
  };

  const archiveOld = async () => {
    if (!window.confirm(`${liveDays} günden eski başarısız kuyruk kayıtları listeden silinsin mi? Mesaj geçmişi durur.`)) {
      return;
    }
    setArchiving(true);
    try {
      const res = await archiveOldQueueFailures(liveDays);
      setError(null);
      await load();
      if (res.deleted === 0) setError("Arşivlenecek eski hata yok.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arşivlenemedi");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <CommunicationPageShell
      title="Mesaj Kuyruğu"
      subtitle="Bekleyen gönderimler, son hatalar ve eski hata arşivi"
      icon="🗂️"
      maxWidth="full"
      breadcrumbs={[
        { label: portal === "muhasebe" ? "WhatsApp" : "İletişim", href: paths.home },
        { label: "Mesaj Kuyruğu" },
      ]}
      actions={
        <div className="comm-dash-refresh">
          <span className="ipanel-live">
            <i className={`ipanel-dot${refreshing ? " is-busy" : ""}`} />
            {generatedAt ? `Canlı · ${formatClock(generatedAt)}` : "15 sn"}
          </span>
          <button type="button" className="comm-btn-secondary" onClick={() => void load()} disabled={refreshing}>
            Yenile
          </button>
        </div>
      }
    >
      <div className="qpage">
        {error && <div className="comm-alert comm-alert-danger">{error}</div>}

        <div className="ipanel-kpis" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
          <button type="button" className="ipanel-kpi" style={{ "--kpi-accent": "#f59e0b" } as never} onClick={() => { setScope("live"); setStatusFilter("PENDING"); setPage(1); }}>
            <div className="ipanel-kpi-label">Bekliyor</div>
            <div className="ipanel-kpi-value">{statusCounts.pending}</div>
            <div className="ipanel-kpi-meta">{waitHint}</div>
          </button>
          <button type="button" className="ipanel-kpi" style={{ "--kpi-accent": "#0ea5e9" } as never} onClick={() => { setScope("live"); setStatusFilter("SENDING"); setPage(1); }}>
            <div className="ipanel-kpi-label">Gönderiliyor</div>
            <div className="ipanel-kpi-value">{statusCounts.sending}</div>
            <div className="ipanel-kpi-meta">{statusCounts.retrying} yeniden deneme</div>
          </button>
          <button type="button" className="ipanel-kpi" style={{ "--kpi-accent": "#be123c" } as never} onClick={() => { setScope("live"); setStatusFilter("FAILED"); setPage(1); }}>
            <div className="ipanel-kpi-label">Son {liveDays} gün hata</div>
            <div className="ipanel-kpi-value">{statusCounts.failed_live}</div>
            <div className="ipanel-kpi-meta">Operasyon listesi</div>
          </button>
          <button type="button" className="ipanel-kpi" style={{ "--kpi-accent": "#64748b" } as never} onClick={() => changeScope("archive")}>
            <div className="ipanel-kpi-label">Eski hatalar</div>
            <div className="ipanel-kpi-value">{statusCounts.failed_archive}</div>
            <div className="ipanel-kpi-meta">{liveDays}+ gün, arşiv</div>
          </button>
          <Link href={paths.home} className="ipanel-kpi" style={{ "--kpi-accent": "#0262a7" } as never}>
            <div className="ipanel-kpi-label">Toplam kuyruk</div>
            <div className="ipanel-kpi-value">{statusCounts.pending + statusCounts.sending + statusCounts.failed}</div>
            <div className="ipanel-kpi-meta">{portal === "muhasebe" ? "Sohbetlere dön" : "Panele dön"}</div>
          </Link>
        </div>

        <div className="qpage-tabs">
          <button type="button" className={`qpage-tab${scope === "live" ? " is-on" : ""}`} onClick={() => changeScope("live")}>
            Aktif kuyruk
          </button>
          <button type="button" className={`qpage-tab${scope === "archive" ? " is-on" : ""}`} onClick={() => changeScope("archive")}>
            Eski hatalar ({statusCounts.failed_archive})
          </button>
        </div>

        {scope === "archive" && (
          <div className="comm-alert">
            {liveDays} günden eski başarısız kayıtlar operasyonu şişirmesin diye burada durur.
            Mesaj geçmişi sohbette kalır; isterseniz kuyruk satırlarını temizleyebilirsiniz.
            <button type="button" className="comm-btn-secondary" style={{ marginLeft: 12 }} onClick={() => void archiveOld()} disabled={archiving || !statusCounts.failed_archive}>
              {archiving ? "Temizleniyor…" : `Eski hataları temizle (${statusCounts.failed_archive})`}
            </button>
          </div>
        )}

        {errorGroups.length > 0 && (
          <div className="qpage-groups">
            {errorGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                className={`qpage-group${errorKey === group.key ? " is-on" : ""}`}
                onClick={() => {
                  setErrorKey((prev) => (prev === group.key ? "" : group.key));
                  setPage(1);
                }}
              >
                {group.label} · {group.count}
              </button>
            ))}
          </div>
        )}

        <div className="qpage-toolbar">
          <div className="qpage-filters">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Telefon, ad veya hata ara"
            />
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select value={accountFilter} onChange={(e) => { setAccountFilter(e.target.value); setPage(1); }}>
              <option value="">Tüm hatlar</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.name || acc.display_phone}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="ipanel-kpis">
            {[0, 1, 2].map((i) => <div key={i} className="ipanel-skel" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="ipanel-card" style={{ minHeight: 160 }}>
            <div className="ipanel-empty">
              {scope === "archive" ? "Eski hata arşivi boş." : "Aktif kuyrukta mesaj yok."}
            </div>
          </div>
        ) : (
          <div className="ipanel-card" style={{ minHeight: 0, padding: 8 }}>
            <div className="comm-table-wrap">
              <table className="qpage-table">
                <thead>
                  <tr>
                    <th>Durum</th>
                    <th>Kişi</th>
                    <th>Kaynak</th>
                    <th>Hat</th>
                    <th>Mesaj</th>
                    <th>Deneme</th>
                    <th>Hata / sıradaki</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className={`comm-status-badge ${statusClass(item.status)}`}>
                          {formatMessageStatus(item.status)}
                        </span>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{formatWhen(item.created_at)}</div>
                      </td>
                      <td>
                        <div className="qpage-who">
                          <strong>{item.contact_name || item.contact_phone || "—"}</strong>
                          <span>{item.contact_name ? item.contact_phone : ""}</span>
                        </div>
                      </td>
                      <td>
                        <div>{item.source_label || "Manuel"}</div>
                        {item.campaign_id && (
                          <Link href={paths.campaign(item.campaign_id)} className="ipanel-link">
                            {item.campaign_title || "Kampanya"}
                          </Link>
                        )}
                      </td>
                      <td>{item.channel_config_name || "—"}</td>
                      <td style={{ maxWidth: 240 }}>{item.body_preview || "—"}</td>
                      <td>{item.attempt_count}/{item.max_attempts || 5}</td>
                      <td>
                        {item.last_error ? (
                          <div className="qpage-err">{item.last_error}</div>
                        ) : (
                          <span style={{ color: "#64748b" }}>{nextAttemptLabel(item.next_attempt_at, item.status)}</span>
                        )}
                      </td>
                      <td>
                        <div className="qpage-actions">
                          {item.can_retry && (
                            <button type="button" className="retry" disabled={busyId === item.id} onClick={() => void runAction(item.id, retryQueueItem)}>
                              {busyId === item.id ? "…" : "Tekrar dene"}
                            </button>
                          )}
                          {item.can_cancel && (
                            <button type="button" className="cancel" disabled={busyId === item.id} onClick={() => void runAction(item.id, cancelQueueItem)}>
                              İptal
                            </button>
                          )}
                          {item.conversation_id && (
                            <Link href={`${paths.chats}?conversation=${item.conversation_id}`} className="ipanel-link">
                              Sohbet
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="comm-pagination">
              <span>
                {scope === "archive" ? "Arşiv" : "Aktif"} · {total.toLocaleString("tr-TR")} kayıt — Sayfa {page}/{totalPages}
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" className="comm-btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Önceki
                </button>
                <button type="button" className="comm-btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Sonraki
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </CommunicationPageShell>
  );
}
