'use client';

import Link from 'next/link';
import { CoachStudentProfileData, type Student360ActionId } from '@/lib/coach-api';
import {
  COACH_RISK_LABELS,
  coachRiskCssClass,
  normalizeCoachRiskLevel,
} from '@/lib/coach-constants';
import CoachStudentAvatar from '@/components/coach/students/CoachStudentAvatar';
import Student360Icon from '@/components/coach/Student360Icon';
import { resolveCoachStudentGradeLevel } from '@/lib/coach-student-display';

interface Student360HeaderProps {
  profile: CoachStudentProfileData;
  backHref?: string;
  pinned?: boolean;
  onTogglePin?: () => void;
  onShowInfo?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onAction?: (action: Student360ActionId) => void;
  onMesaj?: () => void;
}

export default function Student360Header({
  profile,
  backHref = '/coach/ogrenciler',
  pinned = false,
  onTogglePin,
  onShowInfo,
  onRefresh,
  refreshing = false,
  onAction,
  onMesaj,
}: Student360HeaderProps) {
  const { student, risk, last_meeting } = profile;
  const sinifLabel =
    typeof student.sinif === 'string' ? student.sinif : student.sinif?.ad ?? null;
  const seviyeLabel = resolveCoachStudentGradeLevel(student);
  const riskLevel = normalizeCoachRiskLevel(risk?.level ?? risk?.label);
  const highRisk = riskLevel === 'high';
  const lastMeetingText = last_meeting?.date
    ? new Date(last_meeting.date).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <header className="s360-profile-card">
      <div className="s360-profile-toolbar">
        <Link href={backHref} className="student360-back" aria-label="Öğrencilere dön">
          <Student360Icon name="arrow" size={17} />
          <span className="student360-back-label">Öğrencilerim</span>
        </Link>
        <div className="s360-profile-utilities">
          {onTogglePin && (
            <button
              type="button"
              className={`student360-icon-btn${pinned ? ' is-active' : ''}`}
              onClick={onTogglePin}
              aria-pressed={pinned}
              title={pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
            >
              <Student360Icon name="pin" size={17} />
            </button>
          )}
          {onShowInfo && (
            <button
              type="button"
              className="student360-icon-btn"
              onClick={onShowInfo}
              aria-label="Öğrenci profili"
              title="Öğrenci profili"
            >
              <Student360Icon name="info" size={18} />
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
              <Student360Icon name="refresh" size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="s360-profile-main">
        <div className="s360-profile-avatar">
          <CoachStudentAvatar
            ad={student.ad}
            soyad={student.soyad}
            profilFoto={student.profil_foto}
            size="lg"
            highRisk={highRisk}
            enableLightbox
            altName={student.full_name}
          />
        </div>

        <div className="s360-profile-copy">
          <div className="s360-profile-heading">
            <h1 title={student.full_name}>{student.full_name}</h1>
            <span className={`coach-risk-badge ${coachRiskCssClass(riskLevel)}`}>
              {riskLevel ? COACH_RISK_LABELS[riskLevel] : risk?.label || 'Risk yok'}
            </span>
          </div>
          <div className="s360-profile-meta">
            {(seviyeLabel || sinifLabel) && (
              <span>
                <Student360Icon name="academic" size={14} />
                {[seviyeLabel, sinifLabel].filter(Boolean).join(' · ')}
              </span>
            )}
            {student.okul_no && <span className="s360-profile-number">#{student.okul_no}</span>}
          </div>
          <div className="s360-profile-context">
            <span>
              <Student360Icon name="meeting" size={14} />
              {lastMeetingText ? `Son görüşme ${lastMeetingText}` : 'Henüz görüşme yok'}
            </span>
            {profile.coach_context?.coach_name && (
              <span>
                <Student360Icon name="profile" size={14} />
                {profile.coach_context.coach_name}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="s360-profile-actions" aria-label="Öğrenci hızlı işlemleri">
        {onMesaj && (
          <button type="button" className="s360-profile-action" onClick={onMesaj}>
            <Student360Icon name="message" size={17} />
            Mesaj
          </button>
        )}
        {onAction && (
          <>
            <button
              type="button"
              className="s360-profile-action primary"
              onClick={() => onAction('gorusme-ekle')}
            >
              <Student360Icon name="meeting" size={17} />
              Görüşme
            </button>
            <button
              type="button"
              className="s360-profile-action"
              onClick={() => onAction('odev-ver')}
            >
              <Student360Icon name="homework" size={17} />
              Ödev
            </button>
            <button
              type="button"
              className="s360-profile-action danger"
              onClick={() => onAction('risk')}
            >
              <Student360Icon name="risk" size={17} />
              Risk
            </button>
          </>
        )}
      </div>
    </header>
  );
}

export function Student360HeaderSkeleton() {
  return (
    <header className="s360-profile-card s360-profile-skeleton">
      <div className="s360-profile-toolbar">
        <div className="coach-skeleton" style={{ width: 120, height: 32, borderRadius: 10 }} />
        <div className="coach-skeleton" style={{ width: 72, height: 32, borderRadius: 10 }} />
      </div>
      <div className="s360-profile-main">
        <div className="coach-skeleton coach-skeleton-avatar" style={{ width: 72, height: 72 }} />
        <div style={{ flex: 1 }}>
          <div className="coach-skeleton coach-skeleton-line w60" />
          <div className="coach-skeleton coach-skeleton-line w40" style={{ marginTop: 8 }} />
        </div>
      </div>
      <div className="s360-profile-actions">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="coach-skeleton" style={{ height: 36, flex: 1, borderRadius: 10 }} />
        ))}
      </div>
    </header>
  );
}
