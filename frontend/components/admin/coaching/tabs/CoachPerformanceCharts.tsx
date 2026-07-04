'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { fetchCoachMetrics, type CoachMetrics } from '@/lib/coaching-api';

interface Props {
  coachId: number;
}

/* ───── Basit bar chart renderer (recharts bağımlılığı olmadan) ───── */
function MiniBarChart({ data, colors, maxValue }: { data: { label: string; value: number }[]; colors: string[]; maxValue?: number }) {
  const mx = maxValue ?? Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '160px', padding: '0 4px' }}>
      {data.map((d, i) => (
        <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{d.value}</span>
          <div style={{ width: '100%', maxWidth: '48px', backgroundColor: colors[i % colors.length], borderRadius: '6px 6px 0 0', height: `${Math.max((d.value / mx) * 120, 4)}px`, transition: 'height .6s ease', minHeight: '4px' }} />
          <span style={{ fontSize: '10px', color: '#6b7280', textAlign: 'center', lineHeight: 1.2 }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ value, max, color, size = 100 }: { value: number; max: number; color: string; size?: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset .8s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontSize: '18px', fontWeight: 700, fill: '#111827' }}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

export default function CoachPerformanceCharts({ coachId }: Props) {
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

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ height: '260px', backgroundColor: '#f3f4f6', borderRadius: '12px', animation: 'pulse 2s infinite' }} />
        ))}
      </div>
    );
  }

  const eng = metrics?.engagement;
  const met = metrics?.metrics;
  const charts = metrics?.charts;

  // Engagement Level Badge
  const engLevelMap: Record<string, { label: string; color: string; bg: string }> = {
    excellent: { label: 'Mükemmel', color: '#059669', bg: '#d1fae5' },
    good: { label: 'İyi', color: '#3b82f6', bg: '#dbeafe' },
    moderate: { label: 'Orta', color: '#f59e0b', bg: '#fef3c7' },
    low: { label: 'Düşük', color: '#ef4444', bg: '#fee2e2' },
  };
  const engLevel = engLevelMap[eng?.level || 'moderate'];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
      {/* 1) Engagement Score */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', margin: '0 0 16px', alignSelf: 'flex-start' }}>Etkileşim Puanı</h4>
        <DonutChart value={eng?.score ?? 0} max={100} color={engLevel?.color || '#3b82f6'} size={120} />
        <span style={{ marginTop: '12px', padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: engLevel?.bg, color: engLevel?.color }}>{engLevel?.label}</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '100%', marginTop: '16px' }}>
          <div style={{ textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '8px', padding: '10px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#374151' }}>{eng?.weekly_meetings ?? 0}</div>
            <div style={{ fontSize: '10px', color: '#6b7280' }}>Haftalık Grş.</div>
          </div>
          <div style={{ textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '8px', padding: '10px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#374151' }}>{(eng?.avg_response_days ?? 0).toFixed(1)} gün</div>
            <div style={{ fontSize: '10px', color: '#6b7280' }}>Ort. Yanıt</div>
          </div>
        </div>
      </div>

      {/* 2) Event Dağılımı */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', margin: '0 0 16px' }}>Etkinlik Dağılımı</h4>
        {charts?.event_distribution ? (
          <MiniBarChart
            data={charts.event_distribution.labels.map((l, i) => ({ label: l, value: charts.event_distribution.values[i] }))}
            colors={['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']}
          />
        ) : (
          <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '13px' }}>Veri yok</div>
        )}
      </div>

      {/* 3) Haftalık Trend */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', margin: '0 0 16px' }}>Haftalık Trend</h4>
        {charts?.weekly_trend ? (
          <MiniBarChart
            data={charts.weekly_trend.labels.map((l, i) => ({ label: l, value: charts.weekly_trend.values[i] }))}
            colors={['#6366f1']}
          />
        ) : (
          <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '13px' }}>Veri yok</div>
        )}
      </div>

      {/* 4) Genel Metrikler Özeti */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', margin: '0 0 16px' }}>Genel Metrikler</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { label: 'Toplam Öğrenci', value: met?.total_students ?? 0, icon: '🎓', color: '#3b82f6' },
            { label: 'Aktif Öğrenci', value: met?.active_students ?? 0, icon: '✅', color: '#22c55e' },
            { label: 'Kapasite Kullanımı', value: `${met?.capacity_used ?? 0}%`, icon: '📊', color: '#f59e0b' },
            { label: 'Risk Altında', value: met?.risk_students ?? 0, icon: '⚠️', color: '#ef4444' },
            { label: 'Tamamlama', value: `${Math.round(eng?.completion_rate ?? 0)}%`, icon: '🏆', color: '#8b5cf6' },
          ].map(m => (
            <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
              <span style={{ fontSize: '18px' }}>{m.icon}</span>
              <span style={{ flex: 1, fontSize: '13px', color: '#374151' }}>{m.label}</span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: m.color }}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
    </div>
  );
}
