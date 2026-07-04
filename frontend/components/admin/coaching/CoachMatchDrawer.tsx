'use client';

import { useState, useEffect } from 'react';
import { fetchCoachMatches, CoachMatch } from '@/lib/coaching-api';

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
    width: '500px',
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
  studentInfo: {
    backgroundColor: '#f0f9ff',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '24px',
    border: '1px solid #bae6fd',
  },
  studentName: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#0c4a6e',
  },
  studentMeta: {
    display: 'flex',
    gap: '16px',
    marginTop: '8px',
    fontSize: '13px',
    color: '#0369a1',
  },
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px',
    border: '1px solid #e2e8f0',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  matchHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  coachName: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#0f172a',
  },
  matchScore: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  scoreCircle: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: 700,
    color: '#fff',
  },
  factorsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    marginTop: '16px',
  },
  factorItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: '#f8fafc',
    borderRadius: '6px',
    fontSize: '13px',
  },
  factorLabel: {
    color: '#64748b',
  },
  factorValue: {
    fontWeight: 600,
    color: '#0f172a',
  },
  capacityBar: {
    marginTop: '16px',
  },
  capacityLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#64748b',
    marginBottom: '6px',
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
  selectBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#3b82f6',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '16px',
    transition: 'background-color 0.2s ease',
  },
  badge: {
    padding: '2px 8px',
    borderRadius: '9999px',
    fontSize: '11px',
    fontWeight: 600,
  },
};

const factorLabels: Record<string, string> = {
  capacity_fit: '📦 Kapasite Uyumu',
  workload_match: '⚖️ İş Yükü',
  experience_match: '🎓 Deneyim',
  success_rate: '🏆 Başarı Oranı',
};

function getScoreColor(score: number): string {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#3b82f6';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

interface Props {
  studentId: number;
  onClose: () => void;
  onSelect?: (coachId: number) => void;
}

export default function CoachMatchDrawer({ studentId, onClose, onSelect }: Props) {
  const [matches, setMatches] = useState<CoachMatch[]>([]);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCoach, setSelectedCoach] = useState<number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const res = await fetchCoachMatches(studentId, 10);
        
        if (res.success && res.data) {
          setMatches(res.data.matches || []);
          setStudentInfo(res.data.student);
        }
      } catch (err) {
        console.error('Match data load error:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [studentId]);

  const handleSelect = (coachId: number) => {
    setSelectedCoach(coachId);
    if (onSelect) {
      onSelect(coachId);
    }
  };

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.drawer}>
        <div style={styles.header}>
          <div style={styles.title}>🎯 Koç Eşleştirme Önerileri</div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.content}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              Yükleniyor...
            </div>
          ) : (
            <>
              {/* Öğrenci Bilgisi */}
              {studentInfo && (
                <div style={styles.studentInfo}>
                  <div style={styles.studentName}>
                    {studentInfo.ad} {studentInfo.soyad}
                  </div>
                  <div style={styles.studentMeta}>
                    <span>Risk Skoru: <strong>{studentInfo.risk_score || 0}</strong></span>
                    {studentInfo.needs_attention && (
                      <span style={{
                        ...styles.badge,
                        backgroundColor: '#fef2f2',
                        color: '#dc2626',
                      }}>
                        ⚠️ Yüksek İlgi
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Eşleşme Kartları */}
              {matches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  <span style={{ fontSize: '48px' }}>😕</span>
                  <p style={{ marginTop: '16px' }}>Uygun koç bulunamadı</p>
                </div>
              ) : (
                matches.map((match, index) => (
                  <div
                    key={match.coach_id}
                    style={{
                      ...styles.matchCard,
                      borderColor: selectedCoach === match.coach_id ? '#3b82f6' : '#e2e8f0',
                      boxShadow: selectedCoach === match.coach_id ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : 'none',
                    }}
                    onClick={() => setSelectedCoach(match.coach_id)}
                  >
                    <div style={styles.matchHeader}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {index === 0 && (
                            <span style={{
                              ...styles.badge,
                              backgroundColor: '#fef3c7',
                              color: '#d97706',
                            }}>
                              ⭐ En İyi Eşleşme
                            </span>
                          )}
                        </div>
                        <div style={{ ...styles.coachName, marginTop: index === 0 ? '8px' : 0 }}>
                          {match.coach_name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          Koç #{match.coach_id}
                        </div>
                      </div>
                      <div style={styles.matchScore}>
                        <div
                          style={{
                            ...styles.scoreCircle,
                            backgroundColor: getScoreColor(match.match_score),
                          }}
                        >
                          {match.match_score}
                        </div>
                      </div>
                    </div>

                    {/* Faktörler */}
                    <div style={styles.factorsGrid}>
                      {Object.entries(match.factors).map(([key, value]) => (
                        <div key={key} style={styles.factorItem}>
                          <span style={styles.factorLabel}>
                            {factorLabels[key] || key}
                          </span>
                          <span style={{
                            ...styles.factorValue,
                            color: getScoreColor(value as number),
                          }}>
                            {value}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Kapasite */}
                    <div style={styles.capacityBar}>
                      <div style={styles.capacityLabel}>
                        <span>Kapasite Kullanımı</span>
                        <span>{match.current_load} / {match.capacity_total} ({match.load_percentage}%)</span>
                      </div>
                      <div style={styles.progressBar}>
                        <div
                          style={{
                            ...styles.progressFill,
                            width: `${match.load_percentage}%`,
                            backgroundColor: match.load_percentage >= 90 ? '#ef4444' :
                                           match.load_percentage >= 70 ? '#eab308' : '#22c55e',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px' }}>
                        ✅ {match.capacity_available} boş kapasite
                      </div>
                    </div>

                    {/* Seç Butonu */}
                    <button
                      style={{
                        ...styles.selectBtn,
                        backgroundColor: selectedCoach === match.coach_id ? '#16a34a' : '#3b82f6',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(match.coach_id);
                      }}
                    >
                      {selectedCoach === match.coach_id ? '✓ Seçildi' : 'Bu Koçu Seç'}
                    </button>
                  </div>
                ))
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
