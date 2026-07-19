"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { fetchKontrolBadge } from "@/lib/resources-api";
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
  const [gorevOzet, setGorevOzet] = useState<GorevDashboardOzet | null>(null);
  const [students, setStudents] = useState<CoachPortalStudent[]>([]);
  const [recentVisits, setRecentVisits] = useState<CoachRecentVisit[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [kontrolRes, gorevRes, studentsRes] = await Promise.all([
      fetchKontrolBadge(),
      fetchGorevDashboardOzet(),
      fetchCoachStudents(),
    ]);
    if (kontrolRes.success && kontrolRes.data) {
      setOverdueCount(kontrolRes.data.overdue ?? 0);
    }
    if (gorevRes.success && gorevRes.data) {
      setGorevOzet(gorevRes.data);
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
        <h2>Özet</h2>
        <p>Atanmış öğrencileriniz ve günlük takip alanları</p>
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
          {riskStudents.length === 0 ? (
            <p className="coach-widget-empty">
              {needsMeetingCount > 0
                ? `${needsMeetingCount} öğrenci görüşme bekliyor (risk skoru düşük).`
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
            </h3>
            {overdueCount > 0 && (
              <Link href="/coach/odev/kontrol?status=OVERDUE" className="coach-link-btn">
                Tümü →
              </Link>
            )}
          </div>
          {overdueCount > 0 ? (
            <p className="coach-widget-empty">
              <Link href="/coach/odev/kontrol?status=OVERDUE" className="coach-link-btn">
                {overdueCount} geciken ödev kontrol bekliyor →
              </Link>
            </p>
          ) : (
            <p className="coach-widget-empty">Kontrol bekleyen geciken ödev yok.</p>
          )}
        </section>

        <section className="coach-widget">
          <div className="coach-widget-header">
            <h3 className="coach-widget-title">
              <span aria-hidden>✅</span> Bugünkü Görevler
            </h3>
            <Link href="/coach/gorevler" className="coach-link-btn">
              Tümü →
            </Link>
          </div>
          <ul className="coach-widget-list">
            <li>
              <div className="coach-placeholder-item">
                <span className="coach-placeholder-dot" />
                {gorevOzet?.bugun ?? 0} görev · {(gorevOzet?.tip_sayaclari?.ODEV_KONTROL ?? 0)} ödev kontrolü · {(gorevOzet?.tip_sayaclari?.VELI_GORUSME ?? 0)} veli araması
              </div>
            </li>
          </ul>
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
