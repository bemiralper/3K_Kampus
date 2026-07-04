'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchLibraries, deleteLibrary, type Library } from '@/lib/kutuphane-api';
import { useKutuphanePath } from '@/components/kutuphane/KutuphanePathProvider';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktif', INACTIVE: 'Pasif', MAINTENANCE: 'Bakımda',
};
const STATUS_COLORS: Record<string, { bg: string; color: string; border: string; gradient: string }> = {
  ACTIVE: { bg: '#d1fae5', color: '#059669', border: '#6ee7b7', gradient: 'linear-gradient(135deg, #22c55e, #16a34a)' },
  INACTIVE: { bg: '#f3f4f6', color: '#6b7280', border: '#d1d5db', gradient: 'linear-gradient(135deg, #9ca3af, #6b7280)' },
  MAINTENANCE: { bg: '#fef3c7', color: '#d97706', border: '#fbbf24', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
};

export default function SalonlarListPage() {
  const { href, isCoachMode } = useKutuphanePath();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState<'ad' | 'doluluk' | 'masa' | 'durum'>('ad');

  const loadLibraries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { search?: string; durum?: string } = {};
      if (search) params.search = search;
      if (filterStatus !== 'all') params.durum = filterStatus;
      const res = await fetchLibraries(params);
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : [];
        setLibraries(items);
      } else {
        setError(res.error || 'Salonlar yüklenemedi');
      }
    } catch { setError('Bir hata oluştu'); } finally { setLoading(false); }
  }, [search, filterStatus]);

  useEffect(() => { loadLibraries(); }, [loadLibraries]);

  useEffect(() => {
    const timer = setTimeout(() => loadLibraries(), 300);
    return () => clearTimeout(timer);
  }, [search, loadLibraries]);

  const handleDelete = async (id: string, ad: string) => {
    if (!confirm(`"${ad}" salonunu silmek istediğinize emin misiniz?`)) return;
    try {
      const res = await deleteLibrary(id);
      if (res.success) loadLibraries();
      else alert(res.error || 'Silinemedi');
    } catch { alert('Silme işlemi başarısız'); }
  };

  // Computed stats
  const aktifSalon = libraries.filter(l => l.durum === 'ACTIVE').length;
  const toplamMasa = libraries.reduce((s, l) => s + (l.toplam_masa || 0), 0);
  const toplamAtama = libraries.reduce((s, l) => s + (l.aktif_atama || 0), 0);
  const toplamKapasite = libraries.reduce((s, l) => s + l.kapasite, 0);
  const genelDoluluk = toplamMasa > 0 ? Math.round(toplamAtama / toplamMasa * 100) : 0;

  // Sıralama
  const sortedLibraries = [...libraries].sort((a, b) => {
    switch (sortBy) {
      case 'doluluk': return (b.doluluk_orani || 0) - (a.doluluk_orani || 0);
      case 'masa': return (b.toplam_masa || 0) - (a.toplam_masa || 0);
      case 'durum': {
        const order: Record<string, number> = { ACTIVE: 0, MAINTENANCE: 1, INACTIVE: 2 };
        return (order[a.durum] ?? 9) - (order[b.durum] ?? 9);
      }
      default: return (a.ad || '').localeCompare(b.ad || '', 'tr');
    }
  });

  return (
    <div style={{ padding: 0, animation: 'fadeIn 0.4s ease both' }}>
      <style>{`
        @keyframes salonFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .salon-summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 24px; }
        .salon-summary-card { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-radius: 16px; background: #fff; border: 1.5px solid #e5e7eb; transition: all 0.2s; animation: salonFadeIn 0.35s ease both; cursor: default; }
        .salon-summary-card:hover { border-color: #c7d2fe; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.06); }
        .salon-summary-icon { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); flex-shrink: 0; }
        .salon-summary-value { font-size: 26px; font-weight: 800; color: #111827; line-height: 1.1; }
        .salon-summary-label { font-size: 12px; font-weight: 600; color: #6b7280; margin-top: 2px; }
        .salon-card { background: #fff; border-radius: 16px; border: 1.5px solid #e5e7eb; overflow: hidden; transition: all 0.25s cubic-bezier(0.4,0,0.2,1); text-decoration: none; color: inherit; display: block; animation: salonFadeIn 0.4s ease both; }
        .salon-card:hover { border-color: #93c5fd; box-shadow: 0 10px 30px rgba(0,0,0,0.08); transform: translateY(-3px); }
        .salon-card-stripe { height: 4px; width: 100%; }
        .salon-card-body { padding: 22px; }
        .salon-card-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0; }
        .salon-card-stat { text-align: center; padding: 12px 0; background: #f9fafb; border-radius: 10px; }
        .salon-card-stat-value { font-size: 20px; font-weight: 800; color: #111827; }
        .salon-card-stat-label { font-size: 11px; color: #6b7280; font-weight: 600; margin-top: 2px; }
        .salon-card-footer { padding: 14px 22px; border-top: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center; }
        @media (max-width: 1200px) { .salon-summary-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 768px) { .salon-summary-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px) { .salon-summary-grid { grid-template-columns: 1fr; } }
      `}</style>

      {/* Hero Header */}
      <div className="hero-header" style={{ marginBottom: '24px' }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>
          </div>
          <div className="hero-text">
            <h1>Kütüphane Salonları</h1>
            <div className="hero-breadcrumb">
              <a href={isCoachMode ? href() : '/dashboard'}>{isCoachMode ? 'Koç Portalı' : 'Ana Sayfa'}</a><span>/</span>
              <a href={href()}>Kütüphane</a><span>/</span><span>Salonlar</span>
            </div>
          </div>
        </div>
        {!isCoachMode && (
        <Link href={href('salonlar/yeni')} style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px',
          background: 'linear-gradient(135deg, #0061a6, #004d85)', color: '#fff', borderRadius: 10,
          textDecoration: 'none', fontSize: '14px', fontWeight: 600, boxShadow: '0 4px 14px rgba(0,97,166,0.3)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Yeni Salon
        </Link>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '200px', maxWidth: '400px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#9ca3af', pointerEvents: 'none' }}>🔍</span>
          <input type="text" placeholder="Salon ara (ad, kod)..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', transition: 'border-color 0.2s' }}
            onFocus={e => e.target.style.borderColor = '#93c5fd'}
            onBlur={e => e.target.style.borderColor = '#e5e7eb'}
          />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', minWidth: '150px', backgroundColor: '#fff', cursor: 'pointer' }}>
          <option value="all">Tüm Durumlar</option>
          <option value="ACTIVE">✅ Aktif</option>
          <option value="INACTIVE">⏸️ Pasif</option>
          <option value="MAINTENANCE">🔧 Bakımda</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
          style={{ padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', minWidth: '150px', backgroundColor: '#fff', cursor: 'pointer' }}>
          <option value="ad">🔤 Ada Göre</option>
          <option value="doluluk">📊 Doluluk</option>
          <option value="masa">🪑 Masa Sayısı</option>
          <option value="durum">📋 Durum</option>
        </select>
        <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: 500 }}>{libraries.length} salon</div>
      </div>

      {error && (
        <div style={{ background: 'linear-gradient(135deg, #fef2f2, #fee2e2)', border: '1px solid #fca5a5', borderRadius: 14, padding: 16, marginBottom: 20, color: '#991b1b', fontSize: 14, fontWeight: 500 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Özet İstatistik Kartları */}
      {!loading && libraries.length > 0 && (
        <div className="salon-summary-grid">
          {[
            { label: 'Toplam Salon', value: libraries.length, icon: '🏛️', gradient: 'linear-gradient(135deg, #6366f1, #4f46e5)' },
            { label: 'Aktif Salon', value: aktifSalon, icon: '✅', gradient: 'linear-gradient(135deg, #22c55e, #16a34a)' },
            { label: 'Toplam Masa', value: toplamMasa, icon: '🪑', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
            { label: 'Aktif Atama', value: toplamAtama, icon: '👤', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
            { label: 'Doluluk', value: `%${genelDoluluk}`, icon: '📊', gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' },
          ].map((c, i) => (
            <div key={c.label} className="salon-summary-card" style={{ animationDelay: `${i * 0.06}s` }}>
              <div className="salon-summary-icon" style={{ background: c.gradient, color: '#fff' }}>{c.icon}</div>
              <div>
                <div className="salon-summary-value">{c.value}</div>
                <div className="salon-summary-label">{c.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 280, background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)', backgroundSize: '200% 100%', borderRadius: 16 }} />
          ))}
        </div>
      ) : libraries.length === 0 ? (
        <div style={{ padding: '64px 32px', textAlign: 'center', background: '#fff', borderRadius: 18, border: '1.5px solid #e5e7eb' }}>
          <div style={{ fontSize: '56px', marginBottom: '20px' }}>🏛️</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Henüz Salon Tanımlanmamış</div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>İlk kütüphane salonunuzu oluşturarak başlayın.</div>
          {!isCoachMode && (
          <Link href={href('salonlar/yeni')} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px',
            background: 'linear-gradient(135deg, #0061a6, #004d85)', color: '#fff', borderRadius: 10,
            textDecoration: 'none', fontSize: '14px', fontWeight: 600, boxShadow: '0 4px 14px rgba(0,97,166,0.3)',
          }}>+ İlk Salonu Oluştur</Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {sortedLibraries.map((lib, i) => {
            const doluluk = lib.doluluk_orani || 0;
            const st = STATUS_COLORS[lib.durum] || STATUS_COLORS.INACTIVE;
            const barColor = doluluk > 90 ? '#ef4444' : doluluk > 70 ? '#f59e0b' : '#22c55e';
            return (
              <Link key={lib.id} href={href(`salonlar/${lib.id}`)} className="salon-card" style={{ animationDelay: `${i * 0.05}s` }}>
                <div className="salon-card-stripe" style={{ background: st.gradient }} />
                <div className="salon-card-body">
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: 48, height: 48, borderRadius: 14, background: `${st.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: st.color }}>
                        🏛️
                      </div>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>{lib.ad}</h3>
                        <span style={{ fontSize: 12, fontFamily: 'monospace', backgroundColor: '#f3f4f6', padding: '2px 8px', borderRadius: 4, color: '#6b7280', display: 'inline-block', marginTop: 4 }}>{lib.kod}</span>
                      </div>
                    </div>
                    <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, backgroundColor: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
                      {STATUS_LABELS[lib.durum]}
                    </span>
                  </div>

                  {/* Stats Grid */}
                  <div className="salon-card-stats">
                    <div className="salon-card-stat">
                      <div className="salon-card-stat-value">{lib.toplam_masa || 0}</div>
                      <div className="salon-card-stat-label">Masa</div>
                    </div>
                    <div className="salon-card-stat">
                      <div className="salon-card-stat-value">{lib.aktif_atama || 0}</div>
                      <div className="salon-card-stat-label">Atama</div>
                    </div>
                    <div className="salon-card-stat">
                      <div className="salon-card-stat-value">{lib.kapasite}</div>
                      <div className="salon-card-stat-label">Kapasite</div>
                    </div>
                  </div>

                  {/* Doluluk bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>Doluluk</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>%{doluluk}</span>
                    </div>
                    <div style={{ height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${doluluk}%`, height: '100%', borderRadius: 3, backgroundColor: barColor, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="salon-card-footer">
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{lib.bos_masa || 0} boş · {lib.arizali_masa || 0} arızalı</span>
                  <span style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>Detay →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
