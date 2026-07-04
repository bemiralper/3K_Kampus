'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchIntelligenceDashboard,
  fetchRiskList,
  type IntelligenceDashboard,
  type RiskStudent,
} from '@/lib/coaching-api';

// Risk Level Color Map
const RISK_COLORS = {
  HIGH: '#ef4444',
  MEDIUM: '#eab308',
  LOW: '#22c55e',
};

// Mini Stat Card Component
function StatCard({
  icon,
  label,
  value,
  color,
  trend,
}: {
  icon: string;
  label: string;
  value: number | string;
  color: string;
  trend?: { value: number; direction: 'up' | 'down' };
}) {
  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '20px' }}>{icon}</span>
        <span style={{ fontSize: '13px', color: '#6b7280' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ fontSize: '28px', fontWeight: 600, color }}>{value}</span>
        {trend && (
          <span
            style={{
              fontSize: '12px',
              color: trend.direction === 'up' ? '#22c55e' : '#ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            {trend.direction === 'up' ? '↑' : '↓'} %{trend.value}
          </span>
        )}
      </div>
    </div>
  );
}

// Mini Donut Chart (SVG based)
function DonutChart({
  data,
  size = 160,
}: {
  data: { labels: string[]; values: number[]; colors: string[] };
  size?: number;
}) {
  const total = data.values.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          fontSize: '14px',
        }}
      >
        Veri yok
      </div>
    );
  }

  const radius = size / 2 - 20;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 30;

  let currentAngle = -90;

  const paths = data.values.map((value, i) => {
    const percentage = value / total;
    const angle = percentage * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    const largeArcFlag = angle > 180 ? 1 : 0;

    currentAngle = endAngle;

    if (percentage === 0) return null;

    return (
      <path
        key={i}
        d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`}
        fill="none"
        stroke={data.colors[i]}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    );
  });

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        {paths}
      </svg>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '24px', fontWeight: 600, color: '#1f2937' }}>{total}</div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>Toplam</div>
      </div>
    </div>
  );
}

// Risk Badge Component
function RiskBadge({ level }: { level: string }) {
  const colorMap: Record<string, { bg: string; text: string; label: string }> = {
    HIGH: { bg: '#fef2f2', text: '#dc2626', label: 'Yüksek' },
    MEDIUM: { bg: '#fefce8', text: '#ca8a04', label: 'Orta' },
    LOW: { bg: '#f0fdf4', text: '#16a34a', label: 'Düşük' },
  };

  const style = colorMap[level] || colorMap.LOW;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '999px',
        backgroundColor: style.bg,
        color: style.text,
        fontSize: '12px',
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: style.text,
        }}
      />
      {style.label}
    </span>
  );
}

// Engagement Score Bar
function EngagementBar({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return '#22c55e';
    if (s >= 60) return '#84cc16';
    if (s >= 40) return '#eab308';
    return '#ef4444';
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <div
        style={{
          flex: 1,
          height: '8px',
          backgroundColor: '#e5e7eb',
          borderRadius: '999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${score}%`,
            height: '100%',
            backgroundColor: getColor(score),
            borderRadius: '999px',
            transition: 'width 0.5s ease',
          }}
        />
      </div>
      <span style={{ fontSize: '14px', fontWeight: 600, color: getColor(score) }}>{score.toFixed(0)}%</span>
    </div>
  );
}

// Main Page Component
export default function AnalyticsPage() {
  const [dashboard, setDashboard] = useState<IntelligenceDashboard | null>(null);
  const [riskStudents, setRiskStudents] = useState<RiskStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [dashboardRes, riskRes] = await Promise.all([fetchIntelligenceDashboard(), fetchRiskList({ limit: 10 })]);

      if (dashboardRes.success && dashboardRes.data) {
        setDashboard(dashboardRes.data);
      } else {
        setError(dashboardRes.error || 'Dashboard verileri yüklenemedi');
      }

      if (riskRes.success && riskRes.data) {
        setRiskStudents(riskRes.data.students);
      }
    } catch (err) {
      setError('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div style={{ padding: '32px' }}>
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '48px',
            textAlign: 'center',
            color: '#6b7280',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
          Veriler yükleniyor...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '32px' }}>
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '24px',
            color: '#dc2626',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
          {error}
          <button
            onClick={loadData}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              backgroundColor: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div style={{ padding: 0 }}>
      {/* Hero Header */}
      <div className="hero-header" style={{ marginBottom: '24px' }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Coaching Intelligence</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Koçluk</span>
              <span>/</span>
              <span>Intelligence Dashboard</span>
            </div>
          </div>
        </div>
        <button
          onClick={loadData}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            backgroundColor: '#3b82f6',
            color: '#fff',
            borderRadius: '8px',
            border: 'none',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Yenile
        </button>
      </div>

      {/* Overview Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <StatCard icon="👨‍🏫" label="Toplam Koç" value={dashboard.overview.total_coaches} color="#3b82f6" />
        <StatCard icon="👥" label="Toplam Öğrenci" value={dashboard.overview.total_students} color="#8b5cf6" />
        <StatCard icon="📋" label="Aktif Atama" value={dashboard.overview.active_assignments} color="#ec4899" />
        <StatCard
          icon="⚡"
          label="Ort. Engagement"
          value={`${dashboard.engagement.average_score.toFixed(0)}%`}
          color="#22c55e"
        />
      </div>

      {/* Main Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
          marginBottom: '24px',
        }}
      >
        {/* Risk Distribution */}
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', color: '#1f2937' }}>Risk Dağılımı</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <DonutChart data={dashboard.risk.distribution} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: RISK_COLORS.LOW }} />
                    <span style={{ fontSize: '14px', color: '#4b5563' }}>Düşük Risk</span>
                  </div>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: RISK_COLORS.LOW }}>{dashboard.risk.low_risk}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: RISK_COLORS.MEDIUM }} />
                    <span style={{ fontSize: '14px', color: '#4b5563' }}>Orta Risk</span>
                  </div>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: RISK_COLORS.MEDIUM }}>
                    {dashboard.risk.medium_risk}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: RISK_COLORS.HIGH }} />
                    <span style={{ fontSize: '14px', color: '#4b5563' }}>Yüksek Risk</span>
                  </div>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: RISK_COLORS.HIGH }}>{dashboard.risk.high_risk}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Events Summary */}
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', color: '#1f2937' }}>Etkinlik Özeti</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Bekleyen Etkinlik</span>
                <span style={{ fontSize: '16px', fontWeight: 600, color: '#f97316' }}>{dashboard.events.pending_count}</span>
              </div>
              <div
                style={{
                  height: '6px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '999px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(dashboard.events.pending_count * 2, 100)}%`,
                    height: '100%',
                    backgroundColor: '#f97316',
                    borderRadius: '999px',
                  }}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Haftalık Görüşme</span>
                <span style={{ fontSize: '16px', fontWeight: 600, color: '#3b82f6' }}>{dashboard.events.weekly_meetings}</span>
              </div>
              <div
                style={{
                  height: '6px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '999px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(dashboard.events.weekly_meetings * 5, 100)}%`,
                    height: '100%',
                    backgroundColor: '#3b82f6',
                    borderRadius: '999px',
                  }}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Tamamlanma Oranı</span>
                <span style={{ fontSize: '16px', fontWeight: 600, color: '#22c55e' }}>
                  %{dashboard.events.completion_rate.toFixed(0)}
                </span>
              </div>
              <EngagementBar score={dashboard.events.completion_rate} />
            </div>
          </div>
        </div>
      </div>

      {/* High Risk Students Table */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937', margin: 0 }}>⚠️ Yüksek Riskli Öğrenciler</h3>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>{riskStudents.length} öğrenci</span>
        </div>

        {riskStudents.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✅</div>
            Yüksek riskli öğrenci bulunmuyor
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>
                  Öğrenci
                </th>
                <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>
                  Risk Skoru
                </th>
                <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>
                  Risk Seviyesi
                </th>
                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>
                  Nedenler
                </th>
              </tr>
            </thead>
            <tbody>
              {riskStudents.map((student) => (
                <tr key={student.assignment_id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ fontWeight: 500, color: '#1f2937' }}>{student.student_name}</div>
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor:
                          student.risk_score >= 70
                            ? '#fef2f2'
                            : student.risk_score >= 40
                            ? '#fefce8'
                            : '#f0fdf4',
                        color:
                          student.risk_score >= 70
                            ? '#dc2626'
                            : student.risk_score >= 40
                            ? '#ca8a04'
                            : '#16a34a',
                        fontWeight: 600,
                        fontSize: '14px',
                      }}
                    >
                      {student.risk_score}
                    </span>
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                    <RiskBadge level={student.risk_level} />
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {student.reasons.slice(0, 2).map((reason, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: '12px',
                            padding: '4px 8px',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '4px',
                            color: '#4b5563',
                          }}
                        >
                          {reason}
                        </span>
                      ))}
                      {student.reasons.length > 2 && (
                        <span
                          style={{
                            fontSize: '12px',
                            padding: '4px 8px',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '4px',
                            color: '#6b7280',
                          }}
                        >
                          +{student.reasons.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Engagement Warning */}
      {dashboard.engagement.coaches_below_50 > 0 && (
        <div
          style={{
            marginTop: '24px',
            backgroundColor: '#fefce8',
            border: '1px solid #fde047',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '20px' }}>⚡</span>
          <div>
            <div style={{ fontWeight: 500, color: '#854d0e' }}>Düşük Engagement Uyarısı</div>
            <div style={{ fontSize: '14px', color: '#a16207' }}>
              {dashboard.engagement.coaches_below_50} koçun engagement skoru %50&apos;nin altında.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
