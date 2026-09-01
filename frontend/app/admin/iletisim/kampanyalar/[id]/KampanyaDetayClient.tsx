"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CommunicationPageShell,
  WhatsAppPreviewBubble,
} from "@/components/communication";
import "@/components/communication/communication.css";
import {
  CAMPAIGN_STATUS_LABELS,
  CampaignItem,
  cancelCampaign,
  fetchCampaign,
  formatMessageStatus,
  retryFailedCampaign,
} from "@/lib/communication-api";

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

function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    DRAFT: "draft",
    CONFIRMED: "confirmed",
    QUEUED: "queued",
    PROCESSING: "processing",
    COMPLETED: "completed",
    PARTIAL: "partial",
    CANCELLED: "cancelled",
  };
  return map[status] || "draft";
}

function deliveryStatusClass(status: string): string {
  if (status === "READ" || status === "DELIVERED") return "completed";
  if (status === "SENT") return "confirmed";
  if (status === "FAILED" || status === "CANCELLED") return "cancelled";
  if (status === "SENDING" || status === "PENDING") return "processing";
  return "draft";
}

function contactTypeLabel(type: string): string {
  if (type === "VELI") return "Veli";
  if (type === "OGRENCI") return "Öğrenci";
  if (type === "PERSONEL") return "Personel";
  return "";
}

export default function KampanyaDetayClient() {
  const params = useParams();
  const campaignId = params.id as string;
  const [campaign, setCampaign] = useState<CampaignItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchCampaign(campaignId);
      setCampaign(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gönderim yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
    const inflight = campaign?.status === "CONFIRMED" || campaign?.status === "PROCESSING";
    const interval = setInterval(load, inflight ? 4000 : 15000);
    return () => clearInterval(interval);
  }, [load, campaign?.status]);

  const handleRetry = async () => {
    setActionLoading("retry");
    try {
      await retryFailedCampaign(campaignId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yeniden deneme başarısız");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Bekleyen mesajları iptal etmek istediğinize emin misiniz?")) return;
    setActionLoading("cancel");
    try {
      await cancelCampaign(campaignId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "İptal başarısız");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <CommunicationPageShell
        title="Gönderim"
        subtitle="Yükleniyor…"
        icon="📊"
        breadcrumbs={[
          { label: "İletişim" },
          { label: "Gönderim Geçmişi", href: "/admin/iletisim/kampanyalar" },
          { label: "Detay" },
        ]}
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
        breadcrumbs={[
          { label: "Gönderim Geçmişi", href: "/admin/iletisim/kampanyalar" },
          { label: "Detay" },
        ]}
      >
        <p>Bu gönderim mevcut değil.</p>
      </CommunicationPageShell>
    );
  }

  const total = campaign.total_recipients || 0;
  const canCancel = ["DRAFT", "QUEUED", "PROCESSING", "CONFIRMED"].includes(campaign.status);
  const canRetry = campaign.failed_count > 0 && campaign.status !== "CANCELLED";

  return (
    <CommunicationPageShell
      title={campaign.title || "Gönderim Raporu"}
      subtitle={`Oluşturulma: ${new Date(campaign.created_at).toLocaleString("tr-TR")}`}
      icon="📊"
      breadcrumbs={[
        { label: "İletişim" },
        { label: "Gönderim Geçmişi", href: "/admin/iletisim/kampanyalar" },
        { label: campaign.title || "Detay" },
      ]}
      actions={
        <span className={`comm-status-badge ${statusBadgeClass(campaign.status)}`}>
          {CAMPAIGN_STATUS_LABELS[campaign.status] || campaign.status}
        </span>
      }
    >
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}

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

      <div className="comm-card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: "0 0 1.25rem", fontSize: "1rem" }}>Teslimat istatistikleri</h2>
        <StatBar label="Gönderildi" value={campaign.sent_count} total={total} color="#3b82f6" icon="📤" />
        <StatBar label="İletildi" value={campaign.delivered_count} total={total} color="#8b5cf6" icon="✓" />
        <StatBar label="Okundu" value={campaign.read_count} total={total} color="#22c55e" icon="👁" />
        <StatBar label="Başarısız" value={campaign.failed_count} total={total} color="#ef4444" icon="✕" />
        <p style={{ fontSize: "0.875rem", color: "#667781", marginTop: "0.5rem", marginBottom: 0 }}>
          Toplam alıcı: <strong>{total.toLocaleString("tr-TR")}</strong>
        </p>
      </div>

      {!!campaign.deliveries?.length && (
        <div className="comm-card" style={{ marginBottom: "1rem" }}>
          <div className="comm-delivery-toolbar">
            <h2>Alıcılar</h2>
            <div className="comm-delivery-actions">
              {canRetry && (
                <button
                  type="button"
                  className="comm-btn-primary comm-delivery-retry"
                  disabled={actionLoading === "retry"}
                  onClick={handleRetry}
                >
                  {actionLoading === "retry" ? "Yeniden deneniyor…" : "Başarısızları yeniden dene"}
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  className="comm-btn-secondary comm-btn-danger"
                  disabled={actionLoading === "cancel"}
                  onClick={handleCancel}
                >
                  {actionLoading === "cancel" ? "İptal ediliyor…" : "Gönderimi iptal et"}
                </button>
              )}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="comm-table" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Kişi</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Telefon</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Durum</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {campaign.deliveries.map(row => {
                  const isFailed = row.status === "FAILED";
                  const fullNote = isFailed ? (row.failed_reason || "") : "";
                  const shortNote = (row.failed_reason_short || "").trim() || fullNote;
                  const kind = contactTypeLabel(row.contact_type);
                  return (
                  <tr key={row.id}>
                    <td style={{ padding: "6px 8px" }}>
                      <div className="comm-delivery-who">
                        <strong>{row.contact_name || "—"}</strong>
                        {kind ? <span className="comm-delivery-kind">{kind}</span> : null}
                      </div>
                    </td>
                    <td style={{ padding: "6px 8px" }}>{row.phone || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span className={`comm-status-badge ${deliveryStatusClass(row.status)}`}>
                        {formatMessageStatus(row.status)}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", color: fullNote ? "#b91c1c" : "#667781" }}>
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
        </div>
      )}

      {campaign.body_template && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.25rem", alignItems: "start" }}>
          <div className="comm-card">
            <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Mesaj metni</h2>
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
              {campaign.body_template}
            </pre>
          </div>
          <WhatsAppPreviewBubble text={campaign.body_template} />
        </div>
      )}

      {!campaign.deliveries?.length && (canRetry || canCancel) && (
        <div className="comm-delivery-actions" style={{ marginTop: "1rem" }}>
          {canRetry && (
            <button
              type="button"
              className="comm-btn-primary comm-delivery-retry"
              disabled={actionLoading === "retry"}
              onClick={handleRetry}
            >
              {actionLoading === "retry" ? "Yeniden deneniyor…" : "Başarısızları yeniden dene"}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              className="comm-btn-secondary comm-btn-danger"
              disabled={actionLoading === "cancel"}
              onClick={handleCancel}
            >
              {actionLoading === "cancel" ? "İptal ediliyor…" : "Gönderimi iptal et"}
            </button>
          )}
        </div>
      )}
    </CommunicationPageShell>
  );
}
