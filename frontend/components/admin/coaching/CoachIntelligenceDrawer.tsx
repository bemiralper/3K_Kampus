'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { fetchCoachMetrics, type CoachMetrics } from '@/lib/coaching-api';

interface CoachIntelligenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  coachId: number | null;
}

// Simple Bar Chart (SVG based)
function SimpleBarChart({
  data,
  height = 120,
}: {
  data: { labels: string[]; values: number[] };
  height?: number;
}) {
  const maxVal = Math.max(...data.values, 1);
  const barWidth = 100 / data.labels.length;

  return (
    <div style={{ width: '100%', height }}>
      <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
        {data.values.map((val, i) => {
          const barHeight = (val / maxVal) * (height - 24);
          const x = i * barWidth + barWidth * 0.1;
          const width = barWidth * 0.8;
          
          return (
            <g key={i}>
              <rect
                x={`${x}%`}
                y={height - barHeight - 20}
                width={`${width}%`}
                height={barHeight}
                rx="3"
                fill="#3b82f6"
                opacity={0.8}
              />
              <text
                x={`${x + width / 2}%`}
                y={height - 4}
                textAnchor="middle"
                fontSize="8"
                fill="#6b7280"
              >
                {data.labels[i]}
              </text>
              <text
                x={`${x + width / 2}%`}
                y={height - barHeight - 26}
                textAnchor="middle"
                fontSize="8"
                fill="#374151"
                fontWeight="600"
              >
                {val}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Engagement Level Badge
function EngagementLevelBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    excellent: { bg: '#dcfce7', text: '#16a34a', label: 'Mükemmel' },
    good: { bg: '#dbeafe', text: '#2563eb', label: 'İyi' },
    moderate: { bg: '#fef3c7', text: '#d97706', label: 'Orta' },
    low: { bg: '#fee2e2', text: '#dc2626', label: 'Düşük' },
  };

  const style = config[level] || config.moderate;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 12px',
        borderRadius: '999px',
        backgroundColor: style.bg,
        color: style.text,
        fontSize: '13px',
        fontWeight: 600,
      }}
    >
      {style.label}
    </span>
  );
}

// Metric Item
function MetricItem({
  label,
  value,
  icon,
  color = '#1f2937',
}: {
  label: string;
  value: number | string;
  icon: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 0',
        borderBottom: '1px solid #f3f4f6',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>{icon}</span>
        <span style={{ fontSize: '14px', color: '#6b7280' }}>{label}</span>
      </div>
      <span style={{ fontSize: '16px', fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

export default function CoachIntelligenceDrawer({
  isOpen,
  onClose,
  coachId,
}: CoachIntelligenceDrawerProps) {
  const [metrics, setMetrics] = useState<CoachMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!coachId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetchCoachMetrics(coachId);
      if (response.success && response.data) {
        setMetrics(response.data);
      } else {
        setError(response.error || 'Metrikler yüklenemedi');
      }
    } catch (err) {
      setError('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    if (isOpen && coachId) {
      loadData();
    }
  }, [isOpen, coachId, loadData]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          zIndex: 999,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '520px',
          height: '100%',
          backgroundColor: '#fff',
          boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#fff' }}>
              🧠 Koç Intelligence
            </h2>
            {metrics && (
              <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                {metrics.coach.ad} {metrics.coach.soyad}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
              <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
              Yükleniyor...
            </div>
          ) : error ? (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '16px',
                color: '#dc2626',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          ) : metrics ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Engagement Score */}
              <div
                style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '48px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>
                  {metrics.engagement.score.toFixed(0)}
                  <span style={{ fontSize: '24px', color: '#6b7280' }}>%</span>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <EngagementLevelBadge level={metrics.engagement.level} />
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>Engagement Skoru</div>
              </div>

              {/* Key Metrics */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
                  Temel Metrikler
                </h3>
                <div
                  style={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '4px 16px',
                  }}
                >
                  <MetricItem icon="👥" label="Toplam Öğrenci" value={metrics.metrics.total_students} />
                  <MetricItem
                    icon="✅"
                    label="Aktif Öğrenci"
                    value={metrics.metrics.active_students}
                    color="#22c55e"
                  />
                  <MetricItem
                    icon="⏳"
                    label="Bekleyen Etkinlik"
                    value={metrics.metrics.pending_events}
                    color="#f97316"
                  />
                  <MetricItem
                    icon="✓"
                    label="Tamamlanan Etkinlik"
                    value={metrics.metrics.completed_events}
                    color="#8b5cf6"
                  />
                  <MetricItem
                    icon="⚠️"
                    label="Riskli Öğrenci"
                    value={metrics.metrics.risk_students}
                    color="#ef4444"
                  />
                  <MetricItem
                    icon="📊"
                    label="Kapasite Kullanımı"
                    value={`${metrics.metrics.capacity_used}%`}
                    color="#3b82f6"
                  />
                </div>
              </div>

              {/* Engagement Details */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
                  Engagement Detayları
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      backgroundColor: '#eff6ff',
                      borderRadius: '8px',
                      padding: '16px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '24px', fontWeight: 600, color: '#2563eb' }}>
                      {metrics.engagement.weekly_meetings}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Haftalık Görüşme</div>
                  </div>
                  <div
                    style={{
                      backgroundColor: '#f0fdf4',
                      borderRadius: '8px',
                      padding: '16px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '24px', fontWeight: 600, color: '#16a34a' }}>
                      %{metrics.engagement.completion_rate.toFixed(0)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Tamamlanma</div>
                  </div>
                  <div
                    style={{
                      backgroundColor: '#fef3c7',
                      borderRadius: '8px',
                      padding: '16px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '24px', fontWeight: 600, color: '#d97706' }}>
                      {metrics.engagement.avg_response_days.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Ort. Yanıt (gün)</div>
                  </div>
                </div>
              </div>

              {/* Weekly Trend Chart */}
              {metrics.charts.weekly_trend.values.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
                    Haftalık Etkinlik Trendi
                  </h3>
                  <div
                    style={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '16px',
                    }}
                  >
                    <SimpleBarChart data={metrics.charts.weekly_trend} />
                  </div>
                </div>
              )}

              {/* Risk Students */}
              {metrics.risk_students.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
                    ⚠️ Riskli Öğrenciler
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {metrics.risk_students.map((student) => (
                      <div
                        key={student.assignment_id}
                        style={{
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: '8px',
                          padding: '12px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 500, color: '#1f2937' }}>{student.student_name}</div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                            {student.reasons.slice(0, 2).join(', ')}
                          </div>
                        </div>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: '#dc2626',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontSize: '14px',
                          }}
                        >
                          {student.risk_score}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
