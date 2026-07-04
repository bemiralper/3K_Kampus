'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchCoaches, type Coach } from '@/lib/coaching-api';
import CoachEditDrawer from '@/components/admin/coaching/CoachEditDrawer';
import CoachAvatar from '@/components/admin/coaching/CoachAvatar';

/* ───── Renk paleti: her karta farklı gradient ───── */
const CARD_GRADIENTS = [
  ['#667eea', '#764ba2'],
  ['#f093fb', '#f5576c'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#a18cd1', '#fbc2eb'],
  ['#fccb90', '#d57eeb'],
  ['#30cfd0', '#330867'],
  ['#0250c5', '#d43f8d'],
  ['#ebbba7', '#cfc7f8'],
];

function getGradient(index: number) {
  const g = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
  return `linear-gradient(135deg, ${g[0]}, ${g[1]})`;
}

function getCapacityColor(pct: number) {
  if (pct >= 90) return '#ef4444';
  if (pct >= 70) return '#f97316';
  return '#22c55e';
}

export default function CoachesListPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<number | null>(null);

  const loadCoaches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { search?: string; is_active?: boolean } = {};
      if (search) params.search = search;
      if (filterActive === 'active') params.is_active = true;
      if (filterActive === 'inactive') params.is_active = false;
      const response = await fetchCoaches(params);
      if (response.success && response.data) setCoaches(response.data);
      else setError(response.error || 'Koçlar yüklenemedi');
    } catch {
      setError('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }, [search, filterActive]);

  useEffect(() => {
    const t = setTimeout(() => loadCoaches(), 300);
    return () => clearTimeout(t);
  }, [loadCoaches]);

  const openEditDrawer = (id: number) => { setSelectedCoach(id); setEditDrawerOpen(true); };
  const closeDrawer = () => { setEditDrawerOpen(false); setSelectedCoach(null); };
  const handleDrawerSuccess = () => { loadCoaches(); closeDrawer(); };

  /* ───── Özet ───── */
  const totalStudents = coaches.reduce((s, c) => s + c.current_student_count, 0);
  const totalCapacity = coaches.reduce((s, c) => s + c.capacity, 0);
  const avgOcc = totalCapacity > 0 ? Math.round((totalStudents / totalCapacity) * 100) : 0;
  const fullCoaches = coaches.filter(c => c.current_student_count >= c.capacity).length;

  return (
    <div style={{ padding: 0 }}>
      {/* ─── Hero ─── */}
      <div className="hero-header" style={{ marginBottom: '24px' }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </div>
          <div className="hero-text">
            <h1>Koç Yönetimi</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a><span>/</span><span>Koçluk</span><span>/</span><span>Koç Yönetimi</span>
            </div>
          </div>
        </div>
        <a href="/personel/gorevlendirmeler" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#f3f4f6', color: '#374151', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 500 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
          <span>Koç Ataması Yap</span>
        </a>
      </div>

      {/* ─── Özet İstatistikler ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Toplam Koç', value: String(coaches.length), icon: '👨‍🏫', bg: '#eff6ff', clr: '#3b82f6' },
          { label: 'Toplam Öğrenci', value: String(totalStudents), icon: '🎓', bg: '#f0fdf4', clr: '#22c55e' },
          { label: 'Ort. Doluluk', value: `%${avgOcc}`, icon: '📊', bg: '#fef3c7', clr: '#f59e0b' },
          { label: 'Tam Dolu Koç', value: String(fullCoaches), icon: '🔴', bg: '#fef2f2', clr: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>{s.label}</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: s.clr }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Filtreler ─── */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '400px' }}>
          <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input type="text" placeholder="Koç ara (ad, soyad)..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px', outline: 'none' }} />
        </div>
        <select value={filterActive} onChange={e => setFilterActive(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px', minWidth: '140px', backgroundColor: '#fff' }}>
          <option value="all">Tümü</option>
          <option value="active">Aktif</option>
          <option value="inactive">Pasif</option>
        </select>
        <div style={{ display: 'flex', backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '3px', gap: '2px' }}>
          {(['grid', 'list'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{ padding: '7px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: viewMode === m ? '#fff' : 'transparent', boxShadow: viewMode === m ? '0 1px 3px rgba(0,0,0,.1)' : 'none', color: viewMode === m ? '#111827' : '#9ca3af', transition: 'all .2s', display: 'flex', alignItems: 'center' }}>
              {m === 'grid'
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              }
            </button>
          ))}
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginLeft: 'auto' }}>{coaches.length} koç bulundu</div>
      </div>

      {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px', marginBottom: '20px', color: '#dc2626' }}>{error}</div>}

      {/* ─── İçerik ─── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr', gap: '20px' }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ height: '80px', backgroundColor: '#f3f4f6', animation: 'pulse 2s infinite' }} />
              <div style={{ padding: '20px' }}>
                <div style={{ width: '60%', height: '18px', backgroundColor: '#f3f4f6', borderRadius: '6px', marginBottom: '12px', animation: 'pulse 2s infinite' }} />
                <div style={{ width: '40%', height: '14px', backgroundColor: '#f3f4f6', borderRadius: '6px', animation: 'pulse 2s infinite' }} />
              </div>
            </div>
          ))}
        </div>
      ) : coaches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px', backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', margin: '0 auto 20px' }}>👨‍🏫</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>Henüz Koç Atanmamış</div>
          <div style={{ fontSize: '14px', color: '#6b7280', maxWidth: '360px', margin: '0 auto 24px' }}>Personel Görevlendirme sayfasından bir personele &quot;Koç&quot; rolü atayarak başlayın.</div>
          <a href="/personel/gorevlendirmeler" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 24px', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '10px', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>Görevlendirmeye Git →</a>
        </div>
      ) : viewMode === 'grid' ? (
        /* ═══════ GRID GÖRÜNÜM ═══════ */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {coaches.map((coach, idx) => {
            const pct = coach.capacity > 0 ? Math.round((coach.current_student_count / coach.capacity) * 100) : 0;
            const avail = Math.max(coach.capacity - coach.current_student_count, 0);
            return (
              <div key={coach.id} style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden', transition: 'transform .25s cubic-bezier(.4,0,.2,1), box-shadow .25s cubic-bezier(.4,0,.2,1)', cursor: 'pointer', position: 'relative' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                {/* Gradient Banner */}
                <div style={{ height: '72px', background: getGradient(idx), position: 'relative' }}>
                  <span style={{ position: 'absolute', top: '12px', right: '12px', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, letterSpacing: '.02em', backgroundColor: coach.is_active ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.85)', color: coach.is_active ? '#059669' : '#dc2626', backdropFilter: 'blur(4px)' }}>
                    {coach.is_active ? '● Aktif' : '○ Pasif'}
                  </span>
                </div>
                {/* Avatar */}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-36px', position: 'relative', zIndex: 1 }}>
                  <CoachAvatar
                    fotograf={coach.teacher_fotograf}
                    ad={coach.teacher_ad}
                    soyad={coach.teacher_soyad}
                    size={72}
                    gradient={getGradient(idx)}
                  />
                </div>
                {/* İçerik */}
                <div style={{ padding: '12px 20px 20px', textAlign: 'center' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: '0 0 2px' }}>{coach.teacher_full_name}</h3>
                  <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 16px' }}>Koç #{coach.id}</p>
                  {/* 3 Metrik */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                    <div style={{ backgroundColor: '#eff6ff', borderRadius: '10px', padding: '10px 6px' }}>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: '#3b82f6' }}>{coach.current_student_count}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>Öğrenci</div>
                    </div>
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '10px 6px' }}>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: '#374151' }}>{coach.capacity}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>Kapasite</div>
                    </div>
                    <div style={{ backgroundColor: '#f0fdf4', borderRadius: '10px', padding: '10px 6px' }}>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: '#22c55e' }}>{avail}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>Müsait</div>
                    </div>
                  </div>
                  {/* Kapasite barı */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
                      <span>Doluluk</span>
                      <span style={{ fontWeight: 600, color: getCapacityColor(pct) }}>%{pct}</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', backgroundColor: getCapacityColor(pct), borderRadius: '99px', transition: 'width .5s ease' }} />
                    </div>
                  </div>
                  {/* Butonlar */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Link href={`/admin/coaching/coaches/${coach.id}`} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px 0', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', transition: 'background .2s' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2563eb')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#3b82f6')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      Detay
                    </Link>
                    <button onClick={e => { e.stopPropagation(); openEditDrawer(coach.id); }} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px 0', backgroundColor: '#f3f4f6', color: '#374151', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'background .2s' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e5e7eb')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f3f4f6')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      Düzenle
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ═══════ LİSTE GÖRÜNÜM ═══════ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {coaches.map((coach, idx) => {
            const pct = coach.capacity > 0 ? Math.round((coach.current_student_count / coach.capacity) * 100) : 0;
            const avail = Math.max(coach.capacity - coach.current_student_count, 0);
            return (
              <div key={coach.id} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', transition: 'box-shadow .2s, transform .2s' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateX(0)'; }}>
                <CoachAvatar
                  fotograf={coach.teacher_fotograf}
                  ad={coach.teacher_ad}
                  soyad={coach.teacher_soyad}
                  size={48}
                  gradient={getGradient(idx)}
                  style={{ borderWidth: 2, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>{coach.teacher_full_name}</span>
                    <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, backgroundColor: coach.is_active ? '#d1fae5' : '#fee2e2', color: coach.is_active ? '#059669' : '#dc2626' }}>{coach.is_active ? 'Aktif' : 'Pasif'}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>Koç #{coach.id}</div>
                </div>
                <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexShrink: 0 }}>
                  {[
                    { v: coach.current_student_count, l: 'Öğrenci', c: '#3b82f6' },
                    { v: coach.capacity, l: 'Kapasite', c: '#374151' },
                    { v: avail, l: 'Müsait', c: '#22c55e' },
                  ].map(m => (
                    <div key={m.l} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: m.c }}>{m.v}</div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>{m.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ width: '120px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '11px', color: getCapacityColor(pct), fontWeight: 600, marginBottom: '3px' }}>%{pct}</div>
                  <div style={{ width: '100%', height: '5px', backgroundColor: '#e5e7eb', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: getCapacityColor(pct), borderRadius: '99px', transition: 'width .5s' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <Link href={`/admin/coaching/coaches/${coach.id}`} style={{ padding: '7px 14px', backgroundColor: '#eff6ff', color: '#3b82f6', borderRadius: '7px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>Detay</Link>
                  <button onClick={() => openEditDrawer(coach.id)} style={{ padding: '7px 14px', backgroundColor: '#f3f4f6', color: '#374151', borderRadius: '7px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Düzenle</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CoachEditDrawer isOpen={editDrawerOpen} coachId={selectedCoach} onClose={closeDrawer} onSuccess={handleDrawerSuccess} />

      <style jsx>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
      `}</style>
    </div>
  );
}
