"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  fetchCoachStudents,
  type CoachPortalStudent,
  type RiskSeviyesi,
} from "@/lib/coach-api";
import {
  COACH_RISK_LABELS,
  coachRiskCssClass,
} from "@/lib/coach-constants";
import { exportCoachStudentsCsv } from "@/lib/coach-students-export";
import {
  getPinnedStudentIds,
  pruneCoachPrefsToStudentIds,
  togglePinnedStudent,
  type CoachRecentVisit,
} from "@/lib/coach-students-prefs";
import CoachReminderBanner from "@/components/coach/CoachReminderBanner";
import BulkGorusmeDrawer from "@/components/coach/BulkGorusmeDrawer";
import GorusmeEkleDrawer from "@/components/coach/GorusmeEkleDrawer";
import RiskBildirDrawer from "@/components/coach/RiskBildirDrawer";
import CoachStudentAvatar from "@/components/coach/students/CoachStudentAvatar";
import CoachStudentQuickActions from "@/components/coach/students/CoachStudentQuickActions";

type FilterId = "all" | "risk" | "overdue" | "needs_meeting" | "today_meeting" | "pinned";
type SortId = "name" | "risk" | "meeting" | "overdue";

type DrawerState =
  | { type: "gorusme"; student: CoachPortalStudent }
  | { type: "risk"; student: CoachPortalStudent }
  | { type: "bulk"; students: CoachPortalStudent[] }
  | null;

const FILTER_OPTIONS: { id: FilterId; label: string; icon: string }[] = [
  { id: "all", label: "Tümü", icon: "👥" },
  { id: "pinned", label: "Sabitlenen", icon: "📌" },
  { id: "today_meeting", label: "Bugün görüşme", icon: "📅" },
  { id: "risk", label: "Riskli", icon: "⚠️" },
  { id: "overdue", label: "Geciken ödev", icon: "📋" },
  { id: "needs_meeting", label: "Görüşme gerekli", icon: "💬" },
];

const SORT_OPTIONS: { id: SortId; label: string }[] = [
  { id: "name", label: "Ada göre (A→Z)" },
  { id: "risk", label: "Risk (yüksek önce)" },
  { id: "meeting", label: "En eski görüşme" },
  { id: "overdue", label: "Geciken ödev" },
];

const RISK_ORDER: Record<RiskSeviyesi, number> = { high: 3, medium: 2, low: 1 };

function formatDate(d: string | null | undefined): string {
  if (!d) return "Henüz yok";
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysSince(d: string | null | undefined): number | null {
  if (!d) return null;
  const then = new Date(d);
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

function RiskBadge({ level }: { level: RiskSeviyesi | null }) {
  if (!level) {
    return <span className={`coach-risk-badge ${coachRiskCssClass(null)}`}>Belirsiz</span>;
  }
  return (
    <span className={`coach-risk-badge ${coachRiskCssClass(level)}`}>
      {COACH_RISK_LABELS[level]}
    </span>
  );
}

function computeStats(students: CoachPortalStudent[]) {
  const atRisk = students.filter(
    (s) => s.risk_seviyesi === "high" || s.risk_seviyesi === "medium"
  ).length;
  const withOverdue = students.filter((s) => (s.overdue_homework_count ?? 0) > 0).length;
  const totalOverdue = students.reduce((sum, s) => sum + (s.overdue_homework_count ?? 0), 0);
  const needsMeeting = students.filter((s) => s.needs_meeting).length;
  const todayMeeting = students.filter((s) => (s.meeting_today_count ?? 0) > 0).length;

  return { total: students.length, atRisk, withOverdue, totalOverdue, needsMeeting, todayMeeting };
}

function applyFilter(
  students: CoachPortalStudent[],
  filter: FilterId,
  pinnedIds: number[]
): CoachPortalStudent[] {
  switch (filter) {
    case "pinned":
      return students.filter((s) => pinnedIds.includes(s.student_id));
    case "today_meeting":
      return students.filter((s) => (s.meeting_today_count ?? 0) > 0);
    case "risk":
      return students.filter((s) => s.risk_seviyesi === "high" || s.risk_seviyesi === "medium");
    case "overdue":
      return students.filter((s) => (s.overdue_homework_count ?? 0) > 0);
    case "needs_meeting":
      return students.filter((s) => s.needs_meeting);
    default:
      return students;
  }
}

function applySort(
  students: CoachPortalStudent[],
  sort: SortId,
  pinnedIds: number[]
): CoachPortalStudent[] {
  const copy = [...students];
  const pinRank = (id: number) => (pinnedIds.includes(id) ? 0 : 1);

  copy.sort((a, b) => {
    const pinDiff = pinRank(a.student_id) - pinRank(b.student_id);
    if (pinDiff !== 0) return pinDiff;

    switch (sort) {
      case "risk": {
        const ra = a.risk_seviyesi ? RISK_ORDER[a.risk_seviyesi] : 0;
        const rb = b.risk_seviyesi ? RISK_ORDER[b.risk_seviyesi] : 0;
        return rb - ra || a.tam_ad.localeCompare(b.tam_ad, "tr");
      }
      case "meeting": {
        const da = daysSince(a.son_gorusme_tarihi) ?? 9999;
        const db = daysSince(b.son_gorusme_tarihi) ?? 9999;
        return db - da || a.tam_ad.localeCompare(b.tam_ad, "tr");
      }
      case "overdue":
        return (
          (b.overdue_homework_count ?? 0) - (a.overdue_homework_count ?? 0) ||
          a.tam_ad.localeCompare(b.tam_ad, "tr")
        );
      default:
        return a.tam_ad.localeCompare(b.tam_ad, "tr");
    }
  });

  return copy;
}

function RecentChip({ visit }: { visit: CoachRecentVisit }) {
  return (
    <Link href={`/coach/ogrenciler/${visit.id}`} className="coach-recent-chip">
      <CoachStudentAvatar ad={visit.tam_ad.split(" ")[0] ?? ""} soyad={visit.tam_ad.split(" ").slice(1).join(" ") ?? ""} profilFoto={visit.profil_foto} size="sm" />
      <span className="coach-recent-chip-label">
        {visit.tam_ad}
        {visit.sinif ? <small>{visit.sinif}</small> : null}
      </span>
    </Link>
  );
}

interface StudentCardProps {
  student: CoachPortalStudent;
  pinned: boolean;
  selectMode: boolean;
  selected: boolean;
  onTogglePin: () => void;
  onToggleSelect: () => void;
  onGorusme: () => void;
  onRisk: () => void;
}

function StudentCard({
  student,
  pinned,
  selectMode,
  selected,
  onTogglePin,
  onToggleSelect,
  onGorusme,
  onRisk,
}: StudentCardProps) {
  const overdue = student.overdue_homework_count ?? 0;
  const meetingDays = daysSince(student.son_gorusme_tarihi);
  const staleMeeting = student.needs_meeting;
  const todayCount = student.meeting_today_count ?? 0;

  const body = (
    <>
      {selectMode && (
        <input
          type="checkbox"
          className="coach-student-select"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={`${student.tam_ad} seç`}
        />
      )}
      <CoachStudentAvatar
        ad={student.ad}
        soyad={student.soyad}
        profilFoto={student.profil_foto}
        highRisk={student.risk_seviyesi === "high"}
      />
      <div className="coach-student-card-body">
        <div className="coach-student-card-top">
          <div>
            <h3 className="coach-student-name">
              {student.tam_ad}
              {pinned && <span className="coach-pin-badge" title="Sabitlendi">📌</span>}
            </h3>
            <p className="coach-student-meta">
              {student.sinif || "Sınıf yok"}
              {student.okul_no ? ` · No: ${student.okul_no}` : ""}
            </p>
          </div>
          <RiskBadge level={student.risk_seviyesi} />
        </div>
        <div className="coach-student-signals">
          {todayCount > 0 && (
            <span className="coach-signal is-today">
              📅 Bugün {todayCount} görüşme
            </span>
          )}
          <span className={`coach-signal${staleMeeting ? " is-warn" : ""}`}>
            💬 {formatDate(student.son_gorusme_tarihi)}
            {meetingDays !== null && meetingDays > 0 && (
              <span className="coach-signal-sub"> · {meetingDays} gün önce</span>
            )}
          </span>
          {overdue > 0 && (
            <span className="coach-signal is-alert">📋 {overdue} geciken ödev</span>
          )}
        </div>
        {!selectMode && (
          <CoachStudentQuickActions
            veliTelefon={student.veli_telefon}
            veliId={student.veli_id ?? undefined}
            ogrenciId={student.id}
            ogrenciAd={student.tam_ad}
            onGorusme={onGorusme}
            onRisk={onRisk}
            compact
          />
        )}
      </div>
      {!selectMode && (
        <button
          type="button"
          className={`coach-pin-btn${pinned ? " is-pinned" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin();
          }}
          title={pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
          aria-label={pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
        >
          📌
        </button>
      )}
      {!selectMode && <span className="coach-student-chevron" aria-hidden>›</span>}
    </>
  );

  if (selectMode) {
    return (
      <div
        className={`coach-student-card is-selectable${selected ? " is-selected" : ""}`}
        onClick={onToggleSelect}
        onKeyDown={(e) => e.key === "Enter" && onToggleSelect()}
        role="button"
        tabIndex={0}
      >
        {body}
      </div>
    );
  }

  return (
    <Link href={`/coach/ogrenciler/${student.student_id}`} className="coach-student-card">
      {body}
    </Link>
  );
}

export default function CoachOgrencilerPage() {
  const { user } = useAuth();
  const userId = user?.id ?? 0;

  const [students, setStudents] = useState<CoachPortalStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [sortBy, setSortBy] = useState<SortId>("name");
  const [sinifFilter, setSinifFilter] = useState<string>("all");
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [recentVisits, setRecentVisits] = useState<CoachRecentVisit[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    setPinnedIds(getPinnedStudentIds(userId));
  }, [userId]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchCoachStudents(undefined, {
      search: searchQuery || undefined,
      active_only: true,
    });
    if (res.success && res.data) {
      setStudents(res.data);
      // Arama sonuçlarıyla prune etme — yalnızca tam listede eski ziyaretleri temizle
      if (userId && !searchQuery) {
        const { recent, pinned } = pruneCoachPrefsToStudentIds(
          userId,
          res.data.map((s) => s.id)
        );
        setRecentVisits(recent);
        setPinnedIds(pinned);
      }
    } else {
      setError(res.error || "Öğrenci listesi yüklenemedi.");
      setStudents([]);
    }
    setLoading(false);
  }, [searchQuery, userId]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const stats = useMemo(() => computeStats(students), [students]);

  const sinifOptions = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.sinif) set.add(s.sinif);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [students]);

  const displayedStudents = useMemo(() => {
    let list = applyFilter(students, activeFilter, pinnedIds);
    if (sinifFilter !== "all") list = list.filter((s) => s.sinif === sinifFilter);
    return applySort(list, sortBy, pinnedIds);
  }, [students, activeFilter, sinifFilter, sortBy, pinnedIds]);

  const filterCounts = useMemo(
    () => ({
      all: students.length,
      pinned: applyFilter(students, "pinned", pinnedIds).length,
      today_meeting: applyFilter(students, "today_meeting", pinnedIds).length,
      risk: applyFilter(students, "risk", pinnedIds).length,
      overdue: applyFilter(students, "overdue", pinnedIds).length,
      needs_meeting: applyFilter(students, "needs_meeting", pinnedIds).length,
    }),
    [students, pinnedIds]
  );

  const selectedStudents = useMemo(
    () => students.filter((s) => selectedIds.includes(s.student_id)),
    [students, selectedIds]
  );

  const handleTogglePin = (studentId: number) => {
    if (!userId) return;
    setPinnedIds(togglePinnedStudent(userId, studentId));
  };

  const handleToggleSelect = (studentId: number) => {
    setSelectedIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const resetFilters = () => {
    setActiveFilter("all");
    setSinifFilter("all");
    setSearchInput("");
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  return (
    <div className="coach-students-page">
      <header className="coach-page-header">
        <h2>Öğrencilerim</h2>
        <p>Atanmış öğrencilerinizi risk, ödev ve görüşme durumuna göre takip edin.</p>
      </header>

      {userId > 0 && (
        <CoachReminderBanner
          userId={userId}
          needsMeetingCount={stats.needsMeeting}
          overdueStudentCount={stats.withOverdue}
          onFilterNeedsMeeting={() => setActiveFilter("needs_meeting")}
          onFilterOverdue={() => setActiveFilter("overdue")}
        />
      )}

      {recentVisits.length > 0 && (
        <section className="coach-recent-section" aria-label="Son ziyaret edilenler">
          <h3 className="coach-section-title">Son ziyaret edilenler</h3>
          <div className="coach-recent-scroll">
            {recentVisits.map((v) => (
              <RecentChip key={v.id} visit={v} />
            ))}
          </div>
        </section>
      )}

      {!loading && !error && students.length > 0 && (
        <section className="coach-students-stats" aria-label="Özet istatistikler">
          <button
            type="button"
            className={`coach-stat-pill${activeFilter === "all" ? " is-active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            <span className="coach-stat-value">{stats.total}</span>
            <span className="coach-stat-label">Toplam</span>
          </button>
          <button
            type="button"
            className={`coach-stat-pill is-warn${activeFilter === "risk" ? " is-active" : ""}`}
            onClick={() => setActiveFilter("risk")}
          >
            <span className="coach-stat-value">{stats.atRisk}</span>
            <span className="coach-stat-label">Riskli</span>
          </button>
          <button
            type="button"
            className={`coach-stat-pill is-alert${activeFilter === "overdue" ? " is-active" : ""}`}
            onClick={() => setActiveFilter("overdue")}
          >
            <span className="coach-stat-value">{stats.totalOverdue}</span>
            <span className="coach-stat-label">Geciken ödev</span>
          </button>
          <button
            type="button"
            className={`coach-stat-pill is-muted${activeFilter === "today_meeting" ? " is-active" : ""}`}
            onClick={() => setActiveFilter("today_meeting")}
          >
            <span className="coach-stat-value">{stats.todayMeeting}</span>
            <span className="coach-stat-label">Bugün görüşme</span>
          </button>
        </section>
      )}

      <section className="coach-students-toolbar">
        <div className="coach-students-search-wrap">
          <span className="coach-students-search-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </span>
          <input
            type="search"
            className="coach-students-search-input"
            placeholder="Ad, sınıf veya okul no ara…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Öğrenci ara"
          />
        </div>

        <div className="coach-students-toolbar-actions">
          {sinifOptions.length > 1 && (
            <select
              className="coach-students-select"
              value={sinifFilter}
              onChange={(e) => setSinifFilter(e.target.value)}
              aria-label="Sınıf filtresi"
            >
              <option value="all">Tüm sınıflar</option>
              {sinifOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <select
            className="coach-students-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortId)}
            aria-label="Sıralama"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="coach-link-btn"
            onClick={() => exportCoachStudentsCsv(displayedStudents)}
            disabled={displayedStudents.length === 0}
          >
            CSV ↓
          </button>
          <button
            type="button"
            className={`coach-link-btn${selectMode ? " is-active" : ""}`}
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          >
            {selectMode ? "İptal" : "Toplu seç"}
          </button>
        </div>
      </section>

      <div className="coach-students-filters" role="tablist" aria-label="Hızlı filtreler">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={activeFilter === f.id}
            className={`coach-filter-chip${activeFilter === f.id ? " is-active" : ""}`}
            onClick={() => setActiveFilter(f.id)}
          >
            <span aria-hidden>{f.icon}</span>
            {f.label}
            <span className="coach-filter-count">{filterCounts[f.id]}</span>
          </button>
        ))}
      </div>

      <div className="coach-students-list-panel">
        {loading && (
          <div className="coach-students-skeleton">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="coach-skeleton coach-student-skeleton-row" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="coach-error">
            {error}
            <button type="button" className="coach-link-btn" onClick={loadStudents}>
              Tekrar dene
            </button>
          </div>
        )}

        {!loading && !error && students.length === 0 && (
          <div className="coach-empty-state">
            <div className="coach-empty-icon">👥</div>
            <h4>Henüz atanmış öğrenci yok</h4>
            <p>Size atanmış aktif öğrenci bulunmuyor.</p>
          </div>
        )}

        {!loading && !error && students.length > 0 && displayedStudents.length === 0 && (
          <div className="coach-empty-state">
            <div className="coach-empty-icon">🔍</div>
            <h4>Eşleşen öğrenci yok</h4>
            <p>Filtreleri temizleyerek tekrar deneyin.</p>
            <button type="button" className="coach-link-btn" onClick={resetFilters}>
              Filtreleri sıfırla
            </button>
          </div>
        )}

        {!loading && !error && displayedStudents.length > 0 && (
          <>
            <p className="coach-students-result-count">
              {displayedStudents.length} öğrenci listeleniyor
              {pinnedIds.length > 0 && " · Sabitlenenler üstte"}
            </p>
            <div className="coach-students-cards">
              {displayedStudents.map((s) => (
                <StudentCard
                  key={s.id}
                  student={s}
                  pinned={pinnedIds.includes(s.student_id)}
                  selectMode={selectMode}
                  selected={selectedIds.includes(s.student_id)}
                  onTogglePin={() => handleTogglePin(s.student_id)}
                  onToggleSelect={() => handleToggleSelect(s.student_id)}
                  onGorusme={() => setDrawer({ type: "gorusme", student: s })}
                  onRisk={() => setDrawer({ type: "risk", student: s })}
                />
              ))}
            </div>

            <div className="coach-students-table-desktop">
              <table className="coach-students-table">
                <thead>
                  <tr>
                    <th>Öğrenci</th>
                    <th>Sınıf</th>
                    <th>Risk</th>
                    <th>Son görüşme</th>
                    <th>Bugün</th>
                    <th>Geciken</th>
                    <th>Hızlı</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/coach/ogrenciler/${s.student_id}`} className="coach-student-table-link">
                          <CoachStudentAvatar ad={s.ad} soyad={s.soyad} profilFoto={s.profil_foto} size="sm" />
                          <span>
                            <strong>
                              {s.tam_ad}
                              {pinnedIds.includes(s.student_id) ? " 📌" : ""}
                            </strong>
                            {s.okul_no && <small>No: {s.okul_no}</small>}
                          </span>
                        </Link>
                      </td>
                      <td>{s.sinif || "—"}</td>
                      <td>
                        <RiskBadge level={s.risk_seviyesi} />
                      </td>
                      <td>{formatDate(s.son_gorusme_tarihi)}</td>
                      <td>{(s.meeting_today_count ?? 0) > 0 ? s.meeting_today_count : "—"}</td>
                      <td>
                        {(s.overdue_homework_count ?? 0) > 0 ? (
                          <span className="coach-overdue-count">{s.overdue_homework_count}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <CoachStudentQuickActions
                          veliTelefon={s.veli_telefon}
                          veliId={s.veli_id ?? undefined}
                          ogrenciId={s.id}
                          ogrenciAd={s.tam_ad}
                          onGorusme={() => setDrawer({ type: "gorusme", student: s })}
                          onRisk={() => setDrawer({ type: "risk", student: s })}
                          compact
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {selectMode && selectedIds.length > 0 && (
        <div className="coach-bulk-bar">
          <span>{selectedIds.length} öğrenci seçildi</span>
          <button
            type="button"
            className="coach-btn coach-btn-primary"
            onClick={() => setDrawer({ type: "bulk", students: selectedStudents })}
          >
            Toplu görüşme planla
          </button>
        </div>
      )}

      {drawer?.type === "gorusme" && (
        <GorusmeEkleDrawer
          studentId={drawer.student.student_id}
          studentName={drawer.student.tam_ad}
          onClose={() => setDrawer(null)}
          onSuccess={loadStudents}
        />
      )}
      {drawer?.type === "risk" && (
        <RiskBildirDrawer
          studentId={drawer.student.student_id}
          studentName={drawer.student.tam_ad}
          onClose={() => setDrawer(null)}
          onSuccess={loadStudents}
        />
      )}
      {drawer?.type === "bulk" && (
        <BulkGorusmeDrawer
          students={drawer.students.map((s) => ({ id: s.student_id, tam_ad: s.tam_ad }))}
          onClose={() => setDrawer(null)}
          onSuccess={() => {
            loadStudents();
            exitSelectMode();
          }}
        />
      )}
    </div>
  );
}
