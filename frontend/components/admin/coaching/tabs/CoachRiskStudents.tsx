'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { fetchRiskList, type RiskStudent } from '@/lib/coaching-api';

interface Props {
  coachId: number;
}

const RISK_LEVEL_MAP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  high: { label: 'Yüksek', color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
  critical: { label: 'Kritik', color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
  medium: { label: 'Orta', color: '#f59e0b', bg: '#fef3c7', border: '#fcd34d' },
  low: { label: 'Düşük', color: '#22c55e', bg: '#d1fae5', border: '#86efac' },
};

export default function CoachRiskStudents({ coachId }: Props) {
  const [students, setStudents] = useState<RiskStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'score' | 'name'>('score');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRiskList({ coach_id: coachId, limit: 20 });
      if (res.success && res.data) setStudents(res.data.students || []);
      else setError(res.error || 'Veri yüklenemedi');
    } catch { setError('Bir hata oluştu'); } finally { setLoading(false); }
  }, [coachId]);

  useEffect(() => { loadData(); }, [loadData]);

  const sorted = [...students].sort((a, b) => {
    if (sortBy === 'score') return b.risk_score - a.risk_score;
    return a.student_name.localeCompare(b.student_name, 'tr');
  });

  const highCount = students.filter(s => s.risk_level === 'high' || s.risk_level === 'critical').length;
  const medCount = students.filter(s => s.risk_level === 'medium').length;

  if (loading) {
    return (
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
        {[1,2,3].map(i => (
          <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#f3f4f6', animation: 'pulse 2s infinite' }} />
            <div style={{ flex: 1 }}>
              <div style={{ width: '40%', height: '14px', backgroundColor: '#f3f4f6', borderRadius: '6px', marginBottom: '8px', animation: 'pulse 2s infinite' }} />
              <div style={{ width: '70%', height: '12px', backgroundColor: '#f3f4f6', borderRadius: '6px', animation: 'pulse 2s infinite' }} />
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
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: 0 }}>Risk Altındaki Öğrenciler</h3>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Koçun takibindeki risk altındaki öğrenciler</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {highCount > 0 && (
              <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: '#fee2e2', color: '#dc2626' }}>
                {highCount} Yüksek Risk
              </span>
            )}
            {medCount > 0 && (
              <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: '#fef3c7', color: '#f59e0b' }}>
                {medCount} Orta Risk
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setSortBy('score')} style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 500, cursor: 'pointer', backgroundColor: sortBy === 'score' ? '#111827' : '#f3f4f6', color: sortBy === 'score' ? '#fff' : '#6b7280', transition: 'all .2s' }}>
            Risk Puanına Göre
          </button>
          <button onClick={() => setSortBy('name')} style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 500, cursor: 'pointer', backgroundColor: sortBy === 'name' ? '#111827' : '#f3f4f6', color: sortBy === 'name' ? '#fff' : '#6b7280', transition: 'all .2s' }}>
            İsme Göre
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '16px 24px', color: '#dc2626', fontSize: '13px' }}>{error}</div>}

      {/* İçerik */}
      <div style={{ padding: '16px 24px' }}>
        {sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 16px' }}>🎉</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '6px' }}>Risk Altında Öğrenci Yok</div>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>Bu koçun takibindeki tüm öğrenciler güvenli bölgede.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sorted.map(student => {
              const rl = RISK_LEVEL_MAP[student.risk_level] || RISK_LEVEL_MAP.medium;
              const pct = Math.min(student.risk_score, 100);
              return (
                <div key={student.assignment_id} style={{ border: `1px solid ${rl.border}`, borderRadius: '10px', padding: '16px', backgroundColor: '#fff', transition: 'box-shadow .2s, transform .2s' }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.06)'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateX(0)'; }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
                    {/* Avatar */}
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: rl.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700, color: rl.color, flexShrink: 0 }}>
                      {student.student_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{student.student_name}</span>
                        <span style={{ padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, backgroundColor: rl.bg, color: rl.color }}>{rl.label}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>ID: {student.student_id}</div>
                    </div>
                    {/* Risk Skor Badge */}
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: rl.color }}>{student.risk_score}</div>
                      <div style={{ fontSize: '10px', color: '#9ca3af' }}>Risk Puanı</div>
                    </div>
                  </div>

                  {/* Risk bar */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', backgroundColor: rl.color, borderRadius: '99px', transition: 'width .5s ease' }} />
                    </div>
                  </div>

                  {/* Nedenler */}
                  {student.reasons && student.reasons.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {student.reasons.map((reason, ri) => (
                        <span key={ri} style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '11px', backgroundColor: '#f3f4f6', color: '#6b7280' }}>
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}
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
