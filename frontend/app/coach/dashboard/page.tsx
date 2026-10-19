"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  downloadHaftalikProgramPdf,
  fetchHaftalikProgram,
  type HaftalikProgram,
  type HaftalikProgramItem,
} from "@/lib/coaching-api";
import { fetchAssignments, fetchKontrolBadge, type ManualAssignment } from "@/lib/resources-api";
import { fetchGorevDashboardOzet, type GorevDashboardOzet } from "@/lib/gorev-api";
import { fetchCoachStudents, type CoachPortalStudent } from "@/lib/coach-api";
import { fetchCoachMeStats, type CoachSelfStats } from "@/lib/coach-profile-api";
import "./dashboard.css";

type TabKey = "program" | "actions" | "students";
type ViewMode = "gunluk" | "haftalik";

function todayIso(): string {
  const date = new Date();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}` : (parts[0] ?? "?").slice(0, 2);
}

export default function CoachDashboardPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("program");
  const [viewMode, setViewMode] = useState<ViewMode>("gunluk");

  // Program state
  const [week, setWeek] = useState("");
  const [coachId, setCoachId] = useState<number | null>(null);
  const [program, setProgram] = useState<HaftalikProgram | null>(null);
  const [programLoading, setProgramLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [selectedDayIso, setSelectedDayIso] = useState<string>("");

  // Operasyonel veriler
  const [loadingOps, setLoadingOps] = useState(true);
  const [gorevOzet, setGorevOzet] = useState<GorevDashboardOzet | null>(null);
  const [coachStats, setCoachStats] = useState<CoachSelfStats | null>(null);
  const [students, setStudents] = useState<CoachPortalStudent[]>([]);
  const [overdueItems, setOverdueItems] = useState<ManualAssignment[]>([]);
  const [dueTodayCount, setDueTodayCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [studentSearch, setStudentSearch] = useState("");

  const today = todayIso();

  // Program yükleme
  const loadProgram = useCallback(async () => {
    setProgramLoading(true);
    const response = await fetchHaftalikProgram({
      week: week || undefined,
      coachId,
    });
    if (response.success && response.data) {
      setProgram(response.data);
      // Seçili günü belirle
      const hasToday = response.data.days.some((d) => d.date === today);
      if (hasToday) {
        setSelectedDayIso(today);
      } else if (response.data.days.length > 0) {
        setSelectedDayIso(response.data.days[0].date);
      }
    } else {
      setProgram(null);
    }
    setProgramLoading(false);
  }, [week, coachId, today]);

  // Operasyon verilerini yükleme
  const loadOps = useCallback(async () => {
    setLoadingOps(true);
    const [badge, gorev, studentList, overdue, stats] = await Promise.all([
      fetchKontrolBadge(),
      fetchGorevDashboardOzet(),
      fetchCoachStudents(),
      fetchAssignments({ status: "OVERDUE" }),
      fetchCoachMeStats(),
    ]);

    if (badge.success && badge.data) {
      setDueTodayCount(badge.data.due_today ?? badge.data.count ?? 0);
      setOverdueCount(badge.data.overdue ?? 0);
    }
    if (gorev.success && gorev.data) setGorevOzet(gorev.data);
    if (stats.success && stats.data) setCoachStats(stats.data);

    const nextStudents = studentList.success && studentList.data ? studentList.data : [];
    setStudents(nextStudents);

    const raw = overdue.success && overdue.data ? (overdue.data as unknown) : [];
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { results?: ManualAssignment[] }).results)
      ? (raw as { results: ManualAssignment[] }).results!
      : [];
    setOverdueItems(list.slice(0, 10));
    if (list.length) setOverdueCount((c) => Math.max(c, list.length));

    setLoadingOps(false);
  }, []);

  useEffect(() => {
    void loadProgram();
  }, [loadProgram]);

  useEffect(() => {
    void loadOps();
  }, [loadOps]);

  // Hafta kaydırma
  const shiftWeek = (days: number) => {
    const start = program?.week_start;
    if (!start) return;
    setWeek(addDays(start, days));
  };

  // PDF indirme
  const downloadPdf = async () => {
    if (!program?.week_start || !program.coach_id || downloading) return;
    setDownloading(true);
    try {
      await downloadHaftalikProgramPdf({
        week: program.week_start,
        coachId: program.coach_id,
      });
    } catch {
      /* ignore */
    } finally {
      setDownloading(false);
    }
  };

  // Hesaplanan metrikler
  const riskStudents = useMemo(
    () => students.filter((s) => s.risk_seviyesi === "high" || s.risk_seviyesi === "medium"),
    [students]
  );
  const meetingTodayCount = useMemo(
    () =>
      coachStats?.gorusmeler.bugun_planli ??
      students.reduce((tot, s) => tot + (s.meeting_today_count ?? 0), 0),
    [coachStats, students]
  );
  const pendingActionsCount = overdueCount + (gorevOzet?.bugun ?? 0) + (gorevOzet?.geciken ?? 0);

  // Günlük görünüm seçili gün verisi
  const selectedDay = useMemo(() => {
    if (!program) return null;
    return program.days.find((d) => d.date === selectedDayIso) || program.days[0] || null;
  }, [program, selectedDayIso]);

  const selectedDayMeetings = useMemo(
    () => selectedDay?.items.filter((i) => i.kind === "gorusme") || [],
    [selectedDay]
  );
  const selectedDayHomeworks = useMemo(
    () => selectedDay?.items.filter((i) => i.kind === "odev") || [],
    [selectedDay]
  );

  // Öğrenci arama
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLocaleLowerCase("tr");
    return students.filter(
      (s) =>
        s.tam_ad.toLocaleLowerCase("tr").includes(q) ||
        (s.sinif && s.sinif.toLocaleLowerCase("tr").includes(q))
    );
  }, [students, studentSearch]);

  return (
    <div className="cdash-root">
      {/* ─── 1. Cockpit Header & KPIs ────────────────────────── */}
      <header className="cdash-header">
        <div className="cdash-header-copy">
          <h1>Koçluk Masası</h1>
          <p>
            {user?.first_name ? `Hoş geldiniz, ${user.first_name}` : "Günlük operasyon ve ajanda"}
          </p>
        </div>

        <div className="cdash-kpi-bar">
          <button
            type="button"
            className="cdash-kpi is-primary"
            onClick={() => {
              setActiveTab("program");
              setViewMode("gunluk");
            }}
          >
            <span>Bugün Kontrol</span>
            <strong>{dueTodayCount}</strong>
          </button>

          <button
            type="button"
            className="cdash-kpi"
            onClick={() => {
              setActiveTab("program");
              setViewMode("gunluk");
            }}
          >
            <span>Bugün Görüşme</span>
            <strong>{meetingTodayCount}</strong>
          </button>

          <button
            type="button"
            className={`cdash-kpi ${overdueCount > 0 ? "is-alert" : ""}`}
            onClick={() => setActiveTab("actions")}
          >
            <span>Geciken Ödev</span>
            <strong>{overdueCount}</strong>
          </button>

          <button
            type="button"
            className={`cdash-kpi ${riskStudents.length > 0 ? "is-warning" : ""}`}
            onClick={() => setActiveTab("students")}
          >
            <span>Riskli Öğrenci</span>
            <strong>{riskStudents.length}</strong>
          </button>
        </div>
      </header>

      {/* ─── 2. Main Tabs ────────────────────────────────────── */}
      <nav className="cdash-tabs" aria-label="Dashboard sekmeleri">
        <button
          type="button"
          className={`cdash-tab ${activeTab === "program" ? "is-active" : ""}`}
          onClick={() => setActiveTab("program")}
        >
          <span>📅 Programım</span>
          {program && (
            <span className="cdash-tab-badge">
              {program.counts.odev + program.counts.gorusme}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`cdash-tab ${activeTab === "actions" ? "is-active" : ""}`}
          onClick={() => setActiveTab("actions")}
        >
          <span>⚡ Bekleyen Aksiyonlar</span>
          {pendingActionsCount > 0 && (
            <span className="cdash-tab-badge is-alert">{pendingActionsCount}</span>
          )}
        </button>

        <button
          type="button"
          className={`cdash-tab ${activeTab === "students" ? "is-active" : ""}`}
          onClick={() => setActiveTab("students")}
        >
          <span>👥 Öğrenci Takip Masası</span>
          <span className="cdash-tab-badge">{students.length}</span>
        </button>
      </nav>

      {/* ─── 3. Tab 1: PROGRAMIM ─────────────────────────────── */}
      {activeTab === "program" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Program Toolbar */}
          <div className="cdash-prog-bar">
            <div className="cdash-prog-left">
              <div className="cdash-view-seg" role="group" aria-label="Görünüm modu">
                <button
                  type="button"
                  className={`cdash-view-btn ${viewMode === "gunluk" ? "is-active" : ""}`}
                  onClick={() => setViewMode("gunluk")}
                >
                  Günlük
                </button>
                <button
                  type="button"
                  className={`cdash-view-btn ${viewMode === "haftalik" ? "is-active" : ""}`}
                  onClick={() => setViewMode("haftalik")}
                >
                  Haftalık
                </button>
              </div>

              <div className="cdash-week-nav">
                <button
                  type="button"
                  className="cdash-nav-btn"
                  aria-label="Önceki hafta"
                  onClick={() => shiftWeek(-7)}
                  disabled={!program}
                >
                  ‹
                </button>
                <span className="cdash-week-label">{program?.week_label || "Bu hafta"}</span>
                <button
                  type="button"
                  className="cdash-nav-btn"
                  aria-label="Sonraki hafta"
                  onClick={() => shiftWeek(7)}
                  disabled={!program}
                >
                  ›
                </button>
                <button type="button" className="cdash-today-btn" onClick={() => setWeek("")}>
                  Bu hafta
                </button>
              </div>
            </div>

            <div className="cdash-prog-right">
              {program?.can_pick_coach && program.coaches.length > 0 && (
                <select
                  className="cdash-coach-select"
                  aria-label="Koç seçimi"
                  value={program.coach_id ?? ""}
                  onChange={(e) => setCoachId(Number(e.target.value) || null)}
                >
                  {program.coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                className="cdash-pdf-btn"
                onClick={() => void downloadPdf()}
                disabled={!program?.coach_id || downloading}
              >
                {downloading ? "Hazırlanıyor…" : "PDF indir"}
              </button>

              <Link href="/coach/haftalik-program" className="cdash-full-link">
                Tam Sayfada Aç ↗
              </Link>
            </div>
          </div>

          {programLoading && !program ? (
            <p className="cdash-empty">Program yükleniyor…</p>
          ) : null}

          {/* 3A. GÜNLÜK MOD */}
          {program && viewMode === "gunluk" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Gün Hapları (Day selector pills) */}
              <div className="cdash-day-pills">
                {program.days.map((d) => {
                  const isSel = d.date === selectedDayIso;
                  const isTod = d.date === today;
                  const count = d.items.length;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      className={`cdash-day-pill ${isSel ? "is-selected" : ""} ${
                        isTod ? "is-today-marker" : ""
                      }`}
                      onClick={() => setSelectedDayIso(d.date)}
                    >
                      <span className="cdash-day-pill-name">{d.short_name}</span>
                      <span className="cdash-day-pill-num">{d.day}</span>
                      {count > 0 && <span className="cdash-day-pill-count">{count} kayıt</span>}
                    </button>
                  );
                })}
              </div>

              {/* Seçili Gün Detay Panelleri */}
              <div className="cdash-daily-grid">
                {/* Sol Panel: Görüşmeler */}
                <div className="cdash-panel">
                  <div className="cdash-panel-head">
                    <h3>💬 Planlı Görüşmeler</h3>
                    <span>{selectedDayMeetings.length} görüşme</span>
                  </div>

                  {selectedDayMeetings.length === 0 ? (
                    <p className="cdash-empty">Bu günde planlanmış görüşme yok.</p>
                  ) : (
                    <ul className="cdash-event-list">
                      {selectedDayMeetings.map((item, idx) => (
                        <li key={`meet-${idx}`}>
                          <Link href="/coach/gorusmeler" className="cdash-event-card gorusme">
                            <span className="cdash-event-time">{item.time || "Gün içi"}</span>
                            <div className="cdash-event-info">
                              <strong>{item.student}</strong>
                              <span>
                                {item.kind_label}
                                {item.title ? ` · ${item.title}` : ""}
                              </span>
                            </div>
                            {item.status_label && (
                              <span className="cdash-event-badge">{item.status_label}</span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Sağ Panel: Ödev Kontrolleri */}
                <div className="cdash-panel">
                  <div className="cdash-panel-head">
                    <h3>📋 Ödev Kontrolleri</h3>
                    <span>{selectedDayHomeworks.length} kontrol</span>
                  </div>

                  {selectedDayHomeworks.length === 0 ? (
                    <p className="cdash-empty">Bu günde kontrol edilecek ödev yok.</p>
                  ) : (
                    <ul className="cdash-event-list">
                      {selectedDayHomeworks.map((item, idx) => (
                        <li key={`hw-${idx}`}>
                          <Link href="/coach/odev/kontrol" className="cdash-event-card odev">
                            <span className="cdash-event-time">{item.time || "Gün içi"}</span>
                            <div className="cdash-event-info">
                              <strong>{item.student}</strong>
                              <span>
                                {item.title || "Ödev Kontrol"}
                                {item.detail ? ` (${item.detail})` : ""}
                              </span>
                            </div>
                            {item.status_label && (
                              <span className="cdash-event-badge">{item.status_label}</span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3B. HAFTALIK MOD */}
          {program && viewMode === "haftalik" && (
            <div className="cdash-week-grid">
              {program.days.map((day) => (
                <section
                  key={day.date}
                  className={`cdash-week-col ${day.date === today ? "is-today" : ""}`}
                >
                  <header>
                    <b>{day.short_name}</b>
                    <span>
                      {day.day} {day.name}
                    </span>
                  </header>

                  {day.items.length === 0 ? <p className="cdash-empty">Kayıt yok</p> : null}

                  {day.items.map((item, idx) => (
                    <article key={`${day.date}-${idx}`} className={`cdash-card ${item.kind}`}>
                      <div className="meta">
                        <span>{item.time || "Gün içi"}</span>
                        <span>{item.kind_label}</span>
                      </div>
                      <strong>{item.student}</strong>
                      <p>{item.title}</p>
                      {item.status_label && <em>{item.status_label}</em>}
                    </article>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── 4. Tab 2: BEKLEYEN AKSİYONLAR ──────────────────── */}
      {activeTab === "actions" && (
        <div className="cdash-actions-grid">
          {/* Geciken Ödevler */}
          <div className="cdash-panel">
            <div className="cdash-panel-head">
              <h3>⚠️ Kontrol Bekleyen Geciken Ödevler</h3>
              <Link href="/coach/odev/kontrol?status=OVERDUE" className="cdash-full-link">
                Tümü ({overdueCount}) →
              </Link>
            </div>

            {overdueItems.length === 0 ? (
              <p className="cdash-empty">Geciken ödev kontrolü bulunmuyor.</p>
            ) : (
              <ul className="cdash-event-list">
                {overdueItems.map((item) => (
                  <li key={item.id}>
                    <Link href={`/coach/odev/kontrol/${item.id}`} className="cdash-action-row">
                      <div className="cdash-action-info">
                        <strong>{item.student_name || `Öğrenci #${item.student}`}</strong>
                        <span>{item.title || "Ödev"}</span>
                      </div>
                      <span className="cdash-action-badge">Kontrol Et</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Bekleyen Görevler */}
          <div className="cdash-panel">
            <div className="cdash-panel-head">
              <h3>⚡ Bekleyen & Bugünkü Görevler</h3>
              <Link href="/coach/gorevler" className="cdash-full-link">
                Tüm Görevler ({gorevOzet?.bugun ?? 0}) →
              </Link>
            </div>

            <ul className="cdash-event-list">
              <li>
                <Link href="/coach/gorevler" className="cdash-action-row">
                  <div className="cdash-action-info">
                    <strong>Bugünkü Atanmış Görevler</strong>
                    <span>{gorevOzet?.bugun ?? 0} adet günlük görev</span>
                  </div>
                  <span className="cdash-action-badge" style={{ background: "#eff6ff", color: "#0061a6" }}>
                    Aç
                  </span>
                </Link>
              </li>

              <li>
                <Link href="/coach/gorevler?tab=geciken" className="cdash-action-row">
                  <div className="cdash-action-info">
                    <strong>Geciken Görevler</strong>
                    <span>{gorevOzet?.geciken ?? 0} adet tamamlanmamış görev</span>
                  </div>
                  <span className="cdash-action-badge">İncele</span>
                </Link>
              </li>

              <li>
                <Link href="/coach/gorusmeler" className="cdash-action-row">
                  <div className="cdash-action-info">
                    <strong>Öğrenci / Veli Görüşmeleri</strong>
                    <span>{meetingTodayCount} planlı görüşme kaydı</span>
                  </div>
                  <span className="cdash-action-badge" style={{ background: "#f0fdf4", color: "#15803d" }}>
                    Görüşmeler
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ─── 5. Tab 3: ÖĞRENCİ TAKİP MASASI ─────────────────── */}
      {activeTab === "students" && (
        <div className="cdash-panel">
          <div className="cdash-students-toolbar">
            <div className="cdash-panel-head" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: "none" }}>
              <h3>👥 Koçluk Öğrenci Listesi ({filteredStudents.length})</h3>
            </div>

            <input
              type="search"
              className="cdash-search-input"
              placeholder="Öğrenci veya sınıf ara…"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
          </div>

          <div className="cdash-student-table-wrap">
            <table className="cdash-student-table">
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Sınıf</th>
                  <th>Risk Durumu</th>
                  <th>Geciken Ödev</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="cdash-empty">
                      Öğrenci bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st) => {
                    const isHigh = st.risk_seviyesi === "high";
                    const isMed = st.risk_seviyesi === "medium";
                    return (
                      <tr key={st.id}>
                        <td>
                          <Link href={`/coach/ogrenciler/${st.id}`} className="cdash-st-user">
                            <span className="cdash-st-avatar">{initials(st.tam_ad)}</span>
                            <span>{st.tam_ad}</span>
                          </Link>
                        </td>
                        <td>{st.sinif || "—"}</td>
                        <td>
                          {isHigh ? (
                            <span className="cdash-action-badge">Yüksek Risk</span>
                          ) : isMed ? (
                            <span className="cdash-action-badge" style={{ background: "#fff7ed", color: "#c2410c" }}>
                              Orta Risk
                            </span>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#15803d" }}>Normal</span>
                          )}
                        </td>
                        <td>
                          {(st.overdue_homework_count ?? 0) > 0 ? (
                            <span style={{ color: "#be123c", fontWeight: 700 }}>
                              {st.overdue_homework_count} ödev
                            </span>
                          ) : (
                            <span style={{ color: "#64748b" }}>0</span>
                          )}
                        </td>
                        <td>
                          <Link
                            href={`/coach/ogrenciler/${st.id}`}
                            className="cdash-full-link"
                            style={{ padding: 0 }}
                          >
                            Profili Aç →
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
