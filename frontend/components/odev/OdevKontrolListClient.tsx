"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  fetchAssignments,
  fetchAssignmentsStats,
  assignAssignment,
  type AssignmentListStats,
} from "@/lib/resources-api";
import { useOdevKontrolPaths } from "@/components/odev/OdevKontrolPaths";
import {
  isOverdue,
  isDueToday,
  statusBadgeClass,
  NON_SUBMISSION_LABELS,
} from "@/components/odev/statusTokens";
import { stripCompletionTitleSuffix } from "@/components/odev/odevCompletionHelpers";

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

type FilterStatus = "all" | "DRAFT" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
type FilterRisk = "all" | "ON_TRACK" | "AT_RISK" | "DELAYED" | "PENDING_START" | "CRITICAL";

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

function assignmentTitle(a: Assignment): string {
  return stripCompletionTitleSuffix(a.title) || "İsimsiz ödev";
}

/** Kontrol günü = due_date’in takvim günü (gün sonu). Bugüne göre kalan/geçen gün. */
function daysUntilControlDay(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function formatControlCountdown(days: number): string {
  if (days === 0) return "bugün";
  if (days === 1) return "1 gün";
  if (days > 1) return `${days} gün`;
  if (days === -1) return "1g geçti";
  return `${Math.abs(days)}g geçti`;
}

function controlCountdownClass(days: number): string {
  if (days < 0) return "ok-days-until is-late";
  if (days === 0) return "ok-days-until is-today";
  return "ok-days-until";
}

function buildPageItems(current: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages, current, current - 1, current + 1]);
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (current >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("ellipsis");
    out.push(sorted[i]);
  }
  return out;
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
  const hasStatusInUrl = Boolean(initialStatus && VALID_STATUS_FILTERS.has(initialStatus));
  const initialFilter: FilterStatus = hasStatusInUrl
    ? (initialStatus as FilterStatus)
    : "all";
  // Koç varsayılanı: kontrol günü bugün. URL'de status varsa (dashboard kısayolu) onu koru.
  const initialDueToday =
    searchParams.get("due_today") === "1"
    || searchParams.get("due_today") === "true"
    || (isCoach && !hasStatusInUrl && searchParams.get("due_today") !== "0");

  const PAGE_SIZE = isCoach ? 20 : 50;

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [stats, setStats] = useState<AssignmentListStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(initialFilter);
  const [filterRisk, setFilterRisk] = useState<FilterRisk>("all");
  const [filterDueToday, setFilterDueToday] = useState(initialDueToday);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<"created" | "due_date" | "progress" | "student">("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [toast, setToast] = useState<string | null>(null);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadStats = useCallback(async () => {
    try {
      const result = await fetchAssignmentsStats();
      if (result.success && result.data) setStats(result.data);
    } catch {
      /* çipler olmadan da liste çalışabilir */
    }
  }, []);

  const requestSeq = useRef(0);

  const loadAssignments = useCallback(async (targetPage: number) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const result = await fetchAssignments({
        status: filterStatus !== "all" ? filterStatus : undefined,
        risk_status: filterRisk !== "all" ? filterRisk : undefined,
        due_today: filterDueToday || undefined,
        q: debouncedSearch || undefined,
        page: targetPage,
        page_size: PAGE_SIZE,
      });
      if (seq !== requestSeq.current) return;
      if (result.success !== false) {
        const data = result.data || [];
        const list = (Array.isArray(data) ? data : []) as unknown as Assignment[];
        setAssignments(list);
        setTotalCount(typeof result.count === "number" ? result.count : list.length);
        setPage(targetPage);
      } else {
        flash(result.error || "Ödevler yüklenemedi");
      }
    } catch (error) {
      console.error("Ödevler yüklenemedi:", error);
      flash("Ödevler yüklenemedi");
    }
    if (seq === requestSeq.current) setLoading(false);
  }, [filterStatus, filterRisk, filterDueToday, debouncedSearch, PAGE_SIZE]);

  useEffect(() => {
    loadAssignments(1);
  }, [loadAssignments]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const refreshAll = useCallback(() => {
    loadAssignments(page);
    loadStats();
  }, [loadAssignments, loadStats, page]);

  const goToPage = (target: number) => {
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const next = Math.min(Math.max(1, target), totalPages);
    if (next === page && !loading) return;
    loadAssignments(next);
  };

  const handleAssignDraft = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      const result = await assignAssignment(id);
      if (result.success) { flash("Ödev atandı"); refreshAll(); }
      else flash(result.error || "Atama başarısız");
    } catch { flash("Atama başarısız"); }
  };

  const goDetail = (id: number) => router.push(paths.detail(id));

  const sortedAssignments = useMemo(() => {
    return [...assignments].sort((a, b) => {
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
        case "student": cmp = (a.student_name || "").localeCompare(b.student_name || "", "tr"); break;
      }
      return sortOrder === "desc" ? -cmp : cmp;
    });
  }, [assignments, sortBy, sortOrder]);

  const dueTodayStat = stats?.due_today ?? assignments.filter((a) => assignmentIsDueToday(a)).length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE) || 1);

  const selectStatusFilter = (next: FilterStatus) => {
    setFilterStatus(next);
    setFilterRisk("all");
    setFilterDueToday(false);
  };

  const selectDueTodayFilter = () => {
    setFilterDueToday(true);
    setFilterStatus("all");
    setFilterRisk("all");
  };
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);
  const pageItems = buildPageItems(page, totalPages);

  const renderRowMeta = (a: Assignment) => {
    const overdue = assignmentIsOverdue(a);
    const dueToday = assignmentIsDueToday(a);
    const nonSubmissionLabel =
      a.non_submission_reason_display ||
      (a.non_submission_reason ? NON_SUBMISSION_LABELS[a.non_submission_reason] : null);
    return { overdue, dueToday, nonSubmissionLabel, isDraft: a.status === "DRAFT" };
  };

  const renderPager = () => {
    if (totalCount <= PAGE_SIZE) {
      return (
        <div className="ok-pager">
          <span className="ok-pager-meta">{totalCount} ödev</span>
        </div>
      );
    }
    return (
      <div className="ok-pager">
        <span className="ok-pager-meta">
          {rangeStart}–{rangeEnd} / {totalCount} ödev
        </span>
        <div className="ok-pager-controls">
          <button
            type="button"
            className="ok-pager-btn"
            disabled={page <= 1 || loading}
            onClick={() => goToPage(page - 1)}
          >
            Önceki
          </button>
          {pageItems.map((item, idx) =>
            item === "ellipsis" ? (
              <span key={`e-${idx}`} className="ok-pager-ellipsis">…</span>
            ) : (
              <button
                key={item}
                type="button"
                className={`ok-pager-btn${page === item ? " is-active" : ""}`}
                disabled={loading}
                onClick={() => goToPage(item)}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className="ok-pager-btn"
            disabled={page >= totalPages || loading}
            onClick={() => goToPage(page + 1)}
          >
            Sonraki
          </button>
        </div>
      </div>
    );
  };

  const renderControlDay = (a: Assignment, overdue: boolean, dueToday: boolean) => {
    if (!a.due_date) return <span>—</span>;
    const days = daysUntilControlDay(a.due_date);
    const showCountdown =
      days !== null
      && a.status !== "COMPLETED"
      && a.status !== "CANCELLED";
    return (
      <span className={`ok-control-day${dueToday || overdue ? " is-due-today" : ""}`}>
        <span className="ok-control-day-date">{formatDate(a.due_date)}</span>
        {showCountdown && (
          <span className={controlCountdownClass(days!)}>{formatControlCountdown(days!)}</span>
        )}
      </span>
    );
  };

  const renderAssignmentRow = (a: Assignment) => {
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
            <h3 className="ok-list-row-title">{assignmentTitle(a)}</h3>
            <div className="ok-list-row-sub">{a.student_name}</div>
          </div>
          <span className={`ok-badge ${statusBadgeClass(a.status)}`}>{a.status_display}</span>
        </div>
        <div className="ok-list-row-meta">
          {renderControlDay(a, overdue, dueToday)}
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
  };

  return (
    <div className={`ok-root${isCoach ? " ok-coach" : ""}`}>
      {toast && <div className="ok-toast">{toast}</div>}

      <header className="ok-page-header">
        <div className="ok-page-header-text">
          <h1>Ödev Kontrol</h1>
          <p>
            {isCoach
              ? (filterDueToday
                ? "Bugün kontrol günü olan ödevler"
                : "Öğrencilerinizin ödevlerini kontrol edin")
              : "Atanan ödevleri filtreleyin, kontrol edin ve takip edin"}
          </p>
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
          <button
            type="button"
            className={`ok-filter-chip is-warning${filterDueToday ? " is-active" : ""}`}
            onClick={selectDueTodayFilter}
          >
            Kontrol günü<strong>{dueTodayStat}</strong>
          </button>
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
                className={`ok-filter-chip${!filterDueToday && filterStatus === chip.filter ? " is-active" : ""}`}
                onClick={() => selectStatusFilter(chip.filter)}
              >
                {chip.label}<strong>{value}</strong>
              </button>
            );
          })}
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
          value={filterDueToday ? "due_today" : filterStatus}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "due_today") selectDueTodayFilter();
            else selectStatusFilter(v as FilterStatus);
          }}
        >
          <option value="due_today">Kontrol günü (bugün)</option>
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
            <option value="DELAYED">Gecikmiş</option>
            <option value="CRITICAL">Kritik</option>
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
          <option value="due_date-asc">Kontrol yakın</option>
          <option value="due_date-desc">Kontrol uzak</option>
          <option value="progress-desc">İlerleme ↓</option>
          <option value="student-asc">Öğrenci A-Z</option>
        </select>
        {(filterStatus !== "all" || filterRisk !== "all" || filterDueToday || searchQuery) && (
          <button
            type="button"
            className="ok-btn-clear"
            onClick={() => {
              setFilterStatus("all");
              setFilterRisk("all");
              setFilterDueToday(false);
              setSearchQuery("");
              setDebouncedSearch("");
            }}
          >
            Temizle
          </button>
        )}
      </div>

      {loading ? (
        <div className="ok-loading">Yükleniyor...</div>
      ) : sortedAssignments.length === 0 ? (
        <div className="ok-empty">
          <h3>
            {filterDueToday ? "Bugün kontrol günü olan ödev yok" : "Ödev bulunamadı"}
          </h3>
          <p>
            {filterDueToday
              ? "Başka durumları görmek için “Toplam” veya “Temizle”ye basabilirsiniz."
              : searchQuery || filterStatus !== "all" || filterRisk !== "all"
                ? "Filtrelere uygun kayıt yok."
                : "Henüz ödev yok."}
          </p>
          {filterDueToday && (
            <button
              type="button"
              className="ok-btn-secondary"
              style={{ marginTop: 12 }}
              onClick={() => selectStatusFilter("all")}
            >
              Tüm ödevleri göster
            </button>
          )}
        </div>
      ) : (
        <>
          {renderPager()}

          <div className="ok-list-mobile">
            {sortedAssignments.map((a) => renderAssignmentRow(a))}
          </div>

          <table className="ok-table-list ok-list-desktop">
            <thead>
              <tr>
                <th>Öğrenci</th>
                <th>Ödev</th>
                <th>Kontrol</th>
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
                      {!isCoach && a.coach_name && (
                        <div className="ok-table-sub">{a.coach_name}</div>
                      )}
                    </td>
                    <td>
                      <div className="ok-table-title">{assignmentTitle(a)}</div>
                      <div className="ok-table-sub">{a.task_count} görev</div>
                    </td>
                    <td>
                      {renderControlDay(a, overdue, dueToday)}
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

          {renderPager()}
        </>
      )}
    </div>
  );
}
