"use client";

import { useState, useEffect, useCallback } from 'react';
import { TabType, Oda, Sinif, Sube, EgitimYili, OdaTur, SinifSeviyesi } from './types';
import { 
  getOdalar, 
  getSiniflar, 
  deleteOda, 
  deleteSinif, 
  getSubeler, 
  getEgitimYillari,
  getOdaTurleri,
  getSinifSeviyeleri
} from './services';
import { OdaDrawer, SinifDrawer, OdaTable, SinifTable } from './components';

export default function SubeTanimlariPage() {
  const [mounted, setMounted] = useState(false);
  
  // State
  const [activeTab, setActiveTab] = useState<TabType>('odalar');
  const [odalar, setOdalar] = useState<Oda[]>([]);
  const [siniflar, setSiniflar] = useState<Sinif[]>([]);
  const [subeler, setSubeler] = useState<Sube[]>([]);
  const [egitimYillari, setEgitimYillari] = useState<EgitimYili[]>([]);
  const [odaTurleri, setOdaTurleri] = useState<OdaTur[]>([]);
  const [sinifSeviyeleri, setSinifSeviyeleri] = useState<SinifSeviyesi[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubeFilter, setSelectedSubeFilter] = useState<string>('');
  
  // Drawer states
  const [showOdaDrawer, setShowOdaDrawer] = useState(false);
  const [showSinifDrawer, setShowSinifDrawer] = useState(false);
  const [editingOda, setEditingOda] = useState<Oda | null>(null);
  const [editingSinif, setEditingSinif] = useState<Sinif | null>(null);
  
  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{ type: 'oda' | 'sinif'; item: Oda | Sinif } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Stats
  const odaStats = {
    toplam: odalar.length,
    aktif: odalar.filter(o => o.aktif_mi).length,
    pasif: odalar.filter(o => !o.aktif_mi).length,
  };

  const sinifStats = {
    toplam: siniflar.length,
    aktif: siniflar.filter(s => s.aktif_mi).length,
    pasif: siniflar.filter(s => !s.aktif_mi).length,
    ogrenciSayisi: siniflar.reduce((acc, s) => acc + (s.mevcutluk || s.ogrenci_sayisi || 0), 0),
  };

  // Data fetching
  const fetchOdalar = useCallback(async () => {
    setLoading(true);
    try {
      const subeId = selectedSubeFilter ? parseInt(selectedSubeFilter) : undefined;
      const data = await getOdalar(subeId);
      setOdalar(data);
    } catch (error) {
      console.error('Odalar yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedSubeFilter]);

  const fetchSiniflar = useCallback(async () => {
    setLoading(true);
    try {
      const subeId = selectedSubeFilter ? parseInt(selectedSubeFilter) : undefined;
      const data = await getSiniflar(subeId);
      setSiniflar(data);
    } catch (error) {
      console.error('Sınıflar yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedSubeFilter]);

  const fetchMasterData = useCallback(async () => {
    try {
      const [subeData, egitimYiliData, odaTurData, sinifSeviyeData] = await Promise.all([
        getSubeler(),
        getEgitimYillari(),
        getOdaTurleri(),
        getSinifSeviyeleri(),
      ]);
      setSubeler(subeData);
      setEgitimYillari(egitimYiliData);
      setOdaTurleri(odaTurData);
      setSinifSeviyeleri(sinifSeviyeData);
    } catch (error) {
      console.error('Master data yüklenemedi:', error);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchMasterData();
  }, [fetchMasterData]);

  // İlk yüklemede her iki veriyi de çek (tab sayıları için)
  useEffect(() => {
    fetchOdalar();
    fetchSiniflar();
  }, [selectedSubeFilter, fetchOdalar, fetchSiniflar]);

  // ESC tuşu ile drawer kapatma
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowOdaDrawer(false);
        setShowSinifDrawer(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Handlers
  const handleAddNew = () => {
    if (activeTab === 'odalar') {
      setEditingOda(null);
      setShowOdaDrawer(true);
    } else {
      setEditingSinif(null);
      setShowSinifDrawer(true);
    }
  };

  const handleEditOda = (oda: Oda) => {
    setEditingOda(oda);
    setShowOdaDrawer(true);
  };

  const handleEditSinif = (sinif: Sinif) => {
    setEditingSinif(sinif);
    setShowSinifDrawer(true);
  };

  const handleDeleteOda = (oda: Oda) => {
    setDeletingItem({ type: 'oda', item: oda });
    setShowDeleteModal(true);
  };

  const handleDeleteSinif = (sinif: Sinif) => {
    setDeletingItem({ type: 'sinif', item: sinif });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deletingItem) return;
    setDeleteLoading(true);
    
    try {
      if (deletingItem.type === 'oda') {
        await deleteOda((deletingItem.item as Oda).id);
        fetchOdalar();
      } else {
        await deleteSinif((deletingItem.item as Sinif).id);
        fetchSiniflar();
      }
      setShowDeleteModal(false);
      setDeletingItem(null);
    } catch (error) {
      console.error('Silme hatası:', error);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filtered data
  const filteredOdalar = odalar.filter(oda => 
    oda.ad.toLowerCase().includes(searchTerm.toLowerCase()) ||
    oda.sube.ad.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSiniflar = siniflar.filter(sinif => 
    sinif.ad.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (sinif.kod && sinif.kod.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (sinif.sube?.ad && sinif.sube.ad.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (sinif.sinif_seviyesi?.ad && sinif.sinif_seviyesi.ad.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Hydration tamamlanana kadar bekle
  if (!mounted) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: 40, 
            height: 40, 
            border: '3px solid #e2e8f0', 
            borderTop: '3px solid #0066cc', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite',
            margin: '0 auto 12px'
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Hero Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '32px',
        background: 'linear-gradient(135deg, #0066cc 0%, #0052a3 100%)',
        borderRadius: '20px',
        marginBottom: '24px',
        boxShadow: '0 10px 40px rgba(0, 102, 204, 0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'white', margin: '0 0 4px' }}>
              Şube Tanımları
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
              <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none' }}>Ana Sayfa</a>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>/</span>
              <a href="/kurum-yonetimi" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none' }}>Kurum Yönetimi</a>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>/</span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>Şube Tanımları</span>
            </div>
          </div>
        </div>
        <button
          onClick={handleAddNew}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 24px',
            background: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: '#0066cc',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <span style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #0066cc, #0052a3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <span>{activeTab === 'odalar' ? 'Yeni Oda' : 'Yeni Sınıf'}</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {activeTab === 'odalar' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', flex: 1, minWidth: '160px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
              </div>
              <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>{odaStats.toplam}</span>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Toplam</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', flex: 1, minWidth: '160px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>{odaStats.aktif}</span>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Aktif</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', flex: 1, minWidth: '160px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#fff7ed', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              </div>
              <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>{odaStats.pasif}</span>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Pasif</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', flex: 1, minWidth: '160px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              </div>
              <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>{sinifStats.toplam}</span>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Toplam Sınıf</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', flex: 1, minWidth: '160px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>{sinifStats.aktif}</span>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Aktif</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', flex: 1, minWidth: '160px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#faf5ff', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>{sinifStats.ogrenciSayisi}</span>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Toplam Öğrenci</span>
            </div>
          </>
        )}
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', padding: '4px', background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <button
          onClick={() => setActiveTab('odalar')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 24px',
            background: activeTab === 'odalar' ? '#0066cc' : 'transparent',
            border: 'none',
            borderRadius: '10px',
            fontSize: '0.9375rem',
            fontWeight: 500,
            color: activeTab === 'odalar' ? 'white' : '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: activeTab === 'odalar' ? '0 4px 12px rgba(0, 102, 204, 0.25)' : 'none',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Oda Tanımlama
          <span style={{
            padding: '2px 10px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: activeTab === 'odalar' ? 'rgba(255,255,255,0.2)' : '#f1f5f9',
            color: activeTab === 'odalar' ? 'white' : '#64748b',
          }}>
            {odalar.length}
          </span>
        </button>
        
        <button
          onClick={() => setActiveTab('siniflar')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 24px',
            background: activeTab === 'siniflar' ? '#10b981' : 'transparent',
            border: 'none',
            borderRadius: '10px',
            fontSize: '0.9375rem',
            fontWeight: 500,
            color: activeTab === 'siniflar' ? 'white' : '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: activeTab === 'siniflar' ? '0 4px 12px rgba(16, 185, 129, 0.25)' : 'none',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Sınıf Tanımlama
          <span style={{
            padding: '2px 10px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: activeTab === 'siniflar' ? 'rgba(255,255,255,0.2)' : '#f1f5f9',
            color: activeTab === 'siniflar' ? 'white' : '#64748b',
          }}>
            {siniflar.length}
          </span>
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <svg 
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="#94a3b8" 
            strokeWidth="2"
            style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={activeTab === 'odalar' ? 'Oda ara...' : 'Sınıf ara...'}
            style={{
              width: '100%',
              padding: '14px 16px 14px 48px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              background: 'white',
              fontSize: '0.9375rem',
              color: '#1e293b',
              outline: 'none',
              transition: 'all 0.2s',
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                border: 'none',
                background: '#f1f5f9',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <select
          value={selectedSubeFilter}
          onChange={(e) => setSelectedSubeFilter(e.target.value)}
          style={{
            padding: '14px 16px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            background: 'white',
            fontSize: '0.9375rem',
            color: '#1e293b',
            cursor: 'pointer',
            outline: 'none',
            minWidth: '180px',
          }}
        >
          <option value="">Tüm Şubeler</option>
          {subeler.map((sube) => (
            <option key={sube.id} value={sube.id}>{sube.ad}</option>
          ))}
        </select>
      </div>

      {/* Data Grid */}
      <div style={{
        background: 'white',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
      }}>
        {activeTab === 'odalar' ? (
          <OdaTable
            odalar={filteredOdalar}
            loading={loading}
            onEdit={handleEditOda}
            onDelete={handleDeleteOda}
            odaTurleri={odaTurleri}
          />
        ) : (
          <SinifTable
            siniflar={filteredSiniflar}
            loading={loading}
            onEdit={handleEditSinif}
            onDelete={handleDeleteSinif}
            sinifSeviyeleri={sinifSeviyeleri}
          />
        )}
      </div>

      {/* Drawers */}
      <OdaDrawer
        isOpen={showOdaDrawer}
        onClose={() => {
          setShowOdaDrawer(false);
          setEditingOda(null);
        }}
        onSuccess={() => fetchOdalar()}
        editingOda={editingOda}
        subeler={subeler}
      />

      <SinifDrawer
        isOpen={showSinifDrawer}
        onClose={() => {
          setShowSinifDrawer(false);
          setEditingSinif(null);
        }}
        onSuccess={() => fetchSiniflar()}
        editingSinif={editingSinif}
      />

      {/* Delete Modal */}
      {showDeleteModal && deletingItem && (
        <>
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.5)',
              backdropFilter: 'blur(4px)',
              zIndex: 1000,
            }}
            onClick={() => {
              setShowDeleteModal(false);
              setDeletingItem(null);
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#fff',
            borderRadius: '16px',
            padding: '24px',
            width: '400px',
            maxWidth: '90vw',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
            zIndex: 1001,
          }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: '#fef2f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1e293b', margin: '0 0 8px' }}>
                {deletingItem.type === 'oda' ? 'Odayı Sil' : 'Sınıfı Sil'}
              </h3>
              <p style={{ color: '#64748b', margin: 0 }}>
                <strong>
                  {deletingItem.type === 'oda' 
                    ? (deletingItem.item as Oda).ad 
                    : (deletingItem.item as Sinif).ad}
                </strong>{' '}
                silinecek. Bu işlem geri alınamaz.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletingItem(null);
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  color: '#64748b',
                  fontSize: '0.9375rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                İptal
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteLoading}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: deleteLoading ? '#fca5a5' : '#ef4444',
                  color: '#fff',
                  fontSize: '0.9375rem',
                  fontWeight: 500,
                  cursor: deleteLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {deleteLoading ? 'Siliniyor...' : 'Sil'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
