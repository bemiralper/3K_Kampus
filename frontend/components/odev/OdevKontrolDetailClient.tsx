"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useVectorPrint } from "@/lib/useVectorPrint";
import {
  fetchAssignmentDetail,
  updateTaskCompletionStatus,
  resetTaskCompletionStatus,
  resetAllTaskCompletionStatuses,
  updateTaskEvaluationNote,
  postponeAssignment,
  updateAssignmentRiskStatus,
  assignAssignment,
  updateLateNote,
  markAllNotDone,
  deleteAssignment,
} from "@/lib/resources-api";
import { useOdevKontrolPaths } from "@/components/odev/OdevKontrolPaths";
import AssignmentNotifySendModal, { formatNotifySentToast } from "@/components/odev/AssignmentNotifySendModal";
import { getRiskColor, isOverdue } from "@/components/odev/statusTokens";
// ─── Types ───
interface AssignmentTask {
  id: number;
  lesson_block: number;
  content: number | null;
  task_type: string;
  task_type_display: string;
  title: string;
  description: string;
  is_required: boolean;
  question_count: number | null;
  page_count: number | null;
  estimated_duration_minutes: number | null;
  order: number;
  status: string;
  status_display: string;
  completion_status: string;
  completion_status_display: string;
  task_completion_percent: number;
  completed_question_count: number | null;
  completed_page_count: number | null;
  coach_evaluation_note: string;
  evaluated_at: string | null;
  actual_duration_minutes: number | null;
  completed_at: string | null;
  student_feedback: string | null;
  is_completion_task: boolean;
  previous_task_completion_percent: number | null;
  previous_assignment_title: string;
  created_at: string;
  updated_at: string;
  content_topic_name: string | null;
}

interface AssignmentLesson {
  id: number;
  assignment: number;
  lesson: number;
  lesson_name: string;
  order: number;
  resource_book: number | null;
  resource_book_name: string | null;
  content_mode: string;
  content_mode_display: string;
  topic_name: string;
  notes: string;
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

interface AssignmentDetail {
  id: number;
  student: number;
  student_name: string;
  student_info: { id: number; ad: string; soyad: string; profil_foto?: string | null } | null;
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
  completed_date: string | null;
  completion_percent: number;
  postpone_count: number;
  original_due_date: string | null;
  postpone_reason: string;
  max_postpone: number;
  late_submission_note: string;
  is_late_submission: boolean;
  late_days: number;
  non_submission_reason: string;
  non_submission_note: string;
  is_control_locked?: boolean;
  coach_notes: string;
  student_notes: string;
  lessons: AssignmentLesson[];
  report_summary: ReportSummary;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ───
const formatDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
};

const formatDatetime = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const PERCENT_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90];

const getCompletionBadge = (cs: string) => {
  switch (cs) {
    case "DONE": return { bg: "#dcfce7", text: "#16a34a", label: "✅ Yaptı", border: "#bbf7d0" };
    case "NOT_DONE": return { bg: "#fee2e2", text: "#dc2626", label: "❌ Yapmadı", border: "#fecaca" };
    case "PARTIAL": return { bg: "#fef3c7", text: "#d97706", label: "⚠️ Eksik", border: "#fde68a" };
    default: return { bg: "#f1f5f9", text: "#94a3b8", label: "⏳ Beklemede", border: "#e2e8f0" };
  }
};

// ─── Component ───
export default function OdevKontrolDetailClient() {
  const paths = useOdevKontrolPaths();
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.id as string;

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [expandedLessons, setExpandedLessons] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Erteleme modal
  const [showPostponeModal, setShowPostponeModal] = useState(false);
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeReason, setPostponeReason] = useState("");

  // Eksik % seçimi aktif görev
  const [partialTaskId, setPartialTaskId] = useState<number | null>(null);

  // Not ekleme
  const [editingNoteTaskId, setEditingNoteTaskId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");

  // Geç teslim notu
  const [editingLateNote, setEditingLateNote] = useState(false);
  const [lateNoteText, setLateNoteText] = useState("");

  // Ödev Getirilmedi modalı
  const [showNotDoneModal, setShowNotDoneModal] = useState(false);
  const [notDoneReason, setNotDoneReason] = useState("NOT_BROUGHT");
  const [notDoneNote, setNotDoneNote] = useState("");

  // Silme modalı
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");

  const [showSendModal, setShowSendModal] = useState<"plan" | "report" | null>(null);

  // Kontrol tamamlandı ama tekrar düzenleme modu
  const [isReEditing, setIsReEditing] = useState(false);

  const initialLoadDone = useRef(false);

  const fetchAssignment = useCallback(async () => {
    // Sadece ilk yüklemede loading göster, sonraki refresh'lerde scroll bozulmasın
    if (!initialLoadDone.current) setLoading(true);
    try {
      const result = await fetchAssignmentDetail(Number(assignmentId));
      if (result.success !== false && result.data) {
        const data = result.data as unknown as AssignmentDetail;
        setAssignment(data);
        // Sadece ilk yüklemede dersleri aç, sonraki refresh'lerde mevcut expanded durumu koru
        if (!initialLoadDone.current) {
          const ids = new Set<number>((data.lessons || []).map((l: AssignmentLesson) => l.id as number));
          setExpandedLessons(ids);
        }
      }
    } catch (e) {
      console.error("Yüklenemedi:", e);
      flash("❌ Ödev verileri yüklenemedi");
    }
    setLoading(false);
    initialLoadDone.current = true;
  }, [assignmentId]);

  useEffect(() => { fetchAssignment(); }, [fetchAssignment]);

  /* ─── Escape key ile modal kapat ─── */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDeleteModal) setShowDeleteModal(false);
        else if (showNotDoneModal) setShowNotDoneModal(false);
        else if (showPostponeModal) setShowPostponeModal(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showNotDoneModal, showPostponeModal, showDeleteModal]);

  // ─── Canlı Özet Hesaplama (client-side) ───
  const liveSummary = useMemo(() => {
    if (!assignment) return null;
    const tasks = assignment.lessons.flatMap(l => l.tasks);
    const total = tasks.length;
    const done = tasks.filter(t => t.completion_status === "DONE").length;
    const notDone = tasks.filter(t => t.completion_status === "NOT_DONE").length;
    const partial = tasks.filter(t => t.completion_status === "PARTIAL").length;
    const pending = tasks.filter(t => t.completion_status === "PENDING").length;
    const totalQ = tasks.reduce((s, t) => s + (t.question_count || 0), 0);
    const completedQ = tasks.reduce((s, t) => s + (t.completed_question_count || 0), 0);
    const totalP = tasks.reduce((s, t) => s + (t.page_count || 0), 0);
    const completedP = tasks.reduce((s, t) => s + (t.completed_page_count || 0), 0);
    return {
      total, done, notDone, partial, pending,
      totalQ, completedQ, remainingQ: totalQ - completedQ,
      totalP, completedP, remainingP: totalP - completedP,
      questionPct: totalQ > 0 ? Math.round(completedQ / totalQ * 100) : 0,
      pagePct: totalP > 0 ? Math.round(completedP / totalP * 100) : 0,
      taskPct: total > 0 ? Math.round(done / total * 100) : 0,
      overallPct: total > 0 ? Math.round(tasks.reduce((s, t) => s + t.task_completion_percent, 0) / total) : 0,
    };
  }, [assignment]);

  // ─── Actions ───
  const handleUpdateTaskStatus = async (taskId: number, completionStatus: string, pct?: number) => {
    setSaving(taskId);
    try {
      const body: {
        completion_status: string;
        task_completion_percent?: number;
      } = { completion_status: completionStatus };
      if (completionStatus === "PARTIAL" && pct !== undefined) {
        body.task_completion_percent = pct;
      }
      const result = await updateTaskCompletionStatus(taskId, body);
      if (result.success) {
        flash(completionStatus === "DONE" ? "✅ Yaptı olarak işaretlendi" : completionStatus === "NOT_DONE" ? "❌ Yapmadı olarak işaretlendi" : `⚠️ Eksik: %${pct}`);
        await fetchAssignment();
        setPartialTaskId(null);
      } else {
        flash("❌ " + (result.error || "İşlem başarısız"));
      }
    } catch { flash("❌ Bağlantı hatası"); }
    setSaving(null);
  };

  const handleSaveNote = async (taskId: number) => {
    try {
      const result = await updateTaskEvaluationNote(taskId, noteText);
      if (result.success) {
        flash("✅ Not kaydedildi");
        await fetchAssignment();
        setEditingNoteTaskId(null);
        setNoteText("");
      } else {
        flash("❌ " + (result.error || "Not kaydedilemedi"));
      }
    } catch { flash("❌ Not kaydedilemedi"); }
  };

  const handleDeleteNote = async (taskId: number) => {
    if (!confirm("Bu görev notunu silmek istiyor musunuz?")) return;
    try {
      const result = await updateTaskEvaluationNote(taskId, "");
      if (result.success) {
        flash("Not silindi");
        await fetchAssignment();
        setEditingNoteTaskId(null);
        setNoteText("");
      } else {
        flash("❌ " + (result.error || "Not silinemedi"));
      }
    } catch {
      flash("❌ Not silinemedi");
    }
  };

  const handlePostpone = async () => {
    if (!postponeDate || !assignment) return;
    try {
      const result = await postponeAssignment(assignment.id, {
        new_due_date: postponeDate + "T23:59:00Z",
        reason: postponeReason,
      });
      if (result.success) {
        flash("✅ " + (result.message || "Ödev ertelendi"));
        await fetchAssignment();
        setShowPostponeModal(false);
        setPostponeDate("");
        setPostponeReason("");
      } else {
        flash("❌ " + (result.error || "Erteleme başarısız"));
      }
    } catch { flash("❌ Bağlantı hatası"); }
  };

  const handleUpdateRisk = async (riskStatus: string) => {
    if (!assignment) return;
    try {
      const result = await updateAssignmentRiskStatus(assignment.id, riskStatus);
      if (result.success) { flash("✅ Risk durumu güncellendi"); await fetchAssignment(); }
    } catch { flash("❌ Hata"); }
  };

  const handleAssignDraft = async () => {
    if (!assignment) return;
    try {
      const result = await assignAssignment(assignment.id);
      if (result.success) { flash("✅ Ödev atandı"); await fetchAssignment(); }
      else flash("❌ " + (result.error || "Atama başarısız"));
    } catch { flash("❌ Hata"); }
  };

  const handleSaveLateNote = async () => {
    if (!assignment) return;
    try {
      const result = await updateLateNote(assignment.id, lateNoteText);
      if (result.success) {
        flash("✅ Geç teslim notu kaydedildi");
        await fetchAssignment();
        setEditingLateNote(false);
      } else {
        flash("❌ " + (result.error || "İşlem başarısız"));
      }
    } catch { flash("❌ Bağlantı hatası"); }
  };

  const handleMarkAllNotDone = async () => {
    if (!assignment) return;
    try {
      const result = await markAllNotDone(assignment.id, {
        reason: notDoneReason,
        note: notDoneNote,
      });
      if (result.success) {
        flash("✅ " + (result.message || "Tüm görevler yapmadı olarak işaretlendi"));
        await fetchAssignment();
        setShowNotDoneModal(false);
        setNotDoneReason("NOT_BROUGHT");
        setNotDoneNote("");
      } else {
        flash("❌ " + (result.error || "İşlem başarısız"));
      }
    } catch { flash("❌ Bağlantı hatası"); }
  };

  const handleResetTask = async (taskId: number) => {
    if (!confirm("Bu görevin değerlendirmesini sıfırlamak istiyor musunuz?")) return;
    setSaving(taskId);
    try {
      const result = await resetTaskCompletionStatus(taskId);
      if (result.success) {
        flash("Görev değerlendirmesi sıfırlandı");
        await fetchAssignment();
        setPartialTaskId(null);
      } else {
        flash("❌ " + (result.error || "Sıfırlama başarısız"));
      }
    } catch {
      flash("❌ Bağlantı hatası");
    }
    setSaving(null);
  };

  const handleResetAllTasks = async () => {
    if (!assignment) return;
    if (!confirm("Tüm değerlendirilmiş görevleri sıfırlamak istiyor musunuz?")) return;
    try {
      const result = await resetAllTaskCompletionStatuses(assignment.id);
      if (result.success) {
        flash(`✅ ${result.reset_count ?? 0} görev sıfırlandı`);
        await fetchAssignment();
        setIsReEditing(true);
        setPartialTaskId(null);
      } else {
        flash("❌ " + (result.error || "Sıfırlama başarısız"));
      }
    } catch {
      flash("❌ Bağlantı hatası");
    }
  };

  const handleDelete = async () => {
    if (!assignment) return;
    const reason = deletionReason.trim();
    if (reason.length < 10) {
      flash("Silme sebebi en az 10 karakter olmalıdır");
      return;
    }
    try {
      const result = await deleteAssignment(assignment.id, { deletion_reason: reason });
      if (result.success) {
        flash("Ödev başarıyla silindi");
        router.push(paths.list);
      } else {
        flash("❌ " + (result.error || "Silme işlemi başarısız oldu"));
      }
    } catch {
      flash("❌ Bağlantı hatası — silme yapılamadı");
    }
  };

  const toggleLesson = (id: number) => {
    setExpandedLessons(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  // ─── Loading / Error ───
  if (loading) return <div style={{ padding: 60, textAlign: "center", fontFamily: "'Poppins', sans-serif", color: "#64748b" }}>⏳ Yükleniyor...</div>;
  if (!assignment) return <div style={{ padding: 60, textAlign: "center", fontFamily: "'Poppins', sans-serif" }}><h2>Ödev bulunamadı</h2><Link href={paths.list} style={{ color: "#6366f1" }}>← Geri Dön</Link></div>;

  const overdue = isOverdue(assignment.due_date, assignment.status);
  const isNonSubmission = !!assignment.non_submission_reason;
  const isControlLocked = !!assignment.is_control_locked;
  const isCompleted = assignment.status === "COMPLETED";
  const isLocked = isNonSubmission || isControlLocked || (isCompleted && !isReEditing);
  const evaluatedTaskCount = liveSummary ? liveSummary.total - liveSummary.pending : 0;

  return (
    <div className="ok-root" style={{ maxWidth: 1400, margin: "0 auto" }}>

      {toast && <div className="ok-toast">{toast}</div>}

      {/* Breadcrumb + Header */}
      <div style={{ marginBottom: 20 }}>
        <Link href={paths.list} className="ok-link-back">← Ödev Kontrol Listesine Dön</Link>
        <div className="ok-detail-header">
          <h1>{assignment.title || "İsimsiz Ödev"}</h1>
          <div className="ok-detail-header-meta">
            <span>{assignment.student_name}</span>
            {assignment.coach_name && <span>Koç: {assignment.coach_name}</span>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <span className="ok-badge is-accent">{assignment.status_display}</span>
            <span className="ok-badge">{assignment.risk_status_display}</span>
            <span className="ok-badge">{assignment.priority_display} Öncelik</span>
            {assignment.postpone_count > 0 && (
              <span className="ok-badge is-warning">{assignment.postpone_count}x Ertelendi</span>
            )}
          </div>
          <div className="ok-detail-actions">
            {evaluatedTaskCount > 0 && !isControlLocked && (
              <button
                type="button"
                className="ok-btn-secondary"
                onClick={handleResetAllTasks}
              >
                Tüm İşaretleri Sıfırla ({evaluatedTaskCount})
              </button>
            )}
            <button
              type="button"
              className="ok-btn-secondary"
              onClick={() => setShowPostponeModal(true)}
              disabled={isLocked || assignment.status === "COMPLETED" || assignment.postpone_count >= assignment.max_postpone}
            >
              Ertele ({assignment.postpone_count}/{assignment.max_postpone})
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="ok-detail-layout">

        {/* LEFT: Görev Kontrol Alanı */}
        <div className="ok-detail-main">
          {/* Tarih bilgisi bar */}
          <div style={{ background: "white", borderRadius: 14, padding: "16px 22px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", border: "1px solid #f1f5f9", display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: "#94a3b8", fontSize: 12 }}>📅 Atanma:</span><strong style={{ color: "#334155" }}>{formatDate(assignment.assigned_date)}</strong></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: "#94a3b8", fontSize: 12 }}>🎯 Teslim:</span><strong style={{ color: overdue ? "#dc2626" : "#334155" }}>{formatDate(assignment.due_date)}{overdue ? " ⚠️ GECİKTİ" : ""}</strong></div>
            {assignment.original_due_date && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: "#94a3b8", fontSize: 12 }}>Orijinal:</span><strong style={{ textDecoration: "line-through", color: "#cbd5e1" }}>{formatDate(assignment.original_due_date)}</strong></div>}
            {assignment.completed_date && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: "#94a3b8", fontSize: 12 }}>✅ Tamamlanma:</span><strong style={{ color: "#16a34a" }}>{formatDate(assignment.completed_date)}</strong></div>}
          </div>

          {/* Geç Teslim / Erteleme Uyarı Kutusu */}
          {(assignment.is_late_submission || assignment.postpone_count > 0 || overdue) && (
            <div style={{ background: "white", borderRadius: 14, marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", border: "1px solid #fecaca", overflow: "hidden" }}>
              {/* Geç Teslim Uyarısı */}
              {(assignment.is_late_submission || overdue) && (
                <div style={{ padding: "14px 22px", background: "linear-gradient(135deg, #fef2f2, #fee2e2)", borderBottom: assignment.postpone_count > 0 ? "1px solid #fecaca" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>⚠️</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#dc2626" }}>
                      {assignment.is_late_submission
                        ? `Geç Teslim — ${assignment.late_days} gün gecikme`
                        : "Teslim Tarihi Geçti"}
                    </span>
                  </div>
                  {assignment.is_late_submission && (
                    <div style={{ fontSize: 12, color: "#991b1b", marginBottom: 8 }}>
                      Son teslim: {formatDate(assignment.original_due_date || assignment.due_date)} · Tamamlanma: {formatDate(assignment.completed_date)}
                    </div>
                  )}
                  {/* Geç Teslim Notu */}
                  {assignment.late_submission_note && !editingLateNote && (
                    <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.7)", borderRadius: 10, border: "1px solid #fecaca", fontSize: 13, color: "#7f1d1d", marginBottom: 8 }}>
                      📝 <strong>Geç Teslim Notu:</strong> {assignment.late_submission_note}
                    </div>
                  )}
                  {editingLateNote ? (
                    <div style={{ marginTop: 6 }}>
                      <textarea
                        value={lateNoteText}
                        onChange={e => setLateNoteText(e.target.value)}
                        placeholder="Geç teslim sebebini yazın... (örn: hastalık, mazeret, vb.)"
                        style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #fca5a5", borderRadius: 10, fontSize: 13, outline: "none", minHeight: 60, resize: "vertical", background: "white" }}
                      />
                      <div style={{ display: "flex", gap: 10, marginTop: 8, justifyContent: "flex-end" }}>
                        <button onClick={() => setEditingLateNote(false)} style={{ padding: "8px 16px", background: "white", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>İptal</button>
                        <button onClick={handleSaveLateNote} style={{ padding: "8px 18px", background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "white", border: "none", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(220,38,38,0.3)" }}>💾 Notu Kaydet</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingLateNote(true); setLateNoteText(assignment.late_submission_note || ""); }}
                      style={{ padding: "8px 16px", background: "rgba(255,255,255,0.8)", color: "#dc2626", border: "1.5px solid #fca5a5", borderRadius: 10, fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                    >
                      📝 {assignment.late_submission_note ? "Notu Düzenle" : "Geç Teslim Notu Ekle"}
                    </button>
                  )}
                </div>
              )}

              {/* Erteleme Bilgisi */}
              {assignment.postpone_count > 0 && (
                <div style={{ padding: "14px 22px", background: "linear-gradient(135deg, #fffbeb, #fef3c7)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>📅</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#b45309" }}>
                      {assignment.postpone_count} Kez Ertelendi
                    </span>
                    <span style={{ fontSize: 12, color: "#92400e", background: "rgba(255,255,255,0.6)", padding: "2px 10px", borderRadius: 20 }}>
                      {assignment.postpone_count}/{assignment.max_postpone} hak kullanıldı
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#92400e", display: "flex", gap: 16, flexWrap: "wrap", marginBottom: assignment.postpone_reason ? 8 : 0 }}>
                    {assignment.original_due_date && (
                      <span>İlk teslim tarihi: <strong style={{ textDecoration: "line-through" }}>{formatDate(assignment.original_due_date)}</strong></span>
                    )}
                    <span>Yeni teslim tarihi: <strong>{formatDate(assignment.due_date)}</strong></span>
                  </div>
                  {assignment.postpone_reason && (
                    <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.7)", borderRadius: 10, border: "1px solid #fde68a", fontSize: 13, color: "#78350f" }}>
                      📝 <strong>Erteleme Sebebi:</strong> {assignment.postpone_reason}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions Bar */}
          <div style={{ background: "white", borderRadius: 14, padding: "14px 22px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", border: "1px solid #f1f5f9", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {assignment.status === "DRAFT" && !isLocked && <button onClick={handleAssignDraft} style={{ padding: "9px 18px", background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(59,130,246,0.3)" }}>📤 Öğrenciye Ata</button>}
            {assignment.status !== "COMPLETED" && assignment.status !== "DRAFT" && !isLocked && (
              <>
                <button onClick={() => setShowNotDoneModal(true)} style={{ padding: "9px 18px", background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "white", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(239,68,68,0.3)" }}>🚫 Ödev Getirilmedi</button>
                <div style={{ width: 1, height: 28, background: "#e2e8f0" }} />
                <span style={{ fontSize: 12, color: "#94a3b8", marginRight: 2, fontWeight: 500 }}>Risk:</span>
                {[{ key: "ON_TRACK", label: "✅ Yolunda" }, { key: "BEHIND", label: "🟡 Geride" }, { key: "AT_RISK", label: "🔴 Riskli" }].map(r => (
                  <button key={r.key} onClick={() => handleUpdateRisk(r.key)} style={{ padding: "7px 14px", fontSize: 12, border: assignment.risk_status === r.key ? `2px solid ${getRiskColor(r.key).text}` : "1px solid #e2e8f0", borderRadius: 10, background: assignment.risk_status === r.key ? getRiskColor(r.key).bg : "#fafafa", cursor: "pointer", fontWeight: assignment.risk_status === r.key ? 700 : 500, transition: "all 0.2s", boxShadow: assignment.risk_status === r.key ? `0 2px 8px ${getRiskColor(r.key).text}20` : "none" }}>{r.label}</button>
                ))}
              </>
            )}
            <button
              type="button"
              className="ok-btn-danger"
              style={{ marginLeft: "auto", opacity: isControlLocked ? 0.45 : 1 }}
              onClick={() => !isControlLocked && setShowDeleteModal(true)}
              disabled={isControlLocked}
              title={isControlLocked ? "Kontrol günü geçtiği için silinemez" : undefined}
            >
              Sil
            </button>
          </div>

          {/* Ödev Getirilmedi Bilgi Kutusu */}
          {assignment.non_submission_reason && (
            <div style={{ background: "linear-gradient(135deg, #fef2f2, #fee2e2)", borderRadius: 14, padding: "16px 22px", marginBottom: 14, border: "1px solid #fecaca", boxShadow: "0 2px 8px rgba(239,68,68,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>🚫</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#dc2626" }}>Ödev Getirilmedi</span>
              </div>
              <div style={{ fontSize: 13, color: "#991b1b", fontWeight: 600, marginBottom: 4 }}>
                Sebep: {assignment.non_submission_reason === "NOT_BROUGHT" ? "Öğrenci ödevi getirmedi" : assignment.non_submission_reason === "NOT_DONE" ? "Öğrenci ödevi yapmamış" : assignment.non_submission_reason === "CONTROL_NOT_POSSIBLE" ? "Ödev kontrolü yapılamadı" : "Diğer"}
              </div>
              {assignment.non_submission_note && (
                <div style={{ fontSize: 12, color: "#7f1d1d", background: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "8px 12px", marginTop: 6 }}>
                  📝 {assignment.non_submission_note}
                </div>
              )}
            </div>
          )}

          {/* Kontrol günü kilidi */}
          {isControlLocked && (
            <div className="ok-control-lock-banner">
              <span style={{ fontSize: 18 }}>🔒</span>
              <div>
                <strong>Kontrol günü sona erdi</strong>
                <div style={{ fontSize: 12, marginTop: 2, opacity: 0.9 }}>
                  Bu ödev değerlendirilmiş ve teslim günü geçmiş; artık düzenlenemez veya silinemez.
                </div>
              </div>
            </div>
          )}

          {/* Kontrol Tamamlandı Banner */}
          {isCompleted && !isNonSubmission && !isControlLocked && (
            <div style={{
              background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
              borderRadius: 14, padding: "16px 22px", marginBottom: 14,
              border: "1.5px solid #86efac",
              boxShadow: "0 2px 8px rgba(34,197,94,0.1)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>✅</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#15803d" }}>Kontrol Tamamlandı</div>
                  <div style={{ fontSize: 12, color: "#16a34a", marginTop: 2 }}>
                    Tüm görevler değerlendirildi{assignment.completed_date ? ` · ${formatDatetime(assignment.completed_date)}` : ""}
                  </div>
                </div>
              </div>
              {!isReEditing ? (
                <button
                  onClick={() => setIsReEditing(true)}
                  style={{
                    padding: "9px 18px", background: "white",
                    color: "#15803d", border: "1.5px solid #86efac",
                    borderRadius: 10, fontSize: 12, fontWeight: 700,
                    cursor: "pointer", transition: "all 0.2s",
                  }}
                >
                  ✏️ Yeniden Düzenle
                </button>
              ) : (
                <button
                  onClick={() => setIsReEditing(false)}
                  style={{
                    padding: "9px 18px",
                    background: "linear-gradient(135deg, #16a34a, #15803d)",
                    color: "white", border: "none",
                    borderRadius: 10, fontSize: 12, fontWeight: 700,
                    cursor: "pointer", boxShadow: "0 2px 8px rgba(22,163,74,0.3)",
                  }}
                >
                  🔒 Düzenlemeyi Bitir
                </button>
              )}
            </div>
          )}

          {/* Ders & Görev Listesi */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {assignment.lessons.length === 0 ? (
              <div style={{ background: "white", borderRadius: 16, padding: 48, textAlign: "center", color: "#94a3b8", border: "2px dashed #e2e8f0" }}>Henüz ders/görev eklenmemiş.</div>
            ) : (
              (() => {
                // Aynı derse ait lesson'ları grupla
                const grouped = new Map<string, AssignmentLesson[]>();
                assignment.lessons.forEach(lesson => {
                  const key = lesson.lesson_name || "Ders";
                  if (!grouped.has(key)) grouped.set(key, []);
                  grouped.get(key)!.push(lesson);
                });
                return Array.from(grouped.entries()).map(([subjectName, lessons]) => {
                  const allTasks = lessons.flatMap(l => l.tasks);
                  const groupDone = allTasks.filter(t => t.completion_status === "DONE").length;
                  const groupTotal = allTasks.length;
                  const groupPct = groupTotal > 0 ? Math.round(groupDone / groupTotal * 100) : 0;
                  return (
                    <div key={subjectName} style={{ background: "white", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: "1px solid #e8ecf1" }}>
                      {/* Ders Grup Header */}
                      <div style={{ padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", background: groupPct === 100 ? "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)" : "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)", borderBottom: "1px solid #e2e8f0" }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b", display: "flex", alignItems: "center", gap: 6 }}>📖 {subjectName}{groupPct === 100 && <span style={{ fontSize: 15 }}>✅</span>}</div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{lessons.length} kaynak · {groupTotal} görev</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: groupPct === 100 ? "#16a34a" : "#6366f1" }}>{groupDone}/{groupTotal}</div>
                            <div style={{ width: 100, height: 7, background: "#e2e8f0", borderRadius: 3.5, overflow: "hidden", marginTop: 4 }}>
                              <div style={{ height: "100%", width: `${groupPct}%`, background: groupPct === 100 ? "linear-gradient(90deg, #10b981, #059669)" : "linear-gradient(90deg, #6366f1, #818cf8)", borderRadius: 3.5, transition: "width 0.5s" }} />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Alt Kaynaklar (Kitaplar) */}
                      {lessons.map(lesson => {
                const isExpanded = expandedLessons.has(lesson.id);
                const done = lesson.tasks.filter(t => t.completion_status === "DONE").length;
                const total = lesson.tasks.length;
                const pct = total > 0 ? Math.round(done / total * 100) : 0;
                return (
                  <div key={lesson.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    {/* Kaynak/Kitap Header */}
                    <div onClick={() => toggleLesson(lesson.id)} style={{ padding: "14px 22px 14px 34px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: "#f8fafc", borderBottom: isExpanded ? "1px solid #f1f5f9" : "none", marginLeft: 8 }}>
                      <div>
                        {lesson.resource_book_name && <div style={{ fontSize: 14, fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: 6 }}>📕 {lesson.resource_book_name}{pct === 100 && <span style={{ fontSize: 13 }}>✅</span>}</div>}
                        {!lesson.resource_book_name && <div style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>📝 Kaynak belirtilmemiş{pct === 100 && <span style={{ fontSize: 13 }}>✅</span>}</div>}
                        {lesson.topic_name && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>📌 {lesson.topic_name}</div>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? "#16a34a" : "#6366f1" }}>{done}/{total}</div>
                          <div style={{ width: 80, height: 5, background: "#e2e8f0", borderRadius: 2.5, overflow: "hidden", marginTop: 3 }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "linear-gradient(90deg, #10b981, #059669)" : "linear-gradient(90deg, #6366f1, #818cf8)", borderRadius: 2.5, transition: "width 0.5s" }} />
                          </div>
                        </div>
                        <span style={{ fontSize: 16, color: "#94a3b8", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s ease", display: "flex" }}>▾</span>
                      </div>
                    </div>

                    {/* Görevler */}
                    {isExpanded && (
                      <div>
                        {(() => {
                          // Task'ları content_topic_name'e göre alt-grupla
                          const topicGroupMap = new Map<string, AssignmentTask[]>();
                          lesson.tasks.forEach(task => {
                            const tKey = task.content_topic_name || lesson.topic_name || "__default__";
                            if (!topicGroupMap.has(tKey)) topicGroupMap.set(tKey, []);
                            topicGroupMap.get(tKey)!.push(task);
                          });
                          const topicEntries = Array.from(topicGroupMap.entries());
                          const hasMultipleTopics = topicEntries.length > 1;

                          return topicEntries.map(([topicKey, tasks], tIdx) => (
                            <div key={topicKey}>
                              {/* Birden fazla content topic varsa alt-başlık göster */}
                              {hasMultipleTopics && topicKey !== "__default__" && (
                                <div style={{ padding: "8px 22px 6px 42px", background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)", borderTop: tIdx > 0 ? "1px solid #c7d2fe" : "none", display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 13 }}>📂</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#4338ca" }}>{topicKey}</span>
                                  <span style={{ fontSize: 10, color: "#818cf8", fontWeight: 500 }}>({tasks.length} görev)</span>
                                </div>
                              )}
                              {tasks.map(task => {
                          const badge = getCompletionBadge(task.completion_status);
                          const isPartialOpen = partialTaskId === task.id;
                          const isSaving = saving === task.id;
                          const borderColor = task.completion_status === "DONE" ? "#16a34a" : task.completion_status === "NOT_DONE" ? "#dc2626" : task.completion_status === "PARTIAL" ? "#d97706" : "#cbd5e1";
                          return (
                            <div key={task.id} style={{ padding: "18px 22px 18px 18px", borderTop: "1px solid #e8ecf1", background: task.completion_status === "PENDING" ? "#ffffff" : "#fafbfc", borderLeft: `4px solid ${borderColor}`, marginLeft: 8 }}>
                              {/* Görev Başlığı + Badge */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", letterSpacing: -0.2 }}>{task.title}</div>
                                  <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap", fontSize: 12 }}>
                                    <span style={{ color: "#94a3b8", background: "#f8fafc", padding: "2px 8px", borderRadius: 6 }}>{task.task_type_display}</span>
                                    {task.question_count != null && task.question_count > 0 && <span style={{ color: "#6366f1", background: "#eef2ff", padding: "2px 8px", borderRadius: 6, fontWeight: 500 }}>📝 {task.question_count} soru</span>}
                                    {task.page_count != null && task.page_count > 0 && <span style={{ color: "#8b5cf6", background: "#f5f3ff", padding: "2px 8px", borderRadius: 6, fontWeight: 500 }}>📄 {task.page_count} sayfa</span>}
                                    {task.estimated_duration_minutes && <span style={{ color: "#94a3b8", background: "#f8fafc", padding: "2px 8px", borderRadius: 6 }}>⏱️ ~{task.estimated_duration_minutes} dk</span>}
                                  </div>
                                  {task.description && <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, fontStyle: "italic", lineHeight: 1.5 }}>💬 {task.description}</div>}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 }}>
                                  <span style={{ padding: "5px 12px", borderRadius: 24, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.text, border: `1.5px solid ${badge.border}`, whiteSpace: "nowrap", boxShadow: `0 1px 4px ${badge.text}15` }}>
                                    {badge.label}{task.completion_status === "PARTIAL" && ` %${task.task_completion_percent}`}
                                  </span>
                                  {task.is_completion_task && (
                                    <span style={{
                                      padding: "4px 10px",
                                      borderRadius: 24,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      background: "linear-gradient(135deg, #dbeafe, #eff6ff)",
                                      color: "#2563eb",
                                      border: "1.5px solid #93c5fd",
                                      whiteSpace: "nowrap",
                                    }}>
                                      🔄 Eksik Tamamlama
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Eksik Tamamlama Bilgi Notu */}
                              {task.is_completion_task && (
                                <div style={{
                                  background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                                  border: "1px solid #93c5fd",
                                  borderRadius: 10,
                                  padding: "10px 14px",
                                  marginBottom: 12,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                }}>
                                  <span style={{ fontSize: 18, flexShrink: 0 }}>🔄</span>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1e40af", marginBottom: 2 }}>
                                      Eksik Tamamlama
                                    </div>
                                    <div style={{ fontSize: 11, color: "#3b82f6", lineHeight: 1.4 }}>
                                      Bu içerik daha önce <strong>&quot;{task.previous_assignment_title || "önceki ödev"}&quot;</strong> ödevinde
                                      {task.previous_task_completion_percent != null && task.previous_task_completion_percent > 0
                                        ? <> <strong>%{task.previous_task_completion_percent}</strong> oranında tamamlanmıştı.</>
                                        : <> yapılamamıştı.</>
                                      }
                                      {" "}Kalan kısımların tamamlanması bekleniyor.
                                    </div>
                                  </div>
                                  {task.previous_task_completion_percent != null && task.previous_task_completion_percent > 0 && (
                                    <div style={{
                                      background: "white",
                                      borderRadius: 8,
                                      padding: "6px 12px",
                                      textAlign: "center",
                                      border: "1px solid #bfdbfe",
                                      flexShrink: 0,
                                    }}>
                                      <div style={{ fontSize: 14, fontWeight: 800, color: "#2563eb" }}>%{task.previous_task_completion_percent}</div>
                                      <div style={{ fontSize: 9, color: "#60a5fa", fontWeight: 600 }}>ÖNCEKİ</div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Eksik detayları */}
                              {task.completion_status === "PARTIAL" && (
                                <div style={{ background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12 }}>
                                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>📊 Tamamlanma: <strong style={{ color: "#92400e" }}>%{task.task_completion_percent}</strong></span>
                                    {task.completed_question_count != null && <span style={{ display: "flex", alignItems: "center", gap: 4 }}>✅ Çözülen: <strong style={{ color: "#16a34a" }}>{task.completed_question_count}</strong> / {task.question_count} soru</span>}
                                    {task.completed_page_count != null && <span style={{ display: "flex", alignItems: "center", gap: 4 }}>📄 Tamamlanan: <strong style={{ color: "#7c3aed" }}>{task.completed_page_count}</strong> / {task.page_count} sayfa</span>}
                                  </div>
                                </div>
                              )}

                              {task.completion_status === "DONE" && (
                                <div style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12 }}>
                                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
                                    {task.completed_question_count != null && task.completed_question_count > 0 && <span>✅ <strong style={{ color: "#16a34a" }}>{task.completed_question_count}</strong> soru çözüldü</span>}
                                    {task.completed_page_count != null && task.completed_page_count > 0 && <span>📄 <strong style={{ color: "#7c3aed" }}>{task.completed_page_count}</strong> sayfa tamamlandı</span>}
                                    {task.evaluated_at && <span style={{ color: "#94a3b8" }}>🕐 {formatDatetime(task.evaluated_at)}</span>}
                                  </div>
                                </div>
                              )}

                              {/* 3'lü Buton: Yaptı / Yapmadı / Eksik */}
                              {isLocked ? (
                                <div className="ok-task-detail-box">
                                  {isControlLocked
                                    ? "Kontrol günü sona erdi — bu ödev artık düzenlenemez"
                                    : isNonSubmission
                                    ? "Bu ödev kilitli — değişiklik yapılamaz"
                                    : "Kontrol tamamlandı — düzenlemek için yukarıdaki butonu kullanın"}
                                </div>
                              ) : (
                              <div className="ok-task-actions">
                                <div className="ok-segment">
                                  <button
                                    type="button"
                                    className={`ok-segment-btn${task.completion_status === "DONE" ? " is-active-done" : ""}`}
                                    onClick={() => handleUpdateTaskStatus(task.id, "DONE")}
                                    disabled={isSaving}
                                  >
                                    Yaptı
                                  </button>
                                  <button
                                    type="button"
                                    className={`ok-segment-btn${task.completion_status === "NOT_DONE" ? " is-active-not-done" : ""}`}
                                    onClick={() => handleUpdateTaskStatus(task.id, "NOT_DONE")}
                                    disabled={isSaving}
                                  >
                                    Yapmadı
                                  </button>
                                  <button
                                    type="button"
                                    className={`ok-segment-btn${task.completion_status === "PARTIAL" || isPartialOpen ? " is-active-partial" : ""}`}
                                    onClick={() => setPartialTaskId(isPartialOpen ? null : task.id)}
                                    disabled={isSaving}
                                  >
                                    Eksik
                                  </button>
                                </div>
                                {task.completion_status !== "PENDING" && (
                                  <button
                                    type="button"
                                    className="ok-btn-reset"
                                    onClick={() => handleResetTask(task.id)}
                                    disabled={isSaving}
                                  >
                                    Sıfırla
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="ok-btn-ghost"
                                  style={{ marginLeft: "auto" }}
                                  onClick={() => { setEditingNoteTaskId(editingNoteTaskId === task.id ? null : task.id); setNoteText(task.coach_evaluation_note || ""); }}
                                >
                                  {task.coach_evaluation_note ? "Notu Düzenle" : "Not Ekle"}
                                </button>
                              </div>
                              )}

                              {isPartialOpen && (
                                <div className="ok-partial-panel">
                                  <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Tamamlanma yüzdesi seçin:</div>
                                  <div className="ok-partial-grid">
                                    {PERCENT_OPTIONS.map(pct => {
                                      const qCalc = task.question_count ? Math.round(task.question_count * pct / 100) : null;
                                      const pCalc = task.page_count ? Math.round(task.page_count * pct / 100) : null;
                                      const isActive = task.task_completion_percent === pct && task.completion_status === "PARTIAL";
                                      return (
                                        <button
                                          key={pct}
                                          type="button"
                                          className={`ok-partial-btn${isActive ? " is-active" : ""}`}
                                          onClick={() => handleUpdateTaskStatus(task.id, "PARTIAL", pct)}
                                        >
                                          <div style={{ fontWeight: 700 }}>%{pct}</div>
                                          {qCalc != null && <div style={{ fontSize: 10, marginTop: 2 }}>{qCalc}/{task.question_count} soru</div>}
                                          {pCalc != null && <div style={{ fontSize: 10 }}>{pCalc}/{task.page_count} sf</div>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Not alanı */}
                              {editingNoteTaskId === task.id && (
                                <div className="ok-partial-panel">
                                  <textarea
                                    className="ok-textarea"
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    placeholder="Koç değerlendirme notu..."
                                  />
                                  <div className="ok-modal-footer" style={{ padding: "10px 0 0", border: "none", justifyContent: "flex-end" }}>
                                    <button type="button" className="ok-btn-ghost" onClick={() => setEditingNoteTaskId(null)}>İptal</button>
                                    {task.coach_evaluation_note && (
                                      <button type="button" className="ok-btn-danger" onClick={() => handleDeleteNote(task.id)}>Sil</button>
                                    )}
                                    <button type="button" className="ok-btn-primary" style={{ padding: "8px 16px" }} onClick={() => handleSaveNote(task.id)}>Kaydet</button>
                                  </div>
                                </div>
                              )}

                              {task.coach_evaluation_note && editingNoteTaskId !== task.id && (
                                <div className="ok-note-box">
                                  <span>{task.coach_evaluation_note}</span>
                                  {!isLocked && (
                                    <div className="ok-note-actions">
                                      <button
                                        type="button"
                                        className="ok-btn-ghost"
                                        onClick={() => { setEditingNoteTaskId(task.id); setNoteText(task.coach_evaluation_note || ""); }}
                                      >
                                        Düzenle
                                      </button>
                                      <button
                                        type="button"
                                        className="ok-btn-danger"
                                        onClick={() => handleDeleteNote(task.id)}
                                      >
                                        Sil
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                            </div>
                          ));
                        })()}
                        {lesson.notes && <div style={{ padding: "12px 22px", background: "linear-gradient(135deg, #fffbeb, #fef3c7)", fontSize: 12, color: "#92400e", borderTop: "1px solid #fde68a", fontWeight: 500 }}>💡 {lesson.notes}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* /Alt Kaynaklar end */}
                    </div>
                  );
                })
              })()
            )}
          </div>

          {/* Notlar */}
          {(assignment.coach_notes || assignment.student_notes || assignment.description) && (
            <div style={{ background: "white", borderRadius: 16, padding: 24, marginTop: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: "1px solid #f1f5f9" }}>
              {assignment.description && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>📋 Açıklama</div><p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.7, background: "#f8fafc", padding: "10px 14px", borderRadius: 10, border: "1px solid #f1f5f9" }}>{assignment.description}</p></div>}
              {assignment.coach_notes && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>🎓 Koç Notları</div><p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.7, background: "#f5f3ff", padding: "10px 14px", borderRadius: 10, border: "1px solid #ede9fe" }}>{assignment.coach_notes}</p></div>}
              {assignment.student_notes && <div><div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>📝 Öğrenci Notları</div><p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.7, background: "#f0fdf4", padding: "10px 14px", borderRadius: 10, border: "1px solid #dcfce7" }}>{assignment.student_notes}</p></div>}
            </div>
          )}
        </div>

        {/* RIGHT: Canlı Özet Paneli */}
        <div className="ok-detail-aside">
          {liveSummary && (
            <div className="ok-summary-panel">
              <div className="ok-summary-header">
                <h3>Canlı Özet</h3>
              </div>
              <div className="ok-summary-body">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Genel İlerleme</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#1f3c88" }}>%{liveSummary.overallPct}</span>
                </div>
                <div className="ok-progress" style={{ marginBottom: 16 }}>
                  <div className="ok-progress-fill" style={{ width: `${liveSummary.overallPct}%` }} />
                </div>
                <div className="ok-stat-grid" style={{ padding: 0 }}>
                  {[
                    { label: "Yaptı", value: liveSummary.done },
                    { label: "Yapmadı", value: liveSummary.notDone },
                    { label: "Eksik", value: liveSummary.partial },
                    { label: "Beklemede", value: liveSummary.pending },
                  ].map((s) => (
                    <div key={s.label} className="ok-stat-item">
                      <div className="ok-stat-value">{s.value}</div>
                      <div className="ok-stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>Toplam: {liveSummary.total} görev</div>
                {evaluatedTaskCount > 0 && (
                  <button
                    type="button"
                    className="ok-btn-reset-all"
                    onClick={handleResetAllTasks}
                  >
                    Tüm İşaretleri Sıfırla ({evaluatedTaskCount})
                  </button>
                )}
              </div>

              {/* Soru İstatistikleri */}
              {liveSummary.totalQ > 0 && (
                <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Soru İstatistikleri</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#6366f1" }}>%{liveSummary.questionPct}</span>
                  </div>
                  <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ height: "100%", width: `${liveSummary.questionPct}%`, background: "#10b981", borderRadius: 4, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#16a34a" }}>✅ {liveSummary.completedQ} çözüldü</span>
                    <span style={{ color: "#dc2626" }}>❌ {liveSummary.remainingQ} kaldı</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Toplam: {liveSummary.totalQ} soru</div>
                </div>
              )}

              {/* Sayfa İstatistikleri */}
              {liveSummary.totalP > 0 && (
                <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>📄 Sayfa İstatistikleri</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#8b5cf6" }}>%{liveSummary.pagePct}</span>
                  </div>
                  <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ height: "100%", width: `${liveSummary.pagePct}%`, background: "#8b5cf6", borderRadius: 4, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#7c3aed" }}>✅ {liveSummary.completedP} tamamlandı</span>
                    <span style={{ color: "#dc2626" }}>❌ {liveSummary.remainingP} kaldı</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Toplam: {liveSummary.totalP} sayfa</div>
                </div>
              )}

              <div className="ok-summary-report">
                <Link href={paths.report(assignmentId)} className="ok-btn-primary ok-summary-report-btn">
                  Detaylı Sonuç Raporu
                </Link>
                <p className="ok-summary-report-hint">Yazdır, PDF indir veya paylaş</p>
                {assignment.status === "COMPLETED" && (
                  <button
                    type="button"
                    className="ok-btn-secondary"
                    style={{ marginTop: 8, width: "100%", background: "#ecfdf5", borderColor: "#6ee7b7", color: "#047857" }}
                    onClick={() => setShowSendModal("report")}
                  >
                    WhatsApp — Rapor Gönder
                  </button>
                )}
                {assignment.status !== "DRAFT" && assignment.status !== "COMPLETED" && (
                  <button
                    type="button"
                    className="ok-btn-secondary"
                    style={{ marginTop: 8, width: "100%", background: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8" }}
                    onClick={() => setShowSendModal("plan")}
                  >
                    WhatsApp — Plan Gönder
                  </button>
                )}
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Erteleme Modalı */}
      {showPostponeModal && (
        <>
          <div onClick={() => setShowPostponeModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", zIndex: 1000 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "white", borderRadius: 20, padding: 24, zIndex: 1001, width: "min(460px, calc(100vw - 32px))", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#1e293b" }}>📅 Ödev Ertele</h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#64748b" }}>
              Mevcut teslim: <strong>{formatDate(assignment.due_date)}</strong>
              {assignment.postpone_count > 0 && <span> · {assignment.postpone_count}/{assignment.max_postpone} erteleme kullanıldı</span>}
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#334155" }}>Yeni Teslim Tarihi *</label>
              <input type="date" value={postponeDate} min={new Date(new Date().getTime() + 86400000).toISOString().split('T')[0]} onChange={e => setPostponeDate(e.target.value)} style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, outline: "none", transition: "border-color 0.2s" }} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#334155" }}>Erteleme Sebebi</label>
              <textarea value={postponeReason} onChange={e => setPostponeReason(e.target.value)} placeholder="Neden erteleniyor..." style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, outline: "none", minHeight: 80, resize: "vertical", transition: "border-color 0.2s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button onClick={() => setShowPostponeModal(false)} style={{ padding: "11px 22px", background: "white", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, cursor: "pointer", fontWeight: 500 }}>İptal</button>
              <button onClick={handlePostpone} disabled={!postponeDate} style={{ padding: "11px 26px", background: postponeDate ? "linear-gradient(135deg, #f59e0b, #d97706)" : "#d1d5db", color: "white", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: postponeDate ? "pointer" : "default", boxShadow: postponeDate ? "0 3px 12px rgba(245,158,11,0.3)" : "none" }}>📅 Ertele</button>
            </div>
          </div>
        </>
      )}

      {/* Ödev Getirilmedi Modalı */}
      {showNotDoneModal && (
        <>
          <div onClick={() => setShowNotDoneModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", zIndex: 1000 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "white", borderRadius: 20, padding: 32, zIndex: 1001, width: 480, boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#dc2626" }}>🚫 Ödev Getirilmedi</h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#64748b" }}>
              Tüm görevler <strong>&ldquo;Yapmadı&rdquo;</strong> olarak işaretlenecek ve ödev tamamlanmış sayılacak.
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#334155" }}>Sebep Seçin *</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { key: "NOT_BROUGHT", label: "Öğrenci ödevi getirmedi", icon: "📭" },
                  { key: "NOT_DONE", label: "Öğrenci ödevi yapmamış", icon: "✋" },
                  { key: "CONTROL_NOT_POSSIBLE", label: "Ödev kontrolü yapılamadı", icon: "🔒" },
                  { key: "OTHER", label: "Diğer", icon: "📝" },
                ].map(r => (
                  <label key={r.key} onClick={() => setNotDoneReason(r.key)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, border: notDoneReason === r.key ? "2px solid #dc2626" : "1.5px solid #e2e8f0", background: notDoneReason === r.key ? "#fef2f2" : "#fafafa", cursor: "pointer", transition: "all 0.2s" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: notDoneReason === r.key ? "6px solid #dc2626" : "2px solid #cbd5e1", background: "white", flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: notDoneReason === r.key ? 700 : 500, color: notDoneReason === r.key ? "#991b1b" : "#475569" }}>{r.icon} {r.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#334155" }}>Not (isteğe bağlı)</label>
              <textarea value={notDoneNote} onChange={e => setNotDoneNote(e.target.value)} placeholder="Ek açıklama ekleyin..." style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, outline: "none", minHeight: 80, resize: "vertical", transition: "border-color 0.2s" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button onClick={() => { setShowNotDoneModal(false); setNotDoneReason("NOT_BROUGHT"); setNotDoneNote(""); }} style={{ padding: "11px 22px", background: "white", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, cursor: "pointer", fontWeight: 500 }}>İptal</button>
              <button onClick={handleMarkAllNotDone} style={{ padding: "11px 26px", background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "white", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 3px 12px rgba(239,68,68,0.3)" }}>🚫 Tümünü Yapmadı İşaretle</button>
            </div>
          </div>
        </>
      )}

      {showSendModal && assignment && (
        <AssignmentNotifySendModal
          assignmentId={assignment.id}
          notifyType={showSendModal}
          studentName={assignment.student_name}
          onClose={() => setShowSendModal(null)}
          onSent={(sent, details) => flash(formatNotifySentToast(sent, details))}
        />
      )}

      {showDeleteModal && (
        <div className="ok-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="ok-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ok-modal-header">
              <h3>Ödevi Sil</h3>
            </div>
            <div className="ok-modal-body">
              <p>Bu ödev arşive alınacak. Silme sebebini yazın (en az 10 karakter).</p>
              <textarea
                className="ok-textarea"
                value={deletionReason}
                onChange={(e) => setDeletionReason(e.target.value)}
                placeholder="Silme sebebini açıklayın..."
              />
              <div className={`ok-char-hint${deletionReason.trim().length >= 10 ? " is-valid" : ""}`}>
                {deletionReason.trim().length}/10 karakter minimum
              </div>
            </div>
            <div className="ok-modal-footer">
              <button type="button" className="ok-btn-secondary" onClick={() => { setShowDeleteModal(false); setDeletionReason(""); }}>İptal</button>
              <button
                type="button"
                className="ok-btn-danger"
                onClick={handleDelete}
                disabled={deletionReason.trim().length < 10}
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   YAZDIR ÖNİZLEME COMPONENT'İ  — StudyProgramPrintPreview tarzı profesyonel
   ═══════════════════════════════════════════════════════ */
const OdevKontrolPrintPreview: React.FC<{ assignment: AssignmentDetail; onClose: () => void }> = ({ assignment, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");

  const summary = assignment.report_summary;
  const overallPct = summary?.overall_completion_percent ?? 0;
  const logoUrl = "/img/3k-logo.png";
  const currentYear = new Date().getFullYear();
  const todayStr = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  /* Escape key */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  /* ─── PDF hooks ─── */
  const [pdfBusy, setPdfBusy] = useState(false);

  const { print: printVector } = useVectorPrint({
    title: `Ödev Kontrol - ${assignment.student_name}`,
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

  const getCompletionLabel = (cs: string) => {
    switch (cs) {
      case "DONE": return { label: "Yaptı", color: "#16a34a", bg: "#dcfce7" };
      case "NOT_DONE": return { label: "Yapmadı", color: "#dc2626", bg: "#fee2e2" };
      case "PARTIAL": return { label: "Eksik", color: "#d97706", bg: "#fef3c7" };
      default: return { label: "Beklemede", color: "#94a3b8", bg: "#f1f5f9" };
    }
  };

  // Dersleri ders adına göre grupla
  const grouped = new Map<string, AssignmentLesson[]>();
  assignment.lessons.forEach(lesson => {
    const key = lesson.lesson_name || "Ders";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(lesson);
  });

  /* ─── İstatistik dağılımları ─── */
  const allTasks = assignment.lessons.flatMap(l => l.tasks);
  const statusCounts: Record<string, { label: string; count: number; color: string; icon: string }> = {};
  allTasks.forEach(t => {
    const cl = getCompletionLabel(t.completion_status);
    const k = t.completion_status || "PENDING";
    if (!statusCounts[k]) statusCounts[k] = { label: cl.label, count: 0, color: cl.color, icon: k === "DONE" ? "✅" : k === "NOT_DONE" ? "❌" : k === "PARTIAL" ? "⚠️" : "⏳" };
    statusCounts[k].count++;
  });

  // Ders bazlı dağılım
  const lessonCounts: Record<string, number> = {};
  assignment.lessons.forEach(l => {
    const k = l.lesson_name || "Diğer";
    lessonCounts[k] = (lessonCounts[k] || 0) + l.tasks.length;
  });

  /* ─── Ders başına mini chart değerleri ─── */
  const lessonMaxTasks = Math.max(...Object.values(lessonCounts), 1);

  const blockCols = orientation === "landscape" ? 4 : 3;

  /* ─── Style helpers ─── */
  const chipS = (bg: string, color: string, border: string): React.CSSProperties => ({
    padding: "3px 8px", borderRadius: 14, fontSize: 8, fontWeight: 600,
    background: bg, color, border, display: "inline-flex", alignItems: "center", gap: 2,
  });

  const statCardStyle: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 6,
    border: "1px solid #e2e8f0", background: "#fff",
  };

  const statCardTitle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: "#1e293b", marginBottom: 5,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "16px", overflowY: "auto",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16,
        maxWidth: orientation === "landscape" ? 1160 : 860,
        width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)", marginBottom: 40,
      }}>
        {/* ═══ TOOLBAR ═══ */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 24px", borderBottom: "1px solid #e4e9f2",
          position: "sticky", top: 0, background: "#fff", zIndex: 1, borderRadius: "16px 16px 0 0",
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "#172b4c" }}>
            📋 Yazdırma Önizleme
          </h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{
              display: "flex", borderRadius: 8, overflow: "hidden",
              border: "1px solid #e2e8f0",
            }}>
              <button
                onClick={() => setOrientation("portrait")}
                style={{
                  padding: "6px 14px", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: orientation === "portrait" ? "#0061a6" : "#fff",
                  color: orientation === "portrait" ? "#fff" : "#64748b",
                }}
              >📄 Dikey</button>
              <button
                onClick={() => setOrientation("landscape")}
                style={{
                  padding: "6px 14px", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: orientation === "landscape" ? "#0061a6" : "#fff",
                  color: orientation === "landscape" ? "#fff" : "#64748b",
                }}
              >📃 Yatay</button>
            </div>

            <button onClick={handlePDF} disabled={pdfBusy} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: pdfBusy ? "#93c5fd" : "#0061a6", color: "#fff", fontSize: 12, fontWeight: 600,
              cursor: pdfBusy ? "not-allowed" : "pointer",
            }}>{pdfBusy ? "⏳ Hazırlanıyor..." : "🖨️ PDF Önizle"}</button>
            <button onClick={handleDownload} disabled={pdfBusy} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 8, border: "1px solid #0061a6",
              background: "#fff", color: "#0061a6", fontSize: 12, fontWeight: 600,
              cursor: pdfBusy ? "not-allowed" : "pointer",
            }}>⬇️ İndir</button>
            <button onClick={onClose} style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid #e4e9f2",
              background: "#fff", color: "#8c98a4", fontSize: 14, fontWeight: 500, cursor: "pointer",
            }}>✕</button>
          </div>
        </div>

        {/* ═══════════ A4 CONTENT ═══════════ */}
        <div ref={printRef} id="odev-print-area" style={{
          padding: orientation === "landscape" ? "18px 24px" : "22px 28px",
          fontFamily: "'Poppins', sans-serif",
          color: "#172b4c", lineHeight: 1.4,
          maxWidth: orientation === "landscape" ? 1100 : 780,
          margin: "0 auto",
        }}>

          {/* ═══ PREMIUM HEADER ═══ */}
          <div style={{
            position: "relative", overflow: "hidden",
            background: "linear-gradient(135deg, #003d6b 0%, #0061a6 40%, #0085e0 100%)",
            borderRadius: 12, padding: "16px 20px", marginBottom: 12, color: "#fff",
          }}>
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
                  ÖDEV KONTROL RAPORU
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {assignment.title || "İsimsiz Ödev"}
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 8, opacity: 0.7, lineHeight: 1.7 }}>
                <div>ÖKR-{new Date().getTime().toString(36).toUpperCase().slice(-6)}</div>
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
              {assignment.student_info?.profil_foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={assignment.student_info.profil_foto}
                  alt={assignment.student_name}
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
                  {assignment.student_name.split(" ").map(w => w.charAt(0)).join("").substring(0, 2)}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>🎓 {assignment.student_name}</div>
                <div style={{ fontSize: 8, opacity: 0.75 }}>
                  Öğrenci · {assignment.priority_display} Öncelik · {assignment.status_display}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: 12, fontSize: 9 }}>
                {assignment.coach_name && (
                  <>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 7, opacity: 0.6, marginBottom: 1 }}>Maestro Koç</div>
                      <div style={{ fontWeight: 600, fontSize: 10 }}>👨‍🏫 {assignment.coach_name}</div>
                    </div>
                    <div style={{ width: 1, background: "rgba(255,255,255,0.25)" }} />
                  </>
                )}
                {summary && (
                  <>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 7, opacity: 0.6, marginBottom: 1 }}>Görev</div>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>📋 {summary.total_tasks}</div>
                    </div>
                    <div style={{ width: 1, background: "rgba(255,255,255,0.25)" }} />
                    {summary.total_questions > 0 && (
                      <>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 7, opacity: 0.6, marginBottom: 1 }}>Soru</div>
                          <div style={{ fontWeight: 700, fontSize: 12, color: "#fbbf24" }}>✏️ {summary.total_questions}</div>
                        </div>
                        <div style={{ width: 1, background: "rgba(255,255,255,0.25)" }} />
                      </>
                    )}
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 7, opacity: 0.6, marginBottom: 1 }}>Tamamlanma</div>
                      <div style={{ fontWeight: 700, fontSize: 12, color: "#34d399" }}>✅ %{overallPct}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ═══ SUMMARY ROW — chips + mini chart ═══ */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "stretch" }}>
            {/* Chips */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1, alignItems: "center" }}>
              <span style={chipS("#eef2ff", "#4338ca", "1px solid #c7d2fe")}>📚 {grouped.size} Ders</span>
              <span style={chipS("#ecfdf5", "#059669", "1px solid #a7f3d0")}>📋 {summary?.total_tasks ?? 0} Görev</span>
              {summary && summary.total_questions > 0 && (
                <span style={chipS("#fff7ed", "#ea580c", "1px solid #fed7aa")}>✏️ {summary.total_questions} Soru</span>
              )}
              {summary && summary.total_pages > 0 && (
                <span style={chipS("#fdf4ff", "#7c3aed", "1px solid #e9d5ff")}>📄 {summary.total_pages} Sayfa</span>
              )}
              {summary && (
                <span style={chipS("#f0fdf4", "#166534", "1px solid #bbf7d0")}>✅ {summary.done_tasks}/{summary.total_tasks}</span>
              )}
              <span style={chipS("#fff1f2", "#be123c", "1px solid #fecdd3")}>📅 {formatDate(assignment.assigned_date)} → {formatDate(assignment.due_date)}</span>
              {assignment.postpone_count > 0 && (
                <span style={chipS("#fffbeb", "#b45309", "1px solid #fde68a")}>🔄 {assignment.postpone_count}x Ertelendi</span>
              )}
            </div>
            {/* Mini bar chart — ders başı görev */}
            {Object.keys(lessonCounts).length > 1 && (
              <div style={{
                display: "flex", gap: 3, alignItems: "flex-end",
                padding: "5px 8px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0",
                minWidth: 140,
              }}>
                <div style={{ fontSize: 7, fontWeight: 600, color: "#475569", marginRight: 3, alignSelf: "center", writingMode: "vertical-lr" as const, transform: "rotate(180deg)", letterSpacing: 1 }}>DERSLER</div>
                {Object.entries(lessonCounts).map(([name, count]) => {
                  const pct = lessonMaxTasks > 0 ? (count / lessonMaxTasks) * 100 : 0;
                  return (
                    <div key={name} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 7, fontWeight: 700, color: "#374151", marginBottom: 1 }}>{count}</div>
                      <div style={{ height: 24, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                        <div style={{
                          width: "60%", minHeight: 3,
                          height: `${Math.max(pct, 10)}%`,
                          borderRadius: "2px 2px 0 0",
                          background: "linear-gradient(180deg, #60a5fa, #3b82f6)",
                        }} />
                      </div>
                      <div style={{ fontSize: 6, fontWeight: 600, color: "#64748b", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 40 }}>
                        {name.length > 5 ? name.slice(0, 5) + ".." : name}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ═══ COACH NOTE / DESCRIPTION ═══ */}
          {(assignment.coach_notes || assignment.description) && (
            <div style={{
              padding: "6px 12px", marginBottom: 10,
              background: "#fffbeb", border: "1px solid #fde68a",
              borderRadius: 6, fontSize: 9, color: "#92400e", lineHeight: 1.5,
            }}>
              {assignment.description && <div><strong>📋 Açıklama:</strong> {assignment.description}</div>}
              {assignment.coach_notes && <div style={{ marginTop: assignment.description ? 3 : 0 }}><strong>📌 Koç Notu:</strong> {assignment.coach_notes}</div>}
            </div>
          )}

          {/* ═══ SORU / SAYFA İSTATİSTİKLERİ ═══ */}
          {summary && (summary.total_questions > 0 || summary.total_pages > 0) && (
            <div className="page-break-avoid" style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {summary.total_questions > 0 && (
                <div style={{ flex: 1, background: "#eff6ff", borderRadius: 8, padding: "6px 10px", border: "1px solid #bfdbfe" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#1d4ed8", marginBottom: 2 }}>📝 Soru İstatistikleri</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#1e293b" }}>{summary.completed_questions}/{summary.total_questions}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#2563eb" }}>%{summary.question_completion_percent}</span>
                  </div>
                  <div style={{ height: 3, background: "#dbeafe", borderRadius: 3, overflow: "hidden", marginTop: 2 }}>
                    <div style={{ height: "100%", width: `${summary.question_completion_percent}%`, background: "#3b82f6", borderRadius: 3 }} />
                  </div>
                </div>
              )}
              {summary.total_pages > 0 && (
                <div style={{ flex: 1, background: "#f5f3ff", borderRadius: 8, padding: "6px 10px", border: "1px solid #ddd6fe" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#7c3aed", marginBottom: 2 }}>📄 Sayfa İstatistikleri</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#1e293b" }}>{summary.completed_pages}/{summary.total_pages}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed" }}>%{summary.page_completion_percent}</span>
                  </div>
                  <div style={{ height: 3, background: "#ede9fe", borderRadius: 3, overflow: "hidden", marginTop: 2 }}>
                    <div style={{ height: "100%", width: `${summary.page_completion_percent}%`, background: "#8b5cf6", borderRadius: 3 }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ GEÇ TESLİM / ERTELEME / GETİRİLMEDİ ═══ */}
          {(assignment.is_late_submission || assignment.postpone_count > 0 || assignment.non_submission_reason) && (
            <div className="page-break-avoid" style={{ marginBottom: 10, borderRadius: 8, overflow: "hidden", border: "1px solid #fecaca" }}>
              {assignment.non_submission_reason && (
                <div style={{ padding: "6px 12px", background: "#fee2e2" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#dc2626" }}>🚫 Ödev Getirilmedi</div>
                  <div style={{ fontSize: 9, color: "#991b1b", marginTop: 1 }}>
                    {assignment.non_submission_reason === "NOT_BROUGHT" ? "Öğrenci ödevi getirmedi" : assignment.non_submission_reason === "NOT_DONE" ? "Öğrenci ödevi yapmamış" : assignment.non_submission_reason === "CONTROL_NOT_POSSIBLE" ? "Ödev kontrolü yapılamadı" : "Diğer"}
                  </div>
                  {assignment.non_submission_note && <div style={{ fontSize: 8, color: "#7f1d1d", marginTop: 2 }}>📝 {assignment.non_submission_note}</div>}
                </div>
              )}
              {assignment.is_late_submission && (
                <div style={{ padding: "6px 12px", background: "#fff1f2", borderTop: assignment.non_submission_reason ? "1px solid #fecaca" : "none" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#dc2626" }}>⚠️ Geç Teslim — {assignment.late_days} gün</div>
                  {assignment.late_submission_note && <div style={{ fontSize: 8, color: "#7f1d1d", marginTop: 1 }}>📝 {assignment.late_submission_note}</div>}
                </div>
              )}
              {assignment.postpone_count > 0 && (
                <div style={{ padding: "6px 12px", background: "#fef3c7", borderTop: "1px solid #fde68a" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#b45309" }}>📅 {assignment.postpone_count}x Ertelendi</div>
                  {assignment.postpone_reason && <div style={{ fontSize: 8, color: "#78350f", marginTop: 1 }}>📝 {assignment.postpone_reason}</div>}
                </div>
              )}
            </div>
          )}

          {/* ═══ DERS & GÖREV DETAYLARI ═══ */}
          {Array.from(grouped.entries()).map(([subjectName, lessons]) => {
            const allSubjectTasks = lessons.flatMap(l => l.tasks);
            const groupDone = allSubjectTasks.filter(t => t.completion_status === "DONE").length;
            const groupTotal = allSubjectTasks.length;
            const groupPct = groupTotal > 0 ? Math.round(groupDone / groupTotal * 100) : 0;
            const allDone = groupTotal > 0 && groupDone === groupTotal;
            return (
              <div key={subjectName} className="page-break-avoid" style={{ marginBottom: 8 }}>
                {/* Ders Başlığı — StudyProgramPrintPreview day header tarzı */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 10px",
                  background: allDone
                    ? "linear-gradient(135deg, #059669, #10b981)"
                    : "linear-gradient(135deg, #0061a6, #3b82f6)",
                  borderRadius: "6px 6px 0 0",
                  color: "#fff", fontSize: 10,
                }}>
                  <span style={{ fontWeight: 700, fontSize: 11 }}>📖 {subjectName}</span>
                  <span style={{ fontSize: 8, opacity: 0.85 }}>
                    {lessons.length} kaynak · {groupTotal} görev · {groupDone}/{groupTotal}
                    {allDone ? " ✅" : ` · %${groupPct}`}
                  </span>
                </div>

                {/* Kaynaklar (Kitaplar) — grid düzeni */}
                <div style={{ border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 6px 6px", overflow: "hidden" }}>
                  {lessons.map(lesson => {
                    // Task'ları content_topic_name'e göre alt-grupla
                    const topicGroupMap = new Map<string, AssignmentTask[]>();
                    lesson.tasks.forEach(task => {
                      const tKey = task.content_topic_name || lesson.topic_name || "__default__";
                      if (!topicGroupMap.has(tKey)) topicGroupMap.set(tKey, []);
                      topicGroupMap.get(tKey)!.push(task);
                    });
                    const topicEntries = Array.from(topicGroupMap.entries());
                    const hasMultipleTopics = topicEntries.length > 1;

                    const done = lesson.tasks.filter(t => t.completion_status === "DONE").length;
                    const total = lesson.tasks.length;
                    return (
                      <div key={lesson.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                        {/* Kitap/Kaynak Başlığı */}
                        <div style={{ padding: "5px 12px 3px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafbfc" }}>
                          <div>
                            {lesson.resource_book_name && <div style={{ fontSize: 10, fontWeight: 600, color: "#334155" }}>📕 {lesson.resource_book_name}</div>}
                            {!lesson.resource_book_name && <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>📝 Kaynak belirtilmemiş</div>}
                            {!hasMultipleTopics && lesson.topic_name && <div style={{ fontSize: 8, color: "#64748b", marginTop: 1 }}>📌 {lesson.topic_name}</div>}
                          </div>
                          <span style={{ fontSize: 9, fontWeight: 700, color: done === total ? "#16a34a" : "#6366f1" }}>{done}/{total}</span>
                        </div>

                        {/* Konu Bölümleri ve Görev Tablosu */}
                        {topicEntries.map(([topicKey, tasks]) => (
                          <div key={topicKey}>
                            {hasMultipleTopics && topicKey !== "__default__" && (
                              <div style={{ padding: "3px 12px 1px 32px", fontSize: 9, fontWeight: 600, color: "#4338ca", display: "flex", alignItems: "center", gap: 4 }}>
                                📂 {topicKey} <span style={{ fontSize: 8, color: "#818cf8", fontWeight: 500 }}>({tasks.length} görev)</span>
                              </div>
                            )}
                            <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                                  <th style={{ textAlign: "left", padding: "3px 8px 3px 32px", color: "#94a3b8", fontWeight: 500, fontSize: 8 }}>Görev</th>
                                  <th style={{ textAlign: "center", padding: "3px 6px", color: "#94a3b8", fontWeight: 500, fontSize: 8, width: 55 }}>Durum</th>
                                  <th style={{ textAlign: "center", padding: "3px 6px", color: "#94a3b8", fontWeight: 500, fontSize: 8, width: 35 }}>%</th>
                                  <th style={{ textAlign: "center", padding: "3px 6px", color: "#94a3b8", fontWeight: 500, fontSize: 8, width: 55 }}>Soru</th>
                                  <th style={{ textAlign: "center", padding: "3px 6px", color: "#94a3b8", fontWeight: 500, fontSize: 8, width: 55 }}>Sayfa</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tasks.map(task => {
                                  const cl = getCompletionLabel(task.completion_status);
                                  return (
                                    <tr key={task.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                                      <td style={{ padding: "4px 8px 4px 32px", color: "#1e293b", fontWeight: 500, fontSize: 9 }}>
                                        {task.title}
                                        {task.is_completion_task && <span style={{ fontSize: 8, color: "#2563eb", marginLeft: 4 }}>🔄 Eksik Tamamlama</span>}
                                        {task.coach_evaluation_note && <div style={{ fontSize: 8, color: "#6d28d9", fontStyle: "italic", marginTop: 1 }}>💬 {task.coach_evaluation_note}</div>}
                                      </td>
                                      <td style={{ padding: "4px 6px", textAlign: "center" }}>
                                        <span style={{ padding: "1px 6px", borderRadius: 8, fontSize: 8, fontWeight: 600, background: cl.bg, color: cl.color }}>{cl.label}</span>
                                      </td>
                                      <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, fontSize: 9, color: task.task_completion_percent >= 75 ? "#16a34a" : task.task_completion_percent >= 50 ? "#d97706" : "#dc2626" }}>
                                        %{task.task_completion_percent}
                                      </td>
                                      <td style={{ padding: "4px 6px", textAlign: "center", color: "#64748b", fontSize: 9 }}>
                                        {task.question_count ? <span><strong style={{ color: "#1e293b" }}>{task.completed_question_count ?? 0}</strong><span style={{ color: "#94a3b8" }}>/{task.question_count}</span></span> : <span style={{ color: "#cbd5e1" }}>—</span>}
                                      </td>
                                      <td style={{ padding: "4px 6px", textAlign: "center", color: "#64748b", fontSize: 9 }}>
                                        {task.page_count ? <span><strong style={{ color: "#1e293b" }}>{task.completed_page_count ?? 0}</strong><span style={{ color: "#94a3b8" }}>/{task.page_count}</span></span> : <span style={{ color: "#cbd5e1" }}>—</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* ═══ STATISTICS PANEL ═══ */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8, marginTop: 12, marginBottom: 12,
          }}>
            {/* Durum Dağılımı */}
            <div style={statCardStyle}>
              <div style={statCardTitle}>📊 Durum Dağılımı</div>
              {Object.entries(statusCounts).map(([k, v]) => {
                const pct = Math.round((v.count / (allTasks.length || 1)) * 100);
                return (
                  <div key={k} style={{ marginBottom: 3 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, marginBottom: 1 }}>
                      <span style={{ fontWeight: 600, color: v.color }}>{v.icon} {v.label}</span>
                      <span style={{ color: "#6b7280" }}>{v.count} (%{pct})</span>
                    </div>
                    <div style={{ height: 3, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: v.color, borderRadius: 99 }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Soru / Sayfa Tamamlanma */}
            <div style={statCardStyle}>
              <div style={statCardTitle}>📈 Tamamlanma İstatistikleri</div>
              {summary && summary.total_questions > 0 && (
                <div style={{ marginBottom: 3 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, marginBottom: 1 }}>
                    <span style={{ fontWeight: 600, color: "#2563eb" }}>✏️ Soru</span>
                    <span style={{ color: "#6b7280" }}>{summary.completed_questions}/{summary.total_questions} (%{summary.question_completion_percent})</span>
                  </div>
                  <div style={{ height: 3, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${summary.question_completion_percent}%`, height: "100%", background: "#3b82f6", borderRadius: 99 }} />
                  </div>
                </div>
              )}
              {summary && summary.total_pages > 0 && (
                <div style={{ marginBottom: 3 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, marginBottom: 1 }}>
                    <span style={{ fontWeight: 600, color: "#7c3aed" }}>📄 Sayfa</span>
                    <span style={{ color: "#6b7280" }}>{summary.completed_pages}/{summary.total_pages} (%{summary.page_completion_percent})</span>
                  </div>
                  <div style={{ height: 3, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${summary.page_completion_percent}%`, height: "100%", background: "#8b5cf6", borderRadius: 99 }} />
                  </div>
                </div>
              )}
              {summary && (
                <div style={{ marginBottom: 3 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, marginBottom: 1 }}>
                    <span style={{ fontWeight: 600, color: "#059669" }}>✅ Genel</span>
                    <span style={{ color: "#6b7280" }}>{summary.done_tasks}/{summary.total_tasks} (%{overallPct})</span>
                  </div>
                  <div style={{ height: 3, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${overallPct}%`, height: "100%", background: "#10b981", borderRadius: 99 }} />
                  </div>
                </div>
              )}
              {(!summary || (summary.total_questions === 0 && summary.total_pages === 0)) && (
                <div style={{ fontSize: 8, color: "#94a3b8", textAlign: "center", padding: 4 }}>Soru/Sayfa verisi yok</div>
              )}
            </div>

            {/* Ders Dağılımı */}
            <div style={statCardStyle}>
              <div style={statCardTitle}>📚 Ders Dağılımı</div>
              {Object.entries(lessonCounts).map(([name, count]) => {
                const pct = Math.round((count / (allTasks.length || 1)) * 100);
                return (
                  <div key={name} style={{ marginBottom: 3 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, marginBottom: 1 }}>
                      <span style={{ fontWeight: 600, color: "#0369a1" }}>📖 {name}</span>
                      <span style={{ color: "#6b7280" }}>{count} (%{pct})</span>
                    </div>
                    <div style={{ height: 3, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "#0ea5e9", borderRadius: 99 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ═══ BOTTOM NOTICE ═══ */}
          <div style={{
            padding: "6px 12px", marginBottom: 8,
            background: "#f0f7ff", borderRadius: 6, border: "1px solid #dbeafe",
            fontSize: 8, color: "#1e40af", lineHeight: 1.6, textAlign: "center",
          }}>
            Bu ödev kontrol raporu{assignment.coach_name && <>, öğrenci maestro koçu <strong>{assignment.coach_name}</strong> tarafından</>} hazırlanmıştır. Öğrencinin gelişimi koçluk sürecinde takip edilmektedir.
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


    </div>
  );
};
