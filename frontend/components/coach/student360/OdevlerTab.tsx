'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchStudentAssignments,
  assignAssignment,
} from '@/lib/resources-api';
import {
  getStatusColor,
  getRiskColor,
  isOverdue,
  isDueToday,
  NON_SUBMISSION_LABELS,
} from '@/components/odev/statusTokens';

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDateShort(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

interface StudentAssignmentItem {
  id: number;
  title: string;
  description?: string;
  status: string;
  status_display?: string;
  risk_status?: string;
  risk_status_display?: string;
  priority?: string;
  priority_display?: string;
  assigned_date?: string | null;
  due_date?: string | null;
  completion_percent?: number;
  lesson_count?: number;
  task_count?: number;
  pending_task_count?: number;
  evaluated_task_count?: number;
  postpone_count?: number;
  non_submission_reason?: string;
  non_submission_reason_display?: string;
  is_overdue?: boolean;
  is_due_today?: boolean;
  is_control_locked?: boolean;
  coach_name?: string | null;
  created_at?: string;
}

interface OdevlerTabProps {
  studentId: number;
}

const INITIAL_VISIBLE = 8;
const LOAD_MORE_STEP = 8;

function progressColor(pct: number, overdue: boolean) {
  if (overdue) return '#dc2626';
  if (pct >= 100) return '#16a34a';
  if (pct >= 50) return '#0262a7';
  return '#d97706';
}

export default function OdevlerTab({ studentId }: OdevlerTabProps) {
  const router = useRouter();
  const [assignments, setAssignments] = useState<StudentAssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStudentAssignments(studentId);
      if (res.success && Array.isArray(res.data)) {
        setAssignments(res.data as StudentAssignmentItem[]);
        setVisibleCount(INITIAL_VISIBLE);
      } else {
        setError(res.error || 'Ödevler yüklenemedi');
        setAssignments([]);
      }
    } catch {
      setError('Ödevler yüklenirken hata oluştu');
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const total = assignments.length;
    const completed = assignments.filter((a) => a.status === 'COMPLETED').length;
    const overdue = assignments.filter(
      (a) => (a.is_overdue || isOverdue(a.due_date ?? null, a.status)) && a.status !== 'COMPLETED',
    ).length;
    const pending = assignments.filter(
      (a) => a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS' || a.status === 'OVERDUE',
    ).length;
    return { total, completed, overdue, pending };
  }, [assignments]);

  const visibleAssignments = useMemo(
    () => assignments.slice(0, visibleCount),
    [assignments, visibleCount],
  );
  const hiddenCount = assignments.length - visibleAssignments.length;
  const canLoadMore = hiddenCount > 0;
  const canCollapse = visibleCount > INITIAL_VISIBLE;

  const handleAssignDraft = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      const result = await assignAssignment(id);
      if (result.success) {
        flash('✅ Ödev öğrenciye atandı');
        load();
      } else {
        flash('❌ ' + (result.error || 'Atama başarısız'));
      }
    } catch {
      flash('❌ Atama başarısız');
    }
  };

  if (loading) {
    return (
      <div className="student360-panel odev360-panel">
        <div className="odev360-summary odev360-summary-skeleton">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="coach-skeleton" style={{ height: 52, borderRadius: 10 }} />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="odev360-card odev360-card-skeleton">
            <div className="coach-skeleton coach-skeleton-line w60" />
            <div className="coach-skeleton coach-skeleton-line w40" style={{ marginTop: 10 }} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="student360-panel">
        <div className="coach-empty-state">
          <div className="coach-empty-icon">⚠️</div>
          <h4>{error}</h4>
          <button type="button" className="coach-link-btn" onClick={load}>
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="student360-panel">
        <div className="coach-empty-state">
          <div className="coach-empty-icon">📝</div>
          <h4>Atanmış ödev yok</h4>
          <p>Bu öğrenciye henüz ödev verilmemiş.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="student360-panel odev360-panel">
      {toast && <div className="odev360-toast">{toast}</div>}

      <div className="odev360-summary">
        <div className="odev360-stat-pill">
          <span className="odev360-stat-value">{stats.total}</span>
          <span className="odev360-stat-label">Toplam</span>
        </div>
        <div className="odev360-stat-pill is-green">
          <span className="odev360-stat-value">{stats.completed}</span>
          <span className="odev360-stat-label">Tamamlandı</span>
        </div>
        <div className="odev360-stat-pill is-blue">
          <span className="odev360-stat-value">{stats.pending}</span>
          <span className="odev360-stat-label">Aktif</span>
        </div>
        <div className="odev360-stat-pill is-red">
          <span className="odev360-stat-value">{stats.overdue}</span>
          <span className="odev360-stat-label">Geciken</span>
        </div>
      </div>

      {assignments.length > INITIAL_VISIBLE && (
        <p className="odev360-list-hint">
          {visibleAssignments.length} / {assignments.length} ödev gösteriliyor
        </p>
      )}

      <div className="odev360-list">
        {visibleAssignments.map((a) => {
          const overdue = a.is_overdue ?? isOverdue(a.due_date ?? null, a.status);
          const dueToday = a.is_due_today ?? isDueToday(a.due_date ?? null, a.status);
          const isDraft = a.status === 'DRAFT';
          const statusStyle = getStatusColor(overdue && a.status !== 'COMPLETED' ? 'OVERDUE' : a.status);
          const pct = Math.min(100, Math.max(0, a.completion_percent ?? 0));
          const taskCount = a.task_count ?? 0;
          const evaluated = a.evaluated_task_count ?? 0;
          const pendingTasks = a.pending_task_count ?? 0;
          const barColor = progressColor(pct, overdue && a.status !== 'COMPLETED');

          const nonSubmissionLabel =
            a.non_submission_reason_display ||
            (a.non_submission_reason ? NON_SUBMISSION_LABELS[a.non_submission_reason] : null);

          const statusLabel =
            overdue && a.status !== 'COMPLETED'
              ? 'Gecikti'
              : dueToday && a.status !== 'COMPLETED'
                ? 'Bugün teslim'
                : a.status_display || a.status;

          return (
            <article
              key={a.id}
              className="odev360-card"
              style={{ '--odev-accent': statusStyle.text } as React.CSSProperties}
              onClick={() => router.push(`/coach/odev/kontrol/${a.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') router.push(`/coach/odev/kontrol/${a.id}`);
              }}
            >
              <div className="odev360-card-accent" style={{ background: statusStyle.text }} />

              <div className="odev360-card-body">
                <div className="odev360-card-top">
                  <div className="odev360-card-title-wrap">
                    <span className="odev360-status-icon">{statusStyle.icon}</span>
                    <div>
                      <h3 className="odev360-card-title">{a.title}</h3>
                      {a.description && (
                        <p className="odev360-card-desc">{a.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="odev360-card-badges">
                    <span
                      className="odev360-badge"
                      style={{ background: statusStyle.bg, color: statusStyle.text }}
                    >
                      {statusLabel}
                    </span>
                    {a.is_control_locked && (
                      <span className="odev360-badge odev360-badge-muted">🔒 Kilitli</span>
                    )}
                  </div>
                </div>

                <div className="odev360-meta-grid">
                  <div className="odev360-meta-item">
                    <span className="odev360-meta-label">Atanma</span>
                    <span className="odev360-meta-value">{fmtDateShort(a.assigned_date)}</span>
                  </div>
                  <div className="odev360-meta-item">
                    <span className="odev360-meta-label">Son tarih</span>
                    <span
                      className="odev360-meta-value"
                      style={{
                        color: overdue ? '#dc2626' : dueToday ? '#d97706' : undefined,
                        fontWeight: overdue || dueToday ? 600 : 500,
                      }}
                    >
                      {fmtDate(a.due_date)}
                      {dueToday && !overdue ? ' · bugün' : ''}
                    </span>
                  </div>
                  {a.priority_display && (
                    <div className="odev360-meta-item">
                      <span className="odev360-meta-label">Öncelik</span>
                      <span className="odev360-meta-value">{a.priority_display}</span>
                    </div>
                  )}
                  {(a.lesson_count ?? 0) > 0 && (
                    <div className="odev360-meta-item">
                      <span className="odev360-meta-label">Ders</span>
                      <span className="odev360-meta-value">{a.lesson_count} blok</span>
                    </div>
                  )}
                </div>

                <div className="odev360-progress-row">
                  <div className="odev360-ring" style={{ '--pct': pct, '--ring-color': barColor } as React.CSSProperties}>
                    <span className="odev360-ring-value">%{pct}</span>
                  </div>
                  <div className="odev360-progress-detail">
                    <div className="odev360-progress-head">
                      <span>Tamamlanma</span>
                      <span style={{ fontWeight: 700, color: barColor }}>%{pct}</span>
                    </div>
                    <div className="odev360-progress-bar">
                      <div className="odev360-progress-fill" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <div className="odev360-task-chips">
                      {taskCount > 0 && (
                        <>
                          <span className="odev360-chip">{taskCount} görev</span>
                          {evaluated > 0 && (
                            <span className="odev360-chip is-green">{evaluated} değerlendirildi</span>
                          )}
                          {pendingTasks > 0 && (
                            <span className="odev360-chip is-muted">{pendingTasks} bekliyor</span>
                          )}
                        </>
                      )}
                      {taskCount === 0 && (
                        <span className="odev360-chip is-muted">Görev tanımlı değil</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="odev360-card-footer">
                  <div className="odev360-tags">
                    {a.risk_status && a.risk_status !== 'PENDING' && a.risk_status !== 'NONE' && (
                      <span
                        className="odev360-tag"
                        style={{
                          background: getRiskColor(a.risk_status).bg,
                          color: getRiskColor(a.risk_status).text,
                        }}
                      >
                        {getRiskColor(a.risk_status).icon}{' '}
                        {a.risk_status_display || a.risk_status}
                      </span>
                    )}
                    {nonSubmissionLabel && (
                      <span className="odev360-tag is-danger">🚫 {nonSubmissionLabel}</span>
                    )}
                    {(a.postpone_count ?? 0) > 0 && (
                      <span className="odev360-tag is-warn">📅 {a.postpone_count}x ertelendi</span>
                    )}
                    {a.coach_name && (
                      <span className="odev360-tag is-muted">Koç: {a.coach_name}</span>
                    )}
                  </div>
                  <div className="odev360-card-action">
                    {isDraft ? (
                      <button
                        type="button"
                        className="odev360-btn-assign"
                        onClick={(e) => handleAssignDraft(e, a.id)}
                      >
                        Öğrenciye ata
                      </button>
                    ) : (
                      <span className="odev360-link">Kontrol et →</span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {(canLoadMore || canCollapse) && (
        <div className="odev360-load-more-wrap">
          {canLoadMore && (
            <button
              type="button"
              className="odev360-load-more-btn"
              onClick={() => setVisibleCount((n) => Math.min(n + LOAD_MORE_STEP, assignments.length))}
            >
              Daha fazla göster
              <span className="odev360-load-more-sub">
                +{Math.min(LOAD_MORE_STEP, hiddenCount)} ödev · {hiddenCount} kaldı
              </span>
            </button>
          )}
          {canCollapse && (
            <button
              type="button"
              className="odev360-collapse-btn"
              onClick={() => setVisibleCount(INITIAL_VISIBLE)}
            >
              Daha az göster
            </button>
          )}
        </div>
      )}
    </div>
  );
}
