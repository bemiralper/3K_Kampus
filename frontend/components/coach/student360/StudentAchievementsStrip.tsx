'use client';

import { useEffect, useState } from 'react';
import { getContextHeaders } from '@/lib/api';

interface CoachStudentAchievementsPreview {
  has_data: boolean;
  level: {
    level: number;
    max_level?: number;
    total_xp: number;
    rank_title: string;
    rank_icon: string;
  };
  student_track?: {
    code: string;
    label: string;
    short_label: string;
  };
  monthly_season?: {
    month_label: string;
    completed_quests_count: number;
    total_quests_count: number;
    season_medal_unlocked: boolean;
  };
  summary?: {
    unlocked_count: number;
    total_count: number;
    streak_days: number;
    total_focus_minutes: number;
    total_season_questions?: number;
  };
  unlocked_badges: Array<{
    code: string;
    icon: string;
    title: string;
    earned_at: string | null;
  }>;
  closest_target?: {
    icon: string;
    title: string;
    progress_percent: number;
    motivation_text: string;
  } | null;
}

export default function StudentAchievementsStrip({ studentId }: { studentId?: number }) {
  const [data, setData] = useState<CoachStudentAchievementsPreview | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...getContextHeaders(),
    };

    fetch(`/api/student/coach-achievements/${studentId}/`, {
      credentials: 'include',
      headers,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json?.success && json.data?.has_data) {
          setData(json.data as CoachStudentAchievementsPreview);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (!data || !data.summary) return null;

  return (
    <section
      className="student360-overview-section"
      style={{
        marginTop: 18,
        padding: '14px 16px',
        borderRadius: 14,
        border: '1px solid #fde68a',
        background: 'linear-gradient(135deg, #fffbeb 0%, #fefce8 100%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>{data.level.rank_icon}</span>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                flexWrap: 'wrap',
                fontSize: 13.5,
                fontWeight: 700,
                color: '#92400e',
              }}
            >
              <span>
                Portal Seviye {data.level.level}/{data.level.max_level || 50} ·{' '}
                {data.level.rank_title} ({data.level.total_xp} XP)
              </span>
              {data.student_track ? (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: '#fef3c7',
                    border: '1px solid #f59e0b',
                    fontSize: 11,
                    color: '#92400e',
                  }}
                >
                  🎯 {data.student_track.short_label}
                </span>
              ) : null}
              {data.monthly_season ? (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: data.monthly_season.season_medal_unlocked ? '#dcfce7' : '#ffffff',
                    border: '1px solid #fcd34d',
                    fontSize: 11,
                    color: data.monthly_season.season_medal_unlocked ? '#166534' : '#92400e',
                  }}
                >
                  {data.monthly_season.season_medal_unlocked
                    ? `🏅 ${data.monthly_season.month_label} Şampiyonu`
                    : `📅 ${data.monthly_season.month_label}: ${data.monthly_season.completed_quests_count}/${data.monthly_season.total_quests_count}`}
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 3 }}>
              🔥 {data.summary.streak_days} gün seri · ⏱ {data.summary.total_focus_minutes} dk odak ·{' '}
              🏹 {(data.summary.total_season_questions ?? 0).toLocaleString('tr-TR')} soru · 🏅{' '}
              {data.summary.unlocked_count}/{data.summary.total_count} rozet açıldı
            </div>
          </div>
        </div>

        {data.unlocked_badges.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {data.unlocked_badges.slice(0, 5).map((b) => (
              <span
                key={b.code}
                title={`${b.title}${b.earned_at ? ` (${b.earned_at})` : ''}`}
                style={{
                  padding: '4px 9px',
                  borderRadius: 999,
                  background: '#ffffff',
                  border: '1px solid #fcd34d',
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#78350f',
                }}
              >
                {b.icon} {b.title}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
