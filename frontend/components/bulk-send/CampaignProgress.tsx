"use client";

import type { CampaignItem } from "@/lib/communication-api";

/** Kampanya sayaçlarından segment yüzdeleri — toplam alıcıya göre. */
export function campaignSegments(c: CampaignItem) {
  const total = Math.max(1, c.total_recipients || 0);
  const read = c.read_count || 0;
  const delivered = Math.max(0, (c.delivered_count || 0) - read);
  const sent = Math.max(0, (c.sent_count || 0) - (c.delivered_count || 0));
  const failed = c.failed_count || 0;
  const done = read + delivered + sent + failed;
  const pending = Math.max(0, (c.total_recipients || 0) - done);
  const pct = (n: number) => `${Math.min(100, (n / total) * 100)}%`;
  return { total: c.total_recipients || 0, read, delivered, sent, failed, pending, pct };
}

export function CampaignStatBoard({ campaign, live = false }: { campaign: CampaignItem; live?: boolean }) {
  const total = campaign.total_recipients || 0;
  const denom = Math.max(1, total);
  const replied = campaign.replied_count ?? 0;
  const rows: Array<{ label: string; value: number; color: string; ofTotal: boolean }> = [
    { label: "Alıcı", value: total, color: "#334155", ofTotal: false },
    { label: "Gönderildi", value: campaign.sent_count || 0, color: "#3b82f6", ofTotal: true },
    { label: "İletildi", value: campaign.delivered_count || 0, color: "#2563eb", ofTotal: true },
    { label: "Okundu", value: campaign.read_count || 0, color: "#0e7490", ofTotal: true },
    { label: "Başarısız", value: campaign.failed_count || 0, color: "#ef4444", ofTotal: true },
    { label: "Yanıt", value: replied, color: "#7c3aed", ofTotal: true },
  ];
  return (
    <div className={`bs-statboard${live ? " is-live" : ""}`}>
      <div className="bs-statboard-head">
        <CampaignSegmentBar campaign={campaign} legend />
        {live && <span className="bs-live-dot">Canlı</span>}
      </div>
      <div className="bs-progress-kpis">
        {rows.map((row) => {
          const width = row.ofTotal ? Math.min(100, (row.value / denom) * 100) : (total ? 100 : 0);
          return (
            <div className="bs-kpi" key={row.label}>
              <b key={row.value}>{row.value.toLocaleString("tr-TR")}</b>
              <span>{row.label}</span>
              <div className="bs-kpi-meter" aria-hidden>
                <i style={{ width: `${width}%`, background: row.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CampaignSegmentBar({ campaign, legend = false }: { campaign: CampaignItem; legend?: boolean }) {
  const s = campaignSegments(campaign);
  const label = `${s.read} okundu, ${s.delivered} iletildi, ${s.sent} gönderildi, ${s.failed} başarısız, ${s.pending} bekliyor`;
  return (
    <div>
      <div className="bs-seg" role="img" aria-label={label} title={label}>
        <i className="s-read" style={{ width: s.pct(s.read) }} />
        <i className="s-delivered" style={{ width: s.pct(s.delivered) }} />
        <i className="s-sent" style={{ width: s.pct(s.sent) }} />
        <i className="s-failed" style={{ width: s.pct(s.failed) }} />
      </div>
      {legend && (
        <div className="bs-seg-legend">
          <span><i style={{ background: "#0e7490" }} />Okundu {s.read}</span>
          <span><i style={{ background: "#2563eb" }} />İletildi {s.delivered}</span>
          <span><i style={{ background: "#93c5fd" }} />Gönderildi {s.sent}</span>
          <span><i style={{ background: "#ef4444" }} />Başarısız {s.failed}</span>
          <span><i style={{ background: "#e2e8f0" }} />Bekliyor {s.pending}</span>
        </div>
      )}
    </div>
  );
}

const STATUS_TONE: Record<string, { tone: string; label: string; live?: boolean }> = {
  DRAFT: { tone: "tone-muted", label: "Taslak" },
  CONFIRMED: { tone: "tone-blue", label: "Kuyruğa alınıyor", live: true },
  QUEUED: { tone: "tone-blue", label: "Kuyrukta", live: true },
  PROCESSING: { tone: "tone-blue", label: "Gönderiliyor", live: true },
  COMPLETED: { tone: "tone-ok", label: "Tamamlandı" },
  PARTIAL: { tone: "tone-warn", label: "Kısmi" },
  CANCELLED: { tone: "tone-muted", label: "İptal" },
  FAILED: { tone: "tone-bad", label: "Başarısız" },
};

export function CampaignStatusBadge({ status }: { status: string }) {
  const meta = STATUS_TONE[status] || { tone: "tone-muted", label: status };
  return <span className={`bs-badge ${meta.tone}${meta.live ? " is-live" : ""}`}>{meta.label}</span>;
}

const MSG_TONE: Record<string, { tone: string; label: string }> = {
  PENDING: { tone: "tone-muted", label: "Bekliyor" },
  SENDING: { tone: "tone-blue", label: "Gönderiliyor" },
  SENT: { tone: "tone-blue", label: "Gönderildi" },
  DELIVERED: { tone: "tone-ok", label: "İletildi" },
  READ: { tone: "tone-read", label: "Okundu" },
  FAILED: { tone: "tone-bad", label: "Başarısız" },
  CANCELLED: { tone: "tone-muted", label: "İptal" },
};

export function MessageStatusBadge({ status }: { status: string }) {
  const meta = MSG_TONE[status] || { tone: "tone-muted", label: status };
  return <span className={`bs-badge ${meta.tone}`}>{meta.label}</span>;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(value?: string | null): string {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.round(h / 24);
  return d === 1 ? "dün" : `${d} gün önce`;
}
