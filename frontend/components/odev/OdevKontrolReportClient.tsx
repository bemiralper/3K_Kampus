"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useVectorPrint } from "@/lib/useVectorPrint";
import { fetchAssignmentReport } from "@/lib/resources-api";
import AssignmentNotifySendModal, { formatNotifySentToast } from "@/components/odev/AssignmentNotifySendModal";
import { useOdevKontrolPaths } from "@/components/odev/OdevKontrolPaths";
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
  evaluated_at: string | null;
  is_completion_task: boolean;
  previous_task_completion_percent: number | null;
  previous_assignment_title: string;
}

interface AssignmentLesson {
  id: number;
  lesson_name: string;
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

interface TrendItem {
  id: number;
  title: string;
  assigned_date: string | null;
  due_date: string | null;
  status: string;
  completion_percent: number;
  total_tasks: number;
  done_tasks: number;
  total_questions: number;
  completed_questions: number;
  is_current: boolean;
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
  recent_trend: TrendItem[];
}

// ─── Helpers ───
const formatDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
};

const formatShortDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
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

const getStatusColor = (status: string) => {
  switch (status) {
    case "COMPLETED": return "#16a34a";
    case "IN_PROGRESS": return "#2563eb";
    case "OVERDUE": return "#dc2626";
    case "ASSIGNED": return "#d97706";
    default: return "#94a3b8";
  }
};

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

// ─── Mini Bar Chart ───
function MiniBarChart({ data, height = 120 }: { data: { label: string; value: number; maxValue: number; color: string; isCurrent?: boolean }[]; height?: number }) {
  const maxVal = Math.max(...data.map(d => d.maxValue), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, padding: "0 4px" }}>
      {data.map((d, i) => {
        const barH = Math.max((d.value / maxVal) * (height - 30), 4);
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: d.color }}>%{d.value}</div>
            <div style={{
              width: "100%", maxWidth: 32, height: barH, background: d.color,
              borderRadius: "4px 4px 0 0", opacity: d.isCurrent ? 1 : 0.6,
              border: d.isCurrent ? "2px solid #1e293b" : "none",
              transition: "height 0.5s ease-out"
            }} />
            <div style={{ fontSize: 8, color: "#94a3b8", textAlign: "center", lineHeight: 1.1 }}>{d.label}</div>
          </div>
        );
      })}
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
          recent_trend: (result.recent_trend || []) as unknown as TrendItem[],
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
    marginMm: "8mm 10mm",
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

  const handleDownload = handlePDF;

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
  const trend = fullReport.recent_trend;

  const hasQuestions = summary.total_questions > 0;
  const hasPages = summary.total_pages > 0;

  const logoUrl = "/img/3k-logo.png";
  const currentYear = new Date().getFullYear();
  const todayStr = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className={printMode ? undefined : "ok-report-overlay"} style={printMode ? { background: "#fff", minHeight: "100vh" } : undefined}>
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
              İndir
            </button>
            <button
              type="button"
              onClick={() => setShowSendModal(true)}
              className="ok-btn-secondary"
              style={{ background: "#ecfdf5", borderColor: "#6ee7b7", color: "#047857" }}
            >
              WhatsApp Gönder
            </button>
          </div>
        </div>
        </>
        )}

        {/* A4 CONTENT */}
        <div ref={printRef} id="rapor-print-area" style={{
          padding: orientation === "landscape" ? "18px 24px" : "22px 28px",
          fontFamily: "'Poppins', sans-serif",
          color: "#172b4c", lineHeight: 1.4,
          maxWidth: orientation === "landscape" ? 1100 : 840,
          margin: "0 auto",
        }}>
        {/* HEADER */}
        <div className="ok-report-header">
          {/* Decorative */}
          <div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
          <div style={{ position: "absolute", bottom: -20, right: 60, width: 65, height: 65, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />

          {/* Row 1: Logo + Title + Doc info */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 8,
                background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="3K" crossOrigin="anonymous" style={{ width: 28, height: 28, objectFit: "contain" }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>3K KAMPÜS</div>
                <div style={{ fontSize: 8, opacity: 0.75 }}>Koçluk &amp; Danışmanlık Merkezi</div>
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{
                display: "inline-block", padding: "2px 14px", borderRadius: 16,
                background: "rgba(255,255,255,0.15)", fontSize: 8, fontWeight: 600,
                letterSpacing: 2, textTransform: "uppercase", marginBottom: 3,
              }}>
                ÖDEV SONUÇ RAPORU
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {report.title || "İsimsiz Ödev"}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 8, opacity: 0.7, lineHeight: 1.7 }}>
              <div>ÖSR-{new Date().getTime().toString(36).toUpperCase().slice(-6)}</div>
              <div>{todayStr}</div>
            </div>
          </div>

          {/* Row 2: Student bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "rgba(255,255,255,0.12)", borderRadius: 8,
            padding: "8px 12px",
          }}>
            {/* Öğrenci Fotoğrafı */}
            {report.student_info?.profil_foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={report.student_info.profil_foto}
                alt={report.student_name}
                crossOrigin="anonymous"
                style={{
                  width: 40, height: 40, borderRadius: "50%", objectFit: "cover",
                  border: "2px solid rgba(255,255,255,0.5)", flexShrink: 0,
                }}
              />
            ) : (
              <div style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700,
              }}>
                {report.student_name.split(" ").map(w => w.charAt(0)).join("").substring(0, 2)}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>🎓 {report.student_name}</div>
              <div style={{ fontSize: 8, opacity: 0.75 }}>
                Öğrenci · {report.priority_display} Öncelik · {report.status_display}
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 12, fontSize: 9 }}>
              {report.coach_name && (
                <>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 7, opacity: 0.6, marginBottom: 1 }}>Maestro Koç</div>
                    <div style={{ fontWeight: 600, fontSize: 10 }}>👨‍🏫 {report.coach_name}</div>
                  </div>
                  <div style={{ width: 1, background: "rgba(255,255,255,0.25)" }} />
                </>
              )}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 7, opacity: 0.6, marginBottom: 1 }}>Görev</div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>📋 {summary.total_tasks}</div>
              </div>
              <div style={{ width: 1, background: "rgba(255,255,255,0.25)" }} />
              {hasQuestions && (
                <>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 7, opacity: 0.6, marginBottom: 1 }}>Soru</div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#fbbf24" }}>✏️ {summary.total_questions}</div>
                  </div>
                  <div style={{ width: 1, background: "rgba(255,255,255,0.25)" }} />
                </>
              )}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 7, opacity: 0.6, marginBottom: 1 }}>Değerlendirme</div>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#34d399" }}>%{summary.overall_completion_percent}</div>
              </div>
            </div>
          </div>

          {/* Date & tags row */}
          <div style={{ display: "flex", gap: 4, marginTop: 8, fontSize: 8, flexWrap: "wrap" }}>
            <span style={{ padding: "1px 8px", background: "rgba(255,255,255,0.15)", borderRadius: 12 }}>📅 {formatDate(report.assigned_date)} → {formatDate(report.due_date)}</span>
            <span style={{ padding: "1px 8px", background: "rgba(255,255,255,0.15)", borderRadius: 12 }}>{report.status_display}</span>
            <span style={{ padding: "1px 8px", background: "rgba(255,255,255,0.15)", borderRadius: 12 }}>{report.priority_display} Öncelik</span>
            {report.postpone_count > 0 && <span style={{ padding: "1px 8px", background: "rgba(255,100,100,0.2)", borderRadius: 12 }}>📅 {report.postpone_count}x Ertelendi</span>}
          </div>
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
              <div key={group.subjectName} style={{ borderBottom: gIdx < groupedLessonStats.length - 1 ? "2px solid #e2e8f0" : "none" }}>
                {/* Ders Başlığı — Grup Header */}
                <div style={{ padding: "12px 20px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>📖 {group.subjectName}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{group.items.length} kaynak · {group.totalTasks} görev</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CircularProgress value={group.avgPct} size={40} strokeWidth={4} color={group.avgPct >= 75 ? "#16a34a" : group.avgPct >= 50 ? "#d97706" : "#dc2626"} />
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

                {/* Alt Kaynaklar (Kitap → Konu hiyerarşisi) */}
                {(() => {
                  // Aynı kitap adına sahip lesson'ları grupla
                  const bookGroups: { bookName: string | null; items: typeof group.items; totalTasks: number; avgPct: number }[] = [];
                  const bookMap = new Map<string, typeof bookGroups[number]>();
                  group.items.forEach(ls => {
                    const bookKey = ls.lesson.resource_book_name || "__no_book__";
                    if (!bookMap.has(bookKey)) {
                      const bg = { bookName: ls.lesson.resource_book_name, items: [ls], totalTasks: ls.totalTasks, avgPct: ls.avgPct };
                      bookMap.set(bookKey, bg);
                      bookGroups.push(bg);
                    } else {
                      const bg = bookMap.get(bookKey)!;
                      bg.items.push(ls);
                      bg.totalTasks += ls.totalTasks;
                      const allTasks = bg.items.flatMap(i => i.lesson.tasks);
                      bg.avgPct = weightedTaskAvg(allTasks);
                    }
                  });

                  return bookGroups.map((bg, bgIdx) => {
                    // Kitap grubundaki tüm task'ları topla ve content_topic_name'e göre alt-grupla
                    const allBookTasks = bg.items.flatMap(ls => ls.lesson.tasks as any[]);
                    const topicSections: { topicName: string; tasks: any[]; topicCum: any }[] = [];
                    const topicMap = new Map<string, typeof topicSections[number]>();

                    bg.items.forEach(ls => {
                      (ls.lesson.tasks as any[]).forEach((task: any) => {
                        const tKey = task.content_topic_name || ls.lesson.topic_name || "__default__";
                        if (!topicMap.has(tKey)) {
                          const sec = { topicName: tKey === "__default__" ? "" : tKey, tasks: [task], topicCum: ls.topicCum };
                          topicMap.set(tKey, sec);
                          topicSections.push(sec);
                        } else {
                          topicMap.get(tKey)!.tasks.push(task);
                        }
                      });
                    });

                    // Tek konu varsa konu adını lesson'dan al
                    const uniqueTopics = topicSections.filter(s => s.topicName);
                    const hasMultipleTopics = uniqueTopics.length > 1;

                    return (
                    <div key={bg.bookName || bgIdx} style={{ marginLeft: 12, borderLeft: "3px solid #e2e8f0", borderBottom: bgIdx < bookGroups.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                      {/* Kitap Başlığı */}
                      {bg.bookName ? (
                        <div style={{ padding: "8px 20px 4px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#475569", display: "flex", alignItems: "center", gap: 6 }}>
                            📕 {bg.bookName}
                            <span style={{ fontSize: 10, fontWeight: 400, color: "#94a3b8" }}>({hasMultipleTopics ? `${uniqueTopics.length} konu · ` : ""}{bg.totalTasks} görev)</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: bg.avgPct >= 75 ? "#16a34a" : bg.avgPct >= 50 ? "#d97706" : "#dc2626" }}>%{bg.avgPct}</span>
                        </div>
                      ) : null}

                      {/* Konu Bölümleri */}
                      {topicSections.map((sec, secIdx) => {
                        const secAvg = weightedTaskAvg(sec.tasks);
                        return (
                        <div key={sec.topicName || secIdx} style={{ padding: bg.bookName ? "6px 20px 12px 32px" : "8px 20px 12px", borderBottom: secIdx < topicSections.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                          {/* Konu Başlığı — birden fazla konu varsa veya tek konunun adı varsa göster */}
                          {(sec.topicName && (hasMultipleTopics || !bg.bookName)) ? (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: bg.bookName ? "#6366f1" : "#475569", display: "flex", alignItems: "center", gap: 4 }}>
                                {bg.bookName ? "📂" : "📌"} {sec.topicName}
                                <span style={{ fontSize: 10, fontWeight: 400, color: "#94a3b8" }}>({sec.tasks.length} görev)</span>
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: secAvg >= 75 ? "#16a34a" : secAvg >= 50 ? "#d97706" : "#dc2626" }}>%{secAvg}</span>
                            </div>
                          ) : !bg.bookName && !sec.topicName ? (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Kaynak belirtilmemiş</div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: secAvg >= 75 ? "#16a34a" : secAvg >= 50 ? "#d97706" : "#dc2626" }}>%{secAvg}</span>
                            </div>
                          ) : null}

                    {/* Görev Detayları Tablosu */}
                    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <th style={{ textAlign: "left", padding: "8px 10px", color: "#94a3b8", fontWeight: 500 }}>Görev</th>
                          <th style={{ textAlign: "center", padding: "8px 10px", color: "#94a3b8", fontWeight: 500, width: 90 }}>Durum</th>
                          <th style={{ textAlign: "center", padding: "8px 10px", color: "#94a3b8", fontWeight: 500, width: 60 }}>%</th>
                          <th style={{ textAlign: "center", padding: "8px 10px", color: "#94a3b8", fontWeight: 500, width: 100 }}>Soru</th>
                          <th style={{ textAlign: "center", padding: "8px 10px", color: "#94a3b8", fontWeight: 500, width: 100 }}>Sayfa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sec.tasks.map((task: any) => {
                          const badge = getCompletionBadge(task.completion_status);
                          return (
                            <tr key={task.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                              <td style={{ padding: "10px 10px", color: "#1e293b", fontWeight: 500 }}>
                                {task.title}
                                {task.is_completion_task && (
                                  <div style={{ fontSize: 11, color: "#2563eb", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                                    🔄 Eksik Tamamlama
                                    {task.previous_task_completion_percent != null && task.previous_task_completion_percent > 0 && (
                                      <span style={{ color: "#60a5fa" }}>(önceki: %{task.previous_task_completion_percent})</span>
                                    )}
                                  </div>
                                )}
                                {task.coach_evaluation_note && <div style={{ fontSize: 12, color: "#6d28d9", fontStyle: "italic", marginTop: 3 }}>💬 {task.coach_evaluation_note}</div>}
                              </td>
                              <td style={{ padding: "10px 10px", textAlign: "center" }}>
                                <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: badge.bg, color: badge.text }}>{badge.label}</span>
                              </td>
                              <td style={{ padding: "10px 10px", textAlign: "center", fontWeight: 700, color: task.task_completion_percent >= 75 ? "#16a34a" : task.task_completion_percent >= 50 ? "#d97706" : "#dc2626" }}>
                                %{task.task_completion_percent}
                              </td>
                              <td style={{ padding: "10px 10px", textAlign: "center", color: "#64748b" }}>
                                {task.question_count ? (
                                  <span>
                                    <strong style={{ color: "#1e293b" }}>{task.completed_question_count ?? 0}</strong>
                                    <span style={{ color: "#94a3b8" }}>/{task.question_count}</span>
                                  </span>
                                ) : <span style={{ color: "#cbd5e1" }}>—</span>}
                              </td>
                              <td style={{ padding: "8px", textAlign: "center", color: "#64748b" }}>
                                {task.page_count ? (
                                  <span>
                                    <strong style={{ color: "#1e293b" }}>{task.completed_page_count ?? 0}</strong>
                                    <span style={{ color: "#94a3b8" }}>/{task.page_count}</span>
                                  </span>
                                ) : <span style={{ color: "#cbd5e1" }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Kümülatif Konu İstatistikleri */}
                    {sec.topicCum && (sec.topicCum.cumulative_total_questions > 0 || sec.topicCum.cumulative_total_pages > 0) && (
                      <div style={{ marginTop: 8, padding: "8px 12px", background: "linear-gradient(135deg, #ede9fe 0%, #faf5ff 100%)", borderRadius: 8, border: "1px solid #ddd6fe" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                          📊 Bu Konudan Bugüne Kadar Toplam
                          {sec.topicCum.cumulative_assignment_count > 1 && (
                            <span style={{ fontSize: 12, fontWeight: 500, color: "#a78bfa" }}>({sec.topicCum.cumulative_assignment_count} ödevden)</span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                          {sec.topicCum.cumulative_total_questions > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ width: 28, height: 28, borderRadius: 6, background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11, fontWeight: 700 }}>
                                📝
                              </div>
                              <div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>
                                  {sec.topicCum.cumulative_completed_questions}
                                  <span style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8" }}> / {sec.topicCum.cumulative_total_questions} soru</span>
                                </div>
                                <div style={{ fontSize: 10, color: "#64748b" }}>
                                  Bu ödevde: {sec.topicCum.current_completed_questions}/{sec.topicCum.current_total_questions} soru
                                </div>
                              </div>
                            </div>
                          )}
                          {sec.topicCum.cumulative_total_pages > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ width: 28, height: 28, borderRadius: 6, background: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11, fontWeight: 700 }}>
                                📄
                              </div>
                              <div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>
                                  {sec.topicCum.cumulative_completed_pages}
                                  <span style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8" }}> / {sec.topicCum.cumulative_total_pages} sayfa</span>
                                </div>
                                <div style={{ fontSize: 10, color: "#64748b" }}>
                                  Bu ödevde: {sec.topicCum.current_completed_pages}/{sec.topicCum.current_total_pages} sayfa
                                </div>
                              </div>
                            </div>
                          )}
                          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
                            <div style={{ padding: "4px 12px", background: "#7c3aed", borderRadius: 16, color: "white", fontSize: 11, fontWeight: 700 }}>
                              %{sec.topicCum.cumulative_completion_percent} tamamlandı
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                        </div>
                      );
                      })}
                    </div>
                  );
                  });
                })()}
              </div>
            ))}
          </div>
        </div>

        {/* ====== BOLUM 5: ODEV TRENDI ====== */}
        {trend.length > 1 && (
          <div className="ok-report-card" style={{ marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", background: "linear-gradient(90deg, #f8fafc, #fff)" }}>
              <h2 className="ok-report-section-title">📈 Ödev Tamamlanma Trendi</h2>
              <div className="ok-report-section-sub">Son {trend.length} ödevin değerlendirme ortalaması</div>
            </div>
            <div style={{ padding: "12px 20px" }}>
              <MiniBarChart
                height={100}
                data={trend.map(t => ({
                  label: formatShortDate(t.assigned_date),
                  value: t.completion_percent,
                  maxValue: 100,
                  color: t.is_current ? "#0262a7" : getStatusColor(t.status),
                  isCurrent: t.is_current,
                }))}
              />
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginTop: 10 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ textAlign: "left", padding: "8px 10px", color: "#94a3b8", fontWeight: 500 }}>Ödev</th>
                    <th style={{ textAlign: "center", padding: "8px 10px", color: "#94a3b8", fontWeight: 500, width: 90 }}>Tarih</th>
                    <th style={{ textAlign: "center", padding: "8px 10px", color: "#94a3b8", fontWeight: 500, width: 90 }}>Görev</th>
                    <th style={{ textAlign: "center", padding: "8px 10px", color: "#94a3b8", fontWeight: 500, width: 90 }}>Soru</th>
                    <th style={{ textAlign: "center", padding: "8px 10px", color: "#94a3b8", fontWeight: 500, width: 70 }}>Oran</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map(t => (
                    <tr key={t.id} style={{ borderBottom: "1px solid #f8fafc", background: t.is_current ? "#ede9fe" : "transparent" }}>
                      <td style={{ padding: "8px 10px", color: "#1e293b", fontWeight: t.is_current ? 700 : 500 }}>
                        {t.is_current && "➤ "}{t.title}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center", color: "#64748b" }}>{formatShortDate(t.assigned_date)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center", color: "#64748b" }}>{t.done_tasks}/{t.total_tasks}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center", color: "#64748b" }}>{t.completed_questions}/{t.total_questions}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, color: getStatusColor(t.status) }}>%{t.completion_percent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ====== BOLUM 7: BUGÜNE KADAR ÖDEV GEÇMİŞİ ====== */}
        {overall && overall.total_assignments > 0 && (
          <div className="ok-report-history">
            <div className="ok-report-history-header">
              <div>
                <h2>📋 Bugüne Kadar Ödev Geçmişi</h2>
                <p>Öğrencinin koçluk sürecinde aldığı tüm ödevlerin özeti</p>
              </div>
              <div className="ok-report-history-total">
                <span className="ok-report-history-total-num">{overall.total_assignments}</span>
                <span className="ok-report-history-total-label">toplam ödev</span>
              </div>
            </div>

            {/* Dağılım çubuğu */}
            {(() => {
              const segments = [
                { key: "full", count: overall.full_assignments || 0, label: "Tam", color: "#22c55e" },
                { key: "partial", count: overall.partial_assignments || 0, label: "Eksik", color: "#f59e0b" },
                { key: "not_brought", count: overall.not_brought_assignments || 0, label: "Getirmedi", color: "#ef4444" },
                { key: "not_done", count: overall.not_done_assignments || 0, label: "Yapmadı", color: "#dc2626" },
              ].filter(s => s.count > 0);
              const segmentTotal = segments.reduce((sum, s) => sum + s.count, 0);
              return segments.length > 0 ? (
                <div className="ok-report-history-bar-wrap">
                  <div className="ok-report-history-bar">
                    {segments.map(s => (
                      <div
                        key={s.key}
                        className="ok-report-history-bar-seg"
                        style={{
                          width: `${segmentTotal > 0 ? (s.count / segmentTotal) * 100 : 0}%`,
                          background: s.color,
                        }}
                        title={`${s.label}: ${s.count}`}
                      />
                    ))}
                  </div>
                  <div className="ok-report-history-legend">
                    {segments.map(s => (
                      <span key={s.key} className="ok-report-history-legend-item">
                        <span className="ok-report-history-dot" style={{ background: s.color }} />
                        {s.label} <strong>{s.count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            <div className="ok-report-history-grid">
              {[
                { value: overall.full_assignments || 0, label: "Tam", sub: "Tüm görevler yapıldı", color: "#16a34a", bg: "#f0fdf4", icon: "✅" },
                { value: overall.partial_assignments || 0, label: "Eksik", sub: "Kısmen tamamlandı", color: "#d97706", bg: "#fffbeb", icon: "⚠️" },
                { value: overall.not_brought_assignments || 0, label: "Getirmedi", sub: "Ödev getirilmedi", color: "#dc2626", bg: "#fef2f2", icon: "🚫" },
                { value: overall.not_done_assignments || 0, label: "Yapmadı", sub: "Ödev yapılmadı", color: "#b91c1c", bg: "#fef2f2", icon: "❌" },
              ].map(c => (
                <div key={c.label} className="ok-report-history-card" style={{ background: c.bg, borderColor: `${c.color}33`, opacity: c.value > 0 ? 1 : 0.55 }}>
                  <div className="ok-report-history-card-icon">{c.icon}</div>
                  <div className="ok-report-history-card-value" style={{ color: c.color }}>{c.value}</div>
                  <div className="ok-report-history-card-label" style={{ color: c.color }}>{c.label}</div>
                  <div className="ok-report-history-card-sub">{c.sub}</div>
                </div>
              ))}
            </div>

            {/* Görev & soru özeti */}
            <div className="ok-report-history-footer">
              <div className="ok-report-history-stat">
                <span className="ok-report-history-stat-label">Tam ödev oranı</span>
                <span className="ok-report-history-stat-value" style={{ color: "#22c55e" }}>%{overall.assignment_success_percent || 0}</span>
              </div>
              <div className="ok-report-history-stat">
                <span className="ok-report-history-stat-label">Toplam görev</span>
                <span className="ok-report-history-stat-value">
                  {overall.done_tasks_all} yaptı · {overall.partial_tasks_all} eksik · {overall.not_done_tasks_all} yapmadı
                </span>
              </div>
              {overall.total_questions_all > 0 && (
                <div className="ok-report-history-stat">
                  <span className="ok-report-history-stat-label">Toplam soru</span>
                  <span className="ok-report-history-stat-value">
                    {overall.completed_questions_all}/{overall.total_questions_all}
                    <span style={{ color: "#64748b", fontWeight: 500 }}> (%{overall.question_completion_percent_all})</span>
                  </span>
                </div>
              )}
              <div className="ok-report-history-stat">
                <span className="ok-report-history-stat-label">Genel başarı</span>
                <span className="ok-report-history-stat-value" style={{ color: "#7c3aed" }}>%{overall.overall_completion_percent}</span>
              </div>
            </div>
          </div>
        )}

        {/* ═══ BOTTOM NOTICE ═══ */}
        <div style={{
          padding: "6px 12px", marginBottom: 8,
          background: "#f0f7ff", borderRadius: 6, border: "1px solid #dbeafe",
          fontSize: 8, color: "#1e40af", lineHeight: 1.6, textAlign: "center",
        }}>
          Bu ödev sonuç raporu{report.coach_name && <>, öğrenci maestro koçu <strong>{report.coach_name}</strong> tarafından</>} hazırlanmıştır. Öğrencinin gelişimi koçluk sürecinde takip edilmektedir.
        </div>

        {/* ═══ FOOTER ═══ */}
        <div style={{
          paddingTop: 6, borderTop: "2px solid #0061a6",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontSize: 7, color: "#8c98a4",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="3K" crossOrigin="anonymous" style={{ width: 10, height: 10, objectFit: "contain", opacity: 0.5 }} />
            <span style={{ fontWeight: 600 }}>3K Kampüs Koçluk &amp; Danışmanlık Merkezi</span>
          </div>
          <span>© {currentYear} Tüm hakları saklıdır.</span>
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
        />
      )}

    </div>
  );
}
