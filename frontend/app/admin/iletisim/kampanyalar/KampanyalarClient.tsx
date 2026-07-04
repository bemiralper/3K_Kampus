"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CommunicationPageShell } from "@/components/communication";
import "@/components/communication/communication.css";
import {
  CAMPAIGN_STATUS_LABELS,
  CampaignItem,
  cancelCampaign,
  fetchCampaigns,
} from "@/lib/communication-api";

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

export default function KampanyalarClient() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchCampaigns();
      setCampaigns(data.campaigns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kampanyalar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async (id: string) => {
    if (!confirm("Bu kampanyayı iptal etmek istediğinize emin misiniz?")) return;
    setCancellingId(id);
    try {
      await cancelCampaign(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "İptal başarısız");
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) {
    return (
      <CommunicationPageShell
        title="Kampanyalar"
        subtitle="Toplu WhatsApp gönderim geçmişi"
        icon="📋"
        breadcrumbs={[{ label: "İletişim" }, { label: "Kampanyalar" }]}
      >
        <p style={{ color: "#667781" }}>Kampanyalar yükleniyor…</p>
      </CommunicationPageShell>
    );
  }

  return (
    <CommunicationPageShell
      title="Kampanyalar"
      subtitle="Toplu WhatsApp gönderim geçmişi ve raporları"
      icon="📋"
      breadcrumbs={[{ label: "İletişim" }, { label: "Kampanyalar" }]}
      actions={
        <Link href="/admin/iletisim/toplu-gonder" className="comm-btn-primary">
          + Yeni Toplu Gönderim
        </Link>
      }
    >
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}

      {campaigns.length === 0 ? (
        <div className="comm-card" style={{ textAlign: "center", padding: "2.5rem" }}>
          <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.75rem" }}>📭</span>
          <p style={{ color: "#667781", margin: "0 0 1rem" }}>Henüz kampanya yok.</p>
          <Link href="/admin/iletisim/toplu-gonder" className="comm-btn-primary">
            İlk kampanyanızı oluşturun
          </Link>
        </div>
      ) : (
        <div className="comm-table-wrap">
          <table className="comm-table">
            <thead>
              <tr>
                <th>Başlık</th>
                <th>Durum</th>
                <th>Alıcı</th>
                <th>İlerleme</th>
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
                return (
                  <tr key={c.id}>
                    <td>
                      <Link
                        href={`/admin/iletisim/kampanyalar/${c.id}`}
                        style={{ fontWeight: 600, color: "#128c7e", textDecoration: "none" }}
                      >
                        {c.title || c.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>
                      <span className={`comm-status-badge ${statusBadgeClass(c.status)}`}>
                        {CAMPAIGN_STATUS_LABELS[c.status] || c.status}
                      </span>
                    </td>
                    <td>{c.total_recipients}</td>
                    <td>
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
                    <td>
                      {c.failed_count > 0 ? (
                        <span style={{ color: "#dc2626", fontWeight: 600 }}>
                          {c.failed_count} ({failPct}%)
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(c.created_at).toLocaleString("tr-TR")}
                    </td>
                    <td>
                      {["DRAFT", "QUEUED", "PROCESSING", "CONFIRMED"].includes(c.status) && (
                        <button
                          type="button"
                          className="comm-btn-secondary comm-btn-danger"
                          style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                          disabled={cancellingId === c.id}
                          onClick={() => handleCancel(c.id)}
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
    </CommunicationPageShell>
  );
}
