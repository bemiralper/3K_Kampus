"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  fetchAssignments,
  assignAssignment,
} from "@/lib/resources-api";
import { useOdevKontrolPaths } from "@/components/odev/OdevKontrolPaths";
import {
  isOverdue,
  isDueToday,
  statusBadgeClass,
  NON_SUBMISSION_LABELS,
} from "@/components/odev/statusTokens";
import "./odev-kontrol.css";

interface Assignment {
  id: number;
  student: number;
  student_name: string;
  coach: number | null;
  coach_name: string | null;
  title: string;
  description: string;
  status: string;
  status_display: string;
  risk_status: string;
  risk_status_display: string;
  priority: string;
  priority_display: string;
  assigned_date: string | null;
  due_date: string | null;
  completion_percent: number;
  lesson_count: number;
  task_count: number;
  pending_task_count?: number;
  evaluated_task_count?: number;
  postpone_count?: number;
  non_submission_reason?: string;
  non_submission_reason_display?: string | null;
  is_overdue?: boolean;
  is_due_today?: boolean;
  created_at: string;
}

interface Stats {
  total: number;
  draft: number;
  assigned: number;
  in_progress: number;
  completed: number;
  overdue: number;
  at_risk: number;
}

type FilterStatus = "all" | "DRAFT" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
type FilterRisk = "all" | "ON_TRACK" | "AT_RISK" | "BEHIND" | "PENDING_START";

const VALID_STATUS_FILTERS = new Set<string>([
  "all", "DRAFT", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "OVERDUE",
]);

const STATUS_CHIP_LABELS: { filter: FilterStatus; label: string }[] = [
  { filter: "all", label: "Toplam" },
  { filter: "DRAFT", label: "Taslak" },
  { filter: "ASSIGNED", label: "Atanmış" },
  { filter: "IN_PROGRESS", label: "Devam" },
  { filter: "COMPLETED", label: "Tamam" },
  { filter: "OVERDUE", label: "Geciken" },
];

const formatDate = (date: string | null) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
};

function assignmentIsOverdue(a: Assignment): boolean {
  return a.is_overdue ?? isOverdue(a.due_date, a.status);
}

function assignmentIsDueToday(a: Assignment): boolean {
  return a.is_due_today ?? isDueToday(a.due_date, a.status);
}

type OdevKontrolListClientProps = {
  variant?: "admin" | "coach";
};

export default function OdevKontrolListClient({ variant = "admin" }: OdevKontrolListClientProps) {
  const paths = useOdevKontrolPaths();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isCoach = variant === "coach";

  const initialStatus = searchParams.get("status");
  const initialFilter: FilterStatus =
    initialStatus && VALID_STATUS_FILTERS.has(initialStatus)
      ? (initialStatus as FilterStatus)
      : "all";

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(initialFilter);
  const [filterRisk, setFilterRisk] = useState<FilterRisk>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"created" | "due_date" | "progress" | "student">("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [toast, setToast] = useState<string | null>(null);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAssignments();
      if (result.success !== false) {
        const data = result.data || [];
        const list = (Array.isArray(data) ? data : []) as unknown as Assignment[];
        setAssignments(list);
        setStats({
          total: list.length,
          draft: list.filter((a) => a.status === "DRAFT").length,
          assigned: list.filter((a) => a.status === "ASSIGNED").length,
          in_progress: list.filter((a) => a.status === "IN_PROGRESS").length,
          completed: list.filter((a) => a.status === "COMPLETED").length,
          overdue: list.filter((a) => a.status === "OVERDUE" || assignmentIsOverdue(a)).length,
          at_risk: list.filter((a) => a.risk_status === "AT_RISK").length,
        });
      }
    } catch (error) {
      console.error("Ödevler yüklenemedi:", error);
      flash("Ödevler yüklenemedi");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  const handleAssignDraft = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      const result = await assignAssignment(id);
      if (result.success) { flash("Ödev atandı"); loadAssignments(); }
      else flash(result.error || "Atama başarısız");
    } catch { flash("Atama başarısız"); }
  };

  const goDetail = (id: number) => router.push(paths.detail(id));

  const filteredAssignments = assignments.filter((a) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!`${a.student_name} ${a.title} ${a.coach_name || ""}`.toLowerCase().includes(q)) return false;
    }
    if (filterStatus !== "all") {
      if (filterStatus === "OVERDUE") {
        if (a.status !== "OVERDUE" && !assignmentIsOverdue(a)) return false;
      } else if (a.status !== filterStatus) return false;
    }
    if (filterRisk !== "all" && a.risk_status !== filterRisk) return false;
    return true;
  });

  const sortedAssignments = [...filteredAssignments].sort((a, b) => {
    const aDueToday = assignmentIsDueToday(a) ? 1 : 0;
    const bDueToday = assignmentIsDueToday(b) ? 1 : 0;
    if (aDueToday !== bDueToday) return bDueToday - aDueToday;

    let cmp = 0;
    switch (sortBy) {
      case "created": cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
      case "due_date": {
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        cmp = da - db;
        break;
      }
      case "progress": cmp = a.completion_percent - b.completion_percent; break;
      case "student": cmp = (a.student_name || "").localeCompare(b.student_name || ""); break;
    }
    return sortOrder === "desc" ? -cmp : cmp;
  });

  const dueTodayCount = filteredAssignments.filter((a) => assignmentIsDueToday(a)).length;

  const renderRowMeta = (a: Assignment) => {
    const overdue = assignmentIsOverdue(a);
    const dueToday = assignmentIsDueToday(a);
    const nonSubmissionLabel =
      a.non_submission_reason_display ||
      (a.non_submission_reason ? NON_SUBMISSION_LABELS[a.non_submission_reason] : null);
    return { overdue, dueToday, nonSubmissionLabel, isDraft: a.status === "DRAFT" };
  };

  return (
    <div className={`ok-root${isCoach ? " ok-coach" : ""}`}>
      {toast && <div className="ok-toast">{toast}</div>}

      <header className="ok-page-header">
        <div className="ok-page-header-text">
          <h1>Ödev Kontrol</h1>
          <p>Atanan ödevleri filtreleyin, kontrol edin ve takip edin</p>
        </div>
        {!isCoach && (
          <div className="ok-header-actions">
            <Link href="/admin/odev/kontrol/silinen" className="ok-btn-secondary">
              Silinen Ödevler
            </Link>
            {paths.newAssignment && (
              <Link href={paths.newAssignment} className="ok-btn-primary">
                Yeni Ödev Ver
              </Link>
            )}
          </div>
        )}
      </header>

      {stats && (
        <div className="ok-filter-chips">
          {STATUS_CHIP_LABELS.map((chip) => {
            const value =
              chip.filter === "all" ? stats.total
              : chip.filter === "DRAFT" ? stats.draft
              : chip.filter === "ASSIGNED" ? stats.assigned
              : chip.filter === "IN_PROGRESS" ? stats.in_progress
              : chip.filter === "COMPLETED" ? stats.completed
              : stats.overdue;
            return (
              <button
                key={chip.filter}
                type="button"
                className={`ok-filter-chip${filterStatus === chip.filter ? " is-active" : ""}`}
                onClick={() => { setFilterStatus(chip.filter); setFilterRisk("all"); }}
              >
                {chip.label}<strong>{value}</strong>
              </button>
            );
          })}
          {dueTodayCount > 0 && (
            <span className="ok-filter-chip is-warning">
              Bugün<strong>{dueTodayCount}</strong>
            </span>
          )}
        </div>
      )}

      <div className="ok-toolbar">
        <input
          type="text"
          className="ok-input"
          placeholder="Öğrenci veya ödev ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="ok-select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
        >
          <option value="all">Tüm durumlar</option>
          <option value="DRAFT">Taslak</option>
          <option value="ASSIGNED">Atanmış</option>
          <option value="IN_PROGRESS">Devam eden</option>
          <option value="COMPLETED">Tamamlanan</option>
          <option value="OVERDUE">Geciken</option>
        </select>
        {!isCoach && (
          <select
            className="ok-select"
            value={filterRisk}
            onChange={(e) => setFilterRisk(e.target.value as FilterRisk)}
          >
            <option value="all">Tüm risk</option>
            <option value="ON_TRACK">Yolunda</option>
            <option value="AT_RISK">Riskli</option>
            <option value="BEHIND">Geride</option>
            <option value="PENDING_START">Başlamadı</option>
          </select>
        )}
        <select
          className="ok-select"
          value={`${sortBy}-${sortOrder}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split("-");
            setSortBy(s as typeof sortBy);
            setSortOrder(o as typeof sortOrder);
          }}
        >
          <option value="created-desc">En yeni</option>
          <option value="created-asc">En eski</option>
          <option value="due_date-asc">Teslim yakın</option>
          <option value="due_date-desc">Teslim uzak</option>
          <option value="progress-desc">İlerleme ↓</option>
          <option value="student-asc">Öğrenci A-Z</option>
        </select>
        {(filterStatus !== "all" || filterRisk !== "all" || searchQuery) && (
          <button
            type="button"
            className="ok-btn-clear"
            onClick={() => { setFilterStatus("all"); setFilterRisk("all"); setSearchQuery(""); }}
          >
            Temizle
          </button>
        )}
      </div>

      {loading ? (
        <div className="ok-loading">Yükleniyor...</div>
      ) : sortedAssignments.length === 0 ? (
        <div className="ok-empty">
          <h3>Ödev bulunamadı</h3>
          <p>
            {searchQuery || filterStatus !== "all" || filterRisk !== "all"
              ? "Filtrelere uygun kayıt yok."
              : "Henüz ödev yok."}
          </p>
        </div>
      ) : (
        <>
          <div className="ok-list-meta">{sortedAssignments.length} kayıt</div>

          <div className="ok-list-mobile">
            {sortedAssignments.map((a) => {
              const { overdue, dueToday, nonSubmissionLabel, isDraft } = renderRowMeta(a);
              return (
                <article
                  key={a.id}
                  className={`ok-list-row${dueToday ? " is-due-today" : ""}`}
                  onClick={() => goDetail(a.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") goDetail(a.id); }}
                >
                  <div className="ok-list-row-header">
                    <div>
                      <h3 className="ok-list-row-title">{a.title || "İsimsiz ödev"}</h3>
                      <div className="ok-list-row-sub">{a.student_name}</div>
                    </div>
                    <span className={`ok-badge ${statusBadgeClass(a.status)}`}>{a.status_display}</span>
                  </div>
                  <div className="ok-list-row-meta">
                    {a.due_date && (
                      <span className={dueToday || overdue ? "is-due-today" : undefined}>
                        Teslim {formatDate(a.due_date)}
                        {overdue && " · Gecikti"}
                      </span>
                    )}
                    <span>{a.task_count} görev · %{a.completion_percent}</span>
                  </div>
                  <div className="ok-progress">
                    <div className="ok-progress-fill" style={{ width: `${a.completion_percent}%` }} />
                  </div>
                  <div className="ok-list-row-footer">
                    {(a.postpone_count ?? 0) > 0 && (
                      <span className="ok-badge is-warning">{a.postpone_count}x ertelendi</span>
                    )}
                    {nonSubmissionLabel && (
                      <span className="ok-badge is-danger">{nonSubmissionLabel}</span>
                    )}
                    {isDraft && (
                      <button
                        type="button"
                        className="ok-btn-primary"
                        style={{ padding: "4px 12px", fontSize: 12 }}
                        onClick={(e) => handleAssignDraft(e, a.id)}
                      >
                        Ata
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <table className="ok-table-list ok-list-desktop">
            <thead>
              <tr>
                <th>Öğrenci</th>
                <th>Ödev</th>
                <th>Teslim</th>
                <th>Durum</th>
                <th>İlerleme</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedAssignments.map((a) => {
                const { overdue, dueToday, nonSubmissionLabel, isDraft } = renderRowMeta(a);
                return (
                  <tr
                    key={a.id}
                    className={dueToday ? "is-due-today" : undefined}
                    onClick={() => goDetail(a.id)}
                  >
                    <td>
                      <div className="ok-table-title">{a.student_name}</div>
                      {a.coach_name && !isCoach && (
                        <div className="ok-table-sub">{a.coach_name}</div>
                      )}
                    </td>
                    <td>
                      <div className="ok-table-title">{a.title || "İsimsiz ödev"}</div>
                      <div className="ok-table-sub">{a.task_count} görev</div>
                    </td>
                    <td>
                      <span className={dueToday || overdue ? "is-due-today" : undefined}>
                        {formatDate(a.due_date)}
                        {overdue && " · Gecikti"}
                        {dueToday && !overdue && " · Bugün"}
                      </span>
                      {(a.postpone_count ?? 0) > 0 && (
                        <div className="ok-table-sub">{a.postpone_count}x ertelendi</div>
                      )}
                    </td>
                    <td>
                      <span className={`ok-badge ${statusBadgeClass(a.status)}`}>{a.status_display}</span>
                      {nonSubmissionLabel && (
                        <div style={{ marginTop: 4 }}>
                          <span className="ok-badge is-danger">{nonSubmissionLabel}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="ok-table-progress">
                        <div className="ok-progress" style={{ flex: 1, margin: 0 }}>
                          <div className="ok-progress-fill" style={{ width: `${a.completion_percent}%` }} />
                        </div>
                        <span>%{a.completion_percent}</span>
                      </div>
                      {(a.pending_task_count ?? 0) > 0 && (
                        <div className="ok-table-sub">{a.pending_task_count} bekliyor</div>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {isDraft ? (
                        <button
                          type="button"
                          className="ok-btn-primary"
                          style={{ padding: "6px 12px", fontSize: 12 }}
                          onClick={(e) => handleAssignDraft(e, a.id)}
                        >
                          Ata
                        </button>
                      ) : (
                        <span className="ok-table-sub">Kontrol →</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
