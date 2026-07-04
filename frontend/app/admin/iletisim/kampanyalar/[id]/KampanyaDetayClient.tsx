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
      setError(err instanceof Error ? err.message : "Kampanya yüklenemedi");
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
        title="Kampanya"
        subtitle="Yükleniyor…"
        icon="📊"
        breadcrumbs={[
          { label: "İletişim" },
          { label: "Kampanyalar", href: "/admin/iletisim/kampanyalar" },
          { label: "Detay" },
        ]}
      >
        <p style={{ color: "#667781" }}>Kampanya yükleniyor…</p>
      </CommunicationPageShell>
    );
  }

  if (!campaign) {
    return (
      <CommunicationPageShell
        title="Kampanya bulunamadı"
        icon="📊"
        breadcrumbs={[
          { label: "Kampanyalar", href: "/admin/iletisim/kampanyalar" },
          { label: "Detay" },
        ]}
      >
        <p>Bu kampanya mevcut değil.</p>
      </CommunicationPageShell>
    );
  }

  const total = campaign.total_recipients || 0;
  const canCancel = ["DRAFT", "QUEUED", "PROCESSING", "CONFIRMED"].includes(campaign.status);
  const canRetry = campaign.failed_count > 0 && campaign.status !== "CANCELLED";

  return (
    <CommunicationPageShell
      title={campaign.title || "Kampanya Raporu"}
      subtitle={`Oluşturulma: ${new Date(campaign.created_at).toLocaleString("tr-TR")}`}
      icon="📊"
      breadcrumbs={[
        { label: "İletişim" },
        { label: "Kampanyalar", href: "/admin/iletisim/kampanyalar" },
        { label: campaign.title || "Detay" },
      ]}
      actions={
        <span className={`comm-status-badge ${statusBadgeClass(campaign.status)}`}>
          {CAMPAIGN_STATUS_LABELS[campaign.status] || campaign.status}
        </span>
      }
    >
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}

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
            {actionLoading === "cancel" ? "İptal ediliyor…" : "Kampanyayı İptal Et"}
          </button>
        )}
      </div>
    </CommunicationPageShell>
  );
}
