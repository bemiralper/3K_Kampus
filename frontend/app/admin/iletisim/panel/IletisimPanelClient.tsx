"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import CommunicationPageShell from "@/components/communication/CommunicationPageShell";
import "@/components/communication/communication.css";
import {
  CommunicationDashboardData,
  fetchCommunicationDashboard,
} from "@/lib/communication-api";
import { AgingChart, DonutChart, HoursChart, TrendChart } from "./panel-charts";
import "./iletisim-panel.css";

const DEFAULT_REFRESH_MS = 20_000;

function deltaLabel(today: number, yesterday?: number): { text: string; tone: "up" | "down" | "" } {
  if (yesterday == null) return { text: "dünle karşılaştırma yok", tone: "" };
  const diff = today - yesterday;
  if (diff === 0) return { text: "dünle aynı", tone: "" };
  if (diff > 0) return { text: `düünden +${diff}`, tone: "up" };
  return { text: `düünden ${diff}`, tone: "down" };
}

function coachLabel(row: { coach_name?: string; assigned_coach_id: number }): string {
  return (row.coach_name || "").trim() || `Koç #${row.assigned_coach_id}`;
}

function formatClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function formatWhen(iso: string): string {
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

function minutesLabel(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds} sn`;
  return `${Math.round(seconds / 60)} dk`;
}

const SHORTCUTS = [
  { href: "/admin/iletisim/sohbetler", label: "Sohbetler", desc: "Gelen kutusu ve SLA kuyruğu" },
  { href: "/admin/iletisim/kuyruk", label: "Mesaj kuyruğu", desc: "Bekleyen / başarısız gönderimler" },
  { href: "/admin/iletisim/toplu-gonder", label: "Toplu gönder", desc: "Duyuru ve kampanya başlat" },
  { href: "/admin/iletisim/bildirim-sablonlari", label: "Bildirimler", desc: "Otomatik olay şablonları" },
];

export default function IletisimPanelClient() {
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
    const id = window.setInterval(() => void load(true), DEFAULT_REFRESH_MS);
    const onContext = () => void load(true);
    window.addEventListener("storage", onContext);
    window.addEventListener("3k-context-changed", onContext);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onContext);
      window.removeEventListener("3k-context-changed", onContext);
    };
  }, [load]);

  const inboundDelta = deltaLabel(data?.daily_inbound ?? 0, data?.yesterday_inbound);
  const outboundDelta = deltaLabel(data?.daily_outbound ?? 0, data?.yesterday_outbound);
  const coachLoadMax = useMemo(
    () => Math.max(1, ...(data?.by_coach_active || []).map((row) => row.count)),
    [data],
  );
  const replyMax = useMemo(
    () => Math.max(1, ...(data?.by_coach_reply_time || []).map((row) => row.avg_reply_seconds || 0)),
    [data],
  );

  return (
    <CommunicationPageShell
      title="İletişim Paneli"
      subtitle="Canlı sohbet, gönderim sağlığı ve hat performansı"
      maxWidth="full"
      actions={
        <div className="comm-dash-refresh">
          <span className="ipanel-live">
            <i className={`ipanel-dot${refreshing ? " is-busy" : ""}`} />
            {data?.generated_at
              ? `Canlı · ${formatClock(data.generated_at)}`
              : refreshing ? "Yenileniyor…" : "20 sn"}
          </span>
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
      {!data && !error && (
        <div className="ipanel">
          <div className="ipanel-kpis">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="ipanel-skel" />)}
          </div>
        </div>
      )}

      {data && (
        <div className="ipanel">
          {(data.alerts || []).length > 0 && (
            <div className="ipanel-alerts">
              {data.alerts!.map((alert) => (
                <Link key={alert.key} href={alert.href || "/admin/iletisim/sohbetler"} className={`ipanel-alert ${alert.tone}`}>
                  {alert.label}
                </Link>
              ))}
            </div>
          )}

          <div className="ipanel-kpis">
            <Link href="/admin/iletisim/sohbetler" className="ipanel-kpi" style={{ "--kpi-accent": "#0262a7" } as never}>
              <div className="ipanel-kpi-label">Aktif sohbet</div>
              <div className="ipanel-kpi-value">{data.active_conversations}</div>
              <div className="ipanel-kpi-meta">{data.unassigned_active || 0} atamasız</div>
            </Link>
            <Link href="/admin/iletisim/sohbetler" className="ipanel-kpi" style={{ "--kpi-accent": "#f59e0b" } as never}>
              <div className="ipanel-kpi-label">Bekleyen</div>
              <div className="ipanel-kpi-value">{data.waiting_conversations}</div>
              <div className="ipanel-kpi-meta">{data.unanswered_messages} cevapsız</div>
            </Link>
            <Link href="/admin/iletisim/sohbetler" className="ipanel-kpi" style={{ "--kpi-accent": "#be123c" } as never}>
              <div className="ipanel-kpi-label">SLA ihlali</div>
              <div className="ipanel-kpi-value">{data.sla_breaches}</div>
              <div className={`ipanel-kpi-meta${data.sla_breaches ? " hot" : ""}`}>30 dk cevap yoksa destek</div>
            </Link>
            <div className="ipanel-kpi" style={{ "--kpi-accent": "#0ea5e9" } as never}>
              <div className="ipanel-kpi-label">Bugün gelen</div>
              <div className="ipanel-kpi-value">{data.daily_inbound}</div>
              <div className={`ipanel-kpi-meta ${inboundDelta.tone}`}>{inboundDelta.text}</div>
            </div>
            <div className="ipanel-kpi" style={{ "--kpi-accent": "#10b981" } as never}>
              <div className="ipanel-kpi-label">Bugün giden</div>
              <div className="ipanel-kpi-value">{data.daily_outbound}</div>
              <div className={`ipanel-kpi-meta ${outboundDelta.tone}`}>{outboundDelta.text}</div>
            </div>
            <Link href="/admin/iletisim/kuyruk" className="ipanel-kpi" style={{ "--kpi-accent": "#8b5cf6" } as never}>
              <div className="ipanel-kpi-label">Kuyruk / hata</div>
              <div className="ipanel-kpi-value">
                {(data.queue?.pending || 0) + (data.queue?.sending || 0)}
              </div>
              <div className={`ipanel-kpi-meta${data.today_failed ? " hot" : ""}`}>
                {data.today_failed || 0} başarısız · {data.queue?.failed || 0} kuyruk hatası
              </div>
            </Link>
          </div>

          {(data.by_status || []).length > 0 && (
            <div className="ipanel-alerts">
              {data.by_status!.map((row) => (
                <span key={row.key} className="ipanel-alert info">{row.label}: {row.count}</span>
              ))}
            </div>
          )}

          <div className="ipanel-shortcuts">
            {SHORTCUTS.map((item) => (
              <Link key={item.href} href={item.href} className="ipanel-shortcut">
                <strong>{item.label}</strong>
                <span>{item.desc}</span>
              </Link>
            ))}
          </div>

          <div className="ipanel-grid">
            <section className="ipanel-card">
              <div className="ipanel-card-head">
                <div>
                  <h3>14 günlük trafik</h3>
                  <p>Gelen, giden ve başarısız gönderimler</p>
                </div>
              </div>
              <TrendChart data={data.daily_trend || []} />
            </section>
            <section className="ipanel-card">
              <div className="ipanel-card-head">
                <div>
                  <h3>Yoğun saatler</h3>
                  <p>Son 7 gün gelen mesajlar</p>
                </div>
              </div>
              <HoursChart data={data.busy_hours || []} />
            </section>
          </div>

          <div className="ipanel-grid-3">
            <section className="ipanel-card">
              <div className="ipanel-card-head">
                <div>
                  <h3>Departman</h3>
                  <p>Aktif sohbet kırılımı</p>
                </div>
              </div>
              <DonutChart data={data.by_department || []} emptyText="Aktif sohbet yok" centerLabel="sohbet" />
            </section>
            <section className="ipanel-card">
              <div className="ipanel-card-head">
                <div>
                  <h3>Bugünkü teslimat</h3>
                  <p>Giden mesaj durumları</p>
                </div>
                <Link href="/admin/iletisim/kuyruk" className="ipanel-link">Kuyruk</Link>
              </div>
              <DonutChart data={data.today_delivery || []} emptyText="Bugün giden mesaj yok" centerLabel="mesaj" />
            </section>
            <section className="ipanel-card">
              <div className="ipanel-card-head">
                <div>
                  <h3>Cevapsız bekleme</h3>
                  <p>İlk cevapsızdan bu yana</p>
                </div>
              </div>
              <AgingChart data={data.sla_aging || []} />
            </section>
          </div>

          <div className="ipanel-grid">
            <section className="ipanel-card">
              <div className="ipanel-card-head">
                <div>
                  <h3>Koç yükü ve cevap süresi</h3>
                  <p>Atanmış aktif sohbet ve ortalama yanıt</p>
                </div>
              </div>
              {(data.by_coach_active || []).length === 0 ? (
                <div className="ipanel-empty">
                  {data.active_conversations === 0
                    ? "Aktif sohbet yok."
                    : `${data.unassigned_active || 0} aktif sohbet var, henüz koça atanmamış.`}
                </div>
              ) : (
                <div className="ipanel-rank">
                  {data.by_coach_active.map((row) => {
                    const reply = data.by_coach_reply_time.find((item) => item.assigned_coach_id === row.assigned_coach_id);
                    return (
                      <div key={row.assigned_coach_id} className="ipanel-rank-row">
                        <div className="ipanel-rank-name">{coachLabel(row)}</div>
                        <div className="ipanel-rank-val">
                          {row.count} sohbet · {minutesLabel(reply?.avg_reply_seconds)}
                        </div>
                        <div className="ipanel-bar">
                          <span style={{ width: `${Math.round((row.count / coachLoadMax) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {(data.by_coach_reply_time || []).length > 0 && (data.by_coach_active || []).length === 0 && (
                <div className="ipanel-rank" style={{ marginTop: 12 }}>
                  {data.by_coach_reply_time.map((row) => (
                    <div key={row.assigned_coach_id} className="ipanel-rank-row">
                      <div className="ipanel-rank-name">{coachLabel(row)}</div>
                      <div className="ipanel-rank-val">{minutesLabel(row.avg_reply_seconds)}</div>
                      <div className="ipanel-bar">
                        <span style={{ width: `${Math.round(((row.avg_reply_seconds || 0) / replyMax) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="ipanel-card">
              <div className="ipanel-card-head">
                <div>
                  <h3>Son başarısız gönderimler</h3>
                  <p>Meta / kuyruk hataları anlık görünür</p>
                </div>
                <Link href="/admin/iletisim/kuyruk?status=FAILED" className="ipanel-link">Tümü</Link>
              </div>
              {(data.recent_failures || []).length === 0 ? (
                <div className="ipanel-empty">Son dönemde başarısız gönderim yok</div>
              ) : (
                <div className="ipanel-fail">
                  {data.recent_failures!.map((item) => (
                    <div key={item.id} className="ipanel-fail-item">
                      <strong>{item.contact_name || "Alıcı"} · {item.source_label}</strong>
                      <span>{item.reason}</span>
                      <em>{formatWhen(item.at)}</em>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="ipanel-grid">
            <section className="ipanel-card">
              <div className="ipanel-card-head">
                <div>
                  <h3>WhatsApp hatları</h3>
                  <p>Bugünkü giden hacim ve hat durumu</p>
                </div>
                <Link href="/admin/iletisim/whatsapp-hesaplari" className="ipanel-link">Hesaplar</Link>
              </div>
              {(data.accounts || []).length === 0 ? (
                <div className="ipanel-empty">Tanımlı WhatsApp hesabı yok</div>
              ) : (
                <div className="ipanel-accounts">
                  {data.accounts!.map((acc) => (
                    <div key={acc.id} className="ipanel-account">
                      <div>
                        <b>{acc.name}</b>
                        <small>{acc.display_phone || acc.department_label} · bugün {acc.today_outbound}</small>
                      </div>
                      <span className={`ipanel-pill ${acc.is_active ? "on" : "off"}`}>
                        {acc.is_active ? "Aktif" : "Pasif"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="ipanel-card">
              <div className="ipanel-card-head">
                <div>
                  <h3>Kaynak ve kişi tipi</h3>
                  <p>Son 7 gün giden + aktif sohbet kişileri</p>
                </div>
                <Link href="/admin/iletisim/kampanyalar" className="ipanel-link">
                  {data.campaigns?.active || 0} aktif kampanya
                </Link>
              </div>
              <DonutChart data={data.by_source || []} emptyText="Modül kaynağı yok" centerLabel="giden" />
              {(data.by_contact_type || []).length > 0 && (
                <ul className="ipanel-legend" style={{ marginTop: 16 }}>
                  {data.by_contact_type!.map((row) => (
                    <li key={row.key}>{row.label}: <strong>{row.count}</strong></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </CommunicationPageShell>
  );
}
