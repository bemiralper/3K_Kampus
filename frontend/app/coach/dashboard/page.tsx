"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  fetchAssignments,
  fetchKontrolBadge,
  type ManualAssignment,
} from "@/lib/resources-api";
import { fetchGorevDashboardOzet, type GorevDashboardOzet } from "@/lib/gorev-api";
import { fetchCoachStudents, type CoachPortalStudent } from "@/lib/coach-api";
import { pruneCoachPrefsToStudentIds, type CoachRecentVisit } from "@/lib/coach-students-prefs";

function greetingFor(name?: string | null): string {
  const hour = new Date().getHours();
  const part =
    hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar";
  return name ? `${part}, ${name}` : part;
}

export default function CoachDashboardPage() {
  const { user } = useAuth();
  const greeting = greetingFor(user?.first_name);
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueItems, setOverdueItems] = useState<ManualAssignment[]>([]);
  const [dueTodayCount, setDueTodayCount] = useState(0);
  const [gorevOzet, setGorevOzet] = useState<GorevDashboardOzet | null>(null);
  const [students, setStudents] = useState<CoachPortalStudent[]>([]);
  const [recentVisits, setRecentVisits] = useState<CoachRecentVisit[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [kontrolRes, gorevRes, studentsRes, overdueRes] = await Promise.all([
      fetchKontrolBadge(),
      fetchGorevDashboardOzet(),
      fetchCoachStudents(),
      fetchAssignments({ status: "OVERDUE" }),
    ]);
    if (kontrolRes.success && kontrolRes.data) {
      setOverdueCount(kontrolRes.data.overdue ?? 0);
      setDueTodayCount(kontrolRes.data.due_today ?? kontrolRes.data.count ?? 0);
    }
    if (gorevRes.success && gorevRes.data) {
      setGorevOzet(gorevRes.data);
    }
    if (overdueRes.success && overdueRes.data) {
      const raw = overdueRes.data as unknown;
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { results?: ManualAssignment[] })?.results)
          ? (raw as { results: ManualAssignment[] }).results
          : [];
      setOverdueItems(list.slice(0, 5));
      if (list.length > 0) {
        setOverdueCount((prev) => Math.max(prev, list.length));
      }
    } else {
      setOverdueItems([]);
    }
    const nextStudents =
      studentsRes.success && studentsRes.data ? studentsRes.data : [];
    setStudents(nextStudents);
    if (user?.id) {
      // Eski atamalardan kalan ziyaret geçmişini (localStorage) temizle
      const { recent } = pruneCoachPrefsToStudentIds(
        user.id,
        nextStudents.map((s) => s.id)
      );
      setRecentVisits(recent);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const riskStudents = useMemo(
    () =>
      students
        .filter((s) => s.risk_seviyesi === "high" || s.risk_seviyesi === "medium")
        .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
        .slice(0, 5),
    [students]
  );

  const meetingTodayStudents = useMemo(
    () => students.filter((s) => (s.meeting_today_count ?? 0) > 0).slice(0, 5),
    [students]
  );

  const meetingTodayCount = useMemo(
    () =>
      students.reduce((sum, s) => sum + (s.meeting_today_count ?? 0), 0) ||
      (gorevOzet?.tip_sayaclari?.OGRENCI_GORUSME ?? 0) +
        (gorevOzet?.tip_sayaclari?.HAFTALIK_GORUSME ?? 0),
    [students, gorevOzet]
  );

  const needsMeetingCount = useMemo(
    () => students.filter((s) => s.needs_meeting).length,
    [students]
  );

  return (
    <div>
      <section className="coach-hero">
        <p className="coach-hero-kicker">Koç Portalı</p>
        <h2 className="coach-hero-title">{greeting}</h2>
        <p className="coach-hero-sub">Günlük özet ve bekleyen işleriniz</p>
        <div className="coach-hero-stats">
          <Link href="/coach/gorevler" className="coach-hero-stat" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="coach-hero-stat-value">{gorevOzet?.bugun ?? 0}</div>
            <div className="coach-hero-stat-label">Bugün görev</div>
          </Link>
          <Link href="/coach/gorevler?tab=geciken" className="coach-hero-stat" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="coach-hero-stat-value" style={(gorevOzet?.geciken ?? 0) > 0 ? { color: "#dc2626" } : undefined}>
              {gorevOzet?.geciken ?? 0}
            </div>
            <div className="coach-hero-stat-label">Geciken görev</div>
          </Link>
          <Link href="/coach/gorusmeler" className="coach-hero-stat" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="coach-hero-stat-value">{meetingTodayCount}</div>
            <div className="coach-hero-stat-label">Bugün görüşme</div>
          </Link>
        </div>
      </section>

      <header className="coach-page-header">
        <div className="coach-page-header-text">
          <h2>Özet</h2>
          <p>Atanmış öğrencileriniz ve günlük takip alanları</p>
        </div>
      </header>

      {loading && <div className="coach-loading">Özet yükleniyor…</div>}

      <div className="coach-dashboard-grid">
        <section className="coach-widget">
          <div className="coach-widget-header">
            <h3 className="coach-widget-title">
              <span aria-hidden>⚠️</span> Riskli Öğrenciler
            </h3>
            <Link href="/coach/ogrenciler?filter=risk" className="coach-link-btn">
              Tümü →
            </Link>
          </div>
          <p className="coach-widget-empty" style={{ marginBottom: 8, fontSize: 12 }}>
            Risk: uzun süre görüşme/etkinlik yokluğu, bekleyen iş yükü ve iptal zinciri skorlanır (orta/yüksek).
          </p>
          {riskStudents.length === 0 ? (
            <p className="coach-widget-empty">
              {needsMeetingCount > 0
                ? `${needsMeetingCount} öğrencide ödev takibi gecikti (risk skoru düşük).`
                : "Takip edilecek risk öğrencisi bulunmuyor."}
            </p>
          ) : (
            <ul className="coach-widget-list">
              {riskStudents.map((s) => (
                <li key={s.id}>
                  <Link href={`/coach/ogrenciler/${s.id}`} className="coach-placeholder-item" style={{ textDecoration: "none", color: "inherit" }}>
                    <span className="coach-placeholder-dot" />
                    {s.tam_ad}
                    {s.risk_seviyesi ? ` · ${s.risk_seviyesi === "high" ? "Yüksek" : "Orta"}` : ""}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="coach-widget">
          <div className="coach-widget-header">
            <h3 className="coach-widget-title">
              <span aria-hidden>📋</span> Geciken Ödevler
              {overdueCount > 0 ? ` (${overdueCount})` : ""}
            </h3>
            {overdueCount > 0 && (
              <Link href="/coach/odev/kontrol?status=OVERDUE" className="coach-link-btn">
                Tümü →
              </Link>
            )}
          </div>
          {overdueItems.length === 0 ? (
            <p className="coach-widget-empty">Kontrol bekleyen geciken ödev yok.</p>
          ) : (
            <ul className="coach-widget-list">
              {overdueItems.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/coach/odev/kontrol/${a.id}`}
                    className="coach-placeholder-item"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <span className="coach-placeholder-dot" />
                    <span>
                      <strong>{a.student_name || `Öğrenci #${a.student}`}</strong>
                      {a.title ? ` · ${a.title}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {overdueCount > 5 && (
            <div style={{ marginTop: 10 }}>
              <Link href="/coach/odev/kontrol?status=OVERDUE" className="coach-link-btn">
                Tümünü gör ({overdueCount}) →
              </Link>
            </div>
          )}
        </section>

        <section className="coach-widget">
          <div className="coach-widget-header">
            <h3 className="coach-widget-title">
              <span aria-hidden>✅</span> Bugünkü Görevler
            </h3>
            <Link href="/coach/odev/kontrol" className="coach-link-btn">
              Ödev kontrol →
            </Link>
          </div>
          <ul className="coach-widget-list">
            <li>
              <Link
                href={dueTodayCount > 0 ? "/coach/odev/kontrol" : "/coach/gorevler"}
                className="coach-placeholder-item"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <span className="coach-placeholder-dot" />
                {dueTodayCount} ödev kontrolü (bugün)
                {(gorevOzet?.bugun ?? 0) > 0 ? ` · ${gorevOzet?.bugun} görev` : ""}
                {(gorevOzet?.tip_sayaclari?.VELI_GORUSME ?? 0) > 0
                  ? ` · ${gorevOzet?.tip_sayaclari?.VELI_GORUSME} veli araması`
                  : ""}
              </Link>
            </li>
          </ul>
          {dueTodayCount === 0 && (gorevOzet?.bugun ?? 0) === 0 && (
            <p className="coach-widget-empty" style={{ marginTop: 8 }}>
              Bugün kontrol günü gelen ödev veya atanmış görev yok.
            </p>
          )}
        </section>

        <section className="coach-widget">
          <div className="coach-widget-header">
            <h3 className="coach-widget-title">
              <span aria-hidden>🎯</span> Bugünkü Görüşmeler
            </h3>
            <Link href="/coach/gorusmeler" className="coach-link-btn">
              Görüşmeler →
            </Link>
          </div>
          {meetingTodayStudents.length === 0 ? (
            <p className="coach-widget-empty">
              {meetingTodayCount > 0
                ? `Bugün ${meetingTodayCount} görüşme planlanmış.`
                : "Bugün planlanmış görüşme bulunmuyor."}
            </p>
          ) : (
            <ul className="coach-widget-list">
              {meetingTodayStudents.map((s) => (
                <li key={s.id}>
                  <Link href={`/coach/ogrenciler/${s.id}?tab=gorusmeler`} className="coach-placeholder-item" style={{ textDecoration: "none", color: "inherit" }}>
                    <span className="coach-placeholder-dot" />
                    {s.tam_ad} · {s.meeting_today_count} görüşme
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="coach-widget">
          <div className="coach-widget-header">
            <h3 className="coach-widget-title">
              <span aria-hidden>🕐</span> Son Ziyaret Edilenler
            </h3>
          </div>
          {recentVisits.length === 0 ? (
            <p className="coach-widget-empty">Henüz ziyaret geçmişi yok</p>
          ) : (
            <ul className="coach-widget-list">
              {recentVisits.slice(0, 4).map((v) => (
                <li key={v.id}>
                  <Link href={`/coach/ogrenciler/${v.id}`} className="coach-placeholder-item" style={{ textDecoration: "none", color: "inherit" }}>
                    <span className="coach-placeholder-dot" />
                    {v.tam_ad}
                    {v.sinif ? ` · ${v.sinif}` : ""}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
