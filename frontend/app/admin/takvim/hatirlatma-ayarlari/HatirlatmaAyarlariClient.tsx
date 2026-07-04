'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchReminderSettings, createReminderSetting, updateReminderSetting, deleteReminderSetting,
  fetchEventTypes,
  type ReminderSetting, type EventType, REMINDER_UNIT_LABELS, type ReminderUnit,
  type NotificationChannel, type RecipientType,
  NOTIFICATION_CHANNEL_LABELS, RECIPIENT_TYPE_LABELS,
} from '@/lib/takvim-api';

/* ════════════════════════════════════════════
   HATIRLATMA AYARLARI
   ════════════════════════════════════════════ */

const BIRIMLER: ReminderUnit[] = ['MINUTES', 'HOURS', 'DAYS'];
const KANALLAR: NotificationChannel[] = ['APP', 'SMS', 'EMAIL'];
const ALICI_TIPLER: RecipientType[] = ['OGRENCI', 'OGRETMEN', 'VELI', 'PERSONEL'];

const KANAL_IKONLAR: Record<NotificationChannel, string> = { APP: '📱', SMS: '💬', EMAIL: '📧' };
const ALICI_IKONLAR: Record<RecipientType, string> = { OGRENCI: '🎓', OGRETMEN: '👨‍🏫', VELI: '👪', PERSONEL: '👤' };

export default function HatirlatmaAyarlariClient() {
  const [settings, setSettings] = useState<ReminderSetting[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ReminderSetting | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [sRes, tRes] = await Promise.all([fetchReminderSettings(), fetchEventTypes()]);
    if (sRes.success && sRes.data) setSettings(sRes.data);
    if (tRes.success && tRes.data) setEventTypes(tRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const handleDelete = async (s: ReminderSetting) => {
    if (!confirm('Bu hatırlatma ayarını silmek istiyor musunuz?')) return;
    const res = await deleteReminderSetting(s.id);
    if (res.success) { setToast({ type: 'success', message: 'Silindi' }); load(); }
    else setToast({ type: 'error', message: res.error || 'Hata' });
  };

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 20px', borderRadius: 8,
          background: toast.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: toast.type === 'success' ? '#047857' : '#b91c1c',
          fontWeight: 500, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          {toast.message}
        </div>
      )}

      {/* Başlık */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>🔔 Hatırlatma Ayarları</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            Etkinlik türlerine göre otomatik hatırlatma zamanlarını yapılandırın
          </p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={primaryBtn}>+ Yeni Ayar</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Yükleniyor...</div>
      ) : settings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#f9fafb', borderRadius: 12, color: '#9ca3af' }}>
          <p style={{ fontSize: 36 }}>🔔</p>
          <p>Henüz hatırlatma ayarı yok.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {settings.map(s => (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                padding: '12px 16px', background: '#fff', borderRadius: 10,
                border: '1px solid #e5e7eb',
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: s.event_type_renk, flexShrink: 0 }} />
              <span style={{ fontSize: 16 }}>{s.event_type_ikon}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#111827', flex: 1 }}>
                {s.event_type_ad}
              </span>
              <span style={{
                fontSize: 13, color: '#4f46e5', fontWeight: 500,
                background: '#eef2ff', padding: '4px 10px', borderRadius: 8,
              }}>
                {s.miktar} {REMINDER_UNIT_LABELS[s.birim]} önce
              </span>

              {/* Kanallar */}
              <div style={{ display: 'flex', gap: 4 }}>
                {(s.kanallar ?? []).map(k => (
                  <span key={k} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: '#f0fdf4', color: '#15803d', fontWeight: 500,
                  }}>
                    {KANAL_IKONLAR[k]} {NOTIFICATION_CHANNEL_LABELS[k]}
                  </span>
                ))}
              </div>

              {/* Alıcı Tipler */}
              <div style={{ display: 'flex', gap: 4 }}>
                {(s.alici_tipler ?? []).map(a => (
                  <span key={a} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: '#fef3c7', color: '#92400e', fontWeight: 500,
                  }}>
                    {ALICI_IKONLAR[a]} {RECIPIENT_TYPE_LABELS[a]}
                  </span>
                ))}
              </div>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: s.is_active ? '#d1fae5' : '#f3f4f6',
                color: s.is_active ? '#047857' : '#9ca3af',
              }}>
                {s.is_active ? 'Aktif' : 'Pasif'}
              </span>
              <button onClick={() => { setEditing(s); setShowForm(true); }} style={iconBtn}>✏️</button>
              <button onClick={() => handleDelete(s)} style={{ ...iconBtn, color: '#ef4444' }}>🗑</button>
            </div>
          ))}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <ReminderSettingForm
          editing={editing}
          eventTypes={eventTypes}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); setToast({ type: 'success', message: editing ? 'Güncellendi' : 'Oluşturuldu' }); }}
        />
      )}
    </div>
  );
}

/* ────────── Form ────────── */

function ReminderSettingForm({
  editing, eventTypes, onClose, onSaved,
}: {
  editing: ReminderSetting | null;
  eventTypes: EventType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [eventTypeId, setEventTypeId] = useState(editing?.event_type_id || '');
  const [miktar, setMiktar] = useState(editing?.miktar ?? 30);
  const [birim, setBirim] = useState<ReminderUnit>(editing?.birim || 'MINUTES');
  const [kanallar, setKanallar] = useState<NotificationChannel[]>(editing?.kanallar ?? ['APP']);
  const [aliciTipler, setAliciTipler] = useState<RecipientType[]>(editing?.alici_tipler ?? ['OGRENCI']);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const toggleKanal = (k: NotificationChannel) => {
    setKanallar(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  };
  const toggleAlici = (a: RecipientType) => {
    setAliciTipler(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kanallar.length === 0) { alert('En az bir kanal seçmelisiniz'); return; }
    if (aliciTipler.length === 0) { alert('En az bir alıcı tipi seçmelisiniz'); return; }
    setSaving(true);
    const data = {
      event_type_id: eventTypeId, miktar, birim,
      kanallar, alici_tipler: aliciTipler,
      is_active: isActive,
    };
    const res = editing
      ? await updateReminderSetting(editing.id, data)
      : await createReminderSetting(data);
    setSaving(false);
    if (res.success) onSaved();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 460, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 20px' }}>
          {editing ? '✏️ Ayarı Düzenle' : '🔔 Yeni Hatırlatma Ayarı'}
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Etkinlik Türü *">
            <select required value={eventTypeId} onChange={e => setEventTypeId(e.target.value)} style={input}>
              <option value="">Seçiniz</option>
              {eventTypes.filter(t => t.is_active).map(t => (
                <option key={t.id} value={t.id}>{t.ikon} {t.ad}</option>
              ))}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Miktar *">
              <input required type="number" min={1} value={miktar} onChange={e => setMiktar(Number(e.target.value))} style={input} />
            </Field>
            <Field label="Birim">
              <select value={birim} onChange={e => setBirim(e.target.value as ReminderUnit)} style={input}>
                {BIRIMLER.map(b => (
                  <option key={b} value={b}>{REMINDER_UNIT_LABELS[b]}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Bildirim Kanalları */}
          <Field label="Bildirim Kanalları *">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {KANALLAR.map(k => (
                <label key={k} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                  border: `1.5px solid ${kanallar.includes(k) ? '#4f46e5' : '#d1d5db'}`,
                  background: kanallar.includes(k) ? '#eef2ff' : '#fff',
                  transition: 'all 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={kanallar.includes(k)}
                    onChange={() => toggleKanal(k)}
                    style={{ accentColor: '#4f46e5' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{KANAL_IKONLAR[k]} {NOTIFICATION_CHANNEL_LABELS[k]}</span>
                </label>
              ))}
            </div>
          </Field>

          {/* Alıcı Tipleri */}
          <Field label="Alıcı Tipleri *">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ALICI_TIPLER.map(a => (
                <label key={a} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                  border: `1.5px solid ${aliciTipler.includes(a) ? '#d97706' : '#d1d5db'}`,
                  background: aliciTipler.includes(a) ? '#fef3c7' : '#fff',
                  transition: 'all 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={aliciTipler.includes(a)}
                    onChange={() => toggleAlici(a)}
                    style={{ accentColor: '#d97706' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{ALICI_IKONLAR[a]} {RECIPIENT_TYPE_LABELS[a]}</span>
                </label>
              ))}
            </div>
          </Field>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
            <span style={{ fontSize: 13 }}>Aktif</span>
          </label>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={secondaryBtn}>İptal</button>
            <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? '...' : editing ? 'Güncelle' : 'Oluştur'}
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
