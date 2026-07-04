'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { fetchCoachMetrics, type CoachMetrics } from '@/lib/coaching-api';

interface Props {
  coachId: number;
}

interface Activity {
  id: number;
  type: 'meeting' | 'assignment' | 'note' | 'milestone' | 'risk-alert';
  title: string;
  description: string;
  time: string;
  student?: string;
}

const TYPE_CONFIG: Record<Activity['type'], { icon: string; bg: string; border: string; label: string }> = {
  meeting: { icon: '📅', bg: '#dbeafe', border: '#3b82f6', label: 'Görüşme' },
  assignment: { icon: '📝', bg: '#d1fae5', border: '#22c55e', label: 'Atama' },
  note: { icon: '📌', bg: '#fef3c7', border: '#f59e0b', label: 'Not' },
  milestone: { icon: '🏆', bg: '#ede9fe', border: '#8b5cf6', label: 'Başarı' },
  'risk-alert': { icon: '⚠️', bg: '#fee2e2', border: '#ef4444', label: 'Risk Uyarısı' },
};

// Metrics'ten simüle edilmiş aktivite listesi
function generateActivities(metrics: CoachMetrics | null): Activity[] {
  if (!metrics) return [];
  const activities: Activity[] = [];
  let id = 1;

  const students = metrics.risk_students?.map(s => s.student_name) || [];

  // Completed events → meetings
  for (let i = 0; i < Math.min(metrics.metrics?.completed_events || 0, 3); i++) {
    activities.push({
      id: id++,
      type: 'meeting',
      title: 'Birebir Görüşme Tamamlandı',
      description: `${students[i % students.length] || 'Öğrenci'} ile planlanan görüşme başarıyla tamamlandı.`,
      time: `${i + 1} saat önce`,
      student: students[i % students.length],
    });
  }

  // Risk students → risk-alert
  for (const rs of (metrics.risk_students || []).slice(0, 2)) {
    activities.push({
      id: id++,
      type: 'risk-alert',
      title: 'Risk Seviyesi Yükseldi',
      description: `${rs.student_name} — ${rs.reasons?.join(', ') || 'Dikkat gerekiyor'}`,
      time: '3 saat önce',
      student: rs.student_name,
    });
  }

  // Active students → assignment
  if (metrics.metrics?.active_students) {
    activities.push({
      id: id++,
      type: 'assignment',
      title: 'Yeni Öğrenci Ataması',
      description: `${metrics.metrics.active_students} aktif öğrenci koça atandı.`,
      time: 'Bugün',
    });
  }

  // Milestone from engagement
  if ((metrics.engagement?.completion_rate ?? 0) > 70) {
    activities.push({
      id: id++,
      type: 'milestone',
      title: 'Tamamlama Oranı Hedefi Aşıldı',
      description: `%${Math.round(metrics.engagement?.completion_rate ?? 0)} tamamlama oranına ulaşıldı — harika!`,
      time: 'Bu hafta',
    });
  }

  // Note placeholder
  activities.push({
    id: id++,
    type: 'note',
    title: 'Haftalık Değerlendirme',
    description: 'Koçun bu haftaki performans notları güncellendi.',
    time: '2 gün önce',
  });

  return activities.sort(() => 0.5 - Math.random()).slice(0, 8);
}

export default function CoachRecentActivity({ coachId }: Props) {
  const [metrics, setMetrics] = useState<CoachMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Activity['type']>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCoachMetrics(coachId);
      if (res.success && res.data) setMetrics(res.data);
    } catch { /* */ } finally { setLoading(false); }
  }, [coachId]);

  useEffect(() => { loadData(); }, [loadData]);

  const activities = generateActivities(metrics);
  const filtered = filter === 'all' ? activities : activities.filter(a => a.type === filter);

  if (loading) {
    return (
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f3f4f6', animation: 'pulse 2s infinite' }} />
            <div style={{ flex: 1 }}>
              <div style={{ width: '60%', height: '14px', backgroundColor: '#f3f4f6', borderRadius: '6px', marginBottom: '8px', animation: 'pulse 2s infinite' }} />
              <div style={{ width: '90%', height: '12px', backgroundColor: '#f3f4f6', borderRadius: '6px', animation: 'pulse 2s infinite' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: 0 }}>Son Aktiviteler</h3>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Koçun son işlem ve etkinlikleri</p>
          </div>
          <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: '#eff6ff', color: '#3b82f6' }}>{activities.length} aktivite</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['all', 'meeting', 'assignment', 'note', 'milestone', 'risk-alert'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 500, cursor: 'pointer', backgroundColor: filter === f ? '#111827' : '#f3f4f6', color: filter === f ? '#fff' : '#6b7280', transition: 'all .2s' }}>
              {f === 'all' ? 'Tümü' : TYPE_CONFIG[f].label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ padding: '20px 24px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: '14px' }}>Bu kategoride aktivite bulunamadı.</div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Vertical line */}
            <div style={{ position: 'absolute', left: '19px', top: '20px', bottom: '20px', width: '2px', backgroundColor: '#e5e7eb' }} />

            {filtered.map((act, idx) => {
              const cfg = TYPE_CONFIG[act.type];
              return (
                <div key={act.id} style={{ display: 'flex', gap: '16px', position: 'relative', paddingBottom: idx === filtered.length - 1 ? 0 : '24px' }}>
                  {/* Dot */}
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: cfg.bg, border: `2px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0, zIndex: 1 }}>
                    {cfg.icon}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: '10px', padding: '14px 16px', transition: 'background .2s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{act.title}</span>
                      {act.student && (
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: cfg.bg, color: cfg.border, fontWeight: 500 }}>{act.student}</span>
                      )}
                    </div>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 6px', lineHeight: 1.4 }}>{act.description}</p>
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>{act.time}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
    </div>
  );
}
