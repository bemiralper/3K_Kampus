'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchDashboard, type DashboardData } from '@/lib/kutuphane-api';
import { useKutuphanePath } from '@/components/kutuphane/KutuphanePathProvider';
import { useKurum } from '@/lib/contexts/KurumContext';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktif', INACTIVE: 'Pasif', MAINTENANCE: 'Bakımda',
};
const STATUS_COLORS: Record<string, { bg: string; color: string; border: string; gradient: string }> = {
  ACTIVE: { bg: '#d1fae5', color: '#059669', border: '#6ee7b7', gradient: 'linear-gradient(135deg, #22c55e, #16a34a)' },
  INACTIVE: { bg: '#f3f4f6', color: '#6b7280', border: '#d1d5db', gradient: 'linear-gradient(135deg, #9ca3af, #6b7280)' },
  MAINTENANCE: { bg: '#fef3c7', color: '#d97706', border: '#fbbf24', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
};

export default function KutuphaneDashboardPage() {
  const { href, isCoachMode, isMuhasebeMode, portalHomeHref, portalHomeLabel } = useKutuphanePath();
  const { activeKurum, loading: kurumLoading } = useKurum();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (isCoachMode && (!activeKurum || kurumLoading)) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDashboard();
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Dashboard yüklenemedi');
      }
    } catch {
      setError('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }, [isCoachMode, activeKurum, kurumLoading]);

  useEffect(() => {
    if (isCoachMode && kurumLoading) {
      setLoading(true);
      return;
    }
    if (isCoachMode && !activeKurum) {
      setLoading(false);
      setError('Kurum bilgisi yüklenemedi. Lütfen sayfayı yenileyin.');
      return;
    }
    loadDashboard();
  }, [loadDashboard, isCoachMode, kurumLoading, activeKurum]);

  return (
    <div style={{ padding: 0 }}>
      <style>{`
        @keyframes dashFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .dash-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
        .dash-kpi-card { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; padding: 12px 14px; display: flex; align-items: center; gap: 10px; position: relative; overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s; animation: dashFadeIn 0.4s ease both; }
        .dash-kpi-card:hover { border-color: #c7d2fe; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .dash-kpi-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
        .dash-kpi-value { font-size: 18px; font-weight: 700; color: #111827; line-height: 1.2; }
        .dash-kpi-label { font-size: 11px; font-weight: 600; color: #6b7280; margin-top: 2px; }
        .dash-kpi-sub { font-size: 10px; color: #9ca3af; margin-top: 1px; }
        .dash-kpi-deco { position: absolute; top: -16px; right: -16px; width: 56px; height: 56px; border-radius: 50%; opacity: 0.06; pointer-events: none; }
        .dash-section { background: #fff; border-radius: 18px; border: 1.5px solid #e5e7eb; overflow: hidden; margin-bottom: 24px; animation: dashFadeIn 0.45s ease both; }
        .dash-section-header { padding: 20px 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
        .dash-section-title { font-size: 16px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 10px; }
        .dash-section-body { padding: 24px; }
        .dash-progress-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
        .dash-progress-label { font-size: 14px; font-weight: 600; color: #374151; }
        .dash-progress-value { font-size: 14px; font-weight: 700; }
        .dash-progress-bar { height: 10px; background: #f1f5f9; border-radius: 5px; overflow: hidden; }
        .dash-progress-fill { height: 100%; border-radius: 5px; transition: width 0.8s cubic-bezier(0.4,0,0.2,1); }
        .dash-progress-sub { font-size: 12px; color: #9ca3af; margin-top: 5px; }
        .dash-salon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; }
        .dash-salon-card { background: #fff; border-radius: 16px; border: 1.5px solid #e5e7eb; overflow: hidden; transition: all 0.2s; text-decoration: none; color: inherit; display: block; }
        .dash-salon-card:hover { border-color: #93c5fd; box-shadow: 0 8px 25px rgba(0,0,0,0.07); transform: translateY(-2px); }
        .dash-salon-stripe { height: 4px; width: 100%; }
        .dash-salon-body { padding: 20px; }
        .dash-salon-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
        .dash-salon-stat { text-align: center; padding: 10px 0; background: #f9fafb; border-radius: 10px; }
        .dash-salon-stat-value { font-size: 20px; font-weight: 800; color: #111827; }
        .dash-salon-stat-label { font-size: 11px; color: #6b7280; font-weight: 600; margin-top: 2px; }
        .dash-skeleton { background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%); background-size: 200% 100%; animation: dashFadeIn 1.5s ease infinite; border-radius: 12px; }
        @media (max-width: 1024px) { .dash-kpi-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px) { .dash-kpi-grid { grid-template-columns: 1fr; } .dash-salon-grid { grid-template-columns: 1fr; } }
      `}</style>

      {/* Hero Header */}
      <div className="hero-header" style={{ marginBottom: '28px' }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>{isCoachMode || isMuhasebeMode ? 'Kütüphane' : 'Kütüphane Yönetimi'}</h1>
            <div className="hero-breadcrumb">
              {isCoachMode ? (
                <span>Koç Portalı / Kütüphane</span>
              ) : (
                <>
                  <a href={portalHomeHref}>{portalHomeLabel}</a><span>/</span><span>Kütüphane</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadDashboard} disabled={loading}
            style={{ padding: '10px 18px', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
            🔄 Yenile
          </button>
          <Link href={href('salonlar')} style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px',
            background: 'linear-gradient(135deg, #0061a6, #004d85)', color: '#fff', borderRadius: 10,
            textDecoration: 'none', fontSize: '14px', fontWeight: 600, boxShadow: '0 4px 14px rgba(0,97,166,0.3)',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /></svg>
            Salonları Yönet
          </Link>
        </div>
      </div>

      {error && (
        <div style={{ background: 'linear-gradient(135deg, #fef2f2, #fee2e2)', border: '1px solid #fca5a5', borderRadius: 14, padding: 16, marginBottom: 20, color: '#991b1b', fontSize: 14, fontWeight: 500 }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <>
          <div className="dash-kpi-grid">
            {[1,2,3,4].map(i => <div key={i} className="dash-skeleton" style={{ height: 64 }} />)}
          </div>
          <div className="dash-skeleton" style={{ height: 200, marginBottom: 24 }} />
          <div className="dash-skeleton" style={{ height: 300 }} />
        </>
      ) : data ? (
        <>
          {/* ═══ KPI CARDS ═══ */}
          <div className="dash-kpi-grid">
            {[
              { icon: '🏛️', label: 'Aktif Salon', value: data.aktif_salon, sub: `Toplam ${data.toplam_salon} salon`, gradient: 'linear-gradient(135deg, #6366f1, #4f46e5)', deco: '#6366f1' },
              { icon: '🪑', label: 'Masa Doluluk', value: `${data.dolu_masa}/${data.toplam_masa}`, sub: `%${data.doluluk_orani} doluluk`, gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)', deco: '#3b82f6' },
              { icon: '🔒', label: 'Dolap Kullanımı', value: `${data.dolu_dolap}/${data.toplam_dolap}`, sub: `${data.musait_dolap} müsait`, gradient: 'linear-gradient(135deg, #22c55e, #16a34a)', deco: '#22c55e' },
              { icon: '⏱️', label: 'Geçici Oturma', value: data.gecici_oturma, sub: 'Anlık aktif', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)', deco: '#f59e0b' },
            ].map((kpi, i) => (
              <div key={kpi.label} className="dash-kpi-card" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="dash-kpi-deco" style={{ background: kpi.deco }} />
                <div className="dash-kpi-icon" style={{ background: kpi.gradient, color: '#fff' }}>{kpi.icon}</div>
                <div>
                  <div className="dash-kpi-value">{kpi.value}</div>
                  <div className="dash-kpi-label">{kpi.label}</div>
                  <div className="dash-kpi-sub">{kpi.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ═══ DOLULUK + DOLAP BAR ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            {[
              { title: '📊 Masa Doluluk Durumu', right: `${data.aktif_atama} aktif atama`, pct: data.doluluk_orani, sub: `${data.dolu_masa} dolu / ${data.toplam_masa - data.dolu_masa} boş — Toplam kapasite: ${data.toplam_kapasite}` },
              { title: '🔒 Dolap Kullanım Durumu', right: `${data.toplam_dolap} toplam`, pct: data.toplam_dolap > 0 ? Math.round(data.dolu_dolap / data.toplam_dolap * 100) : 0, sub: `${data.dolu_dolap} atanmış / ${data.musait_dolap} müsait` },
            ].map(bar => {
              const color = bar.pct > 90 ? '#ef4444' : bar.pct > 70 ? '#f59e0b' : '#22c55e';
              return (
                <div key={bar.title} className="dash-section" style={{ marginBottom: 0 }}>
                  <div className="dash-section-header">
                    <div className="dash-section-title">{bar.title}</div>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>{bar.right}</span>
                  </div>
                  <div className="dash-section-body">
                    <div className="dash-progress-header">
                      <span className="dash-progress-label">Doluluk</span>
                      <span className="dash-progress-value" style={{ color }}>%{bar.pct}</span>
                    </div>
                    <div className="dash-progress-bar">
                      <div className="dash-progress-fill" style={{ width: `${bar.pct}%`, background: `linear-gradient(90deg, ${color}dd, ${color})` }} />
                    </div>
                    <div className="dash-progress-sub">{bar.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ═══ SALON KARTLARI ═══ */}
          <div className="dash-section">
            <div className="dash-section-header">
              <div className="dash-section-title">🏛️ Salonlar</div>
              <Link href={href('salonlar')} style={{ fontSize: 14, color: '#0061a6', textDecoration: 'none', fontWeight: 600 }}>
                Tümünü Gör →
              </Link>
            </div>
            <div className="dash-section-body">
              {data.salonlar && data.salonlar.length > 0 ? (
                <div className="dash-salon-grid">
                  {data.salonlar.map((salon, i) => {
                    const st = STATUS_COLORS[salon.durum] || STATUS_COLORS.INACTIVE;
                    const pct = salon.doluluk_orani || 0;
                    const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
                    return (
                      <Link key={salon.id} href={href(`salonlar/${salon.id}`)} className="dash-salon-card" style={{ animationDelay: `${i * 0.06}s` }}>
                        <div className="dash-salon-stripe" style={{ background: st.gradient }} />
                        <div className="dash-salon-body">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 48, height: 48, borderRadius: 14, background: `${st.color}15`, color: st.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🏛️</div>
                              <div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{salon.ad}</div>
                                <span style={{ fontSize: 12, fontFamily: 'monospace', background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, color: '#6b7280' }}>{salon.kod}</span>
                              </div>
                            </div>
                            <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
                              {STATUS_LABELS[salon.durum]}
                            </span>
                          </div>
                          <div className="dash-salon-stats">
                            <div className="dash-salon-stat">
                              <div className="dash-salon-stat-value">{salon.toplam_masa}</div>
                              <div className="dash-salon-stat-label">Masa</div>
                            </div>
                            <div className="dash-salon-stat">
                              <div className="dash-salon-stat-value">{salon.aktif_atama}</div>
                              <div className="dash-salon-stat-label">Atama</div>
                            </div>
                            <div className="dash-salon-stat">
                              <div className="dash-salon-stat-value">{salon.kapasite}</div>
                              <div className="dash-salon-stat-label">Kapasite</div>
                            </div>
                          </div>
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                              <span style={{ fontSize: 12, color: '#6b7280' }}>Doluluk</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>%{pct}</span>
                            </div>
                            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: barColor, transition: 'width 0.6s ease' }} />
                            </div>
                          </div>
                        </div>
                        <div style={{ padding: '14px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: '#9ca3af' }}>{salon.bos_masa} boş masa</span>
                          <span style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>Detay →</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Henüz Salon Tanımlanmamış</div>
                  <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>Kütüphane salonlarını tanımlayarak başlayın.</div>
                  {!isCoachMode && (
                  <Link href={href('salonlar/yeni')} style={{
                    display: 'inline-block', padding: '10px 22px',
                    background: 'linear-gradient(135deg, #0061a6, #004d85)', color: '#fff', borderRadius: 10,
                    textDecoration: 'none', fontSize: 14, fontWeight: 600, boxShadow: '0 4px 14px rgba(0,97,166,0.3)',
                  }}>
                    + İlk Salonu Oluştur
                  </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
