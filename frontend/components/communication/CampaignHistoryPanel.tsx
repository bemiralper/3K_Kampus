"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  CampaignItem,
  WhatsAppAccount,
  accountLabel,
  campaignStatusBadgeClass,
  cancelCampaign,
  fetchAccessibleWhatsAppAccounts,
  fetchCampaigns,
  isCampaignActive,
} from "@/lib/communication-api";
import { CommConfirmDialog, type CommConfirmState } from "./CommDialog";
import { CommToast, useCommToast } from "./CommToast";

interface CampaignHistoryPanelProps {
  /**
   * Gömülü kullanım: yalnız son N kayıt, filtre ve sayfalama gizli.
   * Boş bırakılırsa tam liste (filtre çubuğu + sayfalama) gösterilir.
   */
  limit?: number;
  /** Tam listede sayfa boyutu (≤100). */
  pageSize?: number;
  detailPath?: (id: string) => string;
  emptyHref?: string;
  emptyActionLabel?: string;
}

const STATUS_CHIPS = CAMPAIGN_STATUSES.filter((s) => s !== "DRAFT");

export default function CampaignHistoryPanel({
  limit,
  pageSize = 20,
  detailPath = (id) => `/admin/iletisim/kampanyalar/${id}`,
  emptyHref = "/admin/iletisim/toplu-gonder",
  emptyActionLabel = "Yeni gönderim oluştur",
}: CampaignHistoryPanelProps) {
  const embedded = !!limit;
  const effectiveLimit = Math.min(100, Math.max(1, limit || pageSize));

  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<CommConfirmState | null>(null);
  const { toast, show: showToast } = useCommToast();

  // Filtreler
  const [statuses, setStatuses] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accountId, setAccountId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);

  useEffect(() => {
    if (embedded) return;
    fetchAccessibleWhatsAppAccounts()
      .then((res) => setAccounts(res.accounts || []))
      .catch(() => setAccounts([]));
  }, [embedded]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        setError(null);
        const data = await fetchCampaigns({
          limit: effectiveLimit,
          offset,
          status: statuses.length ? statuses : undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          channel_config_id: accountId || undefined,
          q: debouncedSearch || undefined,
        });
        setCampaigns(data.campaigns);
        setTotal(data.total);
        setHasMore(data.has_more);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gönderimler yüklenemedi");
      } finally {
        setLoading(false);
      }
    },
    [effectiveLimit, offset, statuses, dateFrom, dateTo, accountId, debouncedSearch],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Devam eden gönderim varken sayaçları tazele (yalnız görünen sayfa).
  const inflight = campaigns.some((c) => isCampaignActive(c.status));
  useEffect(() => {
    if (!inflight) return;
    const id = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(id);
  }, [inflight, load]);

  const resetAndSet = (fn: () => void) => {
    setOffset(0);
    fn();
  };

  const toggleStatus = (status: string) => {
    resetAndSet(() =>
      setStatuses((prev) =>
        prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
      ),
    );
  };

  const clearFilters = () => {
    setOffset(0);
    setStatuses([]);
    setDateFrom("");
    setDateTo("");
    setAccountId("");
    setSearch("");
  };

  const hasFilters = statuses.length > 0 || !!dateFrom || !!dateTo || !!accountId || !!debouncedSearch;

  const askCancel = (c: CampaignItem) => {
    setConfirm({
      title: "Gönderimi iptal et",
      description: `"${c.title || c.id.slice(0, 8)}" için bekleyen mesajlar iptal edilecek. Gönderilmiş mesajlar geri alınmaz.`,
      confirmLabel: "İptal et",
      danger: true,
      onConfirm: async () => {
        setCancellingId(c.id);
        try {
          await cancelCampaign(c.id);
          showToast("Gönderim iptal edildi.");
          await load(true);
        } catch (err) {
          const message = err instanceof Error ? err.message : "İptal başarısız";
          setError(message);
          showToast(message, "error");
        } finally {
          setCancellingId(null);
        }
      },
    });
  };

  const rangeText = useMemo(() => {
    if (!total) return "0 kayıt";
    const from = offset + 1;
    const to = Math.min(offset + campaigns.length, total);
    return `${from}–${to} / ${total.toLocaleString("tr-TR")}`;
  }, [offset, campaigns.length, total]);

  const emptyState = (
    <div className="comm-card" style={{ textAlign: "center", padding: "2.5rem" }}>
      <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.75rem" }}>📭</span>
      <p className="comm-studio-muted" style={{ margin: "0 0 1rem" }}>
        {hasFilters ? "Filtreye uyan gönderim yok." : "Henüz toplu gönderim yok."}
      </p>
      {hasFilters ? (
        <button type="button" className="comm-btn-secondary" onClick={clearFilters}>
          Filtreleri temizle
        </button>
      ) : (
        <Link href={emptyHref} className="comm-btn-primary">
          {emptyActionLabel}
        </Link>
      )}
    </div>
  );

  return (
    <>
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}

      {!embedded && (
        <>
          <div className="comm-history-filters">
            <input
              type="search"
              value={search}
              onChange={(e) => resetAndSet(() => setSearch(e.target.value))}
              placeholder="Başlıkta ara"
              aria-label="Başlıkta ara"
            />
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => resetAndSet(() => setDateFrom(e.target.value))}
              aria-label="Başlangıç tarihi"
            />
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => resetAndSet(() => setDateTo(e.target.value))}
              aria-label="Bitiş tarihi"
            />
            <select
              value={accountId}
              onChange={(e) => resetAndSet(() => setAccountId(e.target.value))}
              aria-label="Hesap"
            >
              <option value="">Tüm hesaplar</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>{accountLabel(acc)}</option>
              ))}
            </select>
            {hasFilters && (
              <button type="button" className="comm-btn-secondary" onClick={clearFilters}>
                Temizle
              </button>
            )}
          </div>
          <div className="comm-history-chips" role="group" aria-label="Durum filtresi">
            {STATUS_CHIPS.map((status) => (
              <button
                key={status}
                type="button"
                className={`comm-filter-chip-toggle${statuses.includes(status) ? " active" : ""}`}
                aria-pressed={statuses.includes(status)}
                onClick={() => toggleStatus(status)}
              >
                {CAMPAIGN_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </>
      )}

      {loading && campaigns.length === 0 ? (
        <p className="comm-studio-muted">Gönderimler yükleniyor…</p>
      ) : campaigns.length === 0 ? (
        emptyState
      ) : (
        <div className="comm-table-wrap comm-table-wrap--cards">
          <table className="comm-table comm-history-table comm-table-cards">
            <thead>
              <tr>
                <th>Başlık</th>
                <th className="comm-col-account">Hesap</th>
                <th>Durum</th>
                <th>Alıcı</th>
                <th>İlerleme</th>
                <th>Teslim / Okunma</th>
                <th className="comm-col-reply">Yanıt</th>
                <th>Başarısız</th>
                <th>Tarih</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const total = c.total_recipients || 1;
                const sentPct = Math.round((c.sent_count / total) * 100);
                const failPct = Math.round((c.failed_count / total) * 100);
                const cancellable =
                  !!c.can_manage && ["DRAFT", "QUEUED", "PROCESSING", "CONFIRMED"].includes(c.status);
                const materializeError = (c.materialize_error || "").trim();
                return (
                  <tr key={c.id}>
                    <td className="comm-cell-primary" data-label="Başlık">
                      <Link
                        href={detailPath(c.id)}
                        style={{ fontWeight: 600, color: "#128c7e", textDecoration: "none" }}
                      >
                        {c.title || c.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td
                      className="comm-col-account comm-cell-hide-mobile"
                      data-label="Hesap"
                      style={{ fontSize: "0.8125rem", color: "#667781" }}
                    >
                      {c.channel_config_name || "—"}
                    </td>
                    <td data-label="Durum">
                      <span className={`comm-status-badge ${campaignStatusBadgeClass(c.status)}`}>
                        {CAMPAIGN_STATUS_LABELS[c.status] || c.status}
                      </span>
                      {c.status === "CONFIRMED" && (
                        <span className="comm-materialize-progress">
                          Kuyruğa alınıyor {c.materialized_count ?? 0}/{c.total_recipients}
                        </span>
                      )}
                      {materializeError && (
                        <span className="comm-materialize-hint" title={materializeError}>
                          {materializeError}
                        </span>
                      )}
                    </td>
                    <td data-label="Alıcı">{c.total_recipients}</td>
                    <td data-label="İlerleme">
                      <div className="comm-progress-mini">
                        <span style={{ fontSize: "0.75rem" }}>
                          {c.sent_count} gönderildi ({sentPct}%)
                        </span>
                        <div className="comm-progress-bar">
                          <div
                            className="comm-progress-fill sent"
                            style={{ width: `${sentPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td data-label="Teslim / Okunma" style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                      {c.delivery_rate != null ? `%${c.delivery_rate.toFixed(0)}` : "—"} /{" "}
                      {c.read_rate != null ? `%${c.read_rate.toFixed(0)}` : "—"}
                    </td>
                    <td className="comm-col-reply comm-cell-hide-mobile" data-label="Yanıt">
                      {c.replied_count ?? 0}
                    </td>
                    <td data-label="Başarısız">
                      {c.failed_count > 0 ? (
                        <span style={{ color: "#dc2626", fontWeight: 600 }}>
                          {c.failed_count} ({failPct}%)
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td data-label="Tarih" style={{ whiteSpace: "nowrap" }}>
                      {new Date(c.created_at).toLocaleString("tr-TR")}
                    </td>
                    <td className="comm-cell-actions" data-label="">
                      {cancellable && (
                        <button
                          type="button"
                          className="comm-btn-secondary comm-btn-danger"
                          style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                          disabled={cancellingId === c.id}
                          onClick={() => askCancel(c)}
                        >
                          {cancellingId === c.id ? "…" : "İptal"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!embedded && campaigns.length > 0 && (
        <div className="comm-pagination">
          <span>{rangeText}</span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="comm-btn-secondary"
              disabled={offset <= 0 || loading}
              onClick={() => setOffset((o) => Math.max(0, o - effectiveLimit))}
            >
              Önceki
            </button>
            <button
              type="button"
              className="comm-btn-secondary"
              disabled={!hasMore || loading}
              onClick={() => setOffset((o) => o + effectiveLimit)}
            >
              Sonraki
            </button>
          </div>
        </div>
      )}

      <CommConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <CommToast toast={toast} />
    </>
  );
}
