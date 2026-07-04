'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchCoach, fetchCoachStats, fetchCoachStudents,
  fetchAssignments, fetchAvailableStudents, bulkAssignStudents, removeAssignment,
  type Coach, type CoachStats, type CoachStudent, type Assignment, type AvailableStudent,
} from '@/lib/coaching-api';
import CoachStatsCard from '@/components/admin/coaching/CoachStatsCard';
import CoachEditDrawer from '@/components/admin/coaching/CoachEditDrawer';
import CoachChangeModal, { type CoachChangeTarget } from '@/components/admin/coaching/CoachChangeModal';
import CoachAvatar from '@/components/admin/coaching/CoachAvatar';
import CoachWeeklyCalendar from '@/components/admin/coaching/tabs/CoachWeeklyCalendar';
import CoachPerformanceCharts from '@/components/admin/coaching/tabs/CoachPerformanceCharts';
import CoachRecentActivity from '@/components/admin/coaching/tabs/CoachRecentActivity';
import CoachGoalTracking from '@/components/admin/coaching/tabs/CoachGoalTracking';
import CoachRiskStudents from '@/components/admin/coaching/tabs/CoachRiskStudents';
import CoachQuickNotes from '@/components/admin/coaching/tabs/CoachQuickNotes';

type TabKey = 'students' | 'stats' | 'calendar' | 'performance' | 'activity' | 'goals' | 'risk' | 'notes';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

interface Toast {
  id: number;
  type: 'success' | 'error';
  title: string;
  message: string;
}

export default function CoachDetailPage() {
  const params = useParams();
  const router = useRouter();
  const coachId = params?.coachId ? parseInt(params.coachId as string) : null;

  const [coach, setCoach] = useState<Coach | null>(null);
  const [stats, setStats] = useState<CoachStats | null>(null);
  const [students, setStudents] = useState<CoachStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('students');
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);

  /* ─── Atama State'leri ─── */
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignDrawerOpen, setAssignDrawerOpen] = useState(false);
  const [availableStudents, setAvailableStudents] = useState<AvailableStudent[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [changeTarget, setChangeTarget] = useState<CoachChangeTarget | null>(null);

  const showToast = useCallback((type: Toast['type'], title: string, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  /* ─── Veri Yükleme ─── */
  const loadData = useCallback(async () => {
    if (!coachId) return;
    setLoading(true);
    try {
      const [coachRes, statsRes, studentsRes] = await Promise.all([
        fetchCoach(coachId),
        fetchCoachStats(coachId),
        fetchCoachStudents(coachId),
      ]);
      if (coachRes.success && coachRes.data) setCoach(coachRes.data);
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (studentsRes.success && studentsRes.data) setStudents(studentsRes.data);
    } catch (err) {
      console.error('Veri yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  const loadAssignments = useCallback(async () => {
    if (!coachId) return;
    setLoadingAssignments(true);
    try {
      const res = await fetchAssignments({ coach_id: coachId, active_only: true });
      if (res.success && res.data) setAssignments(res.data);
    } catch { /* */ } finally { setLoadingAssignments(false); }
  }, [coachId]);

  const loadAvailableStudents = useCallback(async () => {
    if (!coachId) return;
    setLoadingStudents(true);
    try {
      const res = await fetchAvailableStudents(coachId, { search: studentSearch || undefined });
      if (res.success && res.data) {
        setAvailableStudents(res.data);
      } else setAvailableStudents([]);
    } catch { setAvailableStudents([]); } finally { setLoadingStudents(false); }
  }, [coachId, studentSearch]);

  useEffect(() => { if (coachId) { loadData(); loadAssignments(); } }, [coachId, loadData, loadAssignments]);

  // Student search debounce
  useEffect(() => {
    if (!assignDrawerOpen) return;
    const t = setTimeout(() => loadAvailableStudents(), 300);
    return () => clearTimeout(t);
  }, [studentSearch, assignDrawerOpen, loadAvailableStudents]);

  const handleEditSuccess = () => { loadData(); loadAssignments(); setEditDrawerOpen(false); };

  /* ─── Atama Handlers ─── */
  const openAssignDrawer = () => {
    setAssignDrawerOpen(true);
    setSelectedStudents([]);
    setStudentSearch('');
    loadAvailableStudents();
  };

  const handleStudentToggle = (id: number) => {
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    if (!coach) return;
    const max = coach.available_capacity;
    setSelectedStudents(availableStudents.slice(0, max).map(s => s.id));
  };

  const handleBulkAssign = async () => {
    if (!coachId || selectedStudents.length === 0) return;
    setSubmitting(true);
    try {
      const res = await bulkAssignStudents({ coach_id: coachId, student_ids: selectedStudents });
      if (res.success) {
        showToast('success', 'Başarılı', `${selectedStudents.length} öğrenci atandı`);
        setAssignDrawerOpen(false);
        setSelectedStudents([]);
        loadData();
        loadAssignments();
      } else showToast('error', 'Hata', res.error || 'Atama başarısız');
    } catch { showToast('error', 'Hata', 'Bir hata oluştu'); } finally { setSubmitting(false); }
  };

  const handleRemoveAssignment = async (assignmentId: number) => {
    if (!confirm('Bu atamayı sonlandırmak istediğinize emin misiniz?')) return;
    try {
      const res = await removeAssignment(assignmentId);
      if (res.success) { showToast('success', 'Başarılı', 'Atama sonlandırıldı'); loadData(); loadAssignments(); }
      else showToast('error', 'Hata', res.error || 'İşlem başarısız');
    } catch { showToast('error', 'Hata', 'Bir hata oluştu'); }
  };

  /* ─── Tab tanımları ─── */
  const TABS: TabDef[] = [
    { key: 'students', label: `Öğrencilerim (${assignments.length})`, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
    { key: 'calendar', label: 'Takvim', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
    { key: 'performance', label: 'Performans', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg> },
    { key: 'activity', label: 'Aktiviteler', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg> },
    { key: 'goals', label: 'Hedefler', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg> },
    { key: 'risk', label: 'Risk', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>, badge: stats?.pending_events ? String(stats.pending_events) : undefined },
    { key: 'stats', label: 'İstatistikler', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg> },
    { key: 'notes', label: 'Notlar', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg> },
  ];

  if (loading) {
    return (
      <div style={{ padding: 0 }}>
        <div style={{ height: '80px', backgroundColor: '#f3f4f6', borderRadius: '12px', marginBottom: '24px', animation: 'pulse 2s infinite' }} />
        <div style={{ height: '140px', backgroundColor: '#f3f4f6', borderRadius: '12px', marginBottom: '24px', animation: 'pulse 2s infinite' }} />
        <div style={{ height: '300px', backgroundColor: '#f3f4f6', borderRadius: '12px', animation: 'pulse 2s infinite' }} />
        <style jsx>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
      </div>
    );
  }

  if (!coach) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ textAlign: 'center', color: '#dc2626', padding: '48px' }}>Koç bulunamadı</div>
      </div>
    );
  }

  const pct = coach.capacity > 0 ? Math.round((coach.current_student_count / coach.capacity) * 100) : 0;
  const capColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f97316' : '#22c55e';
  const avail = Math.max(coach.capacity - coach.current_student_count, 0);

  return (
    <div style={{ padding: 0 }}>
      {/* Toast */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{ padding: '12px 16px', borderRadius: 8, backgroundColor: t.type === 'success' ? '#d1fae5' : '#fee2e2', color: t.type === 'success' ? '#065f46' : '#991b1b', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', minWidth: 280 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{t.message}</div>
          </div>
        ))}
      </div>

      {/* ─── Hero Header ─── */}
      <div className="hero-header" style={{ marginBottom: '24px' }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </div>
          <div className="hero-text">
            <h1>Koç Detayı</h1>
            <div className="hero-breadcrumb">
              <Link href="/dashboard">Ana Sayfa</Link><span>/</span><span>Koçluk</span><span>/</span><Link href="/admin/coaching/coaches">Koç Yönetimi</Link><span>/</span><span>{coach.teacher_full_name}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => router.push('/admin/coaching/coaches')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
            Geri Dön
          </button>
          <button onClick={() => setEditDrawerOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            Düzenle
          </button>
        </div>
      </div>

      {/* ─── Profil Kartı (düz tasarım — overlap yok) ─── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
          {/* Avatar */}
          <CoachAvatar
            fotograf={coach.teacher_fotograf}
            ad={coach.teacher_ad}
            soyad={coach.teacher_soyad}
            size={72}
            style={{ borderRadius: '16px', borderWidth: 0, flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>{coach.teacher_full_name}</h2>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ padding: '3px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, backgroundColor: coach.is_active ? '#d1fae5' : '#fee2e2', color: coach.is_active ? '#059669' : '#dc2626' }}>
                {coach.is_active ? '● Aktif' : '○ Pasif'}
              </span>
              {coach.is_coach && (
                <span style={{ padding: '3px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, backgroundColor: '#dbeafe', color: '#1e40af' }}>
                  Koç Yetkili
                </span>
              )}
              <span style={{ padding: '3px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: 500, backgroundColor: '#f3f4f6', color: '#6b7280' }}>
                ID: {coach.id}
              </span>
            </div>
          </div>
        </div>

        {/* Metrik Kutucukları */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '14px' }}>
          {[
            { label: 'Kapasite', value: coach.capacity, bg: '#f9fafb', color: '#111827' },
            { label: 'Aktif Öğrenci', value: coach.current_student_count, bg: '#eff6ff', color: '#3b82f6' },
            { label: 'Müsait', value: avail, bg: '#f0fdf4', color: '#22c55e' },
          ].map(m => (
            <div key={m.label} style={{ backgroundColor: m.bg, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>{m.label}</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Kapasite barı */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: '#6b7280' }}>Doluluk Oranı</span>
            <span style={{ fontWeight: 600, color: capColor }}>%{pct}</span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: capColor, borderRadius: '99px', transition: 'width .5s ease' }} />
          </div>
        </div>
      </div>

      {/* ─── Tab Bar ─── */}
      <div style={{ marginBottom: '20px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'max-content', minWidth: '100%' }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '7px', border: 'none', fontSize: '13px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', backgroundColor: activeTab === tab.key ? '#fff' : 'transparent', color: activeTab === tab.key ? '#111827' : '#6b7280', boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,0,0,.1)' : 'none', transition: 'all .2s' }}>
              {tab.icon}
              {tab.label}
              {tab.badge && (
                <span style={{ padding: '1px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, backgroundColor: '#ef4444', color: '#fff', lineHeight: '16px' }}>{tab.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Tab İçerikleri ─── */}

      {/* ═══ ÖĞRENCİLERİM TAB (Atama dahil) ═══ */}
      {activeTab === 'students' && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
          {/* Başlık + Öğrenci Ata butonu */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#111827' }}>Atanmış Öğrenciler</h3>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                {assignments.length} öğrenci · Müsait kapasite: <strong style={{ color: avail > 0 ? '#22c55e' : '#ef4444' }}>{avail}</strong>
              </div>
            </div>
            <button onClick={openAssignDrawer} disabled={avail === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: avail > 0 ? '#3b82f6' : '#9ca3af', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: avail > 0 ? 'pointer' : 'not-allowed', transition: 'background .2s' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Öğrenci Ata
            </button>
          </div>

          {/* Tablo */}
          {loadingAssignments ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>Yükleniyor...</div>
          ) : assignments.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 16px' }}>📚</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Henüz Öğrenci Atanmamış</div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>Yukarıdaki &quot;Öğrenci Ata&quot; butonuyla öğrenci ekleyebilirsiniz.</div>
              <button onClick={openAssignDrawer} disabled={avail === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                İlk Öğrenciyi Ata
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
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
                  {assignments.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600 }}>
                            {a.student_ad?.charAt(0)}{a.student_soyad?.charAt(0)}
                          </div>
                          <span style={{ fontWeight: 500 }}>{a.student_full_name}</span>
                        </div>
                      </td>
                      <td style={tdStyle}>{a.student_sinif || '-'}</td>
                      <td style={tdStyle}>{new Date(a.start_date).toLocaleDateString('tr-TR')}</td>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '12px', backgroundColor: a.is_primary ? '#d1fae5' : '#f3f4f6', color: a.is_primary ? '#059669' : '#6b7280' }}>
                          {a.is_primary ? 'Ana Koç' : 'Yardımcı'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => setChangeTarget({
                              studentId: a.student_id,
                              studentName: a.student_full_name,
                              currentCoachId: a.coach_id,
                              currentCoachName: a.coach_full_name,
                              assignmentId: a.id,
                            })}
                            style={{ padding: '4px 10px', backgroundColor: 'transparent', color: '#3b82f6', border: '1px solid #93c5fd', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}
                          >
                            Koç Değiştir
                          </button>
                          <button onClick={() => handleRemoveAssignment(a.id)}
                            style={{ padding: '4px 10px', backgroundColor: 'transparent', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'all .2s' }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fee2e2'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                            Kaldır
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'stats' && <CoachStatsCard stats={stats} loading={!stats} />}
      {activeTab === 'calendar' && coachId && <CoachWeeklyCalendar coachId={coachId} />}
      {activeTab === 'performance' && coachId && <CoachPerformanceCharts coachId={coachId} />}
      {activeTab === 'activity' && coachId && <CoachRecentActivity coachId={coachId} />}
      {activeTab === 'goals' && coachId && <CoachGoalTracking coachId={coachId} />}
      {activeTab === 'risk' && coachId && <CoachRiskStudents coachId={coachId} />}
      {activeTab === 'notes' && coachId && <CoachQuickNotes coachId={coachId} />}

      {/* ═══ ÖĞRENCI ATA DRAWER ═══ */}
      {assignDrawerOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,.5)', zIndex: 40 }} onClick={() => setAssignDrawerOpen(false)} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 520, backgroundColor: '#fff', zIndex: 50, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 12px rgba(0,0,0,.1)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }}>
              <div>
                <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#111827', margin: 0 }}>Öğrenci Ata</h2>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>{coach.teacher_full_name} — Müsait: {avail}</p>
              </div>
              <button onClick={() => setAssignDrawerOpen(false)} style={{ padding: 8, backgroundColor: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '6px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Search + Count */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                <input type="text" placeholder="Öğrenci ara (ad, soyad)..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>
                  <strong style={{ color: '#3b82f6' }}>{selectedStudents.length}</strong> öğrenci seçildi
                </span>
                <button onClick={handleSelectAll}
                  style={{ padding: '4px 10px', backgroundColor: 'transparent', color: '#3b82f6', border: '1px solid #93c5fd', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                  Tümünü Seç (max {avail})
                </button>
              </div>
            </div>

            {/* Öğrenci Listesi */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loadingStudents ? (
                <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>Yükleniyor...</div>
              ) : availableStudents.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
                  Atanabilir öğrenci bulunamadı
                </div>
              ) : (
                availableStudents.map(s => {
                  const isSelected = selectedStudents.includes(s.id);
                  const isDisabled = !isSelected && selectedStudents.length >= avail;
                  return (
                    <div key={s.id} onClick={() => !isDisabled && handleStudentToggle(s.id)}
                      style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '12px', cursor: isDisabled ? 'not-allowed' : 'pointer', backgroundColor: isSelected ? '#eff6ff' : 'transparent', opacity: isDisabled ? .5 : 1, borderBottom: '1px solid #f3f4f6', transition: 'background .15s' }}>
                      <input type="checkbox" checked={isSelected} disabled={isDisabled} onChange={() => {}} style={{ width: 18, height: 18, accentColor: '#3b82f6' }} />
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: isSelected ? '#3b82f6' : '#e5e7eb', color: isSelected ? '#fff' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, transition: 'all .2s' }}>
                        {s.ad?.charAt(0)}{s.soyad?.charAt(0)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: '14px', color: '#111827' }}>{s.full_name}</div>
                        {s.sinif && <div style={{ fontSize: '11px', color: '#9ca3af' }}>{s.sinif}</div>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', padding: '16px 24px', borderTop: '1px solid #e5e7eb' }}>
              <button onClick={() => setAssignDrawerOpen(false)}
                style={{ padding: '10px 20px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                İptal
              </button>
              <button onClick={handleBulkAssign} disabled={selectedStudents.length === 0 || submitting}
                style={{ padding: '10px 20px', backgroundColor: selectedStudents.length > 0 ? '#3b82f6' : '#9ca3af', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: selectedStudents.length > 0 ? 'pointer' : 'not-allowed' }}>
                {submitting ? 'Atanıyor...' : `${selectedStudents.length} Öğrenci Ata`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Edit Drawer */}
      <CoachEditDrawer isOpen={editDrawerOpen} coachId={coachId} onClose={() => setEditDrawerOpen(false)} onSuccess={handleEditSuccess} />

      <CoachChangeModal
        isOpen={!!changeTarget}
        target={changeTarget}
        onClose={() => setChangeTarget(null)}
        onSuccess={(message) => {
          showToast('success', 'Başarılı', message);
          loadData();
          loadAssignments();
        }}
      />
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
  color: '#374151',
};
