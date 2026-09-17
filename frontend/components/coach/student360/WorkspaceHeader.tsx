'use client';

/**
 * Öğrenci Çalışma Merkezi — üst başlık bandı.
 *
 * Tam genişlik, yapışkan; kimlik + kritik sinyaller + masaüstü hızlı
 * aksiyonlar tek bantta. Mobilde aksiyonlar alttaki QuickActionBar'a düşer.
 */

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

interface WorkspaceHeaderProps {
  profile: CoachStudentProfileData;
  backHref?: string;
  pinned?: boolean;
  onTogglePin?: () => void;
  onShowInfo?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onAction?: (action: Student360ActionId) => void;
}

function daysSince(d?: string | null): number | null {
  if (!d) return null;
  const then = new Date(d);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((Date.now() - then.getTime()) / 86_400_000);
}

export default function WorkspaceHeader({
  profile,
  backHref = '/coach/ogrenciler',
  pinned = false,
  onTogglePin,
  onShowInfo,
  onRefresh,
  refreshing = false,
  onAction,
}: WorkspaceHeaderProps) {
  const { student, risk, quick_stats: qs } = profile;
  const sinifLabel =
    typeof student.sinif === 'string' ? student.sinif : student.sinif?.ad ?? null;
  const seviyeLabel = resolveCoachStudentGradeLevel(student);
  const riskLevel = normalizeCoachRiskLevel(risk?.level ?? risk?.label);
  const overdue =
    Number(qs?.overdue_homework_count ?? qs?.overdue_homework ?? 0) || 0;
  const meetingDays = daysSince(
    profile.last_meeting?.date || qs?.last_meeting_date || null
  );

  return (
    <header className="s360w-header">
      <div className="s360w-header-inner">
        <Link href={backHref} className="s360w-back" aria-label="Öğrenci listesine dön">
          <Student360Icon name="arrow" size={17} />
          <span>Öğrencilerim</span>
        </Link>

        <div className="s360w-identity">
          <CoachStudentAvatar
            ad={student.ad}
            soyad={student.soyad}
            profilFoto={student.profil_foto}
            size="md"
            highRisk={riskLevel === 'high'}
            enableLightbox
            altName={student.full_name}
          />
          <div className="s360w-identity-copy">
            <div className="s360w-identity-name">
              <h1 title={student.full_name}>{student.full_name}</h1>
              {riskLevel && (
                <span className={`coach-risk-badge ${coachRiskCssClass(riskLevel)}`}>
                  Risk: {COACH_RISK_LABELS[riskLevel]}
                </span>
              )}
              {overdue > 0 && (
                <span className="s360w-signal-badge is-danger">
                  {overdue} geciken ödev
                </span>
              )}
            </div>
            <div className="s360w-identity-meta">
              {(seviyeLabel || sinifLabel) && (
                <span>{[seviyeLabel, sinifLabel].filter(Boolean).join(' · ')}</span>
              )}
              {student.alan?.ad && <span>{student.alan.ad}</span>}
              {student.okul_no && <span>#{student.okul_no}</span>}
              {profile.coach_context?.coach_name && (
                <span className="s360w-meta-coach">
                  Koç: {profile.coach_context.coach_name}
                </span>
              )}
              <span className={meetingDays != null && meetingDays >= 14 ? 's360w-meta-warn' : undefined}>
                {meetingDays == null
                  ? 'Henüz görüşme yok'
                  : meetingDays === 0
                    ? 'Bugün görüşüldü'
                    : `Son görüşme ${meetingDays} gün önce`}
              </span>
            </div>
          </div>
        </div>

        {onAction && (
          <div className="s360w-header-actions" aria-label="Yeni kayıt">
            <button
              type="button"
              className="s360w-action is-primary"
              onClick={() => onAction('gorusme-ekle')}
            >
              <Student360Icon name="meeting" size={16} />
              <span>Görüşme</span>
            </button>
            <button type="button" className="s360w-action" onClick={() => onAction('odev-ver')}>
              <Student360Icon name="homework" size={16} />
              <span>Ödev ver</span>
            </button>
            <button
              type="button"
              className="s360w-action is-danger"
              onClick={() => onAction('risk')}
            >
              <Student360Icon name="risk" size={16} />
              <span>Risk</span>
            </button>
          </div>
        )}

        <div className="s360w-header-utils">
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
              aria-label="Öğrenci kimlik bilgileri"
              title="Öğrenci kimlik bilgileri"
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
    </header>
  );
}

export function WorkspaceHeaderSkeleton() {
  return (
    <header className="s360w-header">
      <div className="s360w-header-inner">
        <div className="coach-skeleton" style={{ width: 110, height: 34, borderRadius: 10 }} />
        <div className="s360w-identity">
          <div className="coach-skeleton coach-skeleton-avatar" style={{ width: 52, height: 52 }} />
          <div style={{ flex: 1, minWidth: 160 }}>
            <div className="coach-skeleton coach-skeleton-line w60" />
            <div className="coach-skeleton coach-skeleton-line w40" style={{ marginTop: 8 }} />
          </div>
        </div>
        <div className="s360w-header-actions">
          {[1, 2, 3].map((i) => (
            <div key={i} className="coach-skeleton" style={{ width: 96, height: 38, borderRadius: 10 }} />
          ))}
        </div>
      </div>
    </header>
  );
}
