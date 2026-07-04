"use client";

import { Sinif, SinifSeviyesi } from '../types';

interface SinifTableProps {
  siniflar: Sinif[];
  loading: boolean;
  onEdit: (sinif: Sinif) => void;
  onDelete: (sinif: Sinif) => void;
  sinifSeviyeleri: SinifSeviyesi[];
}

// Varsayılan renk paleti
const defaultColors = [
  { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  { bg: '#fef3c7', text: '#b45309', border: '#fde68a' },
  { bg: '#faf5ff', text: '#7c3aed', border: '#e9d5ff' },
  { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
];

export default function SinifTable({ siniflar, loading, onEdit, onDelete, sinifSeviyeleri }: SinifTableProps) {
  // Sınıf seviyesi adından renk al
  const getSeviyeStyle = (seviyeId: number | null | undefined) => {
    if (!seviyeId) return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
    const index = seviyeId % defaultColors.length;
    return defaultColors[index];
  };

  // Sınıf seviyesi label
  const getSeviyeLabel = (sinifSeviyesi: { id: number; ad: string } | null) => {
    if (!sinifSeviyesi) return null;
    return sinifSeviyesi.ad;
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '60px 20px',
        color: '#64748b',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid #e2e8f0',
          borderTopColor: '#10b981',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginRight: '12px',
        }} />
        Yükleniyor...
        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (siniflar.length === 0) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '60px 20px',
        color: '#64748b',
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <p style={{ fontWeight: 500, color: '#475569' }}>Henüz sınıf tanımlanmamış</p>
        <p style={{ fontSize: '0.875rem' }}>Yeni bir sınıf ekleyerek başlayın</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={{ 
              padding: '14px 16px', 
              textAlign: 'left', 
              fontSize: '0.75rem', 
              fontWeight: 600, 
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderBottom: '1px solid #e2e8f0',
            }}>
              Sınıf
            </th>
            <th style={{ 
              padding: '14px 16px', 
              textAlign: 'left', 
              fontSize: '0.75rem', 
              fontWeight: 600, 
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderBottom: '1px solid #e2e8f0',
            }}>
              Seviye
            </th>
            <th style={{ 
              padding: '14px 16px', 
              textAlign: 'left', 
              fontSize: '0.75rem', 
              fontWeight: 600, 
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderBottom: '1px solid #e2e8f0',
            }}>
              Şube
            </th>
            <th style={{ 
              padding: '14px 16px', 
              textAlign: 'left', 
              fontSize: '0.75rem', 
              fontWeight: 600, 
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderBottom: '1px solid #e2e8f0',
            }}>
              Eğitim Yılı
            </th>
            <th style={{ 
              padding: '14px 16px', 
              textAlign: 'left', 
              fontSize: '0.75rem', 
              fontWeight: 600, 
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderBottom: '1px solid #e2e8f0',
            }}>
              Oda
            </th>
            <th style={{ 
              padding: '14px 16px', 
              textAlign: 'center', 
              fontSize: '0.75rem', 
              fontWeight: 600, 
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderBottom: '1px solid #e2e8f0',
            }}>
              Öğrenci
            </th>
            <th style={{ 
              padding: '14px 16px', 
              textAlign: 'center', 
              fontSize: '0.75rem', 
              fontWeight: 600, 
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderBottom: '1px solid #e2e8f0',
            }}>
              Durum
            </th>
            <th style={{ 
              padding: '14px 16px', 
              textAlign: 'right', 
              fontSize: '0.75rem', 
              fontWeight: 600, 
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderBottom: '1px solid #e2e8f0',
            }}>
              İşlemler
            </th>
          </tr>
        </thead>
        <tbody>
          {siniflar.map((sinif, index) => {
            const seviyeStyle = getSeviyeStyle(sinif.sinif_seviyesi?.id);
            const ogrenciSayisi = sinif.mevcutluk ?? sinif.ogrenci_sayisi ?? 0;
            const dolulukOrani = sinif.kapasite > 0 ? (ogrenciSayisi / sinif.kapasite) * 100 : 0;
            
            return (
              <tr 
                key={sinif.id}
                style={{ 
                  borderBottom: index < siniflar.length - 1 ? '1px solid #f1f5f9' : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#fafafa'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: `linear-gradient(135deg, ${seviyeStyle.bg}, ${seviyeStyle.border})`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: `1px solid ${seviyeStyle.border}`,
                    }}>
                      <span style={{
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        color: seviyeStyle.text,
                      }}>
                        {sinif.kod || sinif.ad.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '1rem' }}>
                        {sinif.ad}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                        {sinif.kod ? `Kod: ${sinif.kod}` : 'Kod belirtilmemiş'}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  {sinif.sinif_seviyesi ? (
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      background: seviyeStyle.bg,
                      color: seviyeStyle.text,
                      border: `1px solid ${seviyeStyle.border}`,
                    }}>
                      {sinif.sinif_seviyesi.ad}
                    </span>
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '14px 16px', color: '#475569', fontSize: '0.875rem' }}>
                  {sinif.sube?.ad || '—'}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    background: '#e0f2fe',
                    color: '#0c4a6e',
                    border: '1px solid #7dd3fc',
                  }}>
                    {sinif.egitim_yili?.ad || sinif.egitim_yili?.yil_str || '—'}
                  </span>
                </td>
                <td style={{ padding: '14px 16px', color: '#475569', fontSize: '0.875rem' }}>
                  {sinif.oda ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                      </svg>
                      {sinif.oda.ad}
                    </div>
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: '#1e293b',
                    }}>
                      {ogrenciSayisi} / {sinif.kapasite}
                    </span>
                    <div style={{
                      width: '60px',
                      height: '4px',
                      borderRadius: '2px',
                      background: '#e2e8f0',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${Math.min(dolulukOrani, 100)}%`,
                        height: '100%',
                        borderRadius: '2px',
                        background: dolulukOrani >= 90 
                          ? '#ef4444' 
                          : dolulukOrani >= 70 
                            ? '#f59e0b' 
                            : '#10b981',
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    background: sinif.aktif_mi ? '#dcfce7' : '#fee2e2',
                    color: sinif.aktif_mi ? '#16a34a' : '#dc2626',
                  }}>
                    {sinif.aktif_mi ? 'Aktif' : 'Pasif'}
                  </span>
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={() => onEdit(sinif)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        background: '#fff',
                        color: '#64748b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                      title="Düzenle"
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = '#10b981';
                        e.currentTarget.style.color = '#10b981';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = '#e2e8f0';
                        e.currentTarget.style.color = '#64748b';
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDelete(sinif)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        background: '#fff',
                        color: '#64748b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                      title="Sil"
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = '#ef4444';
                        e.currentTarget.style.color = '#ef4444';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = '#e2e8f0';
                        e.currentTarget.style.color = '#64748b';
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
