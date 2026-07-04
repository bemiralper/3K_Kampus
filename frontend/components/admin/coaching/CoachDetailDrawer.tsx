'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { fetchCoach, fetchCoachStats, fetchCoachStudents, type Coach, type CoachStats, type CoachStudent } from '@/lib/coaching-api';
import CoachCapacityBar from './CoachCapacityBar';
import CoachStatsCard from './CoachStatsCard';
import CoachStudentsTable from './CoachStudentsTable';

interface CoachDetailDrawerProps {
  isOpen: boolean;
  coachId: number | null;
  onClose: () => void;
  onEdit: () => void;
}

export default function CoachDetailDrawer({ isOpen, coachId, onClose, onEdit }: CoachDetailDrawerProps) {
  const [coach, setCoach] = useState<Coach | null>(null);
  const [stats, setStats] = useState<CoachStats | null>(null);
  const [students, setStudents] = useState<CoachStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'students' | 'stats'>('students');

  const loadData = useCallback(async () => {
    if (!coachId) return;

    setLoading(true);

    try {
      const [coachRes, statsRes, studentsRes] = await Promise.all([
        fetchCoach(coachId),
        fetchCoachStats(coachId),
        fetchCoachStudents(coachId),
      ]);

      if (coachRes.success && coachRes.data) {
        setCoach(coachRes.data);
      }

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }

      if (studentsRes.success && studentsRes.data) {
        setStudents(studentsRes.data);
      }
    } catch (err) {
      console.error('Veri yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    if (isOpen && coachId) {
      loadData();
      setActiveTab('students');
    }
  }, [isOpen, coachId, loadData]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 40,
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: '672px',
          backgroundColor: '#fff',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', margin: 0 }}>
              Koç Detayı
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0' }}>
              {coach?.teacher_full_name || 'Yükleniyor...'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onEdit}
              style={{
                padding: '8px 16px',
                backgroundColor: '#eff6ff',
                color: '#3b82f6',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Düzenle
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '8px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '6px',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: '48px' }}>
              Yükleniyor...
            </div>
          ) : coach ? (
            <>
              {/* Coach Info Card */}
              <div
                style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '24px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      backgroundColor: '#eff6ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      fontWeight: 600,
                      color: '#3b82f6',
                    }}
                  >
                    {coach.teacher_ad.charAt(0)}{coach.teacher_soyad.charAt(0)}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', margin: 0 }}>
                      {coach.teacher_full_name}
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <span
                        style={{
                          padding: '2px 10px',
                          borderRadius: '10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: coach.is_active ? '#d1fae5' : '#fee2e2',
                          color: coach.is_active ? '#059669' : '#dc2626',
                        }}
                      >
                        {coach.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                      {coach.is_coach && (
                        <span
                          style={{
                            padding: '2px 10px',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: 500,
                            backgroundColor: '#dbeafe',
                            color: '#1e40af',
                          }}
                        >
                          Koç Yetkili
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Capacity Info */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Kapasite</div>
                    <div style={{ fontSize: '20px', fontWeight: 600, color: '#111827' }}>{coach.capacity}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Aktif Öğrenci</div>
                    <div style={{ fontSize: '20px', fontWeight: 600, color: '#3b82f6' }}>{coach.current_student_count}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Müsait</div>
                    <div style={{ fontSize: '20px', fontWeight: 600, color: '#22c55e' }}>
                      {coach.capacity - coach.current_student_count}
                    </div>
                  </div>
                </div>

                <CoachCapacityBar
                  current={coach.current_student_count}
                  capacity={coach.capacity}
                  showLabel
                  size="md"
                />
              </div>

              {/* Tabs */}
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  marginBottom: '20px',
                  backgroundColor: '#f3f4f6',
                  padding: '4px',
                  borderRadius: '8px',
                }}
              >
                <button
                  onClick={() => setActiveTab('students')}
                  style={{
                    flex: 1,
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'students' ? '#fff' : 'transparent',
                    color: activeTab === 'students' ? '#111827' : '#6b7280',
                    boxShadow: activeTab === 'students' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  Öğrencilerim ({students.length})
                </button>
                <button
                  onClick={() => setActiveTab('stats')}
                  style={{
                    flex: 1,
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'stats' ? '#fff' : 'transparent',
                    color: activeTab === 'stats' ? '#111827' : '#6b7280',
                    boxShadow: activeTab === 'stats' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  İstatistik
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'students' && (
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                  <CoachStudentsTable students={students} loading={false} />
                </div>
              )}

              {activeTab === 'stats' && <CoachStatsCard stats={stats} loading={!stats} />}
            </>
          ) : (
            <div style={{ textAlign: 'center', color: '#dc2626', padding: '48px' }}>
              Koç bulunamadı
            </div>
          )}
        </div>
      </div>
    </>
  );
}
