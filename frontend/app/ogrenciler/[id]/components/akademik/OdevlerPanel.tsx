'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  fetchStudentAssignments,
  assignAssignment,
  type ManualAssignment,
} from '@/lib/resources-api';
import {
  getStatusColor,
  getRiskColor,
  isOverdue,
  isDueToday,
  NON_SUBMISSION_LABELS,
} from '@/components/odev/statusTokens';

interface Props {
  ogrenciId: number;
}

const INITIAL_VISIBLE = 6;
const LOAD_MORE_STEP = 8;

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function progressColor(pct: number, overdue: boolean) {
  if (overdue) return '#dc2626';
  if (pct >= 100) return '#16a34a';
  if (pct >= 50) return '#0262a7';
  return '#d97706';
}

type AssignmentRow = ManualAssignment & {
  non_submission_reason?: string;
  non_submission_reason_display?: string;
  postpone_count?: number;
  is_overdue?: boolean;
  is_due_today?: boolean;
  /** student_assignments listesi bu alanı progress_percent yerine completion_percent döner. */
  completion_percent?: number;
};

export default function OdevlerPanel({ ogrenciId }: Props) {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [assigningId, setAssigningId] = useState<number | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStudentAssignments(ogrenciId);
      if (res.success && Array.isArray(res.data)) {
        setAssignments(res.data as AssignmentRow[]);
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
  }, [ogrenciId]);

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

  const visibleAssignments = useMemo(() => assignments.slice(0, visibleCount), [assignments, visibleCount]);
  const hiddenCount = assignments.length - visibleAssignments.length;

  const handleAssignDraft = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (assigningId) return;
    setAssigningId(id);
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
    setAssigningId(null);
  };

  if (loading) {
    return (
      <div>
        <div className="akademik-loading">
          <div className="akademik-spinner" />
          <p>Ödevler yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="alert-modern alert-error">{error}</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {toast && (
        <div
          style={{
            position: 'fixed', top: 20, right: 20, zIndex: 1000,
            background: '#111827', color: '#fff', padding: '10px 16px',
            borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          }}
        >
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Toplam', value: stats.total, bg: '#f1f5f9', text: '#334155' },
            { label: 'Tamamlandı', value: stats.completed, bg: '#dcfce7', text: '#16a34a' },
            { label: 'Aktif', value: stats.pending, bg: '#dbeafe', text: '#2563eb' },
            { label: 'Geciken', value: stats.overdue, bg: '#fee2e2', text: '#dc2626' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: s.bg, color: s.text, borderRadius: 12, padding: '8px 14px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 72,
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 800 }}>{s.value}</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{s.label}</span>
            </div>
          ))}
        </div>
        <Link
          href={`/admin/odev/ver?student=${ogrenciId}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff',
            borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none',
            boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
          }}
        >
          📝 Yeni Ödev Ver
        </Link>
      </div>

      {assignments.length === 0 ? (
        <div className="empty-tab-content">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
            <path d="M9 12h6M9 16h6M9 8h6M5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z" />
          </svg>
          <h4>Atanmış ödev yok</h4>
          <p>Bu öğrenciye henüz ödev verilmemiş.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleAssignments.map((a) => {
              const overdue = a.is_overdue ?? isOverdue(a.due_date ?? null, a.status);
              const dueToday = a.is_due_today ?? isDueToday(a.due_date ?? null, a.status);
              const isDraft = a.status === 'DRAFT';
              const statusStyle = getStatusColor(overdue && a.status !== 'COMPLETED' ? 'OVERDUE' : a.status);
              const pct = Math.min(100, Math.max(0, a.completion_percent ?? 0));
              const barColor = progressColor(pct, overdue && a.status !== 'COMPLETED');
              const nonSubmissionLabel =
                a.non_submission_reason_display ||
                (a.non_submission_reason ? NON_SUBMISSION_LABELS[a.non_submission_reason] : null);
              const statusLabel = overdue && a.status !== 'COMPLETED'
                ? 'Gecikti'
                : dueToday && a.status !== 'COMPLETED'
                  ? 'Bugün teslim'
                  : a.status_display || a.status;

              return (
                <Link
                  key={a.id}
                  href={`/admin/odev/kontrol/${a.id}`}
                  style={{
                    display: 'block', textDecoration: 'none', color: 'inherit',
                    border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px',
                    background: '#fff', transition: 'box-shadow 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{a.title}</div>
                      {a.description && (
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{a.description}</div>
                      )}
                    </div>
                    <span
                      style={{
                        background: statusStyle.bg, color: statusStyle.text,
                        padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                      }}
                    >
                      {statusStyle.icon} {statusLabel}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                    <span>Son tarih: <strong style={{ color: overdue ? '#dc2626' : dueToday ? '#d97706' : '#334155' }}>{fmtDate(a.due_date)}</strong></span>
                    {a.coach_name && <span>Koç: {a.coach_name}</span>}
                    {a.risk_status && a.risk_status !== 'PENDING' && a.risk_status !== 'NONE' && (
                      <span style={{ color: getRiskColor(a.risk_status).text, fontWeight: 600 }}>
                        {getRiskColor(a.risk_status).icon} {a.risk_status_display || a.risk_status}
                      </span>
                    )}
                    {nonSubmissionLabel && <span style={{ color: '#dc2626', fontWeight: 600 }}>🚫 {nonSubmissionLabel}</span>}
                    {(a.postpone_count ?? 0) > 0 && <span>📅 {a.postpone_count}x ertelendi</span>}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                    <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: barColor }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: barColor, minWidth: 34, textAlign: 'right' }}>%{pct}</span>
                    {isDraft && (
                      <button
                        type="button"
                        disabled={assigningId === a.id}
                        onClick={(e) => handleAssignDraft(e, a.id)}
                        style={{
                          padding: '6px 12px', background: '#eff6ff', color: '#2563eb',
                          border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, fontWeight: 700,
                          cursor: assigningId === a.id ? 'default' : 'pointer',
                        }}
                      >
                        {assigningId === a.id ? 'Atanıyor…' : 'Öğrenciye ata'}
                      </button>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {hiddenCount > 0 && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setVisibleCount((n) => Math.min(n + LOAD_MORE_STEP, assignments.length))}
                style={{
                  padding: '8px 16px', background: '#f8fafc', border: '1px solid #e2e8f0',
                  borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer',
                }}
              >
                Daha fazla göster ({hiddenCount} kaldı)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
