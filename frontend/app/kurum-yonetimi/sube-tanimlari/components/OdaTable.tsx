"use client";

import { Oda, OdaTur } from '../types';

// Oda türü renkleri
const odaTuruRenkleri: Record<string, { bg: string; text: string; border: string }> = {
  derslik: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  laboratuvar: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  spor_salonu: { bg: '#fef3c7', text: '#b45309', border: '#fde68a' },
  kutuphane: { bg: '#faf5ff', text: '#7c3aed', border: '#e9d5ff' },
  yemekhane: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  toplanti: { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
  mudur: { bg: '#fdf4ff', text: '#a21caf', border: '#f5d0fe' },
  ogretmenler: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  diger: { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' },
};

interface OdaTableProps {
  odalar: Oda[];
  loading: boolean;
  onEdit: (oda: Oda) => void;
  onDelete: (oda: Oda) => void;
  odaTurleri: OdaTur[];
}

export default function OdaTable({ odalar, loading, onEdit, onDelete, odaTurleri }: OdaTableProps) {
  const getOdaTuruLabel = (value: string): string => {
    const tur = odaTurleri.find(t => t.value === value);
    return tur?.label || value;
  };

  const getOdaTuruStyle = (value: string) => {
    return odaTuruRenkleri[value] || odaTuruRenkleri.diger;
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
          borderTopColor: '#3b82f6',
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

  if (odalar.length === 0) {
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
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </div>
        <p style={{ fontWeight: 500, color: '#475569' }}>Henüz oda tanımlanmamış</p>
        <p style={{ fontSize: '0.875rem' }}>Yeni bir oda ekleyerek başlayın</p>
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
              Oda Adı
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
              Tür
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
              Kapasite
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
          {odalar.map((oda, index) => {
            const turStyle = getOdaTuruStyle(oda.oda_turu || 'diger');
            return (
              <tr 
                key={oda.id}
                style={{ 
                  borderBottom: index < odalar.length - 1 ? '1px solid #f1f5f9' : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#fafafa'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                    }}>
                      {oda.ad.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, color: '#1e293b' }}>{oda.ad}</div>
                      {oda.aciklama && (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                          {oda.aciklama.substring(0, 30)}{oda.aciklama.length > 30 ? '...' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '14px 16px', color: '#475569', fontSize: '0.875rem' }}>
                  {oda.sube.ad}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    background: turStyle.bg,
                    color: turStyle.text,
                    border: `1px solid ${turStyle.border}`,
                  }}>
                    {getOdaTuruLabel(oda.oda_turu || 'diger')}
                  </span>
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    background: '#f1f5f9',
                    color: '#475569',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                    </svg>
                    {oda.kapasite}
                  </span>
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    background: oda.aktif_mi ? '#dcfce7' : '#fee2e2',
                    color: oda.aktif_mi ? '#16a34a' : '#dc2626',
                  }}>
                    {oda.aktif_mi ? 'Aktif' : 'Pasif'}
                  </span>
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={() => onEdit(oda)}
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
                        e.currentTarget.style.borderColor = '#3b82f6';
                        e.currentTarget.style.color = '#3b82f6';
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
                      onClick={() => onDelete(oda)}
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
