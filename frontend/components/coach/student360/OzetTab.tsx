'use client';

import {
  CoachStudentProfileData,
  type Student360ActionId,
  type Student360TabId,
} from '@/lib/coach-api';
import {
  COACH_RISK_LABELS,
  coachRiskCssClass,
  normalizeCoachRiskLevel,
} from '@/lib/coach-constants';
import Student360Icon, {
  type Student360IconName,
} from '@/components/coach/Student360Icon';

type PanelId = Exclude<Student360TabId, 'genel'>;

interface OzetTabProps {
  profile: CoachStudentProfileData;
  onNavigateTab?: (tab: PanelId) => void;
  onAction?: (action: Student360ActionId) => void;
}

type PriorityItem = {
  id: string;
  icon: Student360IconName;
  tone: 'danger' | 'warn' | 'info' | 'ok';
  title: string;
  detail: string;
  cta: string;
  onClick: () => void;
};

function asOverviewRecord(overview: CoachStudentProfileData['overview']): Record<string, unknown> | null {
  if (!overview || typeof overview !== 'object' || Array.isArray(overview)) return null;
  return overview as unknown as Record<string, unknown>;
}

function daysSince(d?: string | null): number | null {
  if (!d) return null;
  const then = new Date(d);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((Date.now() - then.getTime()) / (1000 * 60 * 60 * 24));
}

function buildPriorities(
  profile: CoachStudentProfileData,
  onNavigateTab?: (tab: PanelId) => void,
  onAction?: (action: Student360ActionId) => void
): PriorityItem[] {
  const qs = profile.quick_stats || {};
  const ov = asOverviewRecord(profile.overview);
  const overdue =
    Number(qs.overdue_homework_count ?? qs.overdue_homework ?? qs.overdue_manual_assignments ?? 0) || 0;
  const pending =
    Number(qs.pending_manual_assignments ?? ov?.pending_manual_assignments ?? qs.open_assignments ?? 0) || 0;
  const pendingMeetings = Number(qs.pending_meetings ?? 0) || 0;
  const lastMeetingDate =
    profile.last_meeting?.date || (qs.last_meeting_date as string | undefined) || null;
  const meetingDays = daysSince(lastMeetingDate);
  const riskLevel = normalizeCoachRiskLevel(profile.risk?.level ?? profile.risk?.label);
  const program = ov?.current_week_program as Record<string, unknown> | null | undefined;
  const programPct = qs.program_completion_percent ?? qs.program_completion ?? program?.completion_percent;

  const items: PriorityItem[] = [];

  if (overdue > 0) {
    items.push({
      id: 'overdue',
      icon: 'homework',
      tone: 'danger',
      title: `${overdue} geciken ödev`,
      detail: 'Takip ve tamamlatma gerekiyor',
      cta: 'Ödevlere git',
      onClick: () => onNavigateTab?.('odevler'),
    });
  } else if (pending > 0) {
    items.push({
      id: 'pending',
      icon: 'homework',
      tone: 'warn',
      title: `${pending} açık ödev`,
      detail: 'Öğrencinin üzerinde bekleyen görevler var',
      cta: 'Ödevlere git',
      onClick: () => onNavigateTab?.('odevler'),
    });
  }

  if (riskLevel === 'high' || riskLevel === 'medium') {
    items.push({
      id: 'risk',
      icon: 'risk',
      tone: riskLevel === 'high' ? 'danger' : 'warn',
      title: `Risk: ${COACH_RISK_LABELS[riskLevel]}`,
      detail:
        profile.risk?.reasons?.slice(0, 2).join(' · ') ||
        'Risk nedenlerini gözden geçirin veya yeni bildirim ekleyin',
      cta: 'Risk bildir',
      onClick: () => onAction?.('risk'),
    });
  }

  if (pendingMeetings > 0) {
    items.push({
      id: 'pending-meeting',
      icon: 'meeting',
      tone: 'warn',
      title: `${pendingMeetings} bekleyen görüşme`,
      detail: 'Planlanmış görüşmeleri tamamlayın',
      cta: 'Görüşmelere git',
      onClick: () => onNavigateTab?.('gorusmeler'),
    });
  } else if (meetingDays != null && meetingDays >= 14) {
    items.push({
      id: 'stale-meeting',
      icon: 'meeting',
      tone: 'warn',
      title: `${meetingDays} gündür görüşme yok`,
      detail: 'Son görüşme üzerinden uzun süre geçti',
      cta: 'Görüşme ekle',
      onClick: () => onAction?.('gorusme-ekle'),
    });
  }

  if (programPct != null && Number(programPct) < 40) {
    items.push({
      id: 'program-low',
      icon: 'calendar',
      tone: 'info',
      title: `Program tamamlanma %${Math.round(Number(programPct))}`,
      detail: 'Haftalık program geride',
      cta: 'Programa git',
      onClick: () => onNavigateTab?.('program'),
    });
  } else if (!program && programPct == null) {
    items.push({
      id: 'no-program',
      icon: 'calendar',
      tone: 'info',
      title: 'Bu hafta program yok',
      detail: 'Öğrenci için haftalık program oluşturabilirsiniz',
      cta: 'Program oluştur',
      onClick: () => onAction?.('program'),
    });
  }

  if (items.length === 0) {
    items.push({
      id: 'ok',
      icon: 'check',
      tone: 'ok',
      title: 'Acil takip yok',
      detail: 'Ödev, görüşme ve risk tarafında kritik bir işaret görünmüyor',
      cta: 'Ödev ver',
      onClick: () => onAction?.('odev-ver'),
    });
  }

  return items;
}

export default function OzetTab({ profile, onNavigateTab, onAction }: OzetTabProps) {
  const qs = profile.quick_stats || {};
  const ov = asOverviewRecord(profile.overview);
  const exam = (ov?.exam_summary as Record<string, unknown> | undefined) || {};
  const program = ov?.current_week_program as Record<string, unknown> | null | undefined;
  const programPct =
    qs.program_completion_percent ?? qs.program_completion ?? program?.completion_percent;
  const lastNet = qs.last_exam_net ?? exam.last_exam_net;
  const lastExamName = (exam.last_exam_name as string | undefined) || null;
  const riskLevel = normalizeCoachRiskLevel(profile.risk?.level ?? profile.risk?.label);
  const priorities = buildPriorities(profile, onNavigateTab, onAction);
  const hedef = ov?.hedef as { text?: string } | null | undefined;
  const recentMeetings = Array.isArray(ov?.recent_meetings)
    ? (ov!.recent_meetings as Array<{
        id?: number;
        tarih?: string;
        gorusme_tarihi?: string;
        konu?: string;
      }>)
    : [];
  const overdue = Number(qs.overdue_homework_count ?? qs.overdue_homework ?? 0) || 0;
  const todayLabel = new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="student360-panel s360-ozet">
      <div className="s360-ozet-intro">
        <div>
          <span className="s360-eyebrow">{todayLabel}</span>
          <h2>Öğrenci özeti</h2>
          <p>Önemli sinyaller, güncel durum ve sıradaki aksiyonlar.</p>
        </div>
        {riskLevel && (
          <span className={`coach-risk-badge ${coachRiskCssClass(riskLevel)}`}>
            {COACH_RISK_LABELS[riskLevel]}
          </span>
        )}
      </div>

      <section className="s360-metric-grid" aria-label="Öğrenci performans özeti">
        <button
          type="button"
          className={`s360-metric-card${overdue > 0 ? ' is-alert' : ''}`}
          onClick={() => onNavigateTab?.('odevler')}
        >
          <span className="s360-metric-icon"><Student360Icon name="homework" /></span>
          <span className="s360-metric-copy">
            <strong>{overdue}</strong>
            <span>Geciken ödev</span>
            <small>{overdue > 0 ? 'Takip gerekiyor' : 'Güncel'}</small>
          </span>
        </button>
        <button type="button" className="s360-metric-card" onClick={() => onNavigateTab?.('sinavlar')}>
          <span className="s360-metric-icon"><Student360Icon name="exam" /></span>
          <span className="s360-metric-copy">
            <strong>{lastNet != null ? Number(lastNet).toFixed(1) : '—'}</strong>
            <span>Son sınav neti</span>
            <small>{lastExamName || 'Henüz sınav yok'}</small>
          </span>
        </button>
        <button type="button" className="s360-metric-card" onClick={() => onNavigateTab?.('program')}>
          <span className="s360-metric-icon"><Student360Icon name="calendar" /></span>
          <span className="s360-metric-copy">
            <strong>{programPct != null ? `%${Math.round(Number(programPct))}` : '—'}</strong>
            <span>Program ilerlemesi</span>
            <small>{programPct != null ? 'Bu hafta' : 'Program oluşturulmamış'}</small>
          </span>
        </button>
        <button
          type="button"
          className="s360-metric-card"
          onClick={() => onNavigateTab?.('gorusmeler')}
        >
          <span className="s360-metric-icon"><Student360Icon name="meeting" /></span>
          <span className="s360-metric-copy">
            <strong>{qs.total_meetings ?? 0}</strong>
            <span>Toplam görüşme</span>
            <small>Görüşme geçmişi</small>
          </span>
        </button>
      </section>

      <div className="s360-ozet-layout">
        <section className="s360-surface-card s360-ozet-priority">
          <div className="s360-ozet-section-head">
            <div>
              <span className="s360-eyebrow">Öncelikler</span>
              <h3 className="coach-section-title">Sıradaki en iyi aksiyon</h3>
            </div>
            <span className="s360-count-badge">{priorities.length}</span>
          </div>
          <ul className="s360-priority-list">
            {priorities.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`s360-priority-item is-${item.tone}`}
                  onClick={item.onClick}
                >
                  <span className="s360-priority-icon">
                    <Student360Icon name={item.icon} size={19} />
                  </span>
                  <span className="s360-priority-body">
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </span>
                  <span className="s360-priority-cta">
                    <span>{item.cta}</span>
                    <span aria-hidden>→</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <aside className="s360-ozet-side">
          {(hedef?.text || profile.coach_context?.hedef) && (
            <section className="s360-surface-card s360-ozet-hedef">
              <span className="s360-target-icon"><Student360Icon name="target" /></span>
              <div>
                <span className="s360-eyebrow">Aktif hedef</span>
                <p>{hedef?.text || profile.coach_context?.hedef}</p>
              </div>
            </section>
          )}

          {profile.risk?.reasons && profile.risk.reasons.length > 0 && (
            <section className="s360-surface-card s360-risk-summary">
              <div className="s360-risk-summary-head">
                <span><Student360Icon name="risk" size={19} /></span>
                <div>
                  <span className="s360-eyebrow">Risk sinyalleri</span>
                  <strong>Dikkat edilmesi gerekenler</strong>
                </div>
              </div>
              <ul>
                {profile.risk.reasons.map((reason, index) => <li key={index}>{reason}</li>)}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {recentMeetings.length > 0 && (
        <section className="s360-surface-card s360-ozet-timeline">
          <div className="s360-ozet-section-head">
            <div>
              <span className="s360-eyebrow">Aktivite</span>
              <h3 className="coach-section-title">Son görüşmeler</h3>
            </div>
            {onNavigateTab && (
              <button type="button" className="coach-link-btn" onClick={() => onNavigateTab('gorusmeler')}>
                Tümü →
              </button>
            )}
          </div>
          <ul className="s360-timeline">
            {recentMeetings.slice(0, 5).map((m, idx) => {
              const d = m.gorusme_tarihi || m.tarih;
              return (
                <li key={m.id ?? idx}>
                  <span className="s360-timeline-marker">
                    <Student360Icon name="meeting" size={15} />
                  </span>
                  <span className="s360-timeline-date">
                    {d ? new Date(String(d)).toLocaleDateString('tr-TR') : '—'}
                  </span>
                  <span className="s360-timeline-text">{m.konu || 'Görüşme'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
