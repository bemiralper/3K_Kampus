'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchEventTypes, createEventType, updateEventType, deleteEventType, seedEventTypes,
  type EventType, EVENT_CATEGORY_LABELS, type EventCategory,
} from '@/lib/takvim-api';

/* ════════════════════════════════════════════
   ETKİNLİK TÜRLERİ YÖNETİMİ
   ════════════════════════════════════════════ */

const KATEGORILER: EventCategory[] = [
  'DENEME', 'ETUT', 'GORUSME', 'DERS', 'TOPLANTI', 'ETKINLIK', 'TATIL', 'DIGER',
];

const RENKLER = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4',
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#6B7280',
];

export default function EtkinlikTurleriClient() {
  const [types, setTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState<EventType | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadTypes = useCallback(async () => {
    setLoading(true);
    const res = await fetchEventTypes();
    if (res.success && res.data) setTypes(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { loadTypes(); }, [loadTypes]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleSeed = async () => {
    const res = await seedEventTypes();
    if (res.success) {
      setToast({ type: 'success', message: 'Varsayılan türler oluşturuldu' });
      loadTypes();
    } else {
      setToast({ type: 'error', message: res.error || 'Hata oluştu' });
    }
  };

  const handleDelete = async (t: EventType) => {
    if (t.is_system) {
      setToast({ type: 'error', message: 'Sistem türü silinemez' });
      return;
    }
    if (!confirm(`"${t.ad}" türünü silmek istediğinizden emin misiniz?`)) return;
    const res = await deleteEventType(t.id);
    if (res.success) {
      setToast({ type: 'success', message: 'Tür silindi' });
      loadTypes();
    } else {
      setToast({ type: 'error', message: res.error || 'Silinemedi' });
    }
  };

  const openEdit = (t: EventType) => {
    setEditingType(t);
    setShowForm(true);
  };

  const handleSetDefault = async (t: EventType) => {
    const res = await updateEventType(t.id, { varsayilan_mi: true });
    if (res.success) {
      setToast({ type: 'success', message: `"${t.ad}" varsayılan tür olarak kaydedildi` });
      loadTypes();
    } else {
      setToast({ type: 'error', message: res.error || 'Kaydedilemedi' });
    }
  };

  const openCreate = () => {
    setEditingType(null);
    setShowForm(true);
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 20px', borderRadius: 8,
          background: toast.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: toast.type === 'success' ? '#047857' : '#b91c1c',
          fontWeight: 500, fontSize: 13,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          {toast.message}
        </div>
      )}

      {/* Başlık */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>
            📋 Etkinlik Türleri
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            Takvimde kullanılan etkinlik türlerini yönetin
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSeed} style={secondaryBtn}>🌱 Seed</button>
          <button onClick={openCreate} style={primaryBtn}>+ Yeni Tür</button>
        </div>
      </div>

      {/* Tablo */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Yükleniyor...</div>
      ) : types.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: '#9ca3af',
          background: '#f9fafb', borderRadius: 12,
        }}>
          <p style={{ fontSize: 36 }}>📋</p>
          <p>Henüz etkinlik türü yok.</p>
          <button onClick={handleSeed} style={{ ...primaryBtn, marginTop: 12 }}>🌱 Varsayılan Türleri Oluştur</button>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', fontSize: 12, color: '#6b7280', textTransform: 'uppercase' as const }}>
                <th style={th}>Sıra</th>
                <th style={th}>Renk</th>
                <th style={th}>İkon</th>
                <th style={{ ...th, textAlign: 'left' }}>Ad</th>
                <th style={th}>Kategori</th>
                <th style={th}>Süre (dk)</th>
                <th style={th}>Varsayılan</th>
                <th style={th}>Etkinlik</th>
                <th style={th}>Sistem</th>
                <th style={th}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {types.map(t => (
                <tr key={t.id} style={{ borderTop: '1px solid #f3f4f6', fontSize: 13 }}>
                  <td style={td}>{t.sira}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', background: t.renk }} />
                  </td>
                  <td style={td}>{t.ikon}</td>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 500 }}>{t.ad}</td>
                  <td style={td}>{EVENT_CATEGORY_LABELS[t.kategori]}</td>
                  <td style={td}>{t.varsayilan_sure_dk}</td>
                  <td style={td}>
                    {t.varsayilan_mi ? (
                      <span title="Varsayılan tür">⭐</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(t)}
                        style={{ ...iconBtn, fontSize: 12 }}
                        title="Varsayılan yap"
                      >
                        ☆
                      </button>
                    )}
                  </td>
                  <td style={td}>
                    <span style={{ background: '#f3f4f6', borderRadius: 10, padding: '2px 8px', fontSize: 11 }}>
                      {t.etkinlik_sayisi ?? '-'}
                    </span>
                  </td>
                  <td style={td}>{t.is_system ? '🔒' : ''}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button onClick={() => openEdit(t)} style={iconBtn}>✏️</button>
                      {!t.is_system && (
                        <button onClick={() => handleDelete(t)} style={{ ...iconBtn, color: '#ef4444' }}>🗑</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Drawer */}
      {showForm && (
        <TypeFormDrawer
          editingType={editingType}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadTypes(); setToast({ type: 'success', message: editingType ? 'Güncellendi' : 'Oluşturuldu' }); }}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   TÜR FORM DRAWER
   ════════════════════════════════════════════ */

function TypeFormDrawer({
  editingType,
  onClose,
  onSaved,
}: {
  editingType: EventType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ad, setAd] = useState(editingType?.ad || '');
  const [kategori, setKategori] = useState<EventCategory>(editingType?.kategori || 'DIGER');
  const [renk, setRenk] = useState(editingType?.renk || '#6366F1');
  const [ikon, setIkon] = useState(editingType?.ikon || '📌');
  const [sureDk, setSureDk] = useState(editingType?.varsayilan_sure_dk ?? 60);
  const [sira, setSira] = useState(editingType?.sira ?? 0);
  const [isActive, setIsActive] = useState(editingType?.is_active ?? true);
  const [varsayilanMi, setVarsayilanMi] = useState(editingType?.varsayilan_mi ?? false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const data = {
      ad, kategori, renk, ikon, varsayilan_sure_dk: sureDk, sira, is_active: isActive,
      varsayilan_mi: varsayilanMi,
    };
    const res = editingType
      ? await updateEventType(editingType.id, data)
      : await createEventType(data);
    setSaving(false);
    if (res.success) onSaved();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.3)' }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: 400,
          background: '#fff', boxShadow: '-8px 0 30px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column', zIndex: 9999,
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            {editingType ? '✏️ Türü Düzenle' : '📋 Yeni Etkinlik Türü'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <Field label="Ad *">
            <input required value={ad} onChange={e => setAd(e.target.value)} style={input} placeholder="Örn: Deneme Sınavı" />
          </Field>

          <Field label="Kategori">
            <select value={kategori} onChange={e => setKategori(e.target.value as EventCategory)} style={input}>
              {KATEGORILER.map(k => (
                <option key={k} value={k}>{EVENT_CATEGORY_LABELS[k]}</option>
              ))}
            </select>
          </Field>

          <Field label="İkon">
            <input value={ikon} onChange={e => setIkon(e.target.value)} style={input} placeholder="Emoji" />
          </Field>

          <Field label="Renk">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {RENKLER.map(c => (
                <button
                  key={c} type="button" onClick={() => setRenk(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c,
                    border: renk === c ? '3px solid #111' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                />
              ))}
              <input type="color" value={renk} onChange={e => setRenk(e.target.value)}
                style={{ width: 28, height: 28, border: 'none', cursor: 'pointer', borderRadius: '50%' }}
              />
            </div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Varsayılan Süre (dk)">
              <input type="number" value={sureDk} onChange={e => setSureDk(Number(e.target.value))} style={input} min={5} />
            </Field>
            <Field label="Sıra">
              <input type="number" value={sira} onChange={e => setSira(Number(e.target.value))} style={input} min={0} />
            </Field>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
            <span style={{ fontSize: 13 }}>Aktif</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={varsayilanMi} onChange={e => setVarsayilanMi(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
            <span style={{ fontSize: 13 }}>Yeni etkinliklerde varsayılan tür</span>
          </label>

          <div style={{ flex: 1 }} />

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
            <button type="button" onClick={onClose} style={secondaryBtn}>İptal</button>
            <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Kaydediliyor...' : editingType ? 'Güncelle' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Yardımcılar ── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#6b7280' }}>{label}</label>
      {children}
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'center', fontWeight: 500 };
const td: React.CSSProperties = { padding: '10px 12px', textAlign: 'center', color: '#374151' };
const input: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #d1d5db', fontSize: 13, outline: 'none',
};
const primaryBtn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db',
  background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer',
};
const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 4,
};
