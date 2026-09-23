"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CommConfirmDialog,
  CommToast,
  CommunicationPageShell,
  WhatsAppPreviewBubble,
  useCommToast,
  type CommConfirmState,
} from "@/components/communication";
import "@/components/communication/communication.css";
import {
  CAMPAIGN_STATUS_LABELS,
  CampaignDelivery,
  CampaignItem,
  campaignStatusBadgeClass,
  cancelCampaign,
  communicationPortalPaths,
  fetchCampaign,
  fetchCampaignDeliveries,
  formatMessageStatus,
  isCampaignActive,
  messageStatusBadgeClass,
  processCampaignQueue,
  retryFailedCampaign,
  type InboxPortal,
} from "@/lib/communication-api";

const DELIVERY_PAGE_SIZE = 50;
const ACTIVE_POLL_MS = 4000;

/** Teslimat durum çipleri — değer sunucuya virgüllü liste olarak gider. */
const DELIVERY_STATUS_CHIPS: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: "PENDING", label: "Bekliyor", statuses: ["PENDING", "SENDING"] },
  { key: "SENT", label: "Gönderildi", statuses: ["SENT"] },
  { key: "DELIVERED", label: "İletildi", statuses: ["DELIVERED"] },
  { key: "READ", label: "Okundu", statuses: ["READ"] },
  { key: "FAILED", label: "Başarısız", statuses: ["FAILED"] },
  { key: "CANCELLED", label: "İptal", statuses: ["CANCELLED"] },
];

function StatBar({
  label,
  value,
  total,
  color,
  icon,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  icon: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.875rem",
          marginBottom: 6,
        }}
      >
        <span>
          {icon} {label}
        </span>
        <span style={{ fontWeight: 600 }}>
          {value.toLocaleString("tr-TR")} ({pct}%)
        </span>
      </div>
      <div className="comm-progress-bar" style={{ height: 10 }}>
        <div
          className="comm-progress-fill sent"
          style={{ width: `${pct}%`, background: color, transition: "width 0.3s" }}
        />
      </div>
    </div>
  );
}

function contactTypeLabel(type: string): string {
  if (type === "VELI") return "Veli";
  if (type === "OGRENCI") return "Öğrenci";
  if (type === "PERSONEL") return "Personel";
  return "";
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("tr-TR");
}

/**
 * Gösterilecek mesaj metni. `body_template` ham şablondur ve Meta numaralı
 * şablonlarda ({{1}}) anlamsızdır; `resolved_body` ilk alıcıya giden gerçek
 * metindir. İkisi de yoksa şablon adına düşeriz — kart hiç boş kalmasın.
 */
function campaignMessageText(campaign: CampaignItem): string {
  const resolved = (campaign.resolved_body || "").trim();
  if (resolved) return resolved;
  const raw = (campaign.body_template || "").trim();
  if (raw && raw !== campaign.template_name) return raw;
  return "";
}

export default function KampanyaDetayClient({ portal = "admin" }: { portal?: InboxPortal }) {
  const params = useParams();
  const campaignId = params.id as string;
  const paths = communicationPortalPaths(portal);
  const rootCrumb = { label: portal === "muhasebe" ? "WhatsApp" : "İletişim", href: paths.home };
  const historyCrumb = { label: "Gönderim Geçmişi", href: paths.history };

  const [campaign, setCampaign] = useState<CampaignItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<CommConfirmState | null>(null);
  const { toast, show: showToast } = useCommToast();

  // Teslimat listesi — sayfalı uç nokta
  const [deliveries, setDeliveries] = useState<CampaignDelivery[]>([]);
  const [deliveriesTotal, setDeliveriesTotal] = useState(0);
  const [deliveriesOffset, setDeliveriesOffset] = useState(0);
  const [deliveriesHasMore, setDeliveriesHasMore] = useState(false);
  const [deliveriesArchived, setDeliveriesArchived] = useState(false);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<string>("");
  const [deliverySearch, setDeliverySearch] = useState("");
  const [debouncedDeliverySearch, setDebouncedDeliverySearch] = useState("");
  const [deliveriesTick, setDeliveriesTick] = useState(0);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchCampaign(campaignId);
      setCampaign(data);
      if (data.deliveries_archived != null) setDeliveriesArchived(!!data.deliveries_archived);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gönderim yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Yalnız kuyruğa alma / gönderim sürerken yokla; tamamlanan kampanya boşta kalır.
  const active = isCampaignActive(campaign?.status);
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      void load();
      setDeliveriesTick((t) => t + 1);
    }, ACTIVE_POLL_MS);
    return () => window.clearInterval(interval);
  }, [active, load]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedDeliverySearch(deliverySearch.trim()), 300);
    return () => window.clearTimeout(id);
  }, [deliverySearch]);

  const chipStatuses = useMemo(
    () => DELIVERY_STATUS_CHIPS.find((c) => c.key === deliveryStatus)?.statuses,
    [deliveryStatus],
  );

  const campaignLoaded = !!campaign;
  useEffect(() => {
    if (!campaignId || loading || !campaignLoaded) return;
    let cancelled = false;
    // Yoklama tazelemesinde (tick) yükleniyor göstermeyelim; liste titremesin.
    const silent = deliveriesTick > 0;
    if (!silent) setDeliveriesLoading(true);
    fetchCampaignDeliveries(campaignId, {
      limit: DELIVERY_PAGE_SIZE,
      offset: deliveriesOffset,
      status: chipStatuses,
      q: debouncedDeliverySearch || undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setDeliveries(res.deliveries);
        setDeliveriesTotal(res.total);
        setDeliveriesHasMore(res.has_more);
        setDeliveriesArchived(res.archived);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Alıcı listesi yüklenemedi");
      })
      .finally(() => {
        if (!cancelled) setDeliveriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, loading, campaignLoaded, deliveriesOffset, chipStatuses, debouncedDeliverySearch, deliveriesTick]);

  const refreshAll = useCallback(async () => {
    await load();
    setDeliveriesTick((t) => t + 1);
  }, [load]);

  const runAction = async (
    key: string,
    fn: () => Promise<CampaignItem>,
    successText: string,
    failText: string,
  ) => {
    setActionLoading(key);
    try {
      const result = await fn();
      if (result && result.id) setCampaign(result);
      showToast(successText);
      await refreshAll();
    } catch (err) {
      const message = err instanceof Error ? err.message : failText;
      setError(message);
      showToast(message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const askRetry = () => {
    setConfirm({
      title: "Başarısızları yeniden dene",
      description: `${campaign?.failed_count ?? 0} başarısız alıcı yeniden kuyruğa alınacak. Devam edilsin mi?`,
      confirmLabel: "Yeniden dene",
      onConfirm: () =>
        runAction(
          "retry",
          () => retryFailedCampaign(campaignId),
          "Başarısız alıcılar yeniden kuyruğa alındı.",
          "Yeniden deneme başarısız",
        ),
    });
  };

  const handleProcessQueue = () =>
    runAction(
      "queue",
      () => processCampaignQueue(campaignId),
      "Kuyruk işlendi.",
      "Kuyruk işlenemedi",
    );

  const askCancel = () => {
    setConfirm({
      title: "Gönderimi iptal et",
      description: "Bekleyen mesajlar iptal edilecek; gönderilmiş mesajlar geri alınmaz.",
      confirmLabel: "İptal et",
      danger: true,
      onConfirm: () =>
        runAction(
          "cancel",
          () => cancelCampaign(campaignId),
          "Gönderim iptal edildi.",
          "İptal başarısız",
        ),
    });
  };

  if (loading) {
    return (
      <CommunicationPageShell
        title="Gönderim"
        subtitle="Yükleniyor…"
        icon="📊"
        maxWidth="full"
        breadcrumbs={[rootCrumb, historyCrumb, { label: "Detay" }]}
      >
        <p style={{ color: "#667781" }}>Gönderim yükleniyor…</p>
      </CommunicationPageShell>
    );
  }

  if (!campaign) {
    return (
      <CommunicationPageShell
        title="Gönderim bulunamadı"
        icon="📊"
        maxWidth="full"
        breadcrumbs={[rootCrumb, historyCrumb, { label: "Detay" }]}
      >
        {error && <div className="comm-alert comm-alert-danger">{error}</div>}
        <p>Bu gönderim mevcut değil.</p>
      </CommunicationPageShell>
    );
  }

  const total = campaign.total_recipients || 0;
  const canManage = !!campaign.can_manage;
  const canCancel = canManage && ["DRAFT", "QUEUED", "PROCESSING", "CONFIRMED"].includes(campaign.status);
  const canRetry = canManage && campaign.failed_count > 0 && !["CANCELLED", "FAILED"].includes(campaign.status);
  const queue = campaign.queue_status;
  const waiting = queue
    ? queue.waiting
    : Math.max(0, total - campaign.sent_count - campaign.failed_count);
  const canProcessQueue = canManage && waiting > 0 && !["CANCELLED", "FAILED"].includes(campaign.status);
  const messageText = campaignMessageText(campaign);
  const templateVars = Object.entries(campaign.template_context || {}).filter(
    ([key, value]) => !/^\d+$/.test(key) && String(value || "").trim(),
  );
  const materializeError = (campaign.materialize_error || "").trim();
  const hasActions = canProcessQueue || canRetry || canCancel;

  const actionButtons = hasActions ? (
    <div className="comm-delivery-actions">
      {canProcessQueue && (
        <button
          type="button"
          className="comm-btn-primary"
          disabled={actionLoading === "queue"}
          onClick={() => void handleProcessQueue()}
        >
          {actionLoading === "queue" ? "İşleniyor…" : "Kuyruğu şimdi işle"}
        </button>
      )}
      {canRetry && (
        <button
          type="button"
          className="comm-btn-primary comm-delivery-retry"
          disabled={actionLoading === "retry"}
          onClick={askRetry}
        >
          {actionLoading === "retry" ? "Yeniden deneniyor…" : "Başarısızları yeniden dene"}
        </button>
      )}
      {canCancel && (
        <button
          type="button"
          className="comm-btn-secondary comm-btn-danger"
          disabled={actionLoading === "cancel"}
          onClick={askCancel}
        >
          {actionLoading === "cancel" ? "İptal ediliyor…" : "Gönderimi iptal et"}
        </button>
      )}
    </div>
  ) : null;

  const deliveryRangeText = deliveriesTotal
    ? `${deliveriesOffset + 1}–${Math.min(deliveriesOffset + deliveries.length, deliveriesTotal)} / ${deliveriesTotal.toLocaleString("tr-TR")}`
    : "0 kayıt";

  return (
    <CommunicationPageShell
      title={campaign.title || "Gönderim Raporu"}
      subtitle={`Oluşturulma: ${new Date(campaign.created_at).toLocaleString("tr-TR")}`}
      icon="📊"
      maxWidth="full"
      breadcrumbs={[rootCrumb, historyCrumb, { label: campaign.title || "Detay" }]}
      actions={
        <span className={`comm-status-badge ${campaignStatusBadgeClass(campaign.status)}`}>
          {CAMPAIGN_STATUS_LABELS[campaign.status] || campaign.status}
        </span>
      }
    >
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}

      {materializeError && (
        <div className="comm-alert comm-alert-danger">
          <strong>Kuyruğa alma başarısız oldu.</strong> {materializeError}
        </div>
      )}

      {campaign.status === "CONFIRMED" && (
        <div className="comm-alert comm-alert-info">
          <strong>
            Kuyruğa alınıyor {(campaign.materialized_count ?? 0).toLocaleString("tr-TR")}/
            {total.toLocaleString("tr-TR")}
          </strong>{" "}
          — alıcılar arka planda kuyruğa yazılıyor; sayfa kendiliğinden yenilenir.
        </div>
      )}

      <div className="comm-breakdown-grid" style={{ marginBottom: "1rem" }}>
        <div className="comm-breakdown-item">
          <strong>{campaign.channel_config_name || "—"}</strong>
          <span>Gönderim hesabı</span>
        </div>
        <div className="comm-breakdown-item">
          <strong>{campaign.analytics?.delivery_rate != null ? `%${campaign.analytics.delivery_rate.toFixed(0)}` : campaign.delivery_rate != null ? `%${campaign.delivery_rate.toFixed(0)}` : "—"}</strong>
          <span>Teslim oranı</span>
        </div>
        <div className="comm-breakdown-item">
          <strong>{campaign.analytics?.read_rate != null ? `%${campaign.analytics.read_rate.toFixed(0)}` : campaign.read_rate != null ? `%${campaign.read_rate.toFixed(0)}` : "—"}</strong>
          <span>Okunma oranı</span>
        </div>
        <div className="comm-breakdown-item">
          <strong>{campaign.analytics?.replied ?? campaign.replied_count ?? 0}</strong>
          <span>Yanıt veren</span>
        </div>
        {campaign.estimated_cost_usd && (
          <div className="comm-breakdown-item">
            <strong>${campaign.estimated_cost_usd}</strong>
            <span>Tahmini maliyet</span>
          </div>
        )}
        {campaign.scheduled_at && (
          <div className="comm-breakdown-item">
            <strong>{new Date(campaign.scheduled_at).toLocaleString("tr-TR")}</strong>
            <span>Planlanan gönderim</span>
          </div>
        )}
      </div>

      {waiting > 0 && !["CANCELLED", "FAILED"].includes(campaign.status) && (
        <div className="comm-alert comm-alert-warning">
          <strong>{waiting.toLocaleString("tr-TR")} mesaj hâlâ kuyrukta bekliyor.</strong>{" "}
          Gönderim kuyruğu arka planda işlenir; sıradaki deneme{" "}
          {formatDateTime(queue?.next_attempt_at)}.{" "}
          {queue?.last_error
            ? `Son hata: ${queue.last_error}`
            : canManage
              ? "Uzun süredir ilerlemiyorsa “Kuyruğu şimdi işle” ile elle tetikleyin."
              : ""}
        </div>
      )}

      <div className="comm-card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: "0 0 1.25rem", fontSize: "1rem" }}>Teslimat istatistikleri</h2>
        <StatBar label="Gönderildi" value={campaign.sent_count} total={total} color="#3b82f6" icon="📤" />
        <StatBar label="İletildi" value={campaign.delivered_count} total={total} color="#8b5cf6" icon="✓" />
        <StatBar label="Okundu" value={campaign.read_count} total={total} color="#22c55e" icon="👁" />
        <StatBar label="Başarısız" value={campaign.failed_count} total={total} color="#ef4444" icon="✕" />
        <StatBar label="Bekliyor" value={waiting} total={total} color="#f59e0b" icon="⏳" />
        <p style={{ fontSize: "0.875rem", color: "#667781", marginTop: "0.5rem", marginBottom: 0 }}>
          Toplam alıcı: <strong>{total.toLocaleString("tr-TR")}</strong>
        </p>
      </div>

      <div
        className="comm-campaign-message"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 280px",
          gap: "1.25rem",
          alignItems: "start",
          marginBottom: "1rem",
        }}
      >
        <div className="comm-card">
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Mesaj metni</h2>
          {campaign.template_name && (
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "#667781" }}>
              Şablon: <strong>{campaign.template_name}</strong>
              {campaign.template_language ? ` · ${campaign.template_language}` : ""}
            </p>
          )}
          {messageText ? (
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                fontSize: "0.875rem",
                lineHeight: 1.5,
                color: "#111b21",
              }}
            >
              {messageText}
            </pre>
          ) : (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "#667781" }}>
              Bu gönderim için metin kaydedilmemiş. Meta şablonu silinmiş veya alıcı kuyruğu
              hiç üretilmemiş olabilir.
            </p>
          )}
          {templateVars.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#667781", marginBottom: 6 }}>
                Girilen değişkenler
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.8125rem", color: "#111b21" }}>
                {templateVars.map(([key, value]) => (
                  <li key={key}>
                    <strong>{key}</strong>: {value}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <WhatsAppPreviewBubble text={messageText} />
      </div>

      <div className="comm-card" style={{ marginBottom: "1rem" }}>
        <div className="comm-delivery-toolbar">
          <h2>
            Alıcılar
            {deliveriesTotal ? ` (${deliveriesTotal.toLocaleString("tr-TR")})` : ""}
          </h2>
          {actionButtons}
        </div>

        {deliveriesArchived && (
          <div className="comm-alert comm-alert-info" style={{ marginBottom: "0.75rem" }}>
            Teslimat satırları arşivden gösteriliyor.
          </div>
        )}

        <div className="comm-delivery-filters">
          <div className="comm-history-chips" style={{ marginBottom: 0 }} role="group" aria-label="Teslimat durumu">
            {DELIVERY_STATUS_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`comm-filter-chip-toggle${deliveryStatus === chip.key ? " active" : ""}`}
                aria-pressed={deliveryStatus === chip.key}
                onClick={() => {
                  setDeliveriesOffset(0);
                  setDeliveryStatus((prev) => (prev === chip.key ? "" : chip.key));
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={deliverySearch}
            onChange={(e) => {
              setDeliveriesOffset(0);
              setDeliverySearch(e.target.value);
            }}
            placeholder="Ad veya telefon ara"
            aria-label="Alıcı ara"
          />
        </div>

        {deliveriesLoading && deliveries.length === 0 ? (
          <p style={{ color: "#667781", fontSize: 13, margin: 0 }}>Alıcılar yükleniyor…</p>
        ) : deliveries.length === 0 ? (
          <p style={{ color: "#667781", fontSize: 13, margin: 0 }}>
            {deliveryStatus || debouncedDeliverySearch
              ? "Filtreye uyan alıcı yok."
              : campaign.status === "CONFIRMED"
                ? "Alıcılar henüz kuyruğa yazılıyor."
                : "Bu gönderim için alıcı satırı yok."}
          </p>
        ) : (
          <div className="comm-table-wrap comm-table-wrap--cards" style={{ border: 0 }}>
            <table className="comm-table comm-table-cards" style={{ width: "100%", fontSize: 13, minWidth: 0 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Kişi</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Telefon</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Durum</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((row) => {
                  const isFailed = row.status === "FAILED";
                  const fullNote = isFailed
                    ? (row.failed_reason || "")
                    : (row.queue_note || "");
                  const shortNote = isFailed
                    ? ((row.failed_reason_short || "").trim() || fullNote)
                    : fullNote;
                  const kind = contactTypeLabel(row.contact_type);
                  return (
                    <tr key={row.id}>
                      <td className="comm-cell-primary" data-label="Kişi" style={{ padding: "6px 8px" }}>
                        <div className="comm-delivery-who">
                          <strong>{row.contact_name || "—"}</strong>
                          {kind ? <span className="comm-delivery-kind">{kind}</span> : null}
                        </div>
                      </td>
                      <td data-label="Telefon" style={{ padding: "6px 8px" }}>{row.phone || "—"}</td>
                      <td data-label="Durum" style={{ padding: "6px 8px" }}>
                        <span className={`comm-status-badge ${messageStatusBadgeClass(row.status)}`}>
                          {formatMessageStatus(row.status)}
                        </span>
                      </td>
                      <td data-label="Açıklama" style={{ padding: "6px 8px", color: isFailed ? "#b91c1c" : "#667781" }}>
                        {fullNote ? (
                          <span className="comm-delivery-note" title={fullNote}>
                            {shortNote}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(deliveriesOffset > 0 || deliveriesHasMore) && (
          <div className="comm-pagination">
            <span>{deliveryRangeText}</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="comm-btn-secondary"
                disabled={deliveriesOffset <= 0 || deliveriesLoading}
                onClick={() => setDeliveriesOffset((o) => Math.max(0, o - DELIVERY_PAGE_SIZE))}
              >
                Önceki
              </button>
              <button
                type="button"
                className="comm-btn-secondary"
                disabled={!deliveriesHasMore || deliveriesLoading}
                onClick={() => setDeliveriesOffset((o) => o + DELIVERY_PAGE_SIZE)}
              >
                Sonraki
              </button>
            </div>
          </div>
        )}
      </div>

      <CommConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <CommToast toast={toast} />
    </CommunicationPageShell>
  );
}
