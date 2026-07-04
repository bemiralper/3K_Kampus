'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  fetchPredictiveDashboard,
  fetchHighRiskStudents,
  PredictiveDashboard,
  HighRiskStudent,
} from '@/lib/coaching-api';
import StudentPredictiveDrawer from '@/components/admin/coaching/StudentPredictiveDrawer';
import CoachMatchDrawer from '@/components/admin/coaching/CoachMatchDrawer';

// Styles
const styles = {
  container: {
    padding: '24px',
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#0f172a',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#64748b',
    marginTop: '4px',
  },
  breadcrumb: {
    display: 'flex',
    gap: '8px',
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '16px',
  },
  breadcrumbLink: {
    color: '#3b82f6',
    textDecoration: 'none',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    border: '1px solid #e2e8f0',
  },
  statLabel: {
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '8px',
    fontWeight: 500,
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#0f172a',
  },
  statIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px',
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: '24px',
    marginBottom: '24px',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    border: '1px solid #e2e8f0',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#0f172a',
    marginBottom: '16px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  th: {
    textAlign: 'left' as const,
    padding: '12px 16px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748b',
    borderBottom: '1px solid #e2e8f0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  td: {
    padding: '16px',
    borderBottom: '1px solid #f1f5f9',
    fontSize: '14px',
    color: '#334155',
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 600,
    display: 'inline-block',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e2e8f0',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  actionBtn: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    color: '#334155',
    marginRight: '8px',
  },
  pieChart: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  legend: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
  },
  legendDot: {
    width: '12px',
    height: '12px',
    borderRadius: '3px',
  },
};

// Level renkleri
const levelColors: Record<string, { bg: string; text: string }> = {
  critical: { bg: '#fef2f2', text: '#dc2626' },
  high: { bg: '#fff7ed', text: '#ea580c' },
  medium: { bg: '#fefce8', text: '#ca8a04' },
  low: { bg: '#f0fdf4', text: '#16a34a' },
};

// Priority renkleri
const priorityColors: Record<string, { bg: string; text: string }> = {
  urgent: { bg: '#fef2f2', text: '#dc2626' },
  high: { bg: '#fff7ed', text: '#ea580c' },
  normal: { bg: '#f0f9ff', text: '#0284c7' },
  low: { bg: '#f0fdf4', text: '#16a34a' },
};

export default function PredictiveDashboardPage() {
  const [dashboard, setDashboard] = useState<PredictiveDashboard | null>(null);
  const [highRiskStudents, setHighRiskStudents] = useState<HighRiskStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Drawer states
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);
  const [showPredictiveDrawer, setShowPredictiveDrawer] = useState(false);
  const [showMatchDrawer, setShowMatchDrawer] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [dashboardRes, highRiskRes] = await Promise.all([
        fetchPredictiveDashboard(),
        fetchHighRiskStudents({ limit: 20 }),
      ]);
      
      if (dashboardRes.success && dashboardRes.data) {
        setDashboard(dashboardRes.data);
      }
      
      if (highRiskRes.success && highRiskRes.data) {
        setHighRiskStudents(highRiskRes.data.students || []);
      }
      
      setError(null);
    } catch (err) {
      setError('Veriler yüklenirken hata oluştu');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openPredictiveDrawer = (studentId: number) => {
    setSelectedStudent(studentId);
    setShowPredictiveDrawer(true);
  };

  const openMatchDrawer = (studentId: number) => {
    setSelectedStudent(studentId);
    setShowMatchDrawer(true);
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <div style={{ fontSize: '18px', color: '#64748b' }}>Yükleniyor...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: 'center', padding: '60px', color: '#ef4444' }}>
          {error}
          <button onClick={loadData} style={{ ...styles.actionBtn, marginTop: '16px' }}>
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Breadcrumb */}
      <div style={styles.breadcrumb}>
        <Link href="/admin/coaching" style={styles.breadcrumbLink}>Koçluk</Link>
        <span>/</span>
        <span>Tahminsel Analitik</span>
      </div>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🧠 Tahminsel Analitik Dashboard</h1>
          <p style={styles.subtitle}>AI destekli öğrenci dropout riski ve başarı tahminleri</p>
        </div>
        <button
          onClick={loadData}
          style={{
            ...styles.actionBtn,
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
          }}
        >
          🔄 Yenile
        </button>
      </div>

      {/* Stats Grid */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={{ ...styles.statIcon, backgroundColor: '#eff6ff' }}>
            <span style={{ fontSize: '20px' }}>👥</span>
          </div>
          <div style={styles.statLabel}>Toplam Öğrenci</div>
          <div style={styles.statValue}>{dashboard?.overview.total_students || 0}</div>
        </div>

        <div style={styles.statCard}>
          <div style={{ ...styles.statIcon, backgroundColor: '#fef2f2' }}>
            <span style={{ fontSize: '20px' }}>🚨</span>
          </div>
          <div style={styles.statLabel}>Kritik Risk</div>
          <div style={{ ...styles.statValue, color: '#dc2626' }}>
            {dashboard?.overview.critical_count || 0}
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={{ ...styles.statIcon, backgroundColor: '#fff7ed' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
          </div>
          <div style={styles.statLabel}>Müdahale Gereken</div>
          <div style={{ ...styles.statValue, color: '#ea580c' }}>
            {dashboard?.overview.intervention_required || 0}
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={{ ...styles.statIcon, backgroundColor: '#f0fdf4' }}>
            <span style={{ fontSize: '20px' }}>📊</span>
          </div>
          <div style={styles.statLabel}>Ort. Başarı Skoru</div>
          <div style={{ ...styles.statValue, color: '#16a34a' }}>
            {dashboard?.overview.avg_success_score || 0}
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={{ ...styles.statIcon, backgroundColor: '#fefce8' }}>
            <span style={{ fontSize: '20px' }}>📉</span>
          </div>
          <div style={styles.statLabel}>Ort. Dropout Skoru</div>
          <div style={styles.statValue}>
            {dashboard?.overview.avg_dropout_score || 0}
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={{ ...styles.statIcon, backgroundColor: '#f0f9ff' }}>
            <span style={{ fontSize: '20px' }}>💪</span>
          </div>
          <div style={styles.statLabel}>Ort. Etkileşim</div>
          <div style={styles.statValue}>
            {dashboard?.overview.avg_engagement || 0}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div style={styles.chartsGrid}>
        {/* Risk Dağılımı */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>📊 Risk Dağılımı</h3>
          <div style={styles.pieChart}>
            <svg width="160" height="160" viewBox="0 0 160 160">
              {dashboard?.risk_distribution && (() => {
                const values = dashboard.risk_distribution.values;
                const colors = dashboard.risk_distribution.colors;
                const total = values.reduce((a, b) => a + b, 0) || 1;
                let cumulativePercentage = 0;
                
                return values.map((value, index) => {
                  const percentage = (value / total) * 100;
                  const startAngle = (cumulativePercentage / 100) * 360;
                  const endAngle = ((cumulativePercentage + percentage) / 100) * 360;
                  cumulativePercentage += percentage;
                  
                  const startRad = (startAngle - 90) * (Math.PI / 180);
                  const endRad = (endAngle - 90) * (Math.PI / 180);
                  const largeArc = percentage > 50 ? 1 : 0;
                  
                  const x1 = 80 + 70 * Math.cos(startRad);
                  const y1 = 80 + 70 * Math.sin(startRad);
                  const x2 = 80 + 70 * Math.cos(endRad);
                  const y2 = 80 + 70 * Math.sin(endRad);
                  
                  if (percentage === 0) return null;
                  
                  return (
                    <path
                      key={index}
                      d={`M 80 80 L ${x1} ${y1} A 70 70 0 ${largeArc} 1 ${x2} ${y2} Z`}
                      fill={colors[index]}
                    />
                  );
                });
              })()}
              <circle cx="80" cy="80" r="35" fill="white" />
            </svg>
            <div style={styles.legend}>
              {dashboard?.risk_distribution.labels.map((label, index) => (
                <div key={index} style={styles.legendItem}>
                  <div
                    style={{
                      ...styles.legendDot,
                      backgroundColor: dashboard.risk_distribution.colors[index],
                    }}
                  />
                  <span>{label}: {dashboard.risk_distribution.values[index]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Başarı Dağılımı */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>🎯 Başarı Dağılımı</h3>
          <div style={styles.pieChart}>
            <svg width="160" height="160" viewBox="0 0 160 160">
              {dashboard?.success_distribution && (() => {
                const values = dashboard.success_distribution.values;
                const colors = dashboard.success_distribution.colors;
                const total = values.reduce((a, b) => a + b, 0) || 1;
                let cumulativePercentage = 0;
                
                return values.map((value, index) => {
                  const percentage = (value / total) * 100;
                  const startAngle = (cumulativePercentage / 100) * 360;
                  const endAngle = ((cumulativePercentage + percentage) / 100) * 360;
                  cumulativePercentage += percentage;
                  
                  const startRad = (startAngle - 90) * (Math.PI / 180);
                  const endRad = (endAngle - 90) * (Math.PI / 180);
                  const largeArc = percentage > 50 ? 1 : 0;
                  
                  const x1 = 80 + 70 * Math.cos(startRad);
                  const y1 = 80 + 70 * Math.sin(startRad);
                  const x2 = 80 + 70 * Math.cos(endRad);
                  const y2 = 80 + 70 * Math.sin(endRad);
                  
                  if (percentage === 0) return null;
                  
                  return (
                    <path
                      key={index}
                      d={`M 80 80 L ${x1} ${y1} A 70 70 0 ${largeArc} 1 ${x2} ${y2} Z`}
                      fill={colors[index]}
                    />
                  );
                });
              })()}
              <circle cx="80" cy="80" r="35" fill="white" />
            </svg>
            <div style={styles.legend}>
              {dashboard?.success_distribution.labels.map((label, index) => (
                <div key={index} style={styles.legendItem}>
                  <div
                    style={{
                      ...styles.legendDot,
                      backgroundColor: dashboard.success_distribution.colors[index],
                    }}
                  />
                  <span>{label}: {dashboard.success_distribution.values[index]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* High Risk Table */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>🚨 Yüksek Riskli Öğrenciler</h3>
        {highRiskStudents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <span style={{ fontSize: '48px' }}>✅</span>
            <p style={{ marginTop: '16px' }}>Yüksek riskli öğrenci bulunmuyor</p>
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Öğrenci</th>
                <th style={styles.th}>Dropout Skoru</th>
                <th style={styles.th}>Seviye</th>
                <th style={styles.th}>Başarı</th>
                <th style={styles.th}>Etkileşim</th>
                <th style={styles.th}>Öncelik</th>
                <th style={styles.th}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {highRiskStudents.map((student) => {
                const levelStyle = levelColors[student.dropout_level] || levelColors.medium;
                const priorityStyle = priorityColors[student.weekly_plan?.priority_level || 'normal'];
                
                return (
                  <tr key={student.student_id}>
                    <td style={styles.td}>
                      <div style={{ fontWeight: 600 }}>{student.student_name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        ID: {student.student_id}
                      </div>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={styles.progressBar}>
                          <div
                            style={{
                              ...styles.progressFill,
                              width: `${student.dropout_score}%`,
                              backgroundColor: student.dropout_score >= 80 ? '#dc2626' : 
                                             student.dropout_score >= 60 ? '#ea580c' : 
                                             student.dropout_score >= 40 ? '#ca8a04' : '#16a34a',
                            }}
                          />
                        </div>
                        <span style={{ fontWeight: 600, minWidth: '36px' }}>{student.dropout_score}</span>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          backgroundColor: levelStyle.bg,
                          color: levelStyle.text,
                        }}
                      >
                        {student.dropout_level === 'critical' ? '🚨 Kritik' :
                         student.dropout_level === 'high' ? '⚠️ Yüksek' :
                         student.dropout_level === 'medium' ? '⚡ Orta' : '✅ Düşük'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ fontWeight: 600, color: '#16a34a' }}>
                        {student.success_score}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ fontWeight: 600 }}>
                        {student.engagement_score}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          backgroundColor: priorityStyle.bg,
                          color: priorityStyle.text,
                        }}
                      >
                        {student.weekly_plan?.priority_level === 'urgent' ? '🔴 Acil' :
                         student.weekly_plan?.priority_level === 'high' ? '🟠 Yüksek' :
                         student.weekly_plan?.priority_level === 'normal' ? '🔵 Normal' : '🟢 Düşük'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <button
                        style={styles.actionBtn}
                        onClick={() => openPredictiveDrawer(student.student_id)}
                      >
                        📊 Detay
                      </button>
                      <button
                        style={styles.actionBtn}
                        onClick={() => openMatchDrawer(student.student_id)}
                      >
                        🎯 Koç Eşleştir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Top Risk Students */}
      {dashboard?.top_risk_students && dashboard.top_risk_students.length > 0 && (
        <div style={{ ...styles.card, marginTop: '24px' }}>
          <h3 style={styles.cardTitle}>⚡ En Kritik 5 Öğrenci</h3>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {dashboard.top_risk_students.map((student) => {
              const levelStyle = levelColors[student.dropout_level] || levelColors.medium;
              
              return (
                <div
                  key={student.student_id}
                  style={{
                    padding: '16px',
                    borderRadius: '10px',
                    backgroundColor: levelStyle.bg,
                    border: `1px solid ${levelStyle.text}20`,
                    minWidth: '180px',
                    cursor: 'pointer',
                  }}
                  onClick={() => openPredictiveDrawer(student.student_id)}
                >
                  <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>
                    {student.student_name}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: levelStyle.text }}>
                    {student.dropout_score}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Dropout Skoru
                  </div>
                  {student.intervention_required && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#dc2626' }}>
                      ⚠️ Müdahale Gerekli
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drawers */}
      {showPredictiveDrawer && selectedStudent && (
        <StudentPredictiveDrawer
          studentId={selectedStudent}
          onClose={() => {
            setShowPredictiveDrawer(false);
            setSelectedStudent(null);
          }}
        />
      )}

      {showMatchDrawer && selectedStudent && (
        <CoachMatchDrawer
          studentId={selectedStudent}
          onClose={() => {
            setShowMatchDrawer(false);
            setSelectedStudent(null);
          }}
        />
      )}
    </div>
  );
}
