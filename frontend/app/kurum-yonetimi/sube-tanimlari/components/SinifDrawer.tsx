"use client";

import { useState, useEffect } from 'react';
import { Sinif, SinifFormData, Oda, SinifSeviyesi } from '../types';
import { createSinif, updateSinif, getOdalar, getSinifSeviyeleri } from '../services';
import { useKurum } from '@/lib/contexts/KurumContext';

interface SinifDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingSinif: Sinif | null;
}

export default function SinifDrawer({ isOpen, onClose, onSuccess, editingSinif }: SinifDrawerProps) {
  const { activeSube, activeEgitimYili } = useKurum();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [odalar, setOdalar] = useState<Oda[]>([]);
  const [sinifSeviyeleri, setSinifSeviyeleri] = useState<SinifSeviyesi[]>([]);
  
  const [formData, setFormData] = useState<SinifFormData>({
    sube_id: '',
    egitim_yili_id: '',
    ad: '',
    kod: '',
    oda_id: '',
    sinif_seviyesi_id: '',
    kapasite: '5',
    aktif_mi: true,
  });

  // Sınıf seviyelerini yükle
  useEffect(() => {
    getSinifSeviyeleri().then(setSinifSeviyeleri).catch(console.error);
  }, []);

  // Aktif şube değiştiğinde odaları yükle
  useEffect(() => {
    if (activeSube?.id) {
      getOdalar(activeSube.id).then(setOdalar).catch(console.error);
    } else {
      setOdalar([]);
    }
  }, [activeSube?.id]);

  // Form reset
  useEffect(() => {
    if (editingSinif) {
      setFormData({
        sube_id: editingSinif.sube.id.toString(),
        egitim_yili_id: editingSinif.egitim_yili.id.toString(),
        ad: editingSinif.ad,
        kod: editingSinif.kod || '',
        oda_id: editingSinif.oda?.id?.toString() || '',
        sinif_seviyesi_id: editingSinif.sinif_seviyesi?.id?.toString() || '',
        kapasite: editingSinif.kapasite.toString(),
        aktif_mi: editingSinif.aktif_mi,
      });
    } else {
      // Yeni kayıt - aktif context'ten al
      setFormData({
        sube_id: activeSube?.id?.toString() || '',
        egitim_yili_id: activeEgitimYili?.id?.toString() || '',
        ad: '',
        kod: '',
        oda_id: '',
        sinif_seviyesi_id: sinifSeviyeleri.length > 0 ? sinifSeviyeleri[0].id.toString() : '',
        kapasite: '5',
        aktif_mi: true,
      });
    }
    setError(null);
    setSuccess(null);
  }, [editingSinif, isOpen, activeSube, activeEgitimYili, sinifSeviyeleri]);

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
      if (editingSinif) {
        await updateSinif(editingSinif.id, formData);
        setSuccess('Sınıf başarıyla güncellendi!');
      } else {
        await createSinif(formData);
        setSuccess('Sınıf başarıyla oluşturuldu!');
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
          width: '520px',
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
                  background: 'linear-gradient(135deg, #10b981, #34d399)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                {editingSinif ? 'Sınıf Düzenle' : 'Yeni Sınıf Ekle'}
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '4px 0 0' }}>
                {editingSinif ? 'Sınıf bilgilerini güncelleyin' : 'Akademik sınıf tanımlayın'}
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

            {/* Section: Temel Bilgiler */}
            <div style={{
              marginBottom: '24px',
              padding: '20px',
              background: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
            }}>
              <h3 style={{ 
                fontSize: '0.875rem', 
                fontWeight: 600, 
                color: '#475569', 
                margin: '0 0 16px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Temel Bilgiler
              </h3>
              
              {/* Şube & Eğitim Yılı - Bilgi olarak göster */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '16px', 
                marginBottom: '16px',
                padding: '12px 16px',
                background: '#e0f2fe',
                borderRadius: '8px',
                border: '1px solid #7dd3fc',
              }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 500 }}>Şube</span>
                  <div style={{ fontSize: '0.875rem', color: '#0c4a6e', fontWeight: 600, marginTop: '2px' }}>
                    {editingSinif ? editingSinif.sube.ad : activeSube?.ad || 'Seçili değil'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 500 }}>Eğitim Yılı</span>
                  <div style={{ fontSize: '0.875rem', color: '#0c4a6e', fontWeight: 600, marginTop: '2px' }}>
                    {editingSinif ? editingSinif.egitim_yili.ad : (activeEgitimYili ? `${activeEgitimYili.baslangic_yil}-${activeEgitimYili.bitis_yil}` : 'Seçili değil')}
                  </div>
                </div>
              </div>

              {/* Sınıf Adı & Kod */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.8125rem', 
                    fontWeight: 500, 
                    color: '#374151',
                    marginBottom: '6px',
                  }}>
                    Sınıf Adı <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.ad}
                    onChange={(e) => setFormData({ ...formData, ad: e.target.value })}
                    placeholder="Örn: 9-A, 10-B"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.875rem',
                      color: '#1e293b',
                      transition: 'all 0.2s',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.8125rem', 
                    fontWeight: 500, 
                    color: '#374151',
                    marginBottom: '6px',
                  }}>
                    Sınıf Kodu
                  </label>
                  <input
                    type="text"
                    value={formData.kod}
                    onChange={(e) => setFormData({ ...formData, kod: e.target.value.toUpperCase() })}
                    placeholder="Örn: 9A, 10B"
                    maxLength={10}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.875rem',
                      color: '#1e293b',
                      textTransform: 'uppercase',
                      transition: 'all 0.2s',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Sınıf Seviyesi */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.8125rem', 
                  fontWeight: 500, 
                  color: '#374151',
                  marginBottom: '6px',
                }}>
                  Sınıf Seviyesi
                </label>
                <select
                  value={formData.sinif_seviyesi_id}
                  onChange={(e) => setFormData({ ...formData, sinif_seviyesi_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.875rem',
                    color: '#1e293b',
                    WebkitTextFillColor: '#1e293b',
                    backgroundColor: '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    outline: 'none',
                  }}
                >
                  <option value="">Seçin (Opsiyonel)</option>
                  {sinifSeviyeleri.map((seviye) => (
                    <option key={seviye.id} value={seviye.id}>{seviye.ad}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Section: Mekan ve Kapasite */}
            <div style={{
              marginBottom: '24px',
              padding: '20px',
              background: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
            }}>
              <h3 style={{ 
                fontSize: '0.875rem', 
                fontWeight: 600, 
                color: '#475569', 
                margin: '0 0 16px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Mekan ve Kapasite
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.8125rem', 
                    fontWeight: 500, 
                    color: '#374151',
                    marginBottom: '6px',
                  }}>
                    Oda
                  </label>
                  <select
                    value={formData.oda_id}
                    onChange={(e) => setFormData({ ...formData, oda_id: e.target.value })}
                    disabled={!activeSube?.id}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.875rem',
                      color: '#1e293b',
                      WebkitTextFillColor: '#1e293b',
                      backgroundColor: !activeSube?.id ? '#f1f5f9' : '#ffffff',
                      cursor: !activeSube?.id ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      outline: 'none',
                    }}
                  >
                    <option value="">Seçin (Opsiyonel)</option>
                    {odalar.filter(o => o.aktif_mi).map((oda) => (
                      <option key={oda.id} value={oda.id}>
                        {oda.ad} ({oda.kapasite} kişi)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.8125rem', 
                    fontWeight: 500, 
                    color: '#374151',
                    marginBottom: '6px',
                  }}>
                    Kapasite <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.kapasite}
                    onChange={(e) => setFormData({ ...formData, kapasite: e.target.value })}
                    min="1"
                    max="100"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.875rem',
                      color: '#1e293b',
                      transition: 'all 0.2s',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Preview Card */}
            {formData.ad && (
              <div style={{
                padding: '16px 20px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                border: '1px solid #bbf7d0',
                marginBottom: '20px',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 500, marginBottom: '4px' }}>
                  Oluşturulacak Sınıf
                </div>
                <div style={{ 
                  fontSize: '1.5rem', 
                  fontWeight: 700, 
                  color: '#15803d',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  {formData.ad}
                  {formData.oda_id && (
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      padding: '4px 8px',
                      background: '#dcfce7',
                      borderRadius: '6px',
                      color: '#166534',
                    }}>
                      {odalar.find(o => o.id.toString() === formData.oda_id)?.ad}
                    </span>
                  )}
                </div>
              </div>
            )}

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
                    Sınıf kayıtlara açık mı?
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
                background: loading ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #34d399)',
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
              ) : editingSinif ? 'Güncelle' : 'Kaydet'}
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
