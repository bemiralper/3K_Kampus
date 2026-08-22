"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useVectorPrint } from "@/lib/useVectorPrint";
import { downloadAssignmentServerPdf, fetchAssignmentReport } from "@/lib/resources-api";
import AssignmentNotifySendModal, { formatNotifySentToast } from "@/components/odev/AssignmentNotifySendModal";
import { useOdevKontrolPaths, buildNewAssignmentFromKontrolHref } from "@/components/odev/OdevKontrolPaths";
import { MetaCol, assignmentTypeLabel } from "@/components/odev/odevPdfMeta";
import { displayTestLabel, quotaBookIcon, quotaKindLabel, splitColumnMajor } from "@/components/odev/odevPlanTypes";
import { stripCompletionTitleSuffix } from "@/components/odev/odevCompletionHelpers";

/** Backend completion_utils ile aynı mantık */
function effectiveTaskCompletionPercent(task: {
  completion_status: string;
  task_completion_percent: number;
}): number {
  const status = task.completion_status;
  if (status === "PENDING" || status === "NOT_DONE") return 0;
  if (status === "DONE") return 100;
  if (status === "PARTIAL") {
    const pct = task.task_completion_percent || 0;
    return Math.min(90, Math.max(10, pct));
  }
  return Math.max(0, Math.min(100, task.task_completion_percent || 0));
}

function weightedTaskAvg(tasks: { completion_status: string; task_completion_percent: number }[]): number {
  if (tasks.length === 0) return 0;
  const total = tasks.reduce((s, t) => s + effectiveTaskCompletionPercent(t), 0);
  return Math.round(total / tasks.length);
}

// ─── Types ───
interface AssignmentTask {
  id: number;
  task_type: string;
  task_type_display: string;
  title: string;
  description: string;
  question_count: number | null;
  page_count: number | null;
  completion_status: string;
  completion_status_display: string;
  task_completion_percent: number;
  completed_question_count: number | null;
  completed_page_count: number | null;
  coach_evaluation_note: string;
  student_feedback?: string | null;
  evaluated_at: string | null;
  is_completion_task: boolean;
  previous_task_completion_percent: number | null;
  previous_assignment_title: string;
  content_topic_name?: string | null;
  content_topic_id?: number | null;
  content_unit_name?: string | null;
  content_unit_id?: number | null;
  content_sira?: number | null;
  quota_kind?: string;
  order?: number;
}

interface AssignmentLesson {
  id: number;
  lesson?: number | null;
  lesson_name: string;
  resource_book?: number | null;
  resource_book_name: string | null;
  content_mode: string;
  topic_name: string;
  page_start: number | null;
  page_end: number | null;
  test_number: string;
  tasks: AssignmentTask[];
}

interface ReportSummary {
  total_tasks: number;
  done_tasks: number;
  not_done_tasks: number;
  partial_tasks: number;
  pending_tasks: number;
  total_questions: number;
  completed_questions: number;
  remaining_questions: number;
  total_pages: number;
  completed_pages: number;
  remaining_pages: number;
  question_completion_percent: number;
  page_completion_percent: number;
  task_completion_percent: number;
  overall_completion_percent: number;
}

interface OverallStats {
  total_assignments: number;
  completed_assignments: number;
  in_progress_assignments: number;
  overdue_assignments: number;
  full_assignments: number;
  partial_assignments: number;
  not_brought_assignments: number;
  not_done_assignments: number;
  other_non_submission_assignments: number;
  pending_evaluations: number;
  evaluated_assignments: number;
  assignment_success_percent: number;
  total_tasks_all: number;
  done_tasks_all: number;
  partial_tasks_all: number;
  not_done_tasks_all: number;
  pending_tasks_all: number;
  total_questions_all: number;
  completed_questions_all: number;
  total_pages_all: number;
  completed_pages_all: number;
  overall_completion_percent: number;
  assignment_completion_percent: number;
  question_completion_percent_all: number;
}

interface TopicCumulative {
  lesson_id: number;
  lesson_name: string;
  topic_name: string;
  resource_book_name: string;
  current_total_questions: number;
  current_completed_questions: number;
  current_total_pages: number;
  current_completed_pages: number;
  cumulative_total_questions: number;
  cumulative_completed_questions: number;
  cumulative_total_pages: number;
  cumulative_completed_pages: number;
  cumulative_task_count: number;
  cumulative_done_task_count: number;
  cumulative_assignment_count: number;
  cumulative_completion_percent: number;
}

interface BookCumulative {
  resource_book: number;
  resource_book_name: string;
  quota_kind: string;
  current_total_questions: number;
  current_completed_questions: number;
  cumulative_total_questions: number;
  cumulative_completed_questions: number;
  cumulative_assignment_count: number;
}

interface ReportData {
  id: number;
  student_name: string;
  student_info: { id: number; ad: string; soyad: string; tc_kimlik_no?: string; profil_foto?: string | null } | null;
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
  completed_date: string | null;
  completion_percent: number;
  postpone_count: number;
  original_due_date: string | null;
  postpone_reason: string;
  late_submission_note: string;
  is_late_submission: boolean;
  late_days: number;
  non_submission_reason: string;
  non_submission_note: string;
  lessons: AssignmentLesson[];
  report_summary: ReportSummary;
}

interface FullReportData {
  data: ReportData;
  overall_stats: OverallStats;
  topic_cumulative: TopicCumulative[];
  book_cumulative: BookCumulative[];
}

// ─── Helpers ───
const formatDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
};

const getGrade = (pct: number): { label: string; color: string; bg: string; emoji: string } => {
  if (pct >= 90) return { label: "Mükemmel", color: "#16a34a", bg: "#f0fdf4", emoji: "🌟" };
  if (pct >= 75) return { label: "İyi", color: "#2563eb", bg: "#eff6ff", emoji: "👍" };
  if (pct >= 60) return { label: "Orta", color: "#d97706", bg: "#fffbeb", emoji: "📊" };
  if (pct >= 40) return { label: "Geliştirilmeli", color: "#ea580c", bg: "#fff7ed", emoji: "⚠️" };
  return { label: "Yetersiz", color: "#dc2626", bg: "#fef2f2", emoji: "❌" };
};

const getCompletionBadge = (cs: string) => {
  switch (cs) {
    case "DONE": return { bg: "#dcfce7", text: "#16a34a", label: "Yaptı" };
    case "NOT_DONE": return { bg: "#fee2e2", text: "#dc2626", label: "Yapmadı" };
    case "PARTIAL": return { bg: "#fef3c7", text: "#d97706", label: "Eksik" };
    default: return { bg: "#f1f5f9", text: "#94a3b8", label: "Beklemede" };
  }
};

function pctColor(pct: number): string {
  if (pct >= 75) return "#16a34a";
  if (pct >= 50) return "#d97706";
  return "#dc2626";
}

/** Plan PDF ile aynı hiyerarşi: Kitap → Ünite → Konu → Test (+ değerlendirme) */
function ReportTaskRow({ task, topicName }: { task: AssignmentTask; topicName: string }) {
  const badge = getCompletionBadge(task.completion_status);
  const effPct = effectiveTaskCompletionPercent(task);
  const label = displayTestLabel(task.title, topicName);
  const typeKey = task.task_type || "";
  const qText = task.question_count
    ? `${task.completed_question_count ?? 0}/${task.question_count} Soru`
    : task.page_count
      ? `${task.completed_page_count ?? 0}/${task.page_count} Sayfa`
      : "";

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      padding: "6px 10px",
      minHeight: 34,
      borderBottom: "1px solid #f0f2f5",
      fontSize: 11,
      color: "#172b4c",
      background: "#fff",
    }}>
      <span style={{
        display: "inline-flex",
        width: 12,
        height: 12,
        marginTop: 2,
        borderRadius: 3,
        flexShrink: 0,
        background: task.completion_status === "DONE" ? "#16a34a"
          : task.completion_status === "PARTIAL" ? "#d97706"
            : task.completion_status === "NOT_DONE" ? "#dc2626" : "#e2e8f0",
        border: task.completion_status === "PENDING" || !task.completion_status
          ? "1.5px solid #cbd5e1" : "none",
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 500,
          lineHeight: 1.3,
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          whiteSpace: "normal",
        }}>
          {label}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginTop: 3 }}>
          <span style={{
            padding: "1px 7px", borderRadius: 10, fontSize: 9, fontWeight: 600,
            background: badge.bg, color: badge.text,
          }}>
            {badge.label}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: pctColor(effPct) }}>
            %{effPct}
          </span>
          {task.quota_kind && (
            <span style={{
              fontSize: 8, fontWeight: 700,
              color: task.quota_kind === "PROBLEM" ? "#b45309" : "#0369a1",
            }}>
              {quotaBookIcon(task.quota_kind)} {quotaKindLabel(task.quota_kind)}
            </span>
          )}
          {typeKey && typeKey !== "SOLVE_TEST" && typeKey !== "TEST_SET" && typeKey !== "QUOTA" && !task.quota_kind && (
            <span style={{ fontSize: 8, color: "#94a3b8" }}>{assignmentTypeLabel(typeKey)}</span>
          )}
        </div>
        {task.coach_evaluation_note && (
          <div style={{
            fontSize: 9, color: "#6d28d9", fontStyle: "italic", marginTop: 2, lineHeight: 1.2,
            wordBreak: "break-word",
          }}>
            💬 {task.coach_evaluation_note}
          </div>
        )}
        {task.student_feedback && (
          <div style={{
            fontSize: 9, color: "#0369a1", fontStyle: "italic", marginTop: 2, lineHeight: 1.2,
            wordBreak: "break-word",
          }}>
            🗣️ Öğrenci: {task.student_feedback}
          </div>
        )}
      </div>
      <div style={{
        flexShrink: 0,
        textAlign: "right",
        fontSize: 10,
        fontWeight: 600,
        color: "#475569",
        whiteSpace: "nowrap",
        paddingTop: 1,
        minWidth: 64,
      }}>
        {qText}
      </div>
    </div>
  );
}

function BookCumulativeBlock({ bookCum }: { bookCum: BookCumulative }) {
  if (!bookCum || bookCum.cumulative_total_questions <= 0) return null;
  const kindLabel = quotaKindLabel(bookCum.quota_kind) || "Kitap";
  return (
    <div style={{
      margin: "8px 10px 8px",
      padding: "8px 12px",
      background: bookCum.quota_kind === "PROBLEM"
        ? "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)"
        : "linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%)",
      borderRadius: 8,
      border: bookCum.quota_kind === "PROBLEM" ? "1px solid #fdba74" : "1px solid #7dd3fc",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700,
        color: bookCum.quota_kind === "PROBLEM" ? "#b45309" : "#0369a1",
        marginBottom: 6,
      }}>
        {quotaBookIcon(bookCum.quota_kind)} {kindLabel} kitabı — bugüne kadar
        {bookCum.cumulative_assignment_count > 1 && (
          <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.75, marginLeft: 6 }}>
            ({bookCum.cumulative_assignment_count} ödev)
          </span>
        )}
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>
        {bookCum.cumulative_completed_questions}
        <span style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8" }}>
          {" "}/ {bookCum.cumulative_total_questions} soru
        </span>
      </div>
      <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
        Bu ödevde: {bookCum.current_completed_questions}/{bookCum.current_total_questions} soru
      </div>
    </div>
  );
}

function TopicCumulativeBlock({ topicCum }: { topicCum: TopicCumulative }) {
  if (!topicCum || (topicCum.cumulative_total_questions <= 0 && topicCum.cumulative_total_pages <= 0)) {
    return null;
  }
  return (
    <div style={{
      margin: "8px 10px 4px",
      padding: "8px 12px",
      background: "linear-gradient(135deg, #ede9fe 0%, #faf5ff 100%)",
      borderRadius: 8,
      border: "1px solid #ddd6fe",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#7c3aed", marginBottom: 6,
        display: "flex", alignItems: "center", gap: 4,
      }}>
        📊 Bu Konudan Bugüne Kadar Toplam
        {topicCum.cumulative_assignment_count > 1 && (
          <span style={{ fontSize: 12, fontWeight: 500, color: "#a78bfa" }}>
            ({topicCum.cumulative_assignment_count} ödevden)
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {topicCum.cumulative_total_questions > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: "#10b981",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 11, fontWeight: 700,
            }}>
              📝
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>
                {topicCum.cumulative_completed_questions}
                <span style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8" }}>
                  {" "}/ {topicCum.cumulative_total_questions} soru
                </span>
              </div>
              <div style={{ fontSize: 10, color: "#64748b" }}>
                Bu ödevde: {topicCum.current_completed_questions}/{topicCum.current_total_questions} soru
              </div>
            </div>
          </div>
        )}
        {topicCum.cumulative_total_pages > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: "#8b5cf6",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 11, fontWeight: 700,
            }}>
              📄
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>
                {topicCum.cumulative_completed_pages}
                <span style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8" }}>
                  {" "}/ {topicCum.cumulative_total_pages} sayfa
                </span>
              </div>
              <div style={{ fontSize: 10, color: "#64748b" }}>
                Bu ödevde: {topicCum.current_completed_pages}/{topicCum.current_total_pages} sayfa
              </div>
            </div>
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
          <div style={{
            padding: "4px 12px", background: "#7c3aed", borderRadius: 16,
            color: "white", fontSize: 11, fontWeight: 700,
          }}>
            %{topicCum.cumulative_completion_percent} tamamlandı
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Circular Progress ───
function CircularProgress({ value, size = 120, strokeWidth = 10, color = "#0262a7", label, sublabel }: { value: number; size?: number; strokeWidth?: number; color?: string; label?: string; sublabel?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div style={{ position: "relative", width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease-out" }} />
      </svg>
      <div style={{ position: "absolute", textAlign: "center" }}>
        <div style={{ fontSize: size * 0.22, fontWeight: 800, color }}>%{value}</div>
        {label && <div style={{ fontSize: size * 0.1, color: "#94a3b8", fontWeight: 500 }}>{label}</div>}
        {sublabel && <div style={{ fontSize: size * 0.08, color: "#cbd5e1", fontWeight: 400, marginTop: 1 }}>{sublabel}</div>}
      </div>
    </div>
  );
}

// ─── Component ───
export interface OdevKontrolReportClientProps {
  printMode?: boolean;
  printToken?: string;
  assignmentIdOverride?: string;
  initialOrientation?: "portrait" | "landscape";
}

export default function OdevKontrolReportClient({
  printMode = false,
  printToken,
  assignmentIdOverride,
  initialOrientation = "portrait",
}: OdevKontrolReportClientProps = {}) {
  const paths = useOdevKontrolPaths();
  const params = useParams();
  const assignmentId = assignmentIdOverride ?? (params.id as string);
  const printRef = useRef<HTMLDivElement>(null);

  const [fullReport, setFullReport] = useState<FullReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendToast, setSendToast] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAssignmentReport(assignmentId, {
        printToken: printMode ? printToken : undefined,
      });
      if (result.success && result.data) {
        setFullReport({
          data: result.data as unknown as ReportData,
          overall_stats: (result.overall_stats || {}) as unknown as OverallStats,
          topic_cumulative: (result.topic_cumulative || []) as unknown as TopicCumulative[],
          book_cumulative: (result.book_cumulative || []) as unknown as BookCumulative[],
        });
      }
    } catch (e) {
      console.error("Rapor yüklenemedi:", e);
      setError("Rapor yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.");
    }
    setLoading(false);
  }, [assignmentId, printMode, printToken]);

  useEffect(() => {
    if (printMode && fullReport && !loading && !error) {
      document.body.setAttribute("data-pdf-ready", "true");
    }
  }, [printMode, fullReport, loading, error]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Derse gore soru istatistikleri — aynı ders adına sahip lesson'ları grupla
  const groupedLessonStats = useMemo(() => {
    if (!fullReport) return [];
    const map = new Map<string, {
      subjectName: string;
      items: { lesson: any; totalQ: number; completedQ: number; totalP: number; completedP: number; totalTasks: number; doneTasks: number; avgPct: number; topicCum: any }[];
      totalQ: number; completedQ: number; totalP: number; completedP: number; totalTasks: number; doneTasks: number; avgPct: number;
    }>();
    fullReport.data.lessons.forEach(lesson => {
      const subjectName = lesson.lesson_name || "Ders";
      const totalQ = lesson.tasks.reduce((s: number, t: any) => s + (t.question_count || 0), 0);
      const completedQ = lesson.tasks.reduce((s: number, t: any) => s + (t.completed_question_count || 0), 0);
      const totalP = lesson.tasks.reduce((s: number, t: any) => s + (t.page_count || 0), 0);
      const completedP = lesson.tasks.reduce((s: number, t: any) => s + (t.completed_page_count || 0), 0);
      const totalTasks = lesson.tasks.length;
      const doneTasks = lesson.tasks.filter((t: any) => t.completion_status === "DONE").length;
      const avgPct = weightedTaskAvg(lesson.tasks);
      const topicCum = fullReport.topic_cumulative.find((tc: any) => tc.lesson_id === lesson.id);
      const item = { lesson, totalQ, completedQ, totalP, completedP, totalTasks, doneTasks, avgPct, topicCum };
      if (!map.has(subjectName)) {
        map.set(subjectName, { subjectName, items: [item], totalQ, completedQ, totalP, completedP, totalTasks, doneTasks, avgPct });
      } else {
        const g = map.get(subjectName)!;
        g.items.push(item);
        g.totalQ += totalQ;
        g.completedQ += completedQ;
        g.totalP += totalP;
        g.completedP += completedP;
        g.totalTasks += totalTasks;
        g.doneTasks += doneTasks;
        // avgPct'yi tüm görevlerin ortalaması olarak tekrar hesapla
        const allTasks = g.items.flatMap(i => i.lesson.tasks);
        g.avgPct = weightedTaskAvg(allTasks);
      }
    });
    return Array.from(map.values());
  }, [fullReport]);

  const [orientation, setOrientation] = useState<"portrait" | "landscape">(initialOrientation);

  /* ─── PDF hooks ─── */
  const [pdfBusy, setPdfBusy] = useState(false);

  const { print: printVector } = useVectorPrint({
    title: `Ödev Rapor - ${fullReport?.data.student_name || 'rapor'}`,
    orientation,
    marginMm: "6mm 6mm",
    externalRef: printRef as React.RefObject<HTMLDivElement>,
  });

  const handlePDF = useCallback(async () => {
    setPdfBusy(true);
    try {
      await printVector();
    } finally {
      setPdfBusy(false);
    }
  }, [printVector]);

  const handleDownload = useCallback(async () => {
    const id = Number(assignmentId);
    if (!id) return;
    setPdfBusy(true);
    try {
      await downloadAssignmentServerPdf(id, "report", orientation);
    } catch (e) {
      setSendToast(e instanceof Error ? e.message : "PDF indirilemedi");
      window.setTimeout(() => setSendToast(null), 4000);
    } finally {
      setPdfBusy(false);
    }
  }, [assignmentId, orientation]);

  if (loading) return (
    <div style={{ padding: printMode ? 24 : 60, textAlign: "center", fontFamily: "'Poppins', sans-serif", color: "#64748b" }}>
      {!printMode && <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>}
      Rapor yükleniyor...
    </div>
  );

  if (!fullReport) return (
    <div style={{ padding: printMode ? 24 : 60, textAlign: "center", fontFamily: "'Poppins', sans-serif" }}>
      {error ? (
        <>
          {!printMode && <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>}
          <h2 style={{ color: "#dc2626", marginBottom: 8 }}>Hata</h2>
          <p style={{ color: "#64748b", marginBottom: 16 }}>{error}</p>
          {!printMode && (
            <>
              <button onClick={() => { setError(null); fetchReport(); }} style={{ padding: "10px 20px", background: "#0262a7", color: "white", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", marginRight: 12 }}>Tekrar Dene</button>
              <Link href={paths.list} style={{ color: "#0262a7" }}>← Geri Dön</Link>
            </>
          )}
        </>
      ) : (
        <>
          <h2>Rapor bulunamadı</h2>
          {!printMode && <Link href={paths.list} style={{ color: "#0262a7" }}>← Geri Dön</Link>}
        </>
      )}
    </div>
  );

  const report = fullReport.data;
  const summary = report.report_summary;
  const overall = fullReport.overall_stats;
  const grade = getGrade(summary.overall_completion_percent);

  const hasQuestions = summary.total_questions > 0;
  const hasPages = summary.total_pages > 0;

  const headerLogoUrl = "/img/beyaz-logo.png";
  const footerLogoUrl = "/img/3k-logo.png";
  const currentYear = new Date().getFullYear();
  const todayStr = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className={printMode ? undefined : "ok-report-overlay"} style={printMode ? { background: "#fff" } : undefined}>
      <div
        className={printMode ? undefined : "ok-report-shell"}
        style={{
          maxWidth: printMode ? "100%" : (orientation === "landscape" ? 1160 : 900),
          ...(printMode ? { background: "#fff", boxShadow: "none", borderRadius: 0, margin: 0 } : {}),
        }}
      >
        {!printMode && (
        <>
        {/* TOOLBAR */}
        <div className="ok-report-toolbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href={paths.detail(assignmentId)} className="ok-btn-secondary">← Geri</Link>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "#1e293b" }}>
              Detaylı Sonuç Raporu
            </h3>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="ok-segment">
              <button
                type="button"
                onClick={() => setOrientation("portrait")}
                className={`ok-segment-btn${orientation === "portrait" ? " is-active-done" : ""}`}
              >Dikey</button>
              <button
                type="button"
                onClick={() => setOrientation("landscape")}
                className={`ok-segment-btn${orientation === "landscape" ? " is-active-done" : ""}`}
              >Yatay</button>
            </div>

            <button type="button" onClick={handlePDF} disabled={pdfBusy} className="ok-btn-primary">
              {pdfBusy ? "Hazırlanıyor..." : "PDF Önizle"}
            </button>
            <button type="button" onClick={handleDownload} disabled={pdfBusy} className="ok-btn-secondary">
              {pdfBusy ? "Hazırlanıyor..." : "PDF İndir"}
            </button>
            <button
              type="button"
              onClick={() => setShowSendModal(true)}
              className="ok-btn-secondary"
              style={{ background: "#ecfdf5", borderColor: "#6ee7b7", color: "#047857" }}
              title="Veli ve öğrenciye ödev kontrol raporu PDF'ini WhatsApp ile gönder"
            >
              WhatsApp Gönder (PDF)
            </button>
          </div>
        </div>
        </>
        )}

        {/* A4 CONTENT */}
        <div ref={printRef} id="rapor-print-area" style={{
          padding: orientation === "landscape" ? "12px 14px" : "14px 10px",
          fontFamily: "'Poppins', sans-serif",
          color: "#172b4c", lineHeight: 1.4,
          maxWidth: orientation === "landscape" ? 1100 : 860,
          margin: "0 auto",
        }}>
        {/* HEADER — plan PDF ile aynı kompakt dil */}
        <div className="ok-report-header">
          <div style={{ position: "absolute", top: -24, right: -24, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={headerLogoUrl}
                alt="3K"
                crossOrigin="anonymous"
                style={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0 }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.6, lineHeight: 1.2 }}>3K KAMPÜS</div>
                <div style={{
                  marginTop: 3, display: "inline-block", padding: "1px 8px", borderRadius: 10,
                  background: "rgba(255,255,255,0.16)", fontSize: 8, fontWeight: 600,
                  letterSpacing: 1.2, textTransform: "uppercase",
                }}>
                  Ödev Sonuç Raporu
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right", flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 15, fontWeight: 700, margin: 0, lineHeight: 1.25,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {stripCompletionTitleSuffix(report.title) || "İsimsiz Ödev"}
              </div>
              <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>
                ÖSR-{assignmentId} · {todayStr}
              </div>
            </div>
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "rgba(255,255,255,0.12)", borderRadius: 8,
            padding: "7px 12px",
          }}>
            {report.student_info?.profil_foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={report.student_info.profil_foto}
                alt={report.student_name}
                crossOrigin="anonymous"
                style={{
                  width: 34, height: 34, borderRadius: "50%", objectFit: "cover",
                  border: "1.5px solid rgba(255,255,255,0.5)", flexShrink: 0,
                }}
              />
            ) : (
              <div style={{
                width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700,
              }}>
                {report.student_name.split(" ").map(w => w.charAt(0)).join("").substring(0, 2)}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {report.student_name}
              </div>
              <div style={{ fontSize: 9, opacity: 0.75 }}>
                Öğrenci · {report.status_display} · {report.priority_display} öncelik
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 10, opacity: 0.95, flexShrink: 0 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 8, opacity: 0.7, lineHeight: 1.2 }}>Verilme</div>
                <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{formatDate(report.assigned_date)}</div>
              </div>
              <div style={{ width: 1, background: "rgba(255,255,255,0.3)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 8, opacity: 0.7, lineHeight: 1.2 }}>Teslim</div>
                <div style={{ fontWeight: 600, color: "#fbbf24", lineHeight: 1.2 }}>{formatDate(report.due_date)}</div>
              </div>
              {report.coach_name && (
                <>
                  <div style={{ width: 1, background: "rgba(255,255,255,0.3)" }} />
                  <div style={{ textAlign: "center", maxWidth: 90 }}>
                    <div style={{ fontSize: 8, opacity: 0.7, lineHeight: 1.2 }}>Koç</div>
                    <div style={{ fontWeight: 600, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{report.coach_name}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Özet sütun kutuları — plan PDF ile aynı dil */}
        <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
          <MetaCol
            label="Görev"
            value={`${summary.done_tasks}/${summary.total_tasks}`}
            minWidth={56}
            valueColor="#4338ca"
            borderColor="#c7d2fe"
            background="#eef2ff"
          />
          {hasQuestions && (
            <MetaCol
              label="Soru"
              value={`${summary.completed_questions}/${summary.total_questions}`}
              minWidth={56}
              valueColor="#ea580c"
              borderColor="#fed7aa"
              background="#fff7ed"
            />
          )}
          {hasPages && (
            <MetaCol
              label="Sayfa"
              value={`${summary.completed_pages}/${summary.total_pages}`}
              minWidth={56}
              valueColor="#be185d"
              borderColor="#fbcfe8"
              background="#fdf2f8"
            />
          )}
          <MetaCol
            label="Başarı"
            value={`%${summary.overall_completion_percent}`}
            minWidth={56}
            valueColor={grade.color}
            borderColor="#e2e8f0"
            background="#fff"
          />
          <MetaCol
            label="Yaptı"
            value={String(summary.done_tasks)}
            minWidth={48}
            valueColor="#16a34a"
            borderColor="#bbf7d0"
            background="#f0fdf4"
          />
          <MetaCol
            label="Eksik"
            value={String(summary.partial_tasks)}
            minWidth={48}
            valueColor="#d97706"
            borderColor="#fde68a"
            background="#fffbeb"
          />
          <MetaCol
            label="Yapmadı"
            value={String(summary.not_done_tasks)}
            minWidth={48}
            valueColor="#dc2626"
            borderColor="#fecaca"
            background="#fef2f2"
          />
        </div>

        {/* ====== GEÇ TESLİM / ERTELEME UYARI KUTUSU ====== */}
        {(report.is_late_submission || report.postpone_count > 0) && (
          <div className="page-break-avoid" style={{ borderRadius: 12, overflow: "hidden", marginBottom: 16, border: "1px solid #fecaca", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            {/* Geç Teslim */}
            {report.is_late_submission && (
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)", borderBottom: report.postpone_count > 0 ? "1px solid #fecaca" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#dc2626" }}>
                    Geç Teslim — {report.late_days} gün gecikme
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#991b1b", display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <span>Son teslim: <strong>{formatDate(report.original_due_date || report.due_date)}</strong></span>
                  <span>Tamamlanma: <strong>{formatDate(report.completed_date)}</strong></span>
                </div>
                {report.late_submission_note && (
                  <div style={{ marginTop: 8, padding: "10px 14px", background: "rgba(255,255,255,0.7)", borderRadius: 8, border: "1px solid #fecaca", fontSize: 12, color: "#7f1d1d" }}>
                    📝 <strong>Geç Teslim Notu:</strong> {report.late_submission_note}
                  </div>
                )}
              </div>
            )}
            {/* Erteleme */}
            {report.postpone_count > 0 && (
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>📅</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#b45309" }}>
                    {report.postpone_count} Kez Ertelendi
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#92400e", display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {report.original_due_date && (
                    <span>İlk teslim: <strong style={{ textDecoration: "line-through" }}>{formatDate(report.original_due_date)}</strong></span>
                  )}
                  <span>Güncel teslim: <strong>{formatDate(report.due_date)}</strong></span>
                </div>
                {report.postpone_reason && (
                  <div style={{ marginTop: 8, padding: "10px 14px", background: "rgba(255,255,255,0.7)", borderRadius: 8, border: "1px solid #fde68a", fontSize: 12, color: "#78350f" }}>
                    📝 <strong>Erteleme Sebebi:</strong> {report.postpone_reason}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ====== ÖDEV GETİRİLMEDİ UYARI KUTUSU ====== */}
        {report.non_submission_reason && (
          <div className="page-break-avoid" style={{ borderRadius: 12, overflow: "hidden", marginBottom: 16, border: "2px solid #dc2626", boxShadow: "0 2px 8px rgba(220,38,38,0.12)" }}>
            <div style={{ padding: "16px 20px", background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>🚫</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#dc2626" }}>ÖDEV GETİRİLMEDİ</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#991b1b", marginBottom: 4 }}>
                Sebep: {report.non_submission_reason === "NOT_BROUGHT" ? "Öğrenci ödevi getirmedi" : report.non_submission_reason === "NOT_DONE" ? "Öğrenci ödevi yapmamış" : report.non_submission_reason === "CONTROL_NOT_POSSIBLE" ? "Ödev kontrolü yapılamadı" : "Diğer"}
              </div>
              {report.non_submission_note && (
                <div style={{ marginTop: 8, padding: "10px 14px", background: "rgba(255,255,255,0.7)", borderRadius: 8, border: "1px solid #fecaca", fontSize: 12, color: "#7f1d1d" }}>
                  📝 <strong>Not:</strong> {report.non_submission_note}
                </div>
              )}
            </div>
          </div>
        )}

        {report.description && (
          <div style={{
            padding: "8px 12px", marginBottom: 12,
            background: "#fffbeb", border: "1px solid #fde68a",
            borderRadius: 8, fontSize: 11, color: "#92400e", lineHeight: 1.5,
          }}>
            <strong>📌 Koç Notu:</strong>
            <div style={{ whiteSpace: "pre-line", marginTop: 4 }}>{report.description}</div>
          </div>
        )}

        {/* ====== BOLUM 2: DEGERLENDIRME + GÖREV DURUMLARI ====== */}
        <div className="ok-report-eval-panel">
          {/* Sol: Değerlendirme + İlerleme barı */}
          <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, borderRight: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 40 }}>{grade.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: grade.color }}>{grade.label}</span>
                <span style={{ fontSize: 15, color: "#64748b" }}>·</span>
                <span style={{ fontSize: 26, fontWeight: 800, color: grade.color }}>%{summary.overall_completion_percent}</span>
              </div>
              <div style={{ height: 10, background: "#e2e8f0", borderRadius: 5, marginTop: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${summary.overall_completion_percent}%`, background: `linear-gradient(90deg, ${grade.color}, ${grade.color}cc)`, borderRadius: 5, transition: "width 0.8s" }} />
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 5 }}>
                {summary.done_tasks} yaptı · {summary.partial_tasks} eksik · {summary.not_done_tasks} yapmadı
                {summary.pending_tasks > 0 ? ` · ${summary.pending_tasks} bekliyor` : ""}
              </div>
            </div>
          </div>
          {/* Sağ: Görev dağılımı - kompakt kutular */}
          <div style={{ display: "flex", alignItems: "stretch", gap: 0, padding: "0" }}>
            {[
              { value: summary.done_tasks, label: "Yaptı", color: "#16a34a", bg: "#f0fdf4" },
              { value: summary.partial_tasks, label: "Eksik", color: "#d97706", bg: "#fffbeb" },
              { value: summary.not_done_tasks, label: "Yapmadı", color: "#dc2626", bg: "#fef2f2" },
              { value: summary.pending_tasks, label: "Bekliyor", color: "#94a3b8", bg: "#f8fafc" },
            ].map((s, i) => (
              <div key={s.label} style={{ textAlign: "center", padding: "16px 16px", borderLeft: i > 0 ? "1px solid #f1f5f9" : "none", background: s.value > 0 ? s.bg : "transparent", minWidth: 72 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.value > 0 ? s.color : "#d1d5db" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: s.value > 0 ? s.color : "#94a3b8", fontWeight: 600, marginTop: 3, whiteSpace: "nowrap" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ====== BOLUM 3: OZET KARTLARI ====== */}
        <div className="ok-report-stat-grid" style={{ gridTemplateColumns: `repeat(${2 + (hasQuestions ? 1 : 0) + (hasPages ? 1 : 0)}, 1fr)` }}>
          <div className="ok-report-stat-card">
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>GÖREV</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#1e293b" }}>{summary.done_tasks}<span style={{ fontSize: 14, color: "#94a3b8" }}>/{summary.total_tasks}</span></div>
            <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${summary.task_completion_percent}%`, background: "#0262a7", borderRadius: 3, transition: "width 1s" }} />
            </div>
            <div style={{ fontSize: 11, color: "#0262a7", marginTop: 4, fontWeight: 600 }}>
              %{summary.task_completion_percent} değerlendirme ort.
            </div>
            {summary.partial_tasks > 0 && (
              <div style={{ fontSize: 10, color: "#b45309", marginTop: 2 }}>
                {summary.partial_tasks} eksik görev
              </div>
            )}
          </div>

          {hasQuestions && (
            <div className="ok-report-stat-card">
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>SORU</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#10b981" }}>{summary.completed_questions}<span style={{ fontSize: 14, color: "#94a3b8" }}>/{summary.total_questions}</span></div>
              <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${summary.question_completion_percent}%`, background: "#10b981", borderRadius: 3, transition: "width 1s" }} />
              </div>
              <div style={{ fontSize: 11, color: "#10b981", marginTop: 4, fontWeight: 600 }}>%{summary.question_completion_percent} çözüldü</div>
            </div>
          )}

          {hasPages && (
            <div className="ok-report-stat-card">
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>SAYFA</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#8b5cf6" }}>{summary.completed_pages}<span style={{ fontSize: 14, color: "#94a3b8" }}>/{summary.total_pages}</span></div>
              <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${summary.page_completion_percent}%`, background: "#8b5cf6", borderRadius: 3, transition: "width 1s" }} />
              </div>
              <div style={{ fontSize: 11, color: "#8b5cf6", marginTop: 4, fontWeight: 600 }}>%{summary.page_completion_percent} okundu</div>
            </div>
          )}

          <div className="ok-report-stat-card">
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>BAŞARI</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: grade.color }}>%{summary.overall_completion_percent}</div>
            <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${summary.overall_completion_percent}%`, background: grade.color, borderRadius: 3, transition: "width 1s" }} />
            </div>
            <div style={{ fontSize: 11, color: grade.color, marginTop: 4, fontWeight: 600 }}>{grade.label}</div>
          </div>
        </div>

        {/* ====== BOLUM 4: DERS BAZLI ANALIZ + KUMULATIF ====== */}
        <div className="ok-report-card" style={{ marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(90deg, #f8fafc, #fff)" }}>
            <div>
              <h2 className="ok-report-section-title">📚 Ders Bazlı Analiz</h2>
              <div className="ok-report-section-sub">{groupedLessonStats.length} ders · görev ve konu detayları</div>
            </div>
          </div>
          <div style={{ padding: 0 }}>
            {groupedLessonStats.map((group, gIdx) => (
              <div key={group.subjectName} className="ok-report-subject" style={{ borderBottom: gIdx < groupedLessonStats.length - 1 ? "2px solid #e2e8f0" : "none" }}>
                {/* Ders Başlığı — Grup Header (plan PDF ile uyumlu) */}
                <div style={{
                  padding: "10px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#0061a6",
                  color: "#fff",
                  gap: 8,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 700, lineHeight: 1.3,
                      wordBreak: "break-word", overflowWrap: "anywhere",
                    }}>
                      {gIdx + 1}. {group.subjectName}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>
                      {group.items.length} kaynak · {group.totalTasks} görev
                      {group.totalQ > 0 ? ` · ${group.completedQ}/${group.totalQ} soru` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <CircularProgress
                      value={group.avgPct}
                      size={40}
                      strokeWidth={4}
                      color={group.avgPct >= 75 ? "#86efac" : group.avgPct >= 50 ? "#fcd34d" : "#fca5a5"}
                    />
                  </div>
                </div>

                {/* Ders Genel Istatistik Barlari */}
                <div style={{ padding: "0 20px 8px", display: "flex", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginBottom: 2 }}>
                      <span>Görev değerlendirme</span>
                      <span>%{group.avgPct}</span>
                    </div>
                    <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${group.avgPct}%`, background: "#0262a7", borderRadius: 3 }} />
                    </div>
                  </div>
                  {group.totalQ > 0 && (
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginBottom: 2 }}>
                        <span>Sorular: {group.completedQ}/{group.totalQ}</span>
                        <span>{Math.round(group.completedQ / group.totalQ * 100)}%</span>
                      </div>
                      <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${group.completedQ / group.totalQ * 100}%`, background: "#10b981", borderRadius: 3 }} />
                      </div>
                    </div>
                  )}
                  {group.totalP > 0 && (
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginBottom: 2 }}>
                        <span>Sayfalar: {group.completedP}/{group.totalP}</span>
                        <span>{Math.round(group.completedP / group.totalP * 100)}%</span>
                      </div>
                      <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${group.completedP / group.totalP * 100}%`, background: "#8b5cf6", borderRadius: 3 }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Alt Kaynaklar: Kitap → Ünite → Konu → Test (plan PDF ile aynı) */}
                {(() => {
                  type TopicSec = {
                    topicId: number;
                    topicName: string;
                    tasks: AssignmentTask[];
                    topicCum: TopicCumulative | null;
                  };
                  type UnitSec = {
                    unitId: number;
                    unitName: string;
                    topics: TopicSec[];
                  };
                  type BookSec = {
                    bookId: number;
                    bookName: string;
                    units: UnitSec[];
                    totalTasks: number;
                    avgPct: number;
                  };

                  const books: BookSec[] = [];
                  const bookMap = new Map<string, BookSec>();

                  group.items.forEach((ls) => {
                    const bookId = ls.lesson.resource_book ?? 0;
                    const bookName = (ls.lesson.resource_book_name || "").trim() || "Kitap";
                    const bookKey = `${bookId}:${bookName}`;
                    let book = bookMap.get(bookKey);
                    if (!book) {
                      book = {
                        bookId: bookId || books.length + 1,
                        bookName,
                        units: [],
                        totalTasks: 0,
                        avgPct: 0,
                      };
                      bookMap.set(bookKey, book);
                      books.push(book);
                    }

                    (ls.lesson.tasks as AssignmentTask[]).forEach((task) => {
                      book!.totalTasks += 1;
                      const unitName = (task.content_unit_name || "").trim() || "Ünite";
                      const unitId = task.content_unit_id ?? 0;
                      let unit = book!.units.find((u) =>
                        unitId ? u.unitId === unitId : u.unitName === unitName,
                      );
                      if (!unit) {
                        unit = {
                          unitId: unitId || book!.units.length + 1,
                          unitName,
                          topics: [],
                        };
                        book!.units.push(unit);
                      }

                      const topicName = (task.content_topic_name || ls.lesson.topic_name || "Konu").trim() || "Konu";
                      const topicId = task.content_topic_id ?? ls.lesson.id;
                      let topic = unit.topics.find((t) =>
                        topicId ? t.topicId === topicId : t.topicName === topicName,
                      );
                      if (!topic) {
                        topic = {
                          topicId: topicId || unit.topics.length + 1,
                          topicName,
                          tasks: [],
                          topicCum: (ls.topicCum as TopicCumulative) || null,
                        };
                        unit.topics.push(topic);
                      } else if (!topic.topicCum && ls.topicCum) {
                        topic.topicCum = ls.topicCum as TopicCumulative;
                      }
                      topic.tasks.push(task);
                    });
                  });

                  for (const book of books) {
                    const allTasks = book.units.flatMap((u) => u.topics.flatMap((t) => t.tasks));
                    book.avgPct = weightedTaskAvg(allTasks);
                    for (const unit of book.units) {
                      for (const topic of unit.topics) {
                        if (topic.tasks.some((t) => t.content_sira != null)) {
                          topic.tasks.sort((a, b) => {
                            const sa = a.content_sira ?? Number.MAX_SAFE_INTEGER;
                            const sb = b.content_sira ?? Number.MAX_SAFE_INTEGER;
                            if (sa !== sb) return sa - sb;
                            return (a.order ?? a.id) - (b.order ?? b.id);
                          });
                        }
                      }
                    }
                  }

                  return books.map((book, bookIdx) => (
                    <div
                      key={`${book.bookId}-${book.bookName}`}
                      style={{
                        borderBottom: bookIdx < books.length - 1 ? "1px solid #e4e9f2" : "none",
                      }}
                    >
                      <div style={{
                        padding: "6px 14px",
                        background: "#e8f0fe",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#1a56db",
                        borderBottom: "1px solid #d4dff7",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 8,
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                        lineHeight: 1.35,
                      }}>
                        <span>{quotaBookIcon(book.units.flatMap((u) => u.topics.flatMap((t) => t.tasks.map((task) => task.quota_kind)))[0])} {book.bookName}
                          <span style={{ fontSize: 9, fontWeight: 400, color: "#6b7280", marginLeft: 6 }}>
                            ({book.totalTasks} görev)
                          </span>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: pctColor(book.avgPct), flexShrink: 0 }}>
                          %{book.avgPct}
                        </span>
                      </div>

                      {book.units.map((unit) => {
                        const quotaOnly = unit.topics.every((t) => t.tasks.every((task) => task.quota_kind));
                        return (
                        <div key={`${book.bookId}-${unit.unitId}`}>
                          {!quotaOnly && (
                          <div style={{
                            padding: "6px 14px",
                            background: "#f0f4f8",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#0061a6",
                            borderBottom: "1px solid #e4e9f2",
                            wordBreak: "break-word",
                            overflowWrap: "anywhere",
                            lineHeight: 1.35,
                          }}>
                            📂 {unit.unitName}
                          </div>
                          )}

                          {unit.topics.map((topic) => {
                            const topicAvg = weightedTaskAvg(topic.tasks);
                            const topicQ = topic.tasks.reduce((s, t) => s + (t.question_count || 0), 0);
                            const [leftTasks, rightTasks] = splitColumnMajor(topic.tasks);
                            return (
                              <div key={`${unit.unitId}-${topic.topicId}`} className="ok-report-topic">
                                <div style={{
                                  padding: "7px 14px 4px",
                                  background: "#f8fafc",
                                  borderBottom: "1px solid #e4e9f2",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "flex-start",
                                  gap: 8,
                                }}>
                                  <div style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "#0f172a",
                                    wordBreak: "break-word",
                                    overflowWrap: "anywhere",
                                    whiteSpace: "normal",
                                    lineHeight: 1.35,
                                  }}>
                                    {topic.topicName}
                                    <span style={{ fontSize: 9, fontWeight: 400, color: "#94a3b8", marginLeft: 6 }}>
                                      ({topic.tasks.length} görev{topicQ > 0 ? ` · ${topicQ} soru` : ""})
                                    </span>
                                  </div>
                                  <span style={{
                                    fontSize: 11, fontWeight: 700, color: pctColor(topicAvg), flexShrink: 0,
                                  }}>
                                    %{topicAvg}
                                  </span>
                                </div>

                                <div style={{
                                  display: "grid",
                                  gridTemplateColumns: rightTasks.length > 0 ? "1fr 1fr" : "1fr",
                                  gap: 0,
                                  alignItems: "start",
                                }}>
                                  <div style={{
                                    borderRight: rightTasks.length > 0 ? "1px solid #f0f2f5" : "none",
                                  }}>
                                    {leftTasks.map((task) => (
                                      <ReportTaskRow
                                        key={task.id}
                                        task={task}
                                        topicName={topic.topicName}
                                      />
                                    ))}
                                  </div>
                                  {rightTasks.length > 0 && (
                                    <div>
                                      {rightTasks.map((task) => (
                                        <ReportTaskRow
                                          key={task.id}
                                          task={task}
                                          topicName={topic.topicName}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {topic.tasks.some((task) => task.quota_kind)
                                  ? (() => {
                                      const kind = topic.tasks.find((task) => task.quota_kind)?.quota_kind;
                                      const bookCum = fullReport?.book_cumulative?.find(
                                        (b) => b.resource_book === book.bookId && (!kind || b.quota_kind === kind),
                                      );
                                      return bookCum ? <BookCumulativeBlock bookCum={bookCum} /> : null;
                                    })()
                                  : topic.topicCum && <TopicCumulativeBlock topicCum={topic.topicCum} />}
                              </div>
                            );
                          })}
                        </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            ))}
          </div>
        </div>

        {/* ====== ÖDEV PERFORMANS ÖZETİ ====== */}
        {overall && overall.total_assignments > 0 && (() => {
          const odevPct = overall.assignment_success_percent || 0;
          const gorevPct = overall.total_tasks_all > 0
            ? Math.round((overall.done_tasks_all / overall.total_tasks_all) * 100)
            : 0;
          const soruPct = overall.question_completion_percent_all || 0;
          const performans = overall.overall_completion_percent || 0;
          const statusCards = [
            { value: overall.full_assignments || 0, label: "Tam", color: "#16a34a", bg: "#f0fdf4", icon: "✅" },
            { value: overall.partial_assignments || 0, label: "Eksik", color: "#d97706", bg: "#fffbeb", icon: "⚠️" },
            { value: overall.not_brought_assignments || 0, label: "Getirmedi", color: "#dc2626", bg: "#fef2f2", icon: "🚫" },
            { value: overall.not_done_assignments || 0, label: "Yapmadı", color: "#b91c1c", bg: "#fef2f2", icon: "❌" },
          ];
          const rateRows = [
            { label: "Ödev Tamamlama", hint: "Tam ödev / tüm ödevler", pct: odevPct, color: "#16a34a" },
            { label: "Görev Tamamlama", hint: "Yaptı / tüm görevler", pct: gorevPct, color: "#0262a7" },
            { label: "Soru Tamamlama", hint: "Çözülen / toplam soru", pct: soruPct, color: "#ea580c", showBar: true },
          ];
          return (
          <div className="ok-report-perf">
            <div className="ok-report-perf-header">
              <div>
                <h2 className="ok-report-perf-title">Ödev Performans Özeti</h2>
                <p className="ok-report-perf-sub">
                  {overall.total_assignments} ödev · koçluk sürecindeki birikimli özet
                </p>
              </div>
              <div className="ok-report-perf-score" title="Tüm görevlerin ağırlıklı ortalaması (eksik ve yapmadı dahil)">
                <div className="ok-report-perf-score-label">Performans Puanı</div>
                <div className="ok-report-perf-score-value">
                  <span className="ok-report-perf-score-num">{performans}</span>
                  <span className="ok-report-perf-score-den">/ 100</span>
                </div>
                <div className="ok-report-perf-score-hint">Görev ağırlıklı ortalama</div>
              </div>
            </div>

            <div className="ok-report-perf-status">
              {statusCards.map((c) => (
                <div
                  key={c.label}
                  className="ok-report-perf-status-card"
                  style={{ background: c.bg, borderColor: `${c.color}40`, opacity: c.value > 0 ? 1 : 0.5 }}
                >
                  <span className="ok-report-perf-status-icon">{c.icon}</span>
                  <span className="ok-report-perf-status-value" style={{ color: c.color }}>{c.value}</span>
                  <span className="ok-report-perf-status-label" style={{ color: c.color }}>{c.label}</span>
                </div>
              ))}
            </div>

            <div className="ok-report-perf-rates">
              {rateRows.map((r) => (
                <div key={r.label} className="ok-report-perf-rate-row">
                  <div className="ok-report-perf-rate-text">
                    <span className="ok-report-perf-rate-label">{r.label}</span>
                    <span className="ok-report-perf-rate-hint">{r.hint}</span>
                  </div>
                  <div className="ok-report-perf-rate-right">
                    <span className="ok-report-perf-rate-pct" style={{ color: r.color }}>%{r.pct}</span>
                    {r.showBar && (
                      <div className="ok-report-perf-mini-bar">
                        <div className="ok-report-perf-mini-fill" style={{ width: `${r.pct}%`, background: r.color }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="ok-report-perf-details">
              <div className="ok-report-perf-detail">
                <span className="ok-report-perf-detail-label">Toplam görev</span>
                <div className="ok-report-perf-chips">
                  <span className="ok-report-perf-chip is-done" title="Yaptı">🟢 {overall.done_tasks_all}</span>
                  <span className="ok-report-perf-chip is-partial" title="Eksik">🟡 {overall.partial_tasks_all}</span>
                  <span className="ok-report-perf-chip is-notdone" title="Yapmadı">🔴 {overall.not_done_tasks_all}</span>
                </div>
              </div>
              {overall.total_questions_all > 0 && (
                <div className="ok-report-perf-detail">
                  <span className="ok-report-perf-detail-label">Toplam soru</span>
                  <div className="ok-report-perf-qwrap">
                    <span className="ok-report-perf-qnums">
                      {overall.completed_questions_all}/{overall.total_questions_all}
                      <span className="ok-report-perf-qpct"> (%{soruPct})</span>
                    </span>
                    <div className="ok-report-perf-qbar">
                      <div className="ok-report-perf-qfill" style={{ width: `${soruPct}%` }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* ═══ BOTTOM NOTICE + FOOTER ═══ */}
        <div className="ok-report-footer-block page-break-avoid">
          <div style={{
            padding: "6px 12px", marginBottom: 8,
            background: "#f0f7ff", borderRadius: 6, border: "1px solid #dbeafe",
            fontSize: 8, color: "#1e40af", lineHeight: 1.6, textAlign: "center",
          }}>
            Bu ödev sonuç raporu{report.coach_name && <>, öğrenci maestro koçu <strong>{report.coach_name}</strong> tarafından</>} hazırlanmıştır. Öğrencinin gelişimi koçluk sürecinde takip edilmektedir.
          </div>

          <div style={{
            paddingTop: 6, borderTop: "2px solid #0061a6",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 7, color: "#8c98a4",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={footerLogoUrl} alt="3K" crossOrigin="anonymous" style={{ width: 10, height: 10, objectFit: "contain", opacity: 0.5 }} />
              <span style={{ fontWeight: 600 }}>3K Kampüs Koçluk &amp; Danışmanlık Merkezi</span>
            </div>
            <span>© {currentYear} Tüm hakları saklıdır.</span>
          </div>
        </div>
        </div>
      </div>

      {!printMode && sendToast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 4000,
          background: "#059669", color: "#fff", padding: "10px 16px", borderRadius: 8,
          fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        }}>
          {sendToast}
        </div>
      )}

      {!printMode && showSendModal && (
        <AssignmentNotifySendModal
          assignmentId={Number(assignmentId)}
          notifyType="report"
          studentName={fullReport?.data.student_name}
          reportOrientation={orientation}
          onClose={() => setShowSendModal(false)}
          onSent={(sent, details) => {
            setSendToast(formatNotifySentToast(sent, details));
            setTimeout(() => setSendToast(null), 6000);
          }}
          assignHomeworkHref={
            paths.newAssignment && fullReport?.data.student_info?.id
              ? buildNewAssignmentFromKontrolHref(paths.newAssignment, {
                  studentId: fullReport.data.student_info.id,
                  returnPath: paths.detail(assignmentId),
                })
              : null
          }
        />
      )}

    </div>
  );
}
