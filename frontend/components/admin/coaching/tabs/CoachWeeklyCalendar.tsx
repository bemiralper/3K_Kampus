'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { fetchCoachMetrics, type CoachMetrics } from '@/lib/coaching-api';

interface Props {
  coachId: number;
}

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const HOURS = Array.from({ length: 10 }, (_, i) => `${i + 8}:00`); // 08:00 – 17:00

// Simüle edilmiş takvim verisi — backend event API geldiğinde değişecek
function generateMockEvents(metrics: CoachMetrics | null) {
  if (!metrics) return [];
  const events: { day: number; hour: number; title: string; type: string; student?: string }[] = [];
  const types = ['meeting', 'follow-up', 'assessment', 'group'];
  const students = metrics.risk_students?.map(s => s.student_name) || ['Öğrenci'];

  // metrics'teki event dağılımından yola çıkarak
  const count = Math.min((metrics.metrics?.pending_events || 0) + (metrics.metrics?.completed_events || 0), 12);
  for (let i = 0; i < Math.max(count, 4); i++) {
    events.push({
      day: i % 5,
      hour: (i * 2) % 10,
      title: i % 3 === 0 ? 'Birebir Görüşme' : i % 3 === 1 ? 'Takip Toplantısı' : 'Değerlendirme',
      type: types[i % types.length],
      student: students[i % students.length],
    });
  }
  return events;
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  meeting: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  'follow-up': { bg: '#d1fae5', border: '#22c55e', text: '#065f46' },
  assessment: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  group: { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
};

export default function CoachWeeklyCalendar({ coachId }: Props) {
  const [metrics, setMetrics] = useState<CoachMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCoachMetrics(coachId);
      if (res.success && res.data) setMetrics(res.data);
    } catch { /* */ } finally { setLoading(false); }
  }, [coachId]);

  useEffect(() => { loadData(); }, [loadData]);

  const events = generateMockEvents(metrics);

  if (loading) {
    return (
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ height: '300px', backgroundColor: '#f3f4f6', borderRadius: '10px', animation: 'pulse 2s infinite' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: 0 }}>Haftalık Takvim</h3>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Bu haftaki görüşme ve etkinlik planı</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { type: 'meeting', label: 'Birebir' },
            { type: 'follow-up', label: 'Takip' },
            { type: 'assessment', label: 'Değerlendirme' },
            { type: 'group', label: 'Grup' },
          ].map(l => (
            <div key={l.type} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#6b7280' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: TYPE_COLORS[l.type].border }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>

      {/* Özet İstatistikler */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', padding: '16px 24px', backgroundColor: '#f9fafb' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#3b82f6' }}>{metrics?.engagement?.weekly_meetings ?? 0}</div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>Haftalık Görüşme</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>{metrics?.metrics?.completed_events ?? 0}</div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>Tamamlanan</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>{metrics?.metrics?.pending_events ?? 0}</div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>Bekleyen</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#8b5cf6' }}>{Math.round((metrics?.engagement?.completion_rate ?? 0))}%</div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>Tamamlama Oranı</div>
        </div>
      </div>

      {/* Takvim Grid */}
      <div style={{ padding: '20px 24px', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(5, 1fr)', gap: '1px', minWidth: '700px' }}>
          {/* Başlıklar */}
          <div />
          {DAYS.slice(0, 5).map((day, di) => (
            <div key={day} onClick={() => setSelectedDay(selectedDay === di ? null : di)}
              style={{ padding: '10px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: selectedDay === di ? '#3b82f6' : '#374151', cursor: 'pointer', borderBottom: `2px solid ${selectedDay === di ? '#3b82f6' : '#e5e7eb'}`, transition: 'all .2s' }}>
              {day}
            </div>
          ))}

          {/* Saat satırları */}
          {HOURS.map((hour, hi) => (
            <React.Fragment key={hour}>
              <div style={{ padding: '8px 4px', fontSize: '11px', color: '#9ca3af', textAlign: 'right', borderTop: '1px solid #f3f4f6', minHeight: '48px', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
                {hour}
              </div>
              {DAYS.slice(0, 5).map((_, di) => {
                const cellEvents = events.filter(e => e.day === di && e.hour === hi);
                return (
                  <div key={`${hi}-${di}`} style={{ padding: '4px', borderTop: '1px solid #f3f4f6', borderLeft: '1px solid #f3f4f6', minHeight: '48px', backgroundColor: selectedDay === di ? '#f8fafc' : 'transparent', transition: 'background .2s' }}>
                    {cellEvents.map((ev, ei) => {
                      const c = TYPE_COLORS[ev.type] || TYPE_COLORS.meeting;
                      return (
                        <div key={ei} style={{ backgroundColor: c.bg, borderLeft: `3px solid ${c.border}`, borderRadius: '4px', padding: '4px 6px', marginBottom: '2px', cursor: 'pointer', transition: 'transform .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
                          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: c.text, lineHeight: 1.3 }}>{ev.title}</div>
                          {ev.student && <div style={{ fontSize: '10px', color: c.text, opacity: .7, marginTop: '1px' }}>{ev.student}</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <style jsx>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
    </div>
  );
}
