'use client';

import { useState, useEffect } from 'react';
import {
  fetchStudentScores,
  fetchStudentWeeklyPlan,
  StudentScores,
  WeeklyPlan,
} from '@/lib/coaching-api';

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 9998,
  },
  drawer: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    width: '550px',
    height: '100vh',
    backgroundColor: '#fff',
    boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column' as const,
    animation: 'slideIn 0.3s ease',
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#0f172a',
  },
  closeBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#f1f5f9',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    color: '#64748b',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#64748b',
    marginBottom: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  scoreCard: {
    backgroundColor: '#f8fafc',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px',
    border: '1px solid #e2e8f0',
  },
  scoreGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
  },
  scoreItem: {
    textAlign: 'center' as const,
  },
  scoreValue: {
    fontSize: '32px',
    fontWeight: 700,
  },
  scoreLabel: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '4px',
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 600,
    display: 'inline-block',
    marginTop: '8px',
  },
  planCard: {
    backgroundColor: '#fff',
    borderRadius: '10px',
    padding: '16px',
    border: '1px solid #e2e8f0',
    marginBottom: '12px',
  },
  planRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #f1f5f9',
  },
  planLabel: {
    fontSize: '14px',
    color: '#64748b',
  },
  planValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#0f172a',
  },
  recommendation: {
    padding: '12px 16px',
    backgroundColor: '#f0f9ff',
    borderRadius: '8px',
    marginBottom: '8px',
    fontSize: '14px',
    color: '#0369a1',
    borderLeft: '3px solid #0284c7',
  },
  focusArea: {
    display: 'inline-block',
    padding: '6px 12px',
    backgroundColor: '#eff6ff',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#1d4ed8',
    marginRight: '8px',
    marginBottom: '8px',
  },
  trendChart: {
    height: '120px',
    display: 'flex',
    alignItems: 'flex-end',
    gap: '4px',
    padding: '16px',
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
  },
  trendBar: {
    flex: 1,
    borderRadius: '4px 4px 0 0',
    minWidth: '8px',
    transition: 'height 0.3s ease',
  },
};

const levelColors: Record<string, { bg: string; text: string }> = {
  critical: { bg: '#fef2f2', text: '#dc2626' },
  high: { bg: '#fff7ed', text: '#ea580c' },
  medium: { bg: '#fefce8', text: '#ca8a04' },
  low: { bg: '#f0fdf4', text: '#16a34a' },
};

const priorityLabels: Record<string, string> = {
  urgent: '🔴 Acil',
  high: '🟠 Yüksek',
  normal: '🔵 Normal',
  low: '🟢 Düşük',
};

const volumeLabels: Record<string, string> = {
  high: '📚 Yoğun',
  medium: '📖 Orta',
  low: '📄 Hafif',
};

interface Props {
  studentId: number;
  onClose: () => void;
}

export default function StudentPredictiveDrawer({ studentId, onClose }: Props) {
  const [scores, setScores] = useState<StudentScores | null>(null);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        const [scoresRes, planRes] = await Promise.all([
          fetchStudentScores(studentId),
          fetchStudentWeeklyPlan(studentId),
        ]);
        
        if (scoresRes.success && scoresRes.data) {
          setScores(scoresRes.data);
        }
        
        if (planRes.success && planRes.data) {
          setWeeklyPlan(planRes.data.weekly_plan);
        }
      } catch (err) {
        console.error('Data load error:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [studentId]);

  const dropoutLevel = scores?.scores?.dropout_level || 'medium';
  const levelStyle = levelColors[dropoutLevel] || levelColors.medium;

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.drawer}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>
              📊 Öğrenci Tahminsel Analizi
            </div>
            <div style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
              {scores?.student?.ad} {scores?.student?.soyad}
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.content}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              Yükleniyor...
            </div>
          ) : (
            <>
              {/* Skorlar */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Skorlar</div>
                <div style={styles.scoreCard}>
                  <div style={styles.scoreGrid}>
                    <div style={styles.scoreItem}>
                      <div style={{ ...styles.scoreValue, color: levelStyle.text }}>
                        {scores?.scores?.dropout_score || 0}
                      </div>
                      <div style={styles.scoreLabel}>Dropout Riski</div>
                      <span
                        style={{
                          ...styles.badge,
                          backgroundColor: levelStyle.bg,
                          color: levelStyle.text,
                        }}
                      >
                        {dropoutLevel === 'critical' ? 'Kritik' :
                         dropoutLevel === 'high' ? 'Yüksek' :
                         dropoutLevel === 'medium' ? 'Orta' : 'Düşük'}
                      </span>
                    </div>
                    <div style={styles.scoreItem}>
                      <div style={{ ...styles.scoreValue, color: '#16a34a' }}>
                        {scores?.scores?.success_score || 0}
                      </div>
                      <div style={styles.scoreLabel}>Başarı</div>
                    </div>
                    <div style={styles.scoreItem}>
                      <div style={{ ...styles.scoreValue, color: '#3b82f6' }}>
                        {scores?.scores?.engagement_score || 0}
                      </div>
                      <div style={styles.scoreLabel}>Etkileşim</div>
                    </div>
                  </div>
                  {scores?.scores?.intervention_required && (
                    <div style={{
                      marginTop: '16px',
                      padding: '12px',
                      backgroundColor: '#fef2f2',
                      borderRadius: '8px',
                      color: '#dc2626',
                      fontSize: '14px',
                      fontWeight: 600,
                      textAlign: 'center',
                    }}>
                      ⚠️ ACİL MÜDAHALE GEREKLİ
                    </div>
                  )}
                </div>
              </div>

              {/* Koç Bilgisi */}
              {scores?.assignment && (
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>Koç Ataması</div>
                  <div style={styles.planCard}>
                    <div style={styles.planRow}>
                      <span style={styles.planLabel}>Koç</span>
                      <span style={styles.planValue}>{scores.assignment.coach_name}</span>
                    </div>
                    <div style={{ ...styles.planRow, borderBottom: 'none' }}>
                      <span style={styles.planLabel}>Başlangıç</span>
                      <span style={styles.planValue}>
                        {scores.assignment.start_date ? new Date(scores.assignment.start_date).toLocaleDateString('tr-TR') : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Haftalık Plan */}
              {weeklyPlan && (
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>Haftalık Plan Önerisi</div>
                  <div style={styles.planCard}>
                    <div style={styles.planRow}>
                      <span style={styles.planLabel}>Öncelik</span>
                      <span style={styles.planValue}>
                        {priorityLabels[weeklyPlan.priority_level] || weeklyPlan.priority_level}
                      </span>
                    </div>
                    <div style={styles.planRow}>
                      <span style={styles.planLabel}>Önerilen Toplantı</span>
                      <span style={styles.planValue}>{weeklyPlan.meetings_suggested} / hafta</span>
                    </div>
                    <div style={{ ...styles.planRow, borderBottom: 'none' }}>
                      <span style={styles.planLabel}>Ödev Yoğunluğu</span>
                      <span style={styles.planValue}>
                        {volumeLabels[weeklyPlan.homework_volume] || weeklyPlan.homework_volume}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Odak Alanları */}
              {weeklyPlan?.focus_areas && weeklyPlan.focus_areas.length > 0 && (
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>Odak Alanları</div>
                  <div>
                    {weeklyPlan.focus_areas.map((area, idx) => (
                      <span key={idx} style={styles.focusArea}>
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Öneriler */}
              {weeklyPlan?.recommendations && weeklyPlan.recommendations.length > 0 && (
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>Koç İçin Öneriler</div>
                  {weeklyPlan.recommendations.map((rec, idx) => (
                    <div key={idx} style={styles.recommendation}>
                      {rec}
                    </div>
                  ))}
                </div>
              )}

              {/* Trend */}
              {scores?.trend && scores.trend.length > 0 && (
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>30 Günlük Trend</div>
                  <div style={styles.trendChart}>
                    {scores.trend.map((point, idx) => {
                      const maxScore = Math.max(...scores.trend.map(t => t.dropout_score), 1);
                      const height = (point.dropout_score / maxScore) * 100;
                      
                      return (
                        <div
                          key={idx}
                          style={{
                            ...styles.trendBar,
                            height: `${height}%`,
                            backgroundColor: point.dropout_score >= 60 ? '#ef4444' : 
                                           point.dropout_score >= 40 ? '#eab308' : '#22c55e',
                          }}
                          title={`${point.date}: ${point.dropout_score}`}
                        />
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    <span>30 gün önce</span>
                    <span>Bugün</span>
                  </div>
                </div>
              )}

              {/* Son Güncelleme */}
              {scores?.scores?.last_updated && (
                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', marginTop: '24px' }}>
                  Son güncelleme: {new Date(scores.scores.last_updated).toLocaleString('tr-TR')}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <style jsx global>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
