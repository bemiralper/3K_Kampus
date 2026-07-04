'use client';

import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  CoachOverviewCard,
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

function OverviewCard({
  card,
  onClick,
}: {
  card: CoachOverviewCard;
  onClick?: () => void;
}) {
  const accent = card.accent ? ACCENT_MAP[card.accent] || card.accent : undefined;
  const trendIcon =
    card.trend === 'up' ? '↑' : card.trend === 'down' ? '↓' : card.trend === 'flat' ? '→' : null;

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
      {card.trend && trendIcon && (
        <span className={`coach-overview-trend ${card.trend}`}>
          {trendIcon} {card.trend_label || ''}
        </span>
      )}
    </div>
  );
}

const TAB_FROM_KEY: Partial<Record<string, Student360TabId>> = {
  homework: 'odevler',
  odevler: 'odevler',
  exams: 'sinavlar',
  sinavlar: 'sinavlar',
  meetings: 'gorusmeler',
  gorusmeler: 'gorusmeler',
  program: 'program',
  library: 'kutuphane',
  kutuphane: 'kutuphane',
  risk: 'genel',
};

export default function GenelBakisTab({ profile, onNavigateTab }: GenelBakisTabProps) {
  const router = useRouter();
  const { overview, risk, last_meeting } = profile;
  const riskLevel = normalizeCoachRiskLevel(risk?.level ?? risk?.label);

  const handleCardClick = (card: CoachOverviewCard) => {
    if (card.href) {
      router.push(card.href);
      return;
    }
    const tab = TAB_FROM_KEY[card.key];
    if (tab && onNavigateTab) onNavigateTab(tab);
  };

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

      {last_meeting?.date && (
        <div className="student360-last-meeting-card">
          <div className="student360-last-meeting-label">Son görüşme</div>
          <div className="student360-last-meeting-body">
            <strong>
              {new Date(last_meeting.date).toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </strong>
            {last_meeting.konu ? <span> — {last_meeting.konu}</span> : null}
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

      {overview.length > 0 ? (
        <section className="student360-overview-section">
          <h3 className="coach-section-title">Özet</h3>
          <div className="coach-overview-grid">
            {overview.map((card) => (
              <OverviewCard
                key={card.key}
                card={card}
                onClick={
                  card.href || TAB_FROM_KEY[card.key]
                    ? () => handleCardClick(card)
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      ) : (
        <div className="coach-empty-state">
          <div className="coach-empty-icon">📊</div>
          <h4>Genel bakış verisi henüz yok</h4>
          <p>Özet kartlar veri geldikçe burada görünecek.</p>
        </div>
      )}
    </div>
  );
}
