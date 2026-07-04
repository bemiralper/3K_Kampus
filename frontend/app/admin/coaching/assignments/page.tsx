'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchCoaches,
  fetchAssignments,
  fetchAvailableStudents,
  removeAssignment,
  bulkAssignStudents,
  type Coach,
  type Assignment,
  type AvailableStudent,
} from '@/lib/coaching-api';
import CoachCapacityBar from '@/components/admin/coaching/CoachCapacityBar';
import CoachAvatar from '@/components/admin/coaching/CoachAvatar';
import CoachChangeModal, { type CoachChangeTarget } from '@/components/admin/coaching/CoachChangeModal';

// Toast type
interface Toast {
  id: number;
  type: 'success' | 'error' | 'warning';
  title: string;
  message: string;
}

export default function AssignmentsPage() {
  // State
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [availableStudents, setAvailableStudents] = useState<AvailableStudent[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  
  // Loading states
  const [loadingCoaches, setLoadingCoaches] = useState(true);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Filters
  const [coachSearch, setCoachSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  
  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [changeTarget, setChangeTarget] = useState<CoachChangeTarget | null>(null);
  
  // Toast
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const showToast = useCallback((type: Toast['type'], title: string, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // Load coaches
  const loadCoaches = useCallback(async () => {
    setLoadingCoaches(true);
    try {
      const params: { search?: string; is_active?: boolean } = { is_active: true };
      if (coachSearch) params.search = coachSearch;
      
      const response = await fetchCoaches(params);
      if (response.success && response.data) {
        setCoaches(response.data);
      }
    } catch (err) {
      showToast('error', 'Hata', 'Koçlar yüklenemedi');
    } finally {
      setLoadingCoaches(false);
    }
  }, [coachSearch, showToast]);

  // Load assignments for selected coach
  const loadAssignments = useCallback(async () => {
    if (!selectedCoach) {
      setAssignments([]);
      return;
    }
    
    setLoadingAssignments(true);
    try {
      const response = await fetchAssignments({ coach_id: selectedCoach.id, active_only: true });
      if (response.success && response.data) {
        setAssignments(response.data);
      }
    } catch (err) {
      showToast('error', 'Hata', 'Öğrenciler yüklenemedi');
    } finally {
      setLoadingAssignments(false);
    }
  }, [selectedCoach, showToast]);

  // Load available students for selected coach
  const loadAvailableStudents = useCallback(async (coachId?: number) => {
    const targetCoachId = coachId || selectedCoach?.id;
    if (!targetCoachId) {
      console.log('[Assignments] No coach selected for available students');
      setAvailableStudents([]);
      return;
    }
    
    console.log('[Assignments] Loading available students for coach:', targetCoachId);
    setLoadingStudents(true);
    try {
      const response = await fetchAvailableStudents(targetCoachId, {
        search: studentSearch || undefined,
      });
      console.log('[Assignments] fetchAvailableStudents response:', response);
      if (response.success && response.data) {
        setAvailableStudents(response.data);
      } else {
        setAvailableStudents([]);
      }
    } catch (err) {
      console.error('[Assignments] fetchAvailableStudents error:', err);
      showToast('error', 'Hata', 'Atanabilir öğrenciler yüklenemedi');
    } finally {
      setLoadingStudents(false);
    }
  }, [selectedCoach?.id, studentSearch, showToast]);

  // Effects
  useEffect(() => {
    loadCoaches();
  }, [loadCoaches]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  // Debounce student search
  useEffect(() => {
    if (!drawerOpen) return;
    
    const timer = setTimeout(() => {
      loadAvailableStudents();
    }, 300);
    return () => clearTimeout(timer);
  }, [studentSearch, drawerOpen, loadAvailableStudents]);

  // Handlers
  const handleCoachSelect = (coach: Coach) => {
    setSelectedCoach(coach);
    setSelectedStudents([]);
  };

  const handleOpenBulkDrawer = () => {
    if (!selectedCoach) return;
    console.log('[Assignments] Opening drawer for coach:', selectedCoach.id, selectedCoach.teacher_full_name);
    setDrawerOpen(true);
    setSelectedStudents([]);
    setStudentSearch('');
    // Coach id'yi parametre olarak geç
    loadAvailableStudents(selectedCoach.id);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedStudents([]);
    setStudentSearch('');
  };

  const handleStudentToggle = (studentId: number) => {
    setSelectedStudents(prev => 
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSelectAll = () => {
    if (!selectedCoach) return;
    
    const maxToSelect = selectedCoach.available_capacity;
    const allIds = availableStudents.slice(0, maxToSelect).map(s => s.id);
    setSelectedStudents(allIds);
  };

  const handleBulkAssign = async () => {
    if (!selectedCoach || selectedStudents.length === 0) return;
    
    setSubmitting(true);
    try {
      const response = await bulkAssignStudents({
        coach_id: selectedCoach.id,
        student_ids: selectedStudents,
      });
      
      if (response.success) {
        showToast('success', 'Başarılı', `${selectedStudents.length} öğrenci atandı`);
        handleCloseDrawer();
        loadAssignments();
        loadCoaches(); // Refresh capacity
      } else {
        showToast('error', 'Hata', response.error || 'Atama başarısız');
      }
    } catch (err) {
      showToast('error', 'Hata', 'Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: number) => {
    if (!confirm('Bu atamayı sonlandırmak istediğinize emin misiniz? Öğrenci koçsuz kalır; yeni koç atamak için "Koç Değiştir" kullanın.')) return;
    
    try {
      const response = await removeAssignment(assignmentId);
      if (response.success) {
        showToast('success', 'Başarılı', 'Atama sonlandırıldı');
        loadAssignments();
        loadCoaches();
      } else {
        showToast('error', 'Hata', response.error || 'İşlem başarısız');
      }
    } catch (err) {
      showToast('error', 'Hata', 'Bir hata oluştu');
    }
  };

  return (
    <div style={{ padding: 0 }}>
      {/* Toast Container */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              backgroundColor: toast.type === 'success' ? '#d1fae5' : toast.type === 'error' ? '#fee2e2' : '#fef3c7',
              color: toast.type === 'success' ? '#065f46' : toast.type === 'error' ? '#991b1b' : '#92400e',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              minWidth: 280,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{toast.title}</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{toast.message}</div>
          </div>
        ))}
      </div>

      {/* Hero Header */}
      <div className="hero-header" style={{ marginBottom: 24 }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <path d="M20 8v6" />
              <path d="M23 11h-6" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Koç-Öğrenci Atama</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Koçluk</span>
              <span>/</span>
              <span>Atamalar</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Split Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, minHeight: 600 }}>
        
        {/* LEFT PANEL - Coach List */}
        <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
              Koçlar
            </h3>
            <input
              type="text"
              placeholder="Koç ara..."
              value={coachSearch}
              onChange={(e) => setCoachSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #e5e7eb',
                fontSize: 14,
              }}
            />
          </div>
          
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {loadingCoaches ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                Yükleniyor...
              </div>
            ) : coaches.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                Koç bulunamadı
              </div>
            ) : (
              coaches.map(coach => (
                <div
                  key={coach.id}
                  onClick={() => handleCoachSelect(coach)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    backgroundColor: selectedCoach?.id === coach.id ? '#eff6ff' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <CoachAvatar
                      fotograf={coach.teacher_fotograf}
                      ad={coach.teacher_ad}
                      soyad={coach.teacher_soyad}
                      size={36}
                      style={{ borderWidth: 0, boxShadow: 'none' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, color: '#111827' }}>
                        {coach.teacher_full_name}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        {coach.current_student_count} / {coach.capacity} öğrenci
                      </div>
                    </div>
                  </div>
                  <CoachCapacityBar
                    current={coach.current_student_count}
                    capacity={coach.capacity}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANEL - Selected Coach Students */}
        <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          {!selectedCoach ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>👈</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#374151' }}>
                Bir koç seçin
              </div>
              <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
                Sol panelden bir koç seçerek öğrencilerini görüntüleyin
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>
                    {selectedCoach.teacher_full_name}
                  </h3>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                    Müsait kapasite: <strong>{selectedCoach.available_capacity}</strong>
                  </div>
                </div>
                <button
                  onClick={handleOpenBulkDrawer}
                  disabled={selectedCoach.available_capacity === 0}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: selectedCoach.available_capacity > 0 ? '#3b82f6' : '#9ca3af',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: selectedCoach.available_capacity > 0 ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Öğrenci Ata
                </button>
              </div>

              {/* Students Table */}
              <div style={{ maxHeight: 450, overflowY: 'auto' }}>
                {loadingAssignments ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                    Yükleniyor...
                  </div>
                ) : assignments.length === 0 ? (
                  <div style={{ padding: 48, textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>📚</div>
                    <div style={{ fontSize: 14, color: '#6b7280' }}>
                      Henüz atanmış öğrenci yok
                    </div>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9fafb' }}>
                        <th style={thStyle}>Öğrenci</th>
                        <th style={thStyle}>Sınıf</th>
                        <th style={thStyle}>Başlangıç</th>
                        <th style={thStyle}>Tip</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map(assignment => (
                        <tr key={assignment.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: '50%',
                                  backgroundColor: '#eff6ff',
                                  color: '#3b82f6',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 12,
                                  fontWeight: 600,
                                }}
                              >
                                {assignment.student_ad?.charAt(0)}{assignment.student_soyad?.charAt(0)}
                              </div>
                              <span style={{ fontWeight: 500 }}>{assignment.student_full_name}</span>
                            </div>
                          </td>
                          <td style={tdStyle}>{assignment.student_sinif || '-'}</td>
                          <td style={tdStyle}>
                            {new Date(assignment.start_date).toLocaleDateString('tr-TR')}
                          </td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 10,
                                fontSize: 12,
                                backgroundColor: assignment.is_primary ? '#d1fae5' : '#f3f4f6',
                                color: assignment.is_primary ? '#059669' : '#6b7280',
                              }}
                            >
                              {assignment.is_primary ? 'Ana Koç' : 'Yardımcı'}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              {selectedCoach && (
                                <button
                                  onClick={() => setChangeTarget({
                                    studentId: assignment.student_id,
                                    studentName: assignment.student_full_name,
                                    currentCoachId: assignment.coach_id,
                                    currentCoachName: assignment.coach_full_name,
                                    assignmentId: assignment.id,
                                  })}
                                  style={{
                                    padding: '4px 8px',
                                    backgroundColor: 'transparent',
                                    color: '#3b82f6',
                                    border: '1px solid #93c5fd',
                                    borderRadius: 4,
                                    fontSize: 12,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Koç Değiştir
                                </button>
                              )}
                              <button
                                onClick={() => handleRemoveAssignment(assignment.id)}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: 'transparent',
                                  color: '#dc2626',
                                  border: '1px solid #fecaca',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  cursor: 'pointer',
                                }}
                              >
                                Kaldır
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bulk Assign Drawer */}
      {drawerOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 40,
            }}
            onClick={handleCloseDrawer}
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              maxWidth: 560,
              backgroundColor: '#fff',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-4px 0 6px -1px rgba(0, 0, 0, 0.1)',
            }}
          >
            {/* Drawer Header */}
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
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>
                  Öğrenci Ata
                </h2>
                <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0' }}>
                  {selectedCoach?.teacher_full_name} - Müsait: {selectedCoach?.available_capacity}
                </p>
              </div>
              <button
                onClick={handleCloseDrawer}
                style={{
                  padding: 8,
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Drawer Content */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Search & Actions */}
              <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb' }}>
                <input
                  type="text"
                  placeholder="Öğrenci ara (ad, soyad)..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    fontSize: 14,
                    marginBottom: 12,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    {selectedStudents.length} öğrenci seçildi
                  </div>
                  <button
                    onClick={handleSelectAll}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: 'transparent',
                      color: '#3b82f6',
                      border: '1px solid #3b82f6',
                      borderRadius: 4,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Tümünü Seç (max {selectedCoach?.available_capacity})
                  </button>
                </div>
              </div>

              {/* Student List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                {loadingStudents ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                    Yükleniyor...
                  </div>
                ) : availableStudents.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                    Atanabilir öğrenci bulunamadı
                  </div>
                ) : (
                  availableStudents.map(student => {
                    const isSelected = selectedStudents.includes(student.id);
                    const isDisabled = !isSelected && selectedStudents.length >= (selectedCoach?.available_capacity || 0);
                    
                    return (
                      <div
                        key={student.id}
                        onClick={() => !isDisabled && handleStudentToggle(student.id)}
                        style={{
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                          opacity: isDisabled ? 0.5 : 1,
                          borderBottom: '1px solid #f3f4f6',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={() => {}}
                          style={{ width: 18, height: 18, accentColor: '#3b82f6' }}
                        />
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            backgroundColor: isSelected ? '#3b82f6' : '#e5e7eb',
                            color: isSelected ? '#fff' : '#6b7280',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {student.ad?.charAt(0)}{student.soyad?.charAt(0)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 14, color: '#111827' }}>
                            {student.full_name}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Drawer Footer */}
            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end',
                padding: '16px 24px',
                borderTop: '1px solid #e5e7eb',
              }}
            >
              <button
                onClick={handleCloseDrawer}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#fff',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                İptal
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={selectedStudents.length === 0 || submitting}
                style={{
                  padding: '10px 20px',
                  backgroundColor: selectedStudents.length > 0 ? '#3b82f6' : '#9ca3af',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: selectedStudents.length > 0 ? 'pointer' : 'not-allowed',
                }}
              >
                {submitting ? 'Atanıyor...' : `${selectedStudents.length} Öğrenci Ata`}
              </button>
            </div>
          </div>
        </>
      )}

      <CoachChangeModal
        isOpen={!!changeTarget}
        target={changeTarget}
        onClose={() => setChangeTarget(null)}
        onSuccess={(message) => {
          showToast('success', 'Başarılı', message);
          loadAssignments();
          loadCoaches();
        }}
      />
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
  color: '#374151',
};
