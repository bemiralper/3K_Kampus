'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { fetchCoachMetrics, type CoachMetrics } from '@/lib/coaching-api';

interface Props {
  coachId: number;
}

interface Goal {
  id: number;
  title: string;
  description: string;
  target: number;
  current: number;
  unit: string;
  deadline: string;
  category: 'student' | 'event' | 'engagement' | 'capacity';
  status: 'on-track' | 'at-risk' | 'completed' | 'behind';
}

const STATUS_MAP: Record<Goal['status'], { label: string; color: string; bg: string }> = {
  completed: { label: 'Tamamlandı', color: '#059669', bg: '#d1fae5' },
  'on-track': { label: 'Yolunda', color: '#3b82f6', bg: '#dbeafe' },
  'at-risk': { label: 'Riskli', color: '#f59e0b', bg: '#fef3c7' },
  behind: { label: 'Geride', color: '#ef4444', bg: '#fee2e2' },
};

const CATEGORY_ICONS: Record<Goal['category'], string> = {
  student: '🎓',
  event: '📅',
  engagement: '🤝',
  capacity: '📊',
};

function buildGoals(metrics: CoachMetrics | null): Goal[] {
  if (!metrics) return [];
  const met = metrics.metrics;
  const eng = metrics.engagement;

  const goals: Goal[] = [
    {
      id: 1,
      title: 'Öğrenci Kapasitesi Hedefi',
      description: 'Kapasite kullanım oranını hedefe ulaştır',
      target: 100,
      current: met?.capacity_used ?? 0,
      unit: '%',
      deadline: 'Bu Dönem',
      category: 'capacity',
      status: (met?.capacity_used ?? 0) >= 90 ? 'completed' : (met?.capacity_used ?? 0) >= 60 ? 'on-track' : 'behind',
    },
    {
      id: 2,
      title: 'Haftalık Görüşme Hedefi',
      description: 'Tüm aktif öğrencilerle en az 1 haftalık görüşme',
      target: met?.active_students ?? 5,
      current: eng?.weekly_meetings ?? 0,
      unit: 'görüşme',
      deadline: 'Bu Hafta',
      category: 'event',
      status: (eng?.weekly_meetings ?? 0) >= (met?.active_students ?? 5) ? 'completed' : (eng?.weekly_meetings ?? 0) >= ((met?.active_students ?? 5) / 2) ? 'on-track' : 'at-risk',
    },
    {
      id: 3,
      title: 'Etkinlik Tamamlama Oranı',
      description: 'Planlanan etkinliklerin tamamlanma oranını %80 üzerine çıkar',
      target: 80,
      current: Math.round(eng?.completion_rate ?? 0),
      unit: '%',
      deadline: 'Bu Ay',
      category: 'engagement',
      status: (eng?.completion_rate ?? 0) >= 80 ? 'completed' : (eng?.completion_rate ?? 0) >= 60 ? 'on-track' : 'at-risk',
    },
    {
      id: 4,
      title: 'Risk Altındaki Öğrencileri Azalt',
      description: 'Yüksek riskli öğrenci sayısını sıfıra indir',
      target: 0,
      current: met?.risk_students ?? 0,
      unit: 'öğrenci',
      deadline: 'Bu Dönem',
      category: 'student',
      status: (met?.risk_students ?? 0) === 0 ? 'completed' : (met?.risk_students ?? 0) <= 2 ? 'on-track' : 'behind',
    },
    {
      id: 5,
      title: 'Etkileşim Puanı',
      description: 'Etkileşim puanını 70 üzerine çıkar',
      target: 70,
      current: eng?.score ?? 0,
      unit: 'puan',
      deadline: 'Bu Ay',
      category: 'engagement',
      status: (eng?.score ?? 0) >= 70 ? 'completed' : (eng?.score ?? 0) >= 50 ? 'on-track' : 'behind',
    },
  ];

  return goals;
}

export default function CoachGoalTracking({ coachId }: Props) {
  const [metrics, setMetrics] = useState<CoachMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCoachMetrics(coachId);
      if (res.success && res.data) setMetrics(res.data);
    } catch { /* */ } finally { setLoading(false); }
  }, [coachId]);

  useEffect(() => { loadData(); }, [loadData]);

  const goals = buildGoals(metrics);
  const completedCount = goals.filter(g => g.status === 'completed').length;
  const overallPct = goals.length > 0 ? Math.round((completedCount / goals.length) * 100) : 0;

  if (loading) {
    return (
      <div style={{ display: 'grid', gap: '16px' }}>
        {[1,2,3].map(i => (
          <div key={i} style={{ height: '120px', backgroundColor: '#f3f4f6', borderRadius: '12px', animation: 'pulse 2s infinite' }} />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Genel İlerleme */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: 0 }}>Hedef Takibi</h3>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>{completedCount}/{goals.length} hedef tamamlandı</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '28px', fontWeight: 700, color: overallPct >= 80 ? '#059669' : overallPct >= 50 ? '#f59e0b' : '#ef4444' }}>%{overallPct}</span>
          </div>
        </div>
        <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '99px', overflow: 'hidden' }}>
          <div style={{ width: `${overallPct}%`, height: '100%', backgroundColor: overallPct >= 80 ? '#059669' : overallPct >= 50 ? '#f59e0b' : '#ef4444', borderRadius: '99px', transition: 'width .6s ease' }} />
        </div>
      </div>

      {/* Hedef Kartları */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {goals.map(goal => {
          const st = STATUS_MAP[goal.status];
          const isReverse = goal.category === 'student' && goal.title.includes('Azalt');
          const pct = isReverse
            ? (goal.current <= goal.target ? 100 : Math.max(100 - ((goal.current / Math.max(goal.target + 5, 1)) * 100), 5))
            : goal.target > 0 ? Math.min(Math.round((goal.current / goal.target) * 100), 100) : 0;

          return (
            <div key={goal.id} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', transition: 'box-shadow .2s' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.06)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                  {CATEGORY_ICONS[goal.category]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{goal.title}</span>
                    <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 10px' }}>{goal.description}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, height: '6px', backgroundColor: '#e5e7eb', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', backgroundColor: st.color, borderRadius: '99px', transition: 'width .5s ease' }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                      {goal.current}{goal.unit === '%' || goal.unit === 'puan' ? '' : ` ${goal.unit}`} / {goal.target}{goal.unit === '%' ? '%' : goal.unit === 'puan' ? ' puan' : ` ${goal.unit}`}
                    </span>
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#9ca3af' }}>Bitiş: {goal.deadline}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
    </div>
  );
}
