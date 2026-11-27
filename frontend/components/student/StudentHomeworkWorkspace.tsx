'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ExternalLink,
  FileDown,
  Flame,
  MessageSquarePlus,
  Play,
  Send,
  Sparkles,
  Timer,
} from 'lucide-react';
import {
  studentPortalApi,
  type StudentHomeworkDetail,
  type StudentHomeworkOverviewStats,
  type StudentHomeworkSummaryCard,
  type StudentHomeworkTask,
} from '@/lib/student-portal-api';
import { useStudentPortal } from '@/lib/student-portal-context';

interface StudentHomeworkWorkspaceProps {
  assignments: StudentHomeworkSummaryCard[];
  summary?: StudentHomeworkOverviewStats;
  initialAssignmentId?: number | null;
  onSelectAssignmentId?: (id: number) => void;
  onAssignmentMutated?: () => Promise<void> | void;
}

function formatDueBadge(item: {
  due_date: string | null;
  days_left: number | null;
  is_overdue: boolean;
  is_due_today: boolean;
  is_completed?: boolean;
}) {
  if (item.is_completed) {
    return { label: 'Kontrol Tamamlandı', tone: 'emerald' as const };
  }
  if (item.is_due_today) {
    return { label: 'Bugün Kontrol Günü!', tone: 'warm' as const };
  }
  if (item.is_overdue) {
    return { label: 'Kontrol Tarihi Geçti', tone: 'danger' as const };
  }
  if (item.days_left != null) {
    if (item.days_left === 1) return { label: 'Yarın Kontrol', tone: 'warm' as const };
    return { label: `${item.days_left} gün kaldı`, tone: 'accent' as const };
  }
  if (item.due_date) {
    return { label: `Kontrol: ${item.due_date}`, tone: 'muted' as const };
  }
  return { label: 'Aktif Ödev', tone: 'muted' as const };
}

function chipClassForTone(tone: 'emerald' | 'warm' | 'danger' | 'accent' | 'muted'): string {
  if (tone === 'emerald') return 'sp-chip sp-chip-emerald';
  if (tone === 'warm') return 'sp-chip sp-chip-warm';
  if (tone === 'danger') return 'sp-chip sp-chip-danger';
  if (tone === 'accent') return 'sp-chip sp-chip-accent';
  return 'sp-chip';
}

function k3ModeBadgeStyle(mode: string): { bg: string; color: string } {
  switch (mode) {
    case 'HIZLAN':
      return { bg: 'var(--sp-warm-soft)', color: 'var(--sp-warm)' };
    case 'OGREN':
      return { bg: 'var(--sp-accent-soft)', color: 'var(--sp-accent)' };
    case 'PEKISTIR':
      return { bg: 'var(--sp-emerald-soft)', color: 'var(--sp-emerald)' };
    case 'TEKRARLA':
      return { bg: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' };
    default:
      return { bg: 'var(--sp-surface-2)', color: 'var(--sp-ink-2)' };
  }
}

export default function StudentHomeworkWorkspace({
  assignments,
  summary,
  initialAssignmentId,
  onSelectAssignmentId,
  onAssignmentMutated,
}: StudentHomeworkWorkspaceProps) {
  const { startFocus, studyRefreshNonce } = useStudentPortal();

  const [filter, setFilter] = useState<'active' | 'completed' | 'all'>('active');
  const [selectedId, setSelectedId] = useState<number | null>(
    initialAssignmentId || assignments[0]?.id || null,
  );
  const [detail, setDetail] = useState<StudentHomeworkDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [collapsedLessons, setCollapsedLessons] = useState<Set<number>>(new Set());

  // Task interaction states
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [openNoteTaskId, setOpenNoteTaskId] = useState<number | null>(null);
  const [taskNoteDraft, setTaskNoteDraft] = useState('');
  const [savingTaskNote, setSavingTaskNote] = useState(false);

  // Assignment-level student_notes
  const [assignmentNoteDraft, setAssignmentNoteDraft] = useState('');
  const [savingAssignmentNote, setSavingAssignmentNote] = useState(false);
  const [assignmentNoteSaved, setAssignmentNoteSaved] = useState(false);

  useEffect(() => {
    if (initialAssignmentId && assignments.some((a) => a.id === initialAssignmentId)) {
      const target = assignments.find((a) => a.id === initialAssignmentId);
      if (target?.is_completed && filter === 'active') {
        setFilter('all');
      }
      setSelectedId(initialAssignmentId);
    }
  }, [initialAssignmentId, assignments, filter]);

  const filteredAssignments = useMemo(() => {
    if (filter === 'active') return assignments.filter((a) => !a.is_completed);
    if (filter === 'completed') return assignments.filter((a) => a.is_completed);
    return assignments;
  }, [assignments, filter]);

  useEffect(() => {
    if (filteredAssignments.length === 0) {
      if (filter === 'active' && assignments.length > 0 && !selectedId) {
        setFilter('all');
      }
      return;
    }
    const existsInFiltered = filteredAssignments.some((a) => a.id === selectedId);
    if (!existsInFiltered) {
      setSelectedId(filteredAssignments[0].id);
    }
  }, [filteredAssignments, selectedId, filter, assignments.length]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await studentPortalApi.assignmentDetail(id);
      setDetail(res);
      setAssignmentNoteDraft(res.student_notes || '');
      setAssignmentNoteSaved(false);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Ödev içeriği yüklenemedi.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, loadDetail, studyRefreshNonce]);

  const handleSelectCard = (id: number) => {
    setSelectedId(id);
    setOpenNoteTaskId(null);
    onSelectAssignmentId?.(id);
  };

  const toggleLessonCollapse = (lessonId: number) => {
    setCollapsedLessons((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  };

  const handleTogglePrepared = async (task: StudentHomeworkTask) => {
    setBusyTaskId(task.id);
    try {
      await studentPortalApi.updateAssignmentTask(task.id, {
        prepared: !task.student_prepared,
      });
      if (selectedId) await loadDetail(selectedId);
      await onAssignmentMutated?.();
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleSaveTaskNote = async (e: FormEvent, task: StudentHomeworkTask) => {
    e.preventDefault();
    setSavingTaskNote(true);
    try {
      await studentPortalApi.updateAssignmentTask(task.id, {
        student_feedback: taskNoteDraft,
      });
      setOpenNoteTaskId(null);
      if (selectedId) await loadDetail(selectedId);
    } finally {
      setSavingTaskNote(false);
    }
  };

  const handleSaveAssignmentNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSavingAssignmentNote(true);
    setAssignmentNoteSaved(false);
    try {
      const res = await studentPortalApi.updateAssignmentNote(detail.id, assignmentNoteDraft);
      setAssignmentNoteDraft(res.student_notes);
      setAssignmentNoteSaved(true);
      await onAssignmentMutated?.();
    } finally {
      setSavingAssignmentNote(false);
    }
  };

  const activeCount = summary?.active_count ?? assignments.filter((a) => !a.is_completed).length;
  const completedCount =
    summary?.completed_count ?? assignments.filter((a) => a.is_completed).length;

  return (
    <div className="sp-stack" style={{ gap: 18 }}>
      {/* Ödev KPI Şeridi */}
      {summary ? (
        <div className="sp-kpi-grid">
          <div className="sp-kpi-box">
            <span>Aktif Koç Ödevi</span>
            <strong>{summary.active_count}</strong>
            <small>
              {summary.overdue_count > 0
                ? `${summary.overdue_count} kontrol tarihi geçmiş`
                : `${summary.completed_count} kontrolü tamamlanan`}
            </small>
          </div>
          <div className="sp-kpi-box">
            <span>Test Hazırlığım</span>
            <strong>%{summary.active_ready_percent}</strong>
            <small>
              {summary.ready_active_task_count} / {summary.active_task_count} görev hazırlandı
            </small>
          </div>
          <div className="sp-kpi-box">
            <span>Sıradaki Kontrol</span>
            <strong style={{ fontSize: 17 }}>
              {summary.next_due
                ? summary.next_due.is_due_today
                  ? 'Bugün!'
                  : summary.next_due.is_overdue
                    ? 'Gecikti'
                    : summary.next_due.days_left != null
                      ? `${summary.next_due.days_left} Gün`
                      : summary.next_due.due_date || '—'
                : '—'}
            </strong>
            <small>
              {summary.next_due
                ? `${summary.next_due.due_date || ''} · ${summary.next_due.title}`
                : 'Bekleyen kontrol yok'}
            </small>
          </div>
          <div className="sp-kpi-box">
            <span>Ödev Odak Sürem</span>
            <strong>{summary.total_focused_minutes} dk</strong>
            <small>Testlerde kayıtlı odak</small>
          </div>
        </div>
      ) : null}

      {assignments.length === 0 ? (
        <div className="sp-card">
          <div className="sp-empty-box">
            <BookOpen size={32} />
            <p>Koçun tarafından atanmış bir ödev kaydı henüz görünmüyor.</p>
          </div>
        </div>
      ) : (
        <div className="sp-bento-grid">
          {/* Sol Sütun: Ödev Listesi & Filtreler */}
          <aside className="sp-card sp-col-4">
            <div className="sp-pill-bar" style={{ marginBottom: 14 }}>
              <button
                type="button"
                className="sp-pill"
                data-active={filter === 'active' ? '1' : '0'}
                onClick={() => setFilter('active')}
              >
                Aktif ({activeCount})
              </button>
              <button
                type="button"
                className="sp-pill"
                data-active={filter === 'completed' ? '1' : '0'}
                onClick={() => setFilter('completed')}
              >
                Kontrol Edilen ({completedCount})
              </button>
              <button
                type="button"
                className="sp-pill"
                data-active={filter === 'all' ? '1' : '0'}
                onClick={() => setFilter('all')}
              >
                Tümü ({assignments.length})
              </button>
            </div>

            {filteredAssignments.length === 0 ? (
              <div className="sp-empty-box" style={{ padding: '24px 12px' }}>
                <p>Bu filtrede ödev bulunmuyor.</p>
              </div>
            ) : (
              <div className="sp-stack">
                {filteredAssignments.map((hw) => {
                  const isSelected = hw.id === selectedId;
                  const badge = formatDueBadge(hw);
                  return (
                    <button
                      key={hw.id}
                      type="button"
                      onClick={() => handleSelectCard(hw.id)}
                      className="sp-row-card"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        cursor: 'pointer',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        gap: 10,
                        borderColor: isSelected ? 'var(--sp-accent)' : undefined,
                        background: isSelected ? 'var(--sp-accent-soft)' : undefined,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <div className="sp-row-copy">
                          <strong style={{ fontSize: 14 }}>
                            <span
                              className="sp-dot"
                              style={{
                                backgroundColor: hw.color,
                                marginRight: 7,
                                verticalAlign: -1,
                              }}
                            />
                            {hw.title}
                          </strong>
                          <span>
                            {hw.subjects.map((s) => s.name).join(', ')}
                            {hw.question_count > 0 ? ` · ${hw.question_count} soru` : ''}
                          </span>
                        </div>
                        <span className={chipClassForTone(badge.tone)}>{badge.label}</span>
                      </div>

                      {/* Çift Katmanlı İlerleme: Öğrenci Hazırlığı & Koç Kontrolü */}
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 11.5,
                            color: 'var(--sp-muted)',
                            marginBottom: 5,
                          }}
                        >
                          <span>
                            Hazırlığım: {hw.ready_task_count}/{hw.task_count} test
                          </span>
                          <span>
                            {hw.is_completed || hw.evaluated_task_count > 0
                              ? `Koç Kontrolü: %${hw.completion_percent}`
                              : hw.due_date
                                ? `Kontrol: ${hw.due_date}`
                                : ''}
                          </span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            borderRadius: 999,
                            background: 'var(--sp-border-strong)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${
                                hw.is_completed ? hw.completion_percent : hw.student_ready_percent
                              }%`,
                              background: hw.is_completed
                                ? 'var(--sp-emerald)'
                                : 'var(--sp-accent)',
                              transition: 'width 0.25s ease',
                            }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          {/* Sağ Ana Sütun: Seçili Ödevin Kitap -> Konu -> Test Ağacı */}
          <section className="sp-col-8 sp-stack" style={{ gap: 16 }}>
            {detailLoading ? (
              <div className="sp-skeleton" style={{ height: 360 }} />
            ) : detailError ? (
              <div className="sp-card">
                <div className="sp-empty-box">
                  <AlertTriangle size={28} />
                  <p>{detailError}</p>
                </div>
              </div>
            ) : !detail ? (
              <div className="sp-card">
                <div className="sp-empty-box">
                  <BookOpen size={28} />
                  <p>İçeriğini görüntülemek için soldan bir ödev seç.</p>
                </div>
              </div>
            ) : (
              <>
                {/* 1. Ödev Üst Kartı + PDF İndirme + Açıklama */}
                <div className="sp-card">
                  <div className="sp-card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                          marginBottom: 6,
                        }}
                      >
                        <span className={chipClassForTone(formatDueBadge(detail).tone)}>
                          {formatDueBadge(detail).label}
                        </span>
                        {detail.coach_name ? (
                          <span className="sp-chip">Koç: {detail.coach_name}</span>
                        ) : null}
                        {detail.due_date ? (
                          <span className="sp-chip">
                            <CalendarClock size={13} /> Kontrol: {detail.due_date}
                          </span>
                        ) : null}
                        {detail.postpone_count > 0 ? (
                          <span className="sp-chip sp-chip-warm">
                            {detail.postpone_count} kez ertelendi
                          </span>
                        ) : null}
                      </div>
                      <h2 style={{ margin: 0, fontSize: 20 }}>{detail.title}</h2>
                    </div>

                    <div className="sp-pill-bar">
                      {detail.can_download_plan_pdf ? (
                        <a
                          href={studentPortalApi.assignmentPdfUrl(detail.id, 'plan', true)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sp-btn sp-btn-secondary sp-btn-sm"
                        >
                          <FileDown size={14} />
                          <span>Ödev Planı PDF</span>
                        </a>
                      ) : null}
                      {detail.can_download_report_pdf ? (
                        <a
                          href={studentPortalApi.assignmentPdfUrl(detail.id, 'report', true)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sp-btn sp-btn-primary sp-btn-sm"
                        >
                          <FileDown size={14} />
                          <span>Kontrol Raporu PDF</span>
                        </a>
                      ) : null}
                    </div>
                  </div>

                  {detail.description ? (
                    <div
                      className="sp-row-card"
                      style={{
                        marginBottom: 12,
                        background: 'var(--sp-surface-2)',
                      }}
                    >
                      <div className="sp-row-copy">
                        <strong>Koçunun Ödev Açıklaması</strong>
                        <span
                          style={{ color: 'var(--sp-ink-2)' }}
                          dangerouslySetInnerHTML={{ __html: detail.description }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {detail.non_submission_label ? (
                    <div
                      className="sp-row-card"
                      style={{
                        marginBottom: 12,
                        borderColor: 'var(--sp-danger)',
                        background: 'rgba(220, 38, 38, 0.06)',
                      }}
                    >
                      <div className="sp-row-copy">
                        <strong style={{ color: 'var(--sp-danger)' }}>
                          {detail.non_submission_label}
                        </strong>
                        {detail.non_submission_note ? (
                          <span>{detail.non_submission_note}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* Özet Metrik Çubuğu */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      alignItems: 'center',
                      fontSize: 12.5,
                      color: 'var(--sp-muted)',
                    }}
                  >
                    <span>
                      📚 <strong>{detail.lesson_count}</strong> kaynak blok
                    </span>
                    <span>·</span>
                    <span>
                      📝 <strong>{detail.ready_task_count}/{detail.task_count}</strong> test hazır
                    </span>
                    {detail.question_count > 0 ? (
                      <>
                        <span>·</span>
                        <span>
                          🎯 <strong>{detail.question_count}</strong> toplam soru
                        </span>
                      </>
                    ) : null}
                    {detail.focused_minutes > 0 ? (
                      <>
                        <span>·</span>
                        <span>
                          ⏱ <strong>{detail.focused_minutes} dk</strong> odaklanıldı
                        </span>
                      </>
                    ) : null}
                    {detail.evaluated_task_count > 0 ? (
                      <>
                        <span>·</span>
                        <span>
                          ✅ Koç Kontrolü: <strong>%{detail.completion_percent}</strong> (
                          {detail.done_task_count} Yaptı
                          {detail.partial_task_count > 0
                            ? `, ${detail.partial_task_count} Eksik`
                            : ''}
                          {detail.not_done_task_count > 0
                            ? `, ${detail.not_done_task_count} Yapmadı`
                            : ''}
                          )
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                {/* 2. Kaynak Kitap -> Konu -> Test Ağacı */}
                {detail.lessons.map((lesson) => {
                  const isCollapsed = collapsedLessons.has(lesson.id);
                  const k3Colors = lesson.k3_mode
                    ? k3ModeBadgeStyle(lesson.k3_mode)
                    : null;

                  return (
                    <div key={lesson.id} className="sp-card" style={{ padding: 0, overflow: 'hidden' }}>
                      {/* Ders & Kaynak Kitap Başlığı */}
                      <button
                        type="button"
                        onClick={() => toggleLessonCollapse(lesson.id)}
                        style={{
                          width: '100%',
                          border: 'none',
                          background: 'var(--sp-surface-2)',
                          padding: '16px 18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          cursor: 'pointer',
                          textAlign: 'left',
                          color: 'var(--sp-ink)',
                          borderBottom: isCollapsed ? 'none' : '1px solid var(--sp-border)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                          {lesson.book?.cover_url ? (
                            <img
                              src={lesson.book.cover_url}
                              alt={lesson.book.name}
                              style={{
                                width: 42,
                                height: 54,
                                objectFit: 'cover',
                                borderRadius: 8,
                                border: '1px solid var(--sp-border)',
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 42,
                                height: 42,
                                borderRadius: 11,
                                background: `${lesson.color}1a`,
                                color: lesson.color,
                                display: 'grid',
                                placeItems: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <BookOpen size={20} />
                            </div>
                          )}

                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 7,
                                flexWrap: 'wrap',
                              }}
                            >
                              <strong style={{ fontSize: 15 }}>
                                {lesson.lesson_name}
                                {lesson.book ? ` — ${lesson.book.name}` : ''}
                              </strong>
                              {lesson.k3_mode_label && k3Colors ? (
                                <span
                                  style={{
                                    padding: '2px 9px',
                                    borderRadius: 999,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    background: k3Colors.bg,
                                    color: k3Colors.color,
                                  }}
                                >
                                  <Sparkles
                                    size={11}
                                    style={{ marginRight: 4, verticalAlign: -1 }}
                                  />
                                  3K: {lesson.k3_mode_label}
                                  {lesson.k3_target_minutes
                                    ? ` · Hedef ${lesson.k3_target_minutes} dk`
                                    : ''}
                                </span>
                              ) : null}
                            </div>

                            <div
                              style={{
                                fontSize: 12.5,
                                color: 'var(--sp-muted)',
                                marginTop: 3,
                              }}
                            >
                              {lesson.book?.publisher ? `${lesson.book.publisher} · ` : ''}
                              {lesson.topic_name ? `${lesson.topic_name} · ` : ''}
                              {lesson.page_start && lesson.page_end
                                ? `Sayfa ${lesson.page_start}–${lesson.page_end} · `
                                : ''}
                              {lesson.test_number ? `Test ${lesson.test_number} · ` : ''}
                              {lesson.ready_task_count}/{lesson.task_count} görev hazır
                              {lesson.question_count > 0
                                ? ` · ${lesson.question_count} soru`
                                : ''}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span
                            className={
                              lesson.ready_task_count === lesson.task_count && lesson.task_count > 0
                                ? 'sp-chip sp-chip-emerald'
                                : 'sp-chip'
                            }
                          >
                            {lesson.ready_task_count}/{lesson.task_count}
                          </span>
                          {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                        </div>
                      </button>

                      {/* Görev / Test Satırları */}
                      {!isCollapsed ? (
                        <div style={{ padding: '14px 18px' }} className="sp-stack">
                          {lesson.notes ? (
                            <p
                              style={{
                                margin: '0 0 4px',
                                fontSize: 12.5,
                                color: 'var(--sp-muted)',
                              }}
                            >
                              📌 Kaynak notu: {lesson.notes}
                            </p>
                          ) : null}

                          {lesson.tasks.map((task) => {
                            const isChecked = task.effective_ready;
                            const isNoteOpen = openNoteTaskId === task.id;

                            return (
                              <div
                                key={task.id}
                                className="sp-row-card"
                                style={{
                                  flexDirection: 'column',
                                  alignItems: 'stretch',
                                  gap: 10,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <div className="sp-row-left" style={{ alignItems: 'flex-start' }}>
                                    <button
                                      type="button"
                                      className="sp-icon-btn"
                                      disabled={busyTaskId === task.id}
                                      onClick={() => handleTogglePrepared(task)}
                                      title={
                                        task.student_prepared
                                          ? 'Çözdüm işaretini kaldır'
                                          : 'Çözdüm / Hazırım olarak işaretle'
                                      }
                                    >
                                      {isChecked ? (
                                        <CheckCircle2 size={18} color="var(--sp-emerald)" />
                                      ) : (
                                        <Circle size={18} />
                                      )}
                                    </button>

                                    <div className="sp-row-copy">
                                      <strong
                                        style={{
                                          textDecoration: isChecked ? 'line-through' : 'none',
                                          opacity: isChecked ? 0.72 : 1,
                                        }}
                                      >
                                        {task.title}
                                      </strong>

                                      <span>
                                        {task.unit_name ? `${task.unit_name} › ` : ''}
                                        {task.topic_name || task.task_type_label}
                                        {task.question_count
                                          ? ` · ${task.question_count} soru`
                                          : ''}
                                        {task.page_start && task.page_end
                                          ? ` · s. ${task.page_start}–${task.page_end}`
                                          : task.page_count
                                            ? ` · ${task.page_count} sayfa`
                                            : ''}
                                        {task.target_minutes
                                          ? ` · Hedef ${task.target_minutes} dk`
                                          : ''}
                                      </span>

                                      {/* Etiket Rozetleri (Kota, Eksik Tamamlama, Resmi Koç Kontrol Sonucu) */}
                                      <div
                                        style={{
                                          display: 'flex',
                                          flexWrap: 'wrap',
                                          gap: 6,
                                          marginTop: 4,
                                        }}
                                      >
                                        {task.quota_kind_label ? (
                                          <span className="sp-chip sp-chip-accent">
                                            Kota: {task.quota_kind_label}
                                          </span>
                                        ) : null}

                                        {task.is_completion_task ? (
                                          <span className="sp-chip sp-chip-warm">
                                            Eksik Tamamlama
                                            {task.previous_assignment_title
                                              ? ` (${task.previous_assignment_title})`
                                              : ''}
                                          </span>
                                        ) : null}

                                        {task.completion_status === 'DONE' ? (
                                          <span className="sp-chip sp-chip-emerald">
                                            ✅ Koç Kontrolü: Yaptı
                                          </span>
                                        ) : task.completion_status === 'PARTIAL' ? (
                                          <span className="sp-chip sp-chip-warm">
                                            ⚠️ Koç Kontrolü: Eksik (%{task.task_completion_percent}
                                            {task.completed_question_count != null &&
                                            task.question_count != null
                                              ? ` · ${task.completed_question_count}/${task.question_count} soru`
                                              : ''}
                                            )
                                          </span>
                                        ) : task.completion_status === 'NOT_DONE' ? (
                                          <span className="sp-chip sp-chip-danger">
                                            ❌ Koç Kontrolü: Yapmadı
                                          </span>
                                        ) : task.student_prepared ? (
                                          <span className="sp-chip sp-chip-emerald">
                                            ✓ Çözdüm işaretledin
                                          </span>
                                        ) : null}

                                        {task.actual_duration_minutes > 0 ? (
                                          <span className="sp-chip">
                                            <Timer size={12} /> {task.actual_duration_minutes} dk odak
                                          </span>
                                        ) : null}
                                      </div>

                                      {task.coach_evaluation_note ? (
                                        <span
                                          style={{
                                            marginTop: 5,
                                            padding: '6px 10px',
                                            borderRadius: 8,
                                            background: 'var(--sp-accent-soft)',
                                            color: 'var(--sp-ink)',
                                            fontSize: 12,
                                          }}
                                        >
                                          👨‍🏫 <strong>Koç Notu:</strong> {task.coach_evaluation_note}
                                        </span>
                                      ) : null}

                                      {task.student_feedback && !isNoteOpen ? (
                                        <span
                                          style={{
                                            marginTop: 4,
                                            fontSize: 12,
                                            color: 'var(--sp-ink-2)',
                                          }}
                                        >
                                          💬 <strong>Notum:</strong> {task.student_feedback}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>

                                  {/* Sağ Aksiyon Butonları */}
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    {task.video_url ? (
                                      <a
                                        href={task.video_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="sp-btn sp-btn-ghost sp-btn-sm"
                                      >
                                        <ExternalLink size={13} />
                                        <span>Video</span>
                                      </a>
                                    ) : null}

                                    <button
                                      type="button"
                                      className="sp-btn sp-btn-secondary sp-btn-sm"
                                      onClick={() => {
                                        if (isNoteOpen) {
                                          setOpenNoteTaskId(null);
                                        } else {
                                          setOpenNoteTaskId(task.id);
                                          setTaskNoteDraft(task.student_feedback || '');
                                        }
                                      }}
                                      title="Koçuna bu testle ilgili not bırak"
                                    >
                                      <MessageSquarePlus size={13} />
                                      <span>{task.student_feedback ? 'Notu Düzenle' : 'Not'}</span>
                                    </button>

                                    {!detail.is_completed ? (
                                      <button
                                        type="button"
                                        className="sp-btn sp-btn-primary sp-btn-sm"
                                        onClick={() =>
                                          startFocus({
                                            homeworkTask: task,
                                            mode: 'pomodoro',
                                          })
                                        }
                                      >
                                        {task.target_minutes ? (
                                          <Flame size={13} />
                                        ) : (
                                          <Play size={13} />
                                        )}
                                        <span>
                                          Odaklan
                                          {task.target_minutes ? ` (${task.target_minutes} dk)` : ''}
                                        </span>
                                      </button>
                                    ) : null}
                                  </div>
                                </div>

                                {/* Test Altı Öğrenci Not Formu */}
                                {isNoteOpen ? (
                                  <form
                                    onSubmit={(e) => handleSaveTaskNote(e, task)}
                                    style={{
                                      display: 'flex',
                                      gap: 8,
                                      alignItems: 'center',
                                      flexWrap: 'wrap',
                                      paddingTop: 8,
                                      borderTop: '1px dashed var(--sp-border)',
                                    }}
                                  >
                                    <input
                                      type="text"
                                      value={taskNoteDraft}
                                      onChange={(e) => setTaskNoteDraft(e.target.value)}
                                      placeholder="Örn: 4 soruda takıldım, kontrol gününde bakabilir miyiz?"
                                      style={{
                                        flex: 1,
                                        minWidth: 220,
                                        padding: '8px 11px',
                                        borderRadius: 10,
                                        border: '1px solid var(--sp-border-strong)',
                                        background: 'var(--sp-surface-2)',
                                        color: 'var(--sp-ink)',
                                        fontSize: 13,
                                      }}
                                    />
                                    <button
                                      type="submit"
                                      className="sp-btn sp-btn-primary sp-btn-sm"
                                      disabled={savingTaskNote}
                                    >
                                      <Send size={13} />
                                      <span>{savingTaskNote ? 'Kaydediliyor…' : 'Koça İlet'}</span>
                                    </button>
                                  </form>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {/* 3. Genel Ödev Notum (`ManualAssignment.student_notes`) */}
                <div className="sp-card">
                  <div className="sp-card-header">
                    <div>
                      <span className="sp-eyebrow">Ödev Kontrol Ekranına Düşer</span>
                      <h3 style={{ margin: '2px 0 0', fontSize: 16 }}>
                        Bu Ödev İçin Koçuma Genel Notum
                      </h3>
                    </div>
                  </div>
                  <form onSubmit={handleSaveAssignmentNote} className="sp-stack">
                    <label className="sp-field">
                      <textarea
                        rows={2}
                        value={assignmentNoteDraft}
                        onChange={(e) => setAssignmentNoteDraft(e.target.value)}
                        placeholder="Ödevin geneliyle ilgili koçuna iletmek istediğin bir not varsa buraya yazabilirsin…"
                      />
                    </label>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      {assignmentNoteSaved ? (
                        <span className="sp-chip sp-chip-emerald">
                          ✓ Notun kaydedildi ve koçunun Ödev Kontrol ekranına iletildi.
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--sp-muted)' }}>
                          Yazdığın not koçunun Ödev Kontrol ekranında görünür.
                        </span>
                      )}
                      <button
                        type="submit"
                        className="sp-btn sp-btn-primary sp-btn-sm"
                        disabled={savingAssignmentNote}
                      >
                        <Send size={14} />
                        <span>{savingAssignmentNote ? 'Kaydediliyor…' : 'Ödev Notunu Kaydet'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
