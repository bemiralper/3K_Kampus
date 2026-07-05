"use client";

import { useState, useEffect } from 'react';
import { Oda, OdaFormData, OdaTur } from '../types';
import { getOdaTurleri, createOda, updateOda } from '../services';

interface OdaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingOda: Oda | null;
  activeSube: { id: number; ad: string } | null;
}

export default function OdaDrawer({ isOpen, onClose, onSuccess, editingOda, activeSube }: OdaDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [odaTurleri, setOdaTurleri] = useState<OdaTur[]>([]);
  
  const [formData, setFormData] = useState<OdaFormData>({
    sube_id: '',
    ad: '',
    kapasite: '5',
    oda_turu: 'derslik',
    aciklama: '',
    aktif_mi: true,
  });

  // Oda türlerini yükle
  useEffect(() => {
    getOdaTurleri().then(setOdaTurleri).catch(console.error);
  }, []);

  // Form reset
  useEffect(() => {
    if (editingOda) {
      setFormData({
        sube_id: editingOda.sube.id.toString(),
        ad: editingOda.ad,
        kapasite: editingOda.kapasite.toString(),
        oda_turu: editingOda.oda_turu || 'derslik',
        aciklama: editingOda.aciklama || '',
        aktif_mi: editingOda.aktif_mi,
      });
    } else {
      setFormData({
        sube_id: activeSube ? String(activeSube.id) : '',
        ad: '',
        kapasite: '5',
        oda_turu: 'derslik',
        aciklama: '',
        aktif_mi: true,
      });
    }
    setError(null);
    setSuccess(null);
  }, [editingOda, isOpen, activeSube]);

  // ESC tuşu
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (!editingOda && !activeSube) {
        throw new Error('Aktif şube seçili değil. Üst menüden şube seçin.');
      }
      if (editingOda) {
        await updateOda(editingOda.id, formData);
        setSuccess('Oda başarıyla güncellendi!');
      } else {
        await createOda(formData);
        setSuccess('Oda başarıyla oluşturuldu!');
      }
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="drawer-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          opacity: 1,
          transition: 'opacity 0.3s ease',
        }}
      />
      
      {/* Drawer */}
      <div 
        className="modern-drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '480px',
          maxWidth: '100vw',
          height: '100vh',
          background: '#fff',
          boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.15)',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          transform: 'translateX(0)',
          transition: 'transform 0.3s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #e2e8f0',
          background: 'linear-gradient(135deg, #f8fafc 0%, #fff 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ 
                fontSize: '1.25rem', 
                fontWeight: 600, 
                color: '#1e293b',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <span style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </span>
                {editingOda ? 'Oda Düzenle' : 'Yeni Oda Ekle'}
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '4px 0 0' }}>
                {editingOda ? 'Oda bilgilerini güncelleyin' : 'Fiziksel mekan tanımlayın'}
              </p>
            </div>
            <button 
              onClick={onClose}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#f1f5f9';
                e.currentTarget.style.color = '#1e293b';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.color = '#64748b';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
            {/* Messages */}
            {error && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                fontSize: '0.875rem',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}
            
            {success && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#16a34a',
                fontSize: '0.875rem',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                {success}
              </div>
            )}

            {!activeSube && !editingOda && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#fffbeb',
                border: '1px solid #fcd34d',
                color: '#92400e',
                fontSize: '0.875rem',
                marginBottom: '20px',
              }}>
                Aktif şube seçili değil. Üst menüden şube seçin.
              </div>
            )}

            {activeSube && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
                fontSize: '0.875rem',
                marginBottom: '20px',
              }}>
                Şube: <strong>{activeSube.ad}</strong> (aktif bağlam)
              </div>
            )}

            {/* Oda Adı */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: 500, 
                color: '#374151',
                marginBottom: '8px',
              }}>
                Oda Adı <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.ad}
                onChange={(e) => setFormData({ ...formData, ad: e.target.value })}
                placeholder="Örn: A-101, Laboratuvar 1"
                required
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.9375rem',
                  color: '#1e293b',
                  transition: 'all 0.2s',
                  outline: 'none',
                }}
              />
            </div>

            {/* Kapasite & Oda Türü - 2 Column */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: 500, 
                  color: '#374151',
                  marginBottom: '8px',
                }}>
                  Kapasite <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  value={formData.kapasite}
                  onChange={(e) => setFormData({ ...formData, kapasite: e.target.value })}
                  min="1"
                  max="500"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.9375rem',
                    color: '#1e293b',
                    transition: 'all 0.2s',
                    outline: 'none',
                  }}
                />
              </div>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: 500, 
                  color: '#374151',
                  marginBottom: '8px',
                }}>
                  Oda Türü
                </label>
                <select
                  value={formData.oda_turu}
                  onChange={(e) => setFormData({ ...formData, oda_turu: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.9375rem',
                    color: '#1e293b',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    outline: 'none',
                  }}
                >
                  {odaTurleri.map((tur) => (
                    <option key={tur.value} value={tur.value}>{tur.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Açıklama */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: 500, 
                color: '#374151',
                marginBottom: '8px',
              }}>
                Açıklama
              </label>
              <textarea
                value={formData.aciklama}
                onChange={(e) => setFormData({ ...formData, aciklama: e.target.value })}
                placeholder="Oda hakkında ek bilgiler..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.9375rem',
                  color: '#1e293b',
                  resize: 'none',
                  transition: 'all 0.2s',
                  outline: 'none',
                }}
              />
            </div>

            {/* Aktif Toggle */}
            <div style={{ 
              padding: '16px',
              borderRadius: '12px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}>
                <div>
                  <span style={{ fontWeight: 500, color: '#1e293b' }}>Aktif Durum</span>
                  <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '2px 0 0' }}>
                    Oda kullanıma açık mı?
                  </p>
                </div>
                <div 
                  onClick={() => setFormData({ ...formData, aktif_mi: !formData.aktif_mi })}
                  style={{
                    width: '48px',
                    height: '26px',
                    borderRadius: '13px',
                    background: formData.aktif_mi ? 'linear-gradient(135deg, #10b981, #34d399)' : '#cbd5e1',
                    padding: '3px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    transform: formData.aktif_mi ? 'translateX(22px)' : 'translateX(0)',
                    transition: 'transform 0.2s',
                  }} />
                </div>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '20px 24px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            gap: '12px',
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px 20px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#64748b',
                fontSize: '0.9375rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px 20px',
                borderRadius: '10px',
                border: 'none',
                background: loading ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                color: '#fff',
                fontSize: '0.9375rem',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Kaydediliyor...
                </>
              ) : editingOda ? 'Güncelle' : 'Kaydet'}
            </button>
          </div>
        </form>

        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </>
  );
}
