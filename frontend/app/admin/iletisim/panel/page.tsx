"use client";

import { useCallback, useEffect, useState } from "react";
import CommunicationPageShell from "@/components/communication/CommunicationPageShell";
import "@/components/communication/communication.css";
import {
  CommunicationDashboardData,
  fetchCommunicationDashboard,
} from "@/lib/communication-api";

const REFRESH_MS = 30_000;

function coachLabel(row: { coach_name?: string; assigned_coach_id: number }): string {
  return (row.coach_name || "").trim() || `Koç #${row.assigned_coach_id}`;
}

function formatGeneratedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function IletisimPanelPage() {
  const [data, setData] = useState<CommunicationDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const next = await fetchCommunicationDashboard();
      setData(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(true), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const unassigned = data?.unassigned_active ?? 0;
  const active = data?.active_conversations ?? 0;

  return (
    <CommunicationPageShell
      title="İletişim Paneli"
      subtitle="Aktif sohbetler, SLA ve koç performans özeti"
      actions={
        <div className="comm-dash-refresh">
          {data?.generated_at && (
            <span className="comm-dash-refresh-meta">
              Son güncelleme: {formatGeneratedAt(data.generated_at)}
              {refreshing ? " · yenileniyor…" : " · 30 sn"}
            </span>
          )}
          <button
            type="button"
            className="comm-btn-secondary"
            onClick={() => void load()}
            disabled={refreshing}
          >
            Yenile
          </button>
        </div>
      }
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
              <p className="comm-dash-hint">
                Koça atanmış sohbette 30 dk cevap yoksa Destek Gerekiyor
              </p>
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
            {(data.by_coach_active || []).length === 0 ? (
              <p className="comm-dash-empty">
                {active === 0
                  ? "Aktif sohbet yok."
                  : unassigned > 0
                    ? `${unassigned} aktif sohbet var ancak hiçbiri koça atanmamış. Bu liste yalnızca atanan koçların sohbetlerini gösterir.`
                    : "Koça atanmış aktif sohbet yok."}
              </p>
            ) : (
              <ul className="comm-dash-list">
                {(data.by_coach_active || []).map((row) => (
                  <li key={row.assigned_coach_id}>
                    {coachLabel(row)}: <strong>{row.count}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="comm-dash-card" style={{ marginBottom: 16 }}>
            <div className="label">Koç başına ortalama cevap süresi</div>
            {(data.by_coach_reply_time || []).length === 0 ? (
              <p className="comm-dash-empty">
                Ölçüm için koça atanmış ve hem gelen hem giden mesaj zamanı kayıtlı sohbet gerekir.
                {unassigned > 0
                  ? ` Şu an ${unassigned} aktif sohbet atamasız.`
                  : ""}
              </p>
            ) : (
              <ul className="comm-dash-list">
                {(data.by_coach_reply_time || []).map((row) => (
                  <li key={row.assigned_coach_id}>
                    {coachLabel(row)}:{" "}
                    <strong>
                      {row.avg_reply_seconds != null
                        ? `${Math.round(row.avg_reply_seconds / 60)} dk`
                        : "—"}
                    </strong>{" "}
                    ({row.sample_count} örnek)
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="comm-dash-card">
            <div className="label">En yoğun saatler (son 7 gün, inbound)</div>
            {(data.busy_hours || []).length === 0 ? (
              <p className="comm-dash-empty">
                Son 7 günde gelen (inbound) mesaj kaydı yok — yoğun saat dağılımı oluşmadı.
              </p>
            ) : (
              <ul className="comm-dash-list">
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
            )}
          </div>
        </>
      )}
    </CommunicationPageShell>
  );
}
