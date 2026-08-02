"use client";

import { useEffect, useState } from "react";
import CommunicationPageShell from "@/components/communication/CommunicationPageShell";
import "@/components/communication/communication.css";
import {
  CommunicationDashboardData,
  fetchCommunicationDashboard,
} from "@/lib/communication-api";

export default function IletisimPanelPage() {
  const [data, setData] = useState<CommunicationDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCommunicationDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Yüklenemedi"));
  }, []);

  return (
    <CommunicationPageShell
      title="İletişim Paneli"
      subtitle="Aktif sohbetler, SLA ve koç performans özeti"
    >
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}
      {!data && !error && <p>Yükleniyor…</p>}
      {data && (
        <>
          <div className="comm-dash-grid">
            <div className="comm-dash-card">
              <div className="label">Aktif sohbet</div>
              <div className="value">{data.active_conversations}</div>
            </div>
            <div className="comm-dash-card">
              <div className="label">Bekleyen</div>
              <div className="value">{data.waiting_conversations}</div>
            </div>
            <div className="comm-dash-card">
              <div className="label">SLA ihlali</div>
              <div className="value" style={{ color: "#b91c1c" }}>{data.sla_breaches}</div>
            </div>
            <div className="comm-dash-card">
              <div className="label">Bugün gelen</div>
              <div className="value">{data.daily_inbound}</div>
            </div>
            <div className="comm-dash-card">
              <div className="label">Bugün cevaplanan</div>
              <div className="value">{data.daily_outbound}</div>
            </div>
            <div className="comm-dash-card">
              <div className="label">Cevapsız</div>
              <div className="value">{data.unanswered_messages}</div>
            </div>
          </div>

          <div className="comm-dash-card" style={{ marginBottom: 16 }}>
            <div className="label">Koç başına aktif sohbet</div>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13 }}>
              {(data.by_coach_active || []).length === 0 && <li>Veri yok</li>}
              {(data.by_coach_active || []).map((row) => (
                <li key={row.assigned_coach_id}>
                  Koç #{row.assigned_coach_id}: <strong>{row.count}</strong>
                </li>
              ))}
            </ul>
          </div>

          <div className="comm-dash-card" style={{ marginBottom: 16 }}>
            <div className="label">Koç başına ortalama cevap süresi</div>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13 }}>
              {(data.by_coach_reply_time || []).length === 0 && <li>Veri yok</li>}
              {(data.by_coach_reply_time || []).map((row) => (
                <li key={row.assigned_coach_id}>
                  Koç #{row.assigned_coach_id}:{" "}
                  <strong>
                    {row.avg_reply_seconds != null
                      ? `${Math.round(row.avg_reply_seconds / 60)} dk`
                      : "—"}
                  </strong>{" "}
                  ({row.sample_count} örnek)
                </li>
              ))}
            </ul>
          </div>

          <div className="comm-dash-card">
            <div className="label">En yoğun saatler (son 7 gün, inbound)</div>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13 }}>
              {(data.busy_hours || [])
                .slice()
                .sort((a, b) => b.count - a.count)
                .slice(0, 8)
                .map((h) => (
                  <li key={h.hour}>
                    {String(h.hour).padStart(2, "0")}:00 — <strong>{h.count}</strong> mesaj
                  </li>
                ))}
            </ul>
          </div>
        </>
      )}
    </CommunicationPageShell>
  );
}
