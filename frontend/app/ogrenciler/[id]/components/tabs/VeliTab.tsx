"use client";

import { useState, useEffect } from "react";
import { OgrenciDetay, OgrenciVeli } from "../../types";
import WhatsAppChatButton from "@/components/communication/WhatsAppChatButton";
import { apiFetch } from "@/lib/api";

interface VeliTabProps {
  data: OgrenciDetay;
}

interface VeliFormData {
  veli_turu: string;
  tc_kimlik_no: string;
  ad: string;
  soyad: string;
  telefon: string;
  email: string;
  meslek: string;
  sms_bildirimleri: string[];
}

const DEFAULT_SMS_BILDIRIMLERI = ['duyuru', 'devamsizlik', 'odeme'];

const BILDIRIM_OPTIONS = [
  {
    code: 'duyuru',
    label: 'Duyuru',
    hint: 'Ödev, rapor ve genel duyurular (WhatsApp / SMS)',
  },
  {
    code: 'devamsizlik',
    label: 'Devamsızlık',
    hint: 'Devamsızlık bildirimleri (WhatsApp / SMS)',
  },
  {
    code: 'odeme',
    label: 'Ödeme',
    hint: 'Ödeme hatırlatma, makbuz ve plan (WhatsApp / SMS)',
  },
] as const;

const BILDIRIM_LABELS: Record<string, string> = Object.fromEntries(
  BILDIRIM_OPTIONS.map((o) => [o.code, o.label]),
);

const VELI_TURU_OPTIONS = [
  { value: 'anne', label: 'Anne' },
  { value: 'baba', label: 'Baba' },
  { value: 'kiz_kardes', label: 'Kız Kardeş' },
  { value: 'erkek_kardes', label: 'Erkek Kardeş' },
  { value: 'dayi_amca', label: 'Dayı / Amca' },
  { value: 'hala_teyze', label: 'Hala / Teyze' },
  { value: 'egitim_masraf', label: 'Eğitim Masraflarını Karşılayan' },
  { value: 'diger', label: 'Diğer' },
];

export default function VeliTab({ data }: VeliTabProps) {
  const [editingVeliId, setEditingVeliId] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [formData, setFormData] = useState<VeliFormData>({
    veli_turu: 'anne',
    tc_kimlik_no: '',
    ad: '',
    soyad: '',
    telefon: '',
    email: '',
    meslek: '',
    sms_bildirimleri: [...DEFAULT_SMS_BILDIRIMLERI],
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const veliler = data.veliler || [];

  const emptyForm = (): VeliFormData => ({
    veli_turu: 'anne',
    tc_kimlik_no: '',
    ad: '',
    soyad: '',
    telefon: '',
    email: '',
    meslek: '',
    sms_bildirimleri: [...DEFAULT_SMS_BILDIRIMLERI],
  });

  const toFormData = (veli: OgrenciVeli): VeliFormData => ({
    veli_turu: veli.veli_turu,
    tc_kimlik_no: veli.tc_kimlik_no || '',
    ad: veli.ad || '',
    soyad: veli.soyad || '',
    telefon: veli.telefon || '',
    email: veli.email || '',
    meslek: veli.meslek || '',
    sms_bildirimleri: veli.sms_bildirimleri?.length
      ? [...veli.sms_bildirimleri]
      : [...DEFAULT_SMS_BILDIRIMLERI],
  });

  const toggleBildirim = (code: string) => {
    setFormData((prev) => {
      const current = prev.sms_bildirimleri;
      const next = current.includes(code)
        ? current.filter((c) => c !== code)
        : [...current, code];
      return { ...prev, sms_bildirimleri: next };
    });
  };

  // ESC tuşu ile drawer'ı kapat
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isDrawerOpen]);

  // Body scroll'u engelle drawer açıkken
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDrawerOpen]);

  const handleEdit = (veli: OgrenciVeli) => {
    setEditingVeliId(veli.id);
    setIsAddingNew(false);
    setFormData(toFormData(veli));
    setSaveError(null);
    setIsDrawerOpen(true);
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setEditingVeliId(null);
    setFormData(emptyForm());
    setSaveError(null);
    setIsDrawerOpen(true);
  };

  const handleCancel = () => {
    setIsDrawerOpen(false);
    setEditingVeliId(null);
    setIsAddingNew(false);
    setFormData(emptyForm());
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!formData.ad.trim() || !formData.soyad.trim()) {
      setSaveError('Ad ve soyad zorunludur.');
      return;
    }
    if (!isAddingNew && !editingVeliId) {
      setSaveError('Düzenlenecek veli seçilemedi. Lütfen tekrar deneyin.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const endpoint = isAddingNew
        ? `/ogrenciler/api/${data.id}/veliler/`
        : `/ogrenciler/api/${data.id}/veliler/${editingVeliId}/`;

      const result = await apiFetch(endpoint, {
        method: isAddingNew ? 'POST' : 'PUT',
        body: JSON.stringify(formData),
      });

      if (!result.success) {
        setSaveError(result.error || 'Veli kaydedilemedi');
        return;
      }

      setIsDrawerOpen(false);
      window.location.reload();
    } catch (error) {
      console.error('Veli kaydetme hatası:', error);
      setSaveError('Veli kaydedilirken bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (veliId: number) => {
    if (!confirm('Bu veliyi silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      const result = await apiFetch(`/ogrenciler/api/${data.id}/veliler/${veliId}/`, {
        method: 'DELETE',
      });

      if (result.success) {
        window.location.reload();
      } else {
        alert(result.error || 'Bir hata oluştu');
      }
    } catch (error) {
      console.error('Veli silme hatası:', error);
      alert('Veli silinirken bir hata oluştu');
    }
  };

  const renderVeliForm = () => (
    <div className="veli-form">
      <div className="form-row">
        <div className="form-group">
          <label>Yakınlık</label>
          <select
            value={formData.veli_turu}
            onChange={(e) => setFormData({ ...formData, veli_turu: e.target.value })}
            className="form-input"
          >
            {VELI_TURU_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>TC Kimlik No</label>
          <input
            type="text"
            value={formData.tc_kimlik_no}
            onChange={(e) => setFormData({ ...formData, tc_kimlik_no: e.target.value })}
            className="form-input"
            maxLength={11}
            placeholder="TC Kimlik No"
          />
        </div>
      </div>
      
      <div className="form-row">
        <div className="form-group">
          <label>Ad</label>
          <input
            type="text"
            value={formData.ad}
            onChange={(e) => setFormData({ ...formData, ad: e.target.value })}
            className="form-input"
            placeholder="Ad"
          />
        </div>
        <div className="form-group">
          <label>Soyad</label>
          <input
            type="text"
            value={formData.soyad}
            onChange={(e) => setFormData({ ...formData, soyad: e.target.value })}
            className="form-input"
            placeholder="Soyad"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Telefon</label>
          <input
            type="text"
            value={formData.telefon}
            onChange={(e) => setFormData({ ...formData, telefon: e.target.value })}
            className="form-input"
            placeholder="05XX XXX XX XX"
          />
        </div>
        <div className="form-group">
          <label>E-posta</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="form-input"
            placeholder="E-posta"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group form-group-full">
          <label>Meslek</label>
          <input
            type="text"
            value={formData.meslek}
            onChange={(e) => setFormData({ ...formData, meslek: e.target.value })}
            className="form-input"
            placeholder="Meslek"
          />
        </div>
      </div>

      <div className="veli-bildirim-section">
        <label className="veli-bildirim-title">WhatsApp / SMS Bildirim İzinleri</label>
        <p className="veli-bildirim-desc">
          Velinin hangi konularda WhatsApp ve SMS almak istediğini işaretleyin.
        </p>
        <div className="veli-bildirim-options">
          {BILDIRIM_OPTIONS.map((opt) => (
            <label key={opt.code} className="veli-bildirim-option">
              <input
                type="checkbox"
                checked={formData.sms_bildirimleri.includes(opt.code)}
                onChange={() => toggleBildirim(opt.code)}
              />
              <span className="veli-bildirim-option-body">
                <span className="veli-bildirim-option-label">{opt.label}</span>
                <span className="veli-bildirim-option-hint">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const renderDrawer = () => (
    <>
      {/* Overlay */}
      <div 
        className={`drawer-overlay ${isDrawerOpen ? 'drawer-overlay-visible' : ''}`}
        onClick={handleCancel}
      />
      
      {/* Drawer */}
      <div className={`drawer drawer-right ${isDrawerOpen ? 'drawer-open' : ''}`}>
        <div className="drawer-header">
          <h3>{isAddingNew ? 'Yeni Veli Ekle' : 'Veli Düzenle'}</h3>
          <button 
            className="drawer-close-btn"
            onClick={handleCancel}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        <div className="drawer-body">
          {saveError && (
            <div className="comm-alert comm-alert-danger" style={{ marginBottom: '1rem' }}>
              {saveError}
            </div>
          )}
          {renderVeliForm()}
        </div>
        
        <div className="drawer-footer">
          <button 
            type="button" 
            onClick={handleCancel}
            className="btn-modern btn-secondary"
            disabled={saving}
          >
            İptal
          </button>
          <button 
            type="button" 
            onClick={handleSave}
            className="btn-modern btn-primary"
            disabled={saving}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </>
  );

  const renderVeliCard = (veli: OgrenciVeli) => {
    return (
      <div
        key={veli.id}
        className={`veli-card ${veli.varsayilan ? 'veli-card-primary' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => handleEdit(veli)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleEdit(veli);
          }
        }}
        style={{ cursor: 'pointer' }}
      >
        {/* Header */}
        <div className="veli-card-top">
          <div className="veli-card-top-left">
            {veli.varsayilan && (
              <span className="veli-primary-tag">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                </svg>
                Birincil Veli
              </span>
            )}
            <span className={`veli-type-tag ${veli.veli_turu}`}>
              {veli.veli_turu_display}
            </span>
          </div>
          <div className="veli-card-top-right">
            <button 
              className="btn-icon-mini"
              onClick={(e) => { e.stopPropagation(); handleEdit(veli); }}
              title="Düzenle"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button 
              className="btn-icon-mini btn-icon-mini-danger"
              onClick={(e) => { e.stopPropagation(); handleDelete(veli.id); }}
              title="Sil"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>

        {/* İsim */}
        <div className="veli-name-row">
          <div className="veli-avatar-sm">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h4 className="veli-name">{veli.tam_ad || 'İsimsiz'}</h4>
        </div>

        {/* Bilgiler */}
        <div className="veli-details">
          {/* TC Kimlik */}
          <div className="veli-detail-row">
            <span className="veli-detail-label">TC Kimlik No</span>
            <span className="veli-detail-value">{veli.tc_kimlik_no || '-'}</span>
          </div>

          {/* Telefon */}
          <div className="veli-detail-row">
            <span className="veli-detail-label">Telefon</span>
            <div className="veli-detail-value-phone">
              <span>{veli.telefon || '-'}</span>
              {veli.telefon && (
                <span onClick={(e) => e.stopPropagation()}>
                  <WhatsAppChatButton
                  phone={veli.telefon}
                  ogrenciId={data.id}
                  veliId={veli.id}
                  contactLabel={`${veli.ad} ${veli.soyad}`.trim()}
                  className="whatsapp-btn"
                  title="Veliye uygulama içi mesaj"
                  size={16}
                />
                </span>
              )}
            </div>
          </div>

          {/* E-posta */}
          {veli.email && (
            <div className="veli-detail-row">
              <span className="veli-detail-label">E-posta</span>
              <a href={`mailto:${veli.email}`} className="veli-detail-value veli-email">{veli.email}</a>
            </div>
          )}

          {/* Meslek */}
          {veli.meslek && (
            <div className="veli-detail-row">
              <span className="veli-detail-label">Meslek</span>
              <span className="veli-detail-value">{veli.meslek}</span>
            </div>
          )}

          <div className="veli-detail-row veli-detail-row-stack">
            <span className="veli-detail-label">Bildirimler</span>
            <div className="veli-bildirim-tags">
              {(veli.sms_bildirimleri && veli.sms_bildirimleri.length > 0
                ? veli.sms_bildirimleri
                : DEFAULT_SMS_BILDIRIMLERI
              ).map((code) => (
                <span key={code} className="veli-bildirim-tag">
                  {BILDIRIM_LABELS[code] || code}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="tab-panel">
      <div className="card-modern">
        <div className="card-modern-header">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Veli Bilgileri
          </h3>
          <button 
            className="btn-modern btn-primary btn-sm"
            onClick={handleAddNew}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Veli Ekle
          </button>
        </div>
        
        <div className="card-modern-body">
          {/* Veli Kartları */}
          {veliler.length === 0 ? (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <p>Henüz veli bilgisi eklenmemiş</p>
              <button 
                className="btn-modern btn-primary btn-sm"
                onClick={handleAddNew}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Veli Ekle
              </button>
            </div>
          ) : (
            <div className="veli-cards-grid">
              {veliler.map(renderVeliCard)}
            </div>
          )}
        </div>
      </div>

      {/* Veli Drawer */}
      {renderDrawer()}
    </div>
  );
}
