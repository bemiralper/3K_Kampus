'use client';

import React from 'react';
import { type WeeklySummary, LOAD_LEVEL_META } from '@/lib/study-program-api';

/**
 * Haftalık özet kartı.
 * Haftanın sonunda otomatik gösterilen mini rapor.
 */

interface Props {
  summary: WeeklySummary | null;
  loading: boolean;
}

export default function WeeklySummaryCard({ summary, loading }: Props) {
  if (loading) {
    return (
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', textAlign: 'center', color: '#6b7280' }}>
        Yükleniyor...
      </div>
    );
  }
  if (!summary) return null;

  const metrics = [
    { label: 'Toplam Soru', value: summary.total_questions, icon: '📝' },
    { label: 'Tamamlanma', value: `%${summary.completion_percent}`, icon: '✅' },
    { label: 'Maks. Seri', value: `${summary.max_streak} gün`, icon: '🔥' },
  ];

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #667eea, #764ba2)',
        color: '#fff',
      }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>📊 Haftalık Özet</h3>
        <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
          {summary.week_start} — {summary.week_end}
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Üst metrikler */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
          {metrics.map((m) => (
            <div key={m.label} style={{ textAlign: 'center', padding: '10px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
              <div style={{ fontSize: '18px', marginBottom: '2px' }}>{m.icon}</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>{m.value}</div>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* En iyi / en kötü gün */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          {summary.best_day && (
            <div style={{ padding: '10px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '10px', color: '#059669', fontWeight: 600 }}>🌟 En Güçlü Gün</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>{summary.best_day.weekday}</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>%{summary.best_day.completion} · {summary.best_day.questions} soru</div>
            </div>
          )}
          {summary.worst_day && (
            <div style={{ padding: '10px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: 600 }}>⚡ Geliştir</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>{summary.worst_day.weekday}</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>%{summary.worst_day.completion} · {summary.worst_day.questions} soru</div>
            </div>
          )}
        </div>

        {/* Günlük mini bar chart */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Günlük Dağılım</div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '60px' }}>
            {summary.days.map((d, i) => {
              const maxQ = Math.max(...summary.days.map((dd) => dd.questions), 1);
              const h = Math.max((d.questions / maxQ) * 52, 4);
              const loadMeta = LOAD_LEVEL_META[d.load] || LOAD_LEVEL_META.IDEAL;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <div style={{
                    width: '100%',
                    height: `${h}px`,
                    backgroundColor: loadMeta.color,
                    borderRadius: '4px 4px 0 0',
                    transition: 'height .3s',
                    opacity: 0.8,
                  }} />
                  <span style={{ fontSize: '9px', color: '#6b7280' }}>
                    {d.weekday.slice(0, 3)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rozetler */}
        {summary.badges.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Kazanılan Rozetler</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {summary.badges.map((b, i) => (
                <span key={i} style={{
                  padding: '4px 10px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  backgroundColor: '#fefce8',
                  border: '1px solid #fde68a',
                }}>
                  {b.icon} {b.title}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
