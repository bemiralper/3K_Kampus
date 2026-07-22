"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Oda, Sinif, OdaTur, SinifSeviyesi } from './types';
import { 
  getOdalar, 
  getSiniflar, 
  deleteOda, 
  deleteSinif, 
  getOdaTurleri,
  getSinifSeviyeleri,
  downloadSinifExportCsv,
  downloadSinifExportXlsx,
} from './services';
import { OdaDrawer, SinifDrawer, OdaTable, SinifTable } from './components';
import { useKurum } from '@/lib/contexts/KurumContext';
import { downloadBlob } from '@/lib/download-file';

interface OdalarSiniflarSectionProps {
  activeTab: 'odalar' | 'siniflar';
}

export default function OdalarSiniflarSection({ activeTab }: OdalarSiniflarSectionProps) {
  const { activeSube } = useKurum();
  
  // State
  const [odalar, setOdalar] = useState<Oda[]>([]);
  const [siniflar, setSiniflar] = useState<Sinif[]>([]);
  const [odaTurleri, setOdaTurleri] = useState<OdaTur[]>([]);
  const [sinifSeviyeleri, setSinifSeviyeleri] = useState<SinifSeviyesi[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Drawer states
  const [showOdaDrawer, setShowOdaDrawer] = useState(false);
  const [showSinifDrawer, setShowSinifDrawer] = useState(false);
  const [editingOda, setEditingOda] = useState<Oda | null>(null);
  const [editingSinif, setEditingSinif] = useState<Sinif | null>(null);
  
  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{ type: 'oda' | 'sinif'; item: Oda | Sinif } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Data fetching
  const fetchOdalar = useCallback(async () => {
    setLoading(true);
    try {
      const subeId = activeSube?.id;
      const data = await getOdalar(subeId);
      setOdalar(data);
    } catch (error) {
      console.error('Odalar yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  }, [activeSube?.id]);

  const fetchSiniflar = useCallback(async () => {
    setLoading(true);
    try {
      const subeId = activeSube?.id;
      const data = await getSiniflar(subeId);
      setSiniflar(data);
    } catch (error) {
      console.error('Sınıflar yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  }, [activeSube?.id]);

  const fetchMasterData = useCallback(async () => {
    try {
      const [odaTurData, sinifSeviyeData] = await Promise.all([
        getOdaTurleri(),
        getSinifSeviyeleri(),
      ]);
      setOdaTurleri(odaTurData);
      setSinifSeviyeleri(sinifSeviyeData);
    } catch (error) {
      console.error('Master data yüklenemedi:', error);
    }
  }, []);

  useEffect(() => {
    fetchMasterData();
  }, [fetchMasterData]);

  useEffect(() => {
    fetchOdalar();
    fetchSiniflar();
  }, [activeSube?.id, fetchOdalar, fetchSiniflar]);

  useEffect(() => {
    if (!exportOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportOpen]);

  async function handleSinifExport(format: 'csv' | 'xlsx') {
    setExportOpen(false);
    setExporting(true);
    setExportError(null);
    try {
      const blob = format === 'csv'
        ? await downloadSinifExportCsv()
        : await downloadSinifExportXlsx();
      downloadBlob(blob, `sinif_listesi.${format}`);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Dışa aktarma başarısız.');
    } finally {
      setExporting(false);
    }
  }

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
    setDeleteError(null);
    setDeletingItem({ type: 'oda', item: oda });
    setShowDeleteModal(true);
  };

  const handleDeleteSinif = (sinif: Sinif) => {
    setDeleteError(null);
    setDeletingItem({ type: 'sinif', item: sinif });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deletingItem) return;
    
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      if (deletingItem.type === 'oda') {
        await deleteOda((deletingItem.item as Oda).id);
        await fetchOdalar();
      } else {
        await deleteSinif((deletingItem.item as Sinif).id);
        await fetchSiniflar();
      }
      setShowDeleteModal(false);
      setDeletingItem(null);
    } catch (error: any) {
      console.error('Silme hatası:', error);
      // Hata mesajını göster
      const errorMessage = error?.message || 'Silme işlemi başarısız oldu';
      setDeleteError(errorMessage);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filtered data
  const filteredOdalar = odalar.filter(o => 
    o.ad.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const filteredSiniflar = siniflar.filter(s => 
    s.ad.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const odaIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );

  const sinifIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );

  return (
    <>
      {/* Search & Add Button */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px',
        gap: '16px'
      }}>
        <div className="search-modern" style={{ flex: 1, maxWidth: '400px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input 
            type="text" 
            placeholder={activeTab === 'odalar' ? 'Oda ara...' : 'Sınıf ara...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '14px',
              width: '100%',
              padding: '8px 12px'
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {activeTab === 'siniflar' && (
            <div style={{ position: 'relative' }} ref={exportMenuRef}>
              <button
                type="button"
                disabled={exporting}
                onClick={() => setExportOpen((v) => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  background: 'white',
                  color: '#334155',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: exporting ? 'not-allowed' : 'pointer',
                  opacity: exporting ? 0.6 : 1,
                }}
              >
                {exporting ? 'Hazırlanıyor…' : 'Dışa Aktar'}
              </button>
              {exportOpen && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 8px)',
                  minWidth: '160px',
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
                  padding: '6px',
                  zIndex: 20,
                }}>
                  <button
                    type="button"
                    onClick={() => handleSinifExport('xlsx')}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: 'none',
                      background: 'transparent',
                      borderRadius: '8px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSinifExport('csv')}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: 'none',
                      background: 'transparent',
                      borderRadius: '8px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    CSV
                  </button>
                </div>
              )}
            </div>
          )}
        <button 
          onClick={handleAddNew}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {activeTab === 'odalar' ? 'Yeni Oda' : 'Yeni Sınıf'}
        </button>
        </div>
      </div>

      {exportError && activeTab === 'siniflar' && (
        <div style={{
          marginBottom: '16px',
          padding: '12px 16px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#dc2626',
          fontSize: '14px',
        }}>
          {exportError}
        </div>
      )}

      {/* Content Card */}
      <div className="card-modern">
        <div className="card-modern-header">
          <h3>
            {activeTab === 'odalar' && <>{odaIcon} Odalar Listesi ({filteredOdalar.length})</>}
            {activeTab === 'siniflar' && <>{sinifIcon} Sınıflar Listesi ({filteredSiniflar.length})</>}
          </h3>
        </div>
        <div className="card-modern-body" style={{ padding: 0 }}>
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
      </div>

      {/* Drawers */}
      <OdaDrawer 
        isOpen={showOdaDrawer}
        onClose={() => { setShowOdaDrawer(false); setEditingOda(null); }}
        onSuccess={() => { fetchOdalar(); setShowOdaDrawer(false); setEditingOda(null); }}
        editingOda={editingOda}
        activeSube={activeSube ? { id: activeSube.id, ad: activeSube.ad } : null}
      />
      
      <SinifDrawer 
        isOpen={showSinifDrawer}
        onClose={() => { setShowSinifDrawer(false); setEditingSinif(null); }}
        onSuccess={() => { fetchSiniflar(); setShowSinifDrawer(false); setEditingSinif(null); }}
        editingSinif={editingSinif}
      />

      {/* Delete Modal */}
      {showDeleteModal && deletingItem && (
        <>
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 1000
            }}
            onClick={() => { setShowDeleteModal(false); setDeleteError(null); }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            zIndex: 1001,
            minWidth: '400px',
            maxWidth: '500px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600 }}>
              {deletingItem.type === 'oda' ? 'Oda Sil' : 'Sınıf Sil'}
            </h3>
            
            {/* Hata mesajı */}
            {deleteError && (
              <div style={{
                padding: '12px 16px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div>
                  <p style={{ margin: 0, color: '#dc2626', fontWeight: 500, fontSize: '14px' }}>
                    Silme işlemi yapılamadı
                  </p>
                  <p style={{ margin: '4px 0 0', color: '#b91c1c', fontSize: '13px' }}>
                    {deleteError}
                  </p>
                </div>
              </div>
            )}
            
            {!deleteError && (
              <p style={{ margin: '0 0 24px', color: '#64748b' }}>
                <strong>{(deletingItem.item as any).ad}</strong> {deletingItem.type === 'oda' ? 'odasını' : 'sınıfını'} silmek istediğinizden emin misiniz?
              </p>
            )}
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => { setShowDeleteModal(false); setDeleteError(null); }}
                style={{
                  padding: '10px 20px',
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                {deleteError ? 'Kapat' : 'İptal'}
              </button>
              {!deleteError && (
              <button 
                onClick={confirmDelete}
                disabled={deleteLoading}
                style={{
                  padding: '10px 20px',
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  opacity: deleteLoading ? 0.6 : 1
                }}
              >
                {deleteLoading ? 'Siliniyor...' : 'Sil'}
              </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
