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
  communicationPortalPaths,
  fetchCampaign,
  formatMessageStatus,
  retryFailedCampaign,
  type InboxPortal,
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

function contactTypeLabel(type: string): string {
  if (type === "VELI") return "Veli";
  if (type === "OGRENCI") return "Öğrenci";
  if (type === "PERSONEL") return "Personel";
  return "";
}

export default function KampanyaDetayClient({ portal = "admin" }: { portal?: InboxPortal }) {
  const params = useParams();
  const campaignId = params.id as string;
  const paths = communicationPortalPaths(portal);
  const historyCrumb = { label: "Gönderim Geçmişi", href: paths.campaigns };
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
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

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
          historyCrumb,
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
        breadcrumbs={[historyCrumb, { label: "Detay" }]}
      >
        <p>Bu gönderim mevcut değil.</p>
      </CommunicationPageShell>
    );
  }

  const total = campaign.total_recipients || 0;
  const canCancel = ["DRAFT", "QUEUED", "PROCESSING", "CONFIRMED"].includes(campaign.status);
  const canRetry = campaign.failed_count > 0 && campaign.status !== "CANCELLED";
  const deliveries = campaign.deliveries || [];
  const undelivered = deliveries.filter(
    (row) => row.status === "FAILED" || row.status === "PENDING" || row.status === "SENDING" || row.status === "CANCELLED",
  );
  const delivered = deliveries.filter(
    (row) => row.status === "SENT" || row.status === "DELIVERED" || row.status === "READ",
  );

  return (
    <CommunicationPageShell
      title={campaign.title || "Gönderim Raporu"}
      subtitle={`Oluşturulma: ${new Date(campaign.created_at).toLocaleString("tr-TR")}`}
      icon="📊"
      breadcrumbs={[
        { label: portal === "muhasebe" ? "WhatsApp" : "İletişim" },
        historyCrumb,
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

      <DeliveryTable
        title={
          campaign.deliveries_total && campaign.deliveries_total > deliveries.length
            ? `Alıcılar (ilk ${deliveries.length} / ${campaign.deliveries_total})`
            : "Alıcılar"
        }
        rows={deliveries}
        empty="Bu gönderimde alıcı kaydı yok."
      />

      {undelivered.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <DeliveryTable
            title={`İletilmeyenler (${undelivered.length})`}
            rows={undelivered}
            empty=""
          />
        </div>
      )}

      {delivered.length > 0 && undelivered.length > 0 && (
        <p style={{ fontSize: "0.8rem", color: "#667781", marginTop: "0.5rem" }}>
          İletilen {delivered.length} kişi üstteki alıcı listesinde.
        </p>
      )}

      {campaign.body_template && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.25rem", alignItems: "start", marginTop: "1.25rem" }}>
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

      <div className="comm-btn-row" style={{ marginTop: "1.5rem" }}>
        {canRetry && (
          <button
            type="button"
            className="comm-btn-secondary"
            disabled={actionLoading === "retry"}
            onClick={handleRetry}
          >
            {actionLoading === "retry" ? "Yeniden deneniyor…" : "Başarısızları Yeniden Dene"}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            className="comm-btn-secondary comm-btn-danger"
            disabled={actionLoading === "cancel"}
            onClick={handleCancel}
          >
            {actionLoading === "cancel" ? "İptal ediliyor…" : "Gönderimi İptal Et"}
          </button>
        )}
      </div>
    </CommunicationPageShell>
  );
}

function DeliveryTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: NonNullable<CampaignItem["deliveries"]>;
  empty: string;
}) {
  return (
    <div className="comm-card">
      <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>{title}</h2>
      {rows.length === 0 ? (
        empty ? <p style={{ color: "#667781", margin: 0 }}>{empty}</p> : null
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#667781", borderBottom: "1px solid #e9edef" }}>
                <th style={{ padding: "6px 8px" }}>Kişi</th>
                <th style={{ padding: "6px 8px" }}>Telefon</th>
                <th style={{ padding: "6px 8px" }}>Durum</th>
                <th style={{ padding: "6px 8px" }}>Not</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isFailed = row.status === "FAILED";
                const fullNote = isFailed ? (row.failed_reason || "") : (row.queue_note || "");
                const shortNote = isFailed
                  ? ((row.failed_reason_short || "").trim() || fullNote)
                  : fullNote;
                const kind = contactTypeLabel(row.contact_type);
                const name = (row.contact_name || "").trim() || row.phone || "—";
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f0f2f5" }}>
                    <td style={{ padding: "8px" }}>
                      <strong>{name}</strong>
                      {kind ? <span style={{ color: "#667781", marginLeft: 6 }}>{kind}</span> : null}
                    </td>
                    <td style={{ padding: "8px", color: "#667781" }}>{row.phone || "—"}</td>
                    <td style={{ padding: "8px" }}>{formatMessageStatus(row.status)}</td>
                    <td style={{ padding: "8px", color: isFailed ? "#b91c1c" : "#667781" }}>
                      {fullNote ? (
                        <span title={fullNote}>{shortNote}</span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
