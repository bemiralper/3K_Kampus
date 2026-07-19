'use client';

import type { CSSProperties } from 'react';
import {
  CoachStudentProfileData,
  Student360TabId,
} from '@/lib/coach-api';
import { normalizeCoachRiskLevel } from '@/lib/coach-constants';

const ACCENT_MAP: Record<string, string> = {
  blue: '#2563eb',
  green: '#059669',
  amber: '#d97706',
  red: '#dc2626',
  purple: '#7c3aed',
  teal: '#0d9488',
};

interface GenelBakisTabProps {
  profile: CoachStudentProfileData;
  onNavigateTab?: (tab: Student360TabId) => void;
}

type OverviewCardModel = {
  key: string;
  title: string;
  value: string | number;
  subtitle?: string | null;
  accent?: string;
  tab?: Student360TabId;
};

function OverviewCard({
  card,
  onClick,
}: {
  card: OverviewCardModel;
  onClick?: () => void;
}) {
  const accent = card.accent ? ACCENT_MAP[card.accent] || card.accent : undefined;

  return (
    <div
      className={`coach-overview-card student360-overview-card${onClick ? ' clickable' : ''}`}
      style={accent ? ({ ['--card-accent' as string]: accent } as CSSProperties) : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick();
            }
          : undefined
      }
    >
      <div className="coach-overview-title">{card.title}</div>
      <div className="coach-overview-value">{card.value}</div>
      {card.subtitle && <div className="coach-overview-sub">{card.subtitle}</div>}
    </div>
  );
}

function asOverviewRecord(overview: CoachStudentProfileData['overview']): Record<string, unknown> | null {
  if (!overview || typeof overview !== 'object' || Array.isArray(overview)) return null;
  return overview as unknown as Record<string, unknown>;
}

function buildCards(profile: CoachStudentProfileData): OverviewCardModel[] {
  const qs = profile.quick_stats || {};
  const ov = asOverviewRecord(profile.overview);
  const exam = (ov?.exam_summary as Record<string, unknown> | undefined) || {};
  const program = ov?.current_week_program as Record<string, unknown> | null | undefined;
  const pending =
    Number(qs.pending_manual_assignments ?? ov?.pending_manual_assignments ?? qs.open_assignments ?? 0) || 0;
  const overdue =
    Number(qs.overdue_homework_count ?? qs.overdue_homework ?? qs.overdue_manual_assignments ?? 0) || 0;
  const programPct =
    qs.program_completion_percent ?? qs.program_completion ?? program?.completion_percent;
  const lastNet = qs.last_exam_net ?? exam.last_exam_net;
  const lastExamName = (exam.last_exam_name as string | undefined) || null;
  const lastExamDate = (qs.last_exam_date || exam.last_exam_date) as string | null | undefined;
  const totalMeetings =
    Number(
      (profile.coach_context as { total_meeting_count?: number })?.total_meeting_count ??
        qs.total_meetings ??
        0
    ) || 0;

  const cards: OverviewCardModel[] = [
    {
      key: 'odevler',
      title: 'Bekleyen ödev',
      value: pending,
      subtitle: overdue > 0 ? `${overdue} gecikmiş` : 'Aktif ödevler',
      accent: overdue > 0 ? 'red' : 'blue',
      tab: 'odevler',
    },
    {
      key: 'gorusmeler',
      title: 'Görüşmeler',
      value: totalMeetings,
      subtitle: qs.last_meeting_date
        ? `Son: ${new Date(String(qs.last_meeting_date)).toLocaleDateString('tr-TR')}`
        : 'Kayıt yok',
      accent: 'purple',
      tab: 'gorusmeler',
    },
    {
      key: 'program',
      title: 'Haftalık program',
      value: programPct != null ? `%${Math.round(Number(programPct))}` : '—',
      subtitle: program ? 'Bu hafta' : 'Program yok',
      accent: 'teal',
      tab: 'program',
    },
    {
      key: 'sinavlar',
      title: 'Son sınav net',
      value: lastNet != null ? Number(lastNet).toFixed(1) : '—',
      subtitle: lastExamName || (lastExamDate ? String(lastExamDate) : 'Sınav yok'),
      accent: 'amber',
      tab: 'sinavlar',
    },
  ];

  return cards;
}

export default function GenelBakisTab({ profile, onNavigateTab }: GenelBakisTabProps) {
  const { risk } = profile;
  const riskLevel = normalizeCoachRiskLevel(risk?.level ?? risk?.label);
  const cards = buildCards(profile);
  const ov = asOverviewRecord(profile.overview);
  const hedef = ov?.hedef as { text?: string; source?: string } | null | undefined;
  const recentMeetings = Array.isArray(ov?.recent_meetings)
    ? (ov!.recent_meetings as Array<{ id?: number; tarih?: string; gorusme_tarihi?: string; konu?: string }>)
    : [];
  const lastMeetingDate =
    profile.last_meeting?.date ||
    profile.quick_stats?.last_meeting_date ||
    recentMeetings[0]?.gorusme_tarihi ||
    recentMeetings[0]?.tarih ||
    null;
  const lastMeetingKonu =
    profile.last_meeting?.konu || recentMeetings[0]?.konu || null;

  return (
    <div className="student360-panel">
      {risk?.reasons && risk.reasons.length > 0 && (
        <div className="student360-risk-alert">
          <div className="student360-risk-alert-head">
            <span className="student360-risk-alert-icon">⚠️</span>
            <div>
              <h3 className="student360-risk-alert-title">Risk nedenleri</h3>
              {riskLevel && (
                <p className="student360-risk-alert-sub">
                  Mevcut seviye: {risk.label || riskLevel}
                </p>
              )}
            </div>
          </div>
          <ul className="student360-risk-list">
            {risk.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {hedef?.text && (
        <div className="student360-last-meeting-card" style={{ marginBottom: 12 }}>
          <div className="student360-last-meeting-label">Hedef</div>
          <div className="student360-last-meeting-body">
            <strong>{hedef.text}</strong>
          </div>
        </div>
      )}

      {lastMeetingDate && (
        <div className="student360-last-meeting-card">
          <div className="student360-last-meeting-label">Son görüşme</div>
          <div className="student360-last-meeting-body">
            <strong>
              {new Date(String(lastMeetingDate)).toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </strong>
            {lastMeetingKonu ? <span> — {lastMeetingKonu}</span> : null}
          </div>
          {onNavigateTab && (
            <button
              type="button"
              className="coach-link-btn"
              onClick={() => onNavigateTab('gorusmeler')}
            >
              Tüm görüşmeler →
            </button>
          )}
        </div>
      )}

      <section className="student360-overview-section">
        <h3 className="coach-section-title">Özet</h3>
        <div className="coach-overview-grid">
          {cards.map((card) => (
            <OverviewCard
              key={card.key}
              card={card}
              onClick={
                card.tab && onNavigateTab ? () => onNavigateTab(card.tab!) : undefined
              }
            />
          ))}
        </div>
      </section>

      {recentMeetings.length > 0 && (
        <section className="student360-overview-section" style={{ marginTop: 20 }}>
          <h3 className="coach-section-title">Son görüşmeler</h3>
          <ul className="mesajlar-tab-list">
            {recentMeetings.slice(0, 5).map((m, idx) => {
              const d = m.gorusme_tarihi || m.tarih;
              return (
                <li key={m.id ?? idx} className="mesajlar-tab-item" style={{ cursor: 'default' }}>
                  <div className="mesajlar-tab-item-top">
                    <strong>{m.konu || 'Görüşme'}</strong>
                    <span>
                      {d
                        ? new Date(String(d)).toLocaleDateString('tr-TR')
                        : '—'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {onNavigateTab && (
            <button
              type="button"
              className="coach-link-btn"
              style={{ marginTop: 8 }}
              onClick={() => onNavigateTab('gorusmeler')}
            >
              Görüşme sekmesine git →
            </button>
          )}
        </section>
      )}

    </div>
  );
}
