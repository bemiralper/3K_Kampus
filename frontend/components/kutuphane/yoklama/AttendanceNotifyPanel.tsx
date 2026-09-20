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
  {
    title: string;
    className: string;
    category: string;
    eventKey: string;
    templateKey: keyof AttendanceNotifyConfig;
  }
> = {
  ABSENT: { title: "Gelmedi", className: "absent", category: "yoklama_gelmedi", eventKey: "yoklama.gelmedi", templateKey: "absent_template" },
  LATE: { title: "Geç kalma", className: "late", category: "yoklama_gec", eventKey: "yoklama.gec", templateKey: "late_template" },
  EXIT: { title: "Çıkış", className: "exit", category: "yoklama_cikis", eventKey: "yoklama.cikis", templateKey: "exit_template" },
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

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.06c-.24.68-1.4 1.3-1.94 1.38-.5.07-1.12.1-1.81-.11-.42-.13-.95-.31-1.64-.6-2.88-1.24-4.76-4.15-4.9-4.34-.14-.19-1.17-1.56-1.17-2.97 0-1.41.74-2.1 1-2.39.26-.29.57-.36.76-.36l.55.01c.18.01.41-.07.64.49.24.57.81 1.98.88 2.12.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.29.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.69-.8.88-1.08.19-.28.37-.23.63-.14.26.1 1.65.78 1.93.92.28.14.47.21.54.33.07.11.07.66-.17 1.34z" />
    </svg>
  );
}

export default function AttendanceNotifyPanel({
  status,
  config,
  templatesBasePath = "/admin/iletisim/bildirim-sablonlari",
  onNotify,
  onOpenSettings,
}: AttendanceNotifyPanelProps) {
  const events: AttendanceNotifyEventType[] = ["ABSENT", "LATE", "EXIT"];
  const recentSends = status?.recent_sends ?? [];
  const totalSent = events.reduce((acc, e) => acc + (status?.summary?.[e]?.sent ?? 0), 0);
  const totalPending = events.reduce((acc, e) => acc + (status?.summary?.[e]?.pending ?? 0), 0);
  const active = Boolean(config?.is_active);

  return (
    <div className="ycn">
      <header className="ycn-head">
        <div>
          <h3>Veli bildirimleri</h3>
          <p>WhatsApp mesajları yalnızca <b>Gönder</b> ile iletilir. Yoklamayı kaydetmek mesaj göndermez.</p>
        </div>
        {onOpenSettings && (
          <button type="button" className="ycn-settings" onClick={onOpenSettings}>
            Şablon ayarları
          </button>
        )}
      </header>

      <div className="ycn-summary">
        <div className={`ycn-sum${totalPending > 0 ? " is-warn" : ""}`}>
          <b>{totalPending}</b>
          <span>Bekleyen</span>
        </div>
        <div className={`ycn-sum${totalSent > 0 ? " is-good" : ""}`}>
          <b>{totalSent}</b>
          <span>İletildi</span>
        </div>
      </div>

      {!active && (
        <div className="ycn-banner is-off">
          Yoklama bildirimleri bu kurumda kapalı. Şablon ayarlarından etkinleştirin.
        </div>
      )}

      <div className="ycn-cards">
        {events.map((event) => {
          const meta = EVENT_META[event];
          const tpl = config?.[meta.templateKey] as { name?: string; body?: string } | null | undefined;
          const s = status?.summary?.[event];
          const pending = s?.pending ?? 0;
          const sent = s?.sent ?? 0;
          const eligible = s?.eligible ?? 0;
          const canSend = active && pending > 0;

          return (
            <article key={event} className={`ycn-card is-${meta.className}`}>
              <div className="ycn-card-top">
                <span className="ycn-tag">{meta.title}</span>
                <Link
                  href={`${templatesBasePath}?event=${encodeURIComponent(meta.eventKey)}`}
                  className="ycn-edit"
                >
                  Şablonu düzenle
                </Link>
              </div>

              <div className="ycn-nums">
                <span className="ycn-num is-pending"><b>{pending}</b> bekliyor</span>
                <span className="ycn-num is-sent"><b>{sent}</b> iletildi</span>
                <span className="ycn-num"><b>{eligible}</b> uygun</span>
              </div>

              <p className="ycn-tpl">
                {tpl?.body || "Varsayılan şablon kullanılacak (ilk gönderimde otomatik oluşturulur)."}
              </p>

              <button
                type="button"
                className="ycn-send"
                disabled={!canSend}
                onClick={() => onNotify(event)}
              >
                <WhatsAppIcon />
                {pending > 0
                  ? `Gönder · ${pending} veli`
                  : sent > 0
                    ? "Tümü iletildi"
                    : "Gönderilecek yok"}
              </button>
            </article>
          );
        })}
      </div>

      {recentSends.length > 0 && (
        <section className="ycn-recent">
          <h4>Son gönderimler</h4>
          <ul>
            {recentSends.map((item, idx) => (
              <li key={`${item.ogrenci_id}-${item.event_type}-${idx}`}>
                <span className="ycn-recent-time">{formatSentAt(item.sent_at)}</span>
                <span className="ycn-recent-name">{item.ogrenci_ad}</span>
                <span className="ycn-recent-event">{item.event_label}</span>
                <span className="ycn-recent-veli">{item.veli_ad || "Veli"}</span>
                <span className="ycn-recent-ok">iletildi</span>
              </li>
            ))}
          </ul>
        </section>
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
