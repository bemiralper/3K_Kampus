"use client";

import Link from "next/link";
import {
  type AttendanceNotifyConfig,
  type AttendanceNotifyEventType,
  type AttendanceNotifyStatusResponse,
  type NotifyDeliveryStatus,
} from "@/lib/kutuphane-api";
import "./yoklama-notify.css";

const EVENT_META: Record<
  AttendanceNotifyEventType,
  { title: string; className: string; category: string; templateKey: keyof AttendanceNotifyConfig }
> = {
  ABSENT: { title: "Gelmedi", className: "absent", category: "yoklama_gelmedi", templateKey: "absent_template" },
  LATE: { title: "Geç kalma", className: "late", category: "yoklama_gec", templateKey: "late_template" },
  EXIT: { title: "Çıkış", className: "exit", category: "yoklama_cikis", templateKey: "exit_template" },
};

const DELIVERY_LABELS: Record<NotifyDeliveryStatus, string> = {
  none: "",
  pending: "bekliyor",
  sent: "iletildi",
};

function formatSentAt(iso: string): string {
  if (!iso) return "";
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

interface AttendanceNotifyPanelProps {
  status: AttendanceNotifyStatusResponse | null;
  config: AttendanceNotifyConfig | null;
  templatesBasePath?: string;
  onNotify: (event: AttendanceNotifyEventType) => void;
  onOpenSettings?: () => void;
}

export default function AttendanceNotifyPanel({
  status,
  config,
  templatesBasePath = "/admin/iletisim/sablonlar",
  onNotify,
  onOpenSettings,
}: AttendanceNotifyPanelProps) {
  const events: AttendanceNotifyEventType[] = ["ABSENT", "LATE", "EXIT"];
  const recentSends = status?.recent_sends ?? [];
  const totalSent = events.reduce((acc, e) => acc + (status?.summary?.[e]?.sent ?? 0), 0);
  const totalPending = events.reduce((acc, e) => acc + (status?.summary?.[e]?.pending ?? 0), 0);

  return (
    <div className="yok-notify-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Veli bildirimleri</h4>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
            Yoklama kaydetmek tek başına mesaj göndermez. Aşağıdaki butonlarla veliye WhatsApp iletin.
          </p>
        </div>
        {onOpenSettings && (
          <button type="button" className="yok-notify-btn ghost" onClick={onOpenSettings}>
            ⚙️ Şablon ayarları
          </button>
        )}
      </div>

      <div className="yok-notify-info-box">
        <strong>Önemli:</strong> Kaydet = yoklama durumu kaydı. Mesaj gitmesi için{" "}
        <em>Gelmedi bildir</em> veya kayıt sonrası <em>Önizle ve gönder</em> adımını tamamlamanız gerekir.
      </div>

      {totalPending > 0 && totalSent === 0 && (
        <div className="yok-notify-warn-box">
          {totalPending} veli bildirimi <strong>henüz gönderilmedi</strong> (bekliyor).
        </div>
      )}

      {totalSent > 0 && totalPending === 0 && (
        <div className="yok-notify-success-box">
          Bu oturumdaki tüm bekleyen bildirimler gönderildi ({totalSent} öğrenci).
        </div>
      )}

      {totalSent > 0 && totalPending > 0 && (
        <div className="yok-notify-warn-box">
          {totalSent} öğrenci için iletildi, {totalPending} öğrenci için hâlâ bekliyor.
        </div>
      )}

      {!config?.is_active && (
        <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c", fontSize: 12 }}>
          Yoklama bildirimleri bu kurumda kapalı. Ayarlardan etkinleştirebilirsiniz.
        </div>
      )}

      <div className="yok-notify-stats">
        {events.map((event) => {
          const meta = EVENT_META[event];
          const s = status?.summary?.[event];
          return (
            <div key={event} className={`yok-notify-stat-card ${meta.className}`}>
              <h4>{meta.title}</h4>
              <div className="count">{s?.pending ?? 0}</div>
              <div className="meta">
                bekleyen · {s?.sent ?? 0} iletildi · {s?.eligible ?? 0} uygun
              </div>
            </div>
          );
        })}
      </div>

      {events.map((event) => {
        const meta = EVENT_META[event];
        const tpl = config?.[meta.templateKey] as { name?: string; body?: string } | null | undefined;
        const pending = status?.summary?.[event]?.pending ?? 0;
        const sent = status?.summary?.[event]?.sent ?? 0;

        return (
          <div key={`tpl-${event}`} className="yok-notify-template-card">
            <div className="yok-notify-template-head">
              <strong>{meta.title} şablonu</strong>
              <Link
                href={`${templatesBasePath}?category=${meta.category}`}
                className="yok-notify-btn secondary"
                style={{ textDecoration: "none", padding: "6px 10px", fontSize: 12 }}
              >
                Şablonu düzenle
              </Link>
            </div>
            <div className="yok-notify-template-body">
              {tpl?.body || "Varsayılan şablon kullanılacak (ilk gönderimde otomatik oluşturulur)."}
            </div>
            <div className="yok-notify-actions">
              <button
                type="button"
                className="yok-notify-btn primary"
                disabled={!config?.is_active || pending === 0}
                onClick={() => onNotify(event)}
              >
                {pending > 0
                  ? `${meta.title} bildir — ${pending} bekliyor`
                  : sent > 0
                    ? `${meta.title} — tümü iletildi`
                    : `${meta.title} — gönderilecek yok`}
              </button>
            </div>
          </div>
        );
      })}

      {recentSends.length > 0 && (
        <div className="yok-notify-template-card">
          <div className="yok-notify-template-head">
            <strong>Son gönderimler</strong>
            <span style={{ fontSize: 11, color: "#64748b" }}>Bu oturum</span>
          </div>
          <div className="yok-notify-recent-list">
            {recentSends.map((item, idx) => (
              <div key={`${item.ogrenci_id}-${item.event_type}-${idx}`} className="yok-notify-recent-row">
                <span className="yok-notify-recent-time">{formatSentAt(item.sent_at)}</span>
                <span className="yok-notify-recent-student">{item.ogrenci_ad}</span>
                <span className="yok-notify-recent-event">{item.event_label}</span>
                <span className="yok-notify-recent-veli">{item.veli_ad || "Veli"}</span>
                <span className="yok-notify-chip sent">iletildi ✓</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function NotificationStatusChips({
  ogrenciId,
  status,
}: {
  ogrenciId: number;
  status: AttendanceNotifyStatusResponse | null;
}) {
  const row = status?.by_ogrenci?.[String(ogrenciId)] ?? status?.by_ogrenci?.[ogrenciId];
  if (!row) return <span style={{ fontSize: 10, color: "#cbd5e1" }}>—</span>;

  const items: { key: AttendanceNotifyEventType; short: string; full: string }[] = [
    { key: "ABSENT", short: "Gelmedi", full: "Gelmedi" },
    { key: "LATE", short: "Geç", full: "Geç kalma" },
    { key: "EXIT", short: "Çıkış", full: "Çıkış" },
  ];

  const visible = items.filter(({ key }) => row[key] !== "none");
  if (visible.length === 0) {
    return <span style={{ fontSize: 10, color: "#cbd5e1" }}>—</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {visible.map(({ key, full }) => {
        const st = row[key] as NotifyDeliveryStatus;
        const label = DELIVERY_LABELS[st];
        return (
          <span
            key={key}
            className={`yok-notify-chip ${st}`}
            title={`${full}: ${label}`}
          >
            {full} · {label}
          </span>
        );
      })}
    </div>
  );
}

export function NotificationColumnLegend() {
  return (
    <span
      title="Gelmedi/Geç/Çıkış için bekliyor = henüz WhatsApp gönderilmedi. iletildi = veliye mesaj gitti."
      style={{ fontSize: 10, color: "#94a3b8", cursor: "help" }}
    >
      WhatsApp ⓘ
    </span>
  );
}
