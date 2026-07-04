'use client';

import Link from 'next/link';
import {
  CoachStudentProfileData,
  CoachStudentQuickStats,
} from '@/lib/coach-api';
import {
  COACH_RISK_LABELS,
  coachRiskCssClass,
  normalizeCoachRiskLevel,
} from '@/lib/coach-constants';
import CoachStudentAvatar from '@/components/coach/students/CoachStudentAvatar';

function fmtDate(d?: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function daysSince(d?: string | null): number | null {
  if (!d) return null;
  const then = new Date(d);
  return Math.floor((Date.now() - then.getTime()) / (1000 * 60 * 60 * 24));
}

interface Student360HeaderProps {
  profile: CoachStudentProfileData;
  backHref?: string;
  pinned?: boolean;
  onTogglePin?: () => void;
  onShowInfo?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function KpiPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string | number;
  tone?: 'warn' | 'danger' | 'ok';
}) {
  return (
    <div className={`student360-kpi-pill${tone ? ` is-${tone}` : ''}`}>
      <span className="student360-kpi-pill-icon">{icon}</span>
      <div className="student360-kpi-pill-body">
        <span className="student360-kpi-pill-value">{value}</span>
        <span className="student360-kpi-pill-label">{label}</span>
      </div>
    </div>
  );
}

export default function Student360Header({
  profile,
  backHref = '/coach/ogrenciler',
  pinned = false,
  onTogglePin,
  onShowInfo,
  onRefresh,
  refreshing = false,
}: Student360HeaderProps) {
  const { student, coach_context, risk, last_meeting, quick_stats } = profile;
  const sinifLabel =
    typeof student.sinif === 'string'
      ? student.sinif
      : student.sinif?.ad ?? null;
  const riskLevel = normalizeCoachRiskLevel(risk?.level ?? risk?.label);
  const highRisk = riskLevel === 'high';
  const lastMeetingText = last_meeting?.date ? fmtDate(last_meeting.date) : null;
  const meetingDays = daysSince(last_meeting?.date);
  const stats = quick_stats ?? ({} as CoachStudentQuickStats);
  const overdue = stats.overdue_homework ?? 0;
  const pendingMeetings = stats.pending_meetings ?? 0;

  return (
    <header className="student360-hero">
      <div className="student360-hero-bg" aria-hidden />
      <div className="student360-hero-inner">
        <div className="student360-hero-toolbar">
          <Link href={backHref} className="student360-back" aria-label="Öğrencilere dön">
            <span aria-hidden>←</span>
            <span className="student360-back-label">Öğrencilerim</span>
          </Link>
          <div className="student360-hero-actions">
            {onTogglePin && (
              <button
                type="button"
                className={`student360-icon-btn${pinned ? ' is-active' : ''}`}
                onClick={onTogglePin}
                aria-pressed={pinned}
                title={pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
              >
                {pinned ? '📌' : '📍'}
              </button>
            )}
            {onShowInfo && (
              <button
                type="button"
                className="student360-icon-btn"
                onClick={onShowInfo}
                aria-label="Öğrenci bilgileri"
                title="Öğrenci bilgileri"
              >
                ℹ
              </button>
            )}
            {onRefresh && (
              <button
                type="button"
                className={`student360-icon-btn${refreshing ? ' is-spinning' : ''}`}
                onClick={onRefresh}
                disabled={refreshing}
                aria-label="Yenile"
                title="Yenile"
              >
                ↻
              </button>
            )}
          </div>
        </div>

        <div className="student360-hero-profile">
          <CoachStudentAvatar
            ad={student.ad}
            soyad={student.soyad}
            profilFoto={student.profil_foto}
            size="lg"
            highRisk={highRisk}
            enableLightbox
            altName={student.full_name}
          />
          <div className="student360-identity">
            <h1 className="student360-name">{student.full_name}</h1>
            <div className="student360-meta">
              {sinifLabel && (
                <span className="student360-meta-item">🎓 {sinifLabel}</span>
              )}
              {student.okul_no && (
                <span className="student360-meta-item">#{student.okul_no}</span>
              )}
              {student.veli_adi && (
                <span className="student360-meta-item">👪 {student.veli_adi}</span>
              )}
            </div>
            <div className="student360-status-row">
              <span className={`coach-risk-badge ${coachRiskCssClass(riskLevel)}`}>
                {riskLevel ? COACH_RISK_LABELS[riskLevel] : risk?.label || 'Risk yok'}
              </span>
              {lastMeetingText && (
                <span className="student360-status-chip">
                  💬 {lastMeetingText}
                  {meetingDays != null && meetingDays >= 14 ? (
                    <strong className="student360-status-warn"> · {meetingDays}g</strong>
                  ) : null}
                </span>
              )}
              {coach_context.coach_name && (
                <span className="student360-status-chip">👤 {coach_context.coach_name}</span>
              )}
            </div>
          </div>
        </div>

        {coach_context.hedef && (
          <div className="student360-hedef">
            <span className="student360-hedef-label">Hedef</span>
            <p className="student360-hedef-text">{coach_context.hedef}</p>
          </div>
        )}

        <div className="student360-kpi-strip">
          <KpiPill
            icon="📋"
            label="Geciken ödev"
            value={overdue}
            tone={overdue > 0 ? 'danger' : undefined}
          />
          <KpiPill
            icon="💬"
            label="Bekleyen görüşme"
            value={pendingMeetings}
            tone={pendingMeetings > 0 ? 'warn' : undefined}
          />
          <KpiPill
            icon="📊"
            label="Son sınav net"
            value={stats.last_exam_net != null ? stats.last_exam_net.toFixed(1) : '—'}
          />
          <KpiPill
            icon="📅"
            label="Toplam görüşme"
            value={stats.total_meetings ?? 0}
          />
        </div>
      </div>
    </header>
  );
}

export function Student360HeaderSkeleton() {
  return (
    <header className="student360-hero student360-hero-skeleton">
      <div className="student360-hero-bg" aria-hidden />
      <div className="student360-hero-inner">
        <div className="student360-hero-toolbar">
          <div className="coach-skeleton" style={{ width: 120, height: 36, borderRadius: 12 }} />
          <div className="coach-skeleton" style={{ width: 72, height: 36, borderRadius: 12 }} />
        </div>
        <div className="student360-hero-profile">
          <div className="coach-skeleton coach-skeleton-avatar student360-skeleton-avatar" />
          <div style={{ flex: 1 }}>
            <div className="coach-skeleton coach-skeleton-line w60" />
            <div className="coach-skeleton coach-skeleton-line w40" style={{ marginTop: 8 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <div className="coach-skeleton" style={{ width: 72, height: 26, borderRadius: 999 }} />
              <div className="coach-skeleton" style={{ width: 100, height: 26, borderRadius: 999 }} />
            </div>
          </div>
        </div>
        <div className="student360-kpi-strip">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="coach-skeleton" style={{ height: 64, borderRadius: 14 }} />
          ))}
        </div>
      </div>
    </header>
  );
}
