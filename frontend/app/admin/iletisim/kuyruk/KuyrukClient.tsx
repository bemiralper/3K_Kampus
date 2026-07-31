"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CommunicationPageShell } from "@/components/communication";
import "@/components/communication/communication.css";
import {
  fetchAccessibleWhatsAppAccounts,
  fetchOutboundQueue,
  formatMessageStatus,
  OutboundQueueItem,
  WhatsAppAccount,
} from "@/lib/communication-api";

const PAGE_SIZE = 50;
const STATUS_OPTIONS = [
  { value: "", label: "Tümü" },
  { value: "PENDING", label: "Bekliyor" },
  { value: "SENDING", label: "Gönderiliyor" },
  { value: "FAILED", label: "Başarısız" },
  { value: "SENT", label: "İletildi" },
  { value: "DELIVERED", label: "Teslim edildi" },
  { value: "READ", label: "Okundu" },
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

export default function KuyrukClient() {
  const [items, setItems] = useState<OutboundQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [statusCounts, setStatusCounts] = useState({ pending: 0, sending: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchOutboundQueue({
        status: statusFilter || undefined,
        channel_config_id: accountFilter || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setStatusCounts(data.status_counts || { pending: 0, sending: 0, failed: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kuyruk yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, accountFilter, page]);

  useEffect(() => {
    fetchAccessibleWhatsAppAccounts()
      .then((res) => setAccounts(res.accounts || []))
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <CommunicationPageShell
      title="Mesaj Kuyruğu"
      subtitle="Gönderilmeyi bekleyen / başarısız WhatsApp mesajlarını izleyin"
      icon="🗂️"
      breadcrumbs={[{ label: "İletişim" }, { label: "Mesaj Kuyruğu" }]}
    >
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}

      <div className="comm-queue-status-pills">
        <span className="comm-queue-status-pill pending">Bekliyor: {statusCounts.pending}</span>
        <span className="comm-queue-status-pill sending">Gönderiliyor: {statusCounts.sending}</span>
        <span className="comm-queue-status-pill failed">Başarısız: {statusCounts.failed}</span>
      </div>

      <div className="comm-sablonlar-toolbar">
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={accountFilter}
            onChange={(e) => {
              setAccountFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tüm hesaplar</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name || acc.display_phone}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="comm-btn-secondary" onClick={load} disabled={loading}>
          Yenile
        </button>
      </div>

      {loading ? (
        <p style={{ color: "#667781" }}>Kuyruk yükleniyor…</p>
      ) : items.length === 0 ? (
        <div className="comm-card" style={{ textAlign: "center", padding: "2.5rem" }}>
          <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.75rem" }}>📭</span>
          <p style={{ color: "#667781", margin: 0 }}>Kuyrukta mesaj yok.</p>
        </div>
      ) : (
        <>
          <div className="comm-table-wrap">
            <table className="comm-table">
              <thead>
                <tr>
                  <th>Durum</th>
                  <th>Telefon</th>
                  <th>Kampanya</th>
                  <th>Hesap</th>
                  <th>Mesaj önizleme</th>
                  <th>Deneme</th>
                  <th>Hata</th>
                  <th>Oluşturulma</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className={`comm-status-badge ${statusClass(item.status)}`}>
                        {formatMessageStatus(item.status)}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{item.contact_phone || "—"}</td>
                    <td>
                      {item.campaign_id ? (
                        <Link
                          href={`/admin/iletisim/kampanyalar/${item.campaign_id}`}
                          style={{ color: "#128c7e", textDecoration: "none", fontWeight: 600 }}
                        >
                          {item.campaign_title || item.campaign_id.slice(0, 8)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{item.channel_config_name || "—"}</td>
                    <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.body_preview || "—"}
                    </td>
                    <td>{item.attempt_count}</td>
                    <td style={{ maxWidth: 220, color: item.last_error ? "#dc2626" : undefined }}>
                      {item.last_error || "—"}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {item.created_at ? new Date(item.created_at).toLocaleString("tr-TR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="comm-pagination">
            <span>
              Toplam {total.toLocaleString("tr-TR")} kayıt — Sayfa {page}/{totalPages}
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="comm-btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Önceki
              </button>
              <button
                type="button"
                className="comm-btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Sonraki
              </button>
            </div>
          </div>
        </>
      )}
    </CommunicationPageShell>
  );
}
