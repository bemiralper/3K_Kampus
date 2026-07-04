'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchNotificationPreferences, upsertNotificationPreference, deleteNotificationPreference,
  fetchEventTypes,
  type UserNotificationPreference, type EventType,
} from '@/lib/takvim-api';

/* ════════════════════════════════════════════
   BİLDİRİM TERCİHLERİ SAYFASI
   ════════════════════════════════════════════ */

export default function BildirimTercihleriClient() {
  const [prefs, setPrefs] = useState<UserNotificationPreference[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UserNotificationPreference | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [pRes, tRes] = await Promise.all([fetchNotificationPreferences(), fetchEventTypes()]);
    if (pRes.success && pRes.data) setPrefs(pRes.data);
    if (tRes.success && tRes.data) setEventTypes(tRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const handleDelete = async (p: UserNotificationPreference) => {
    if (!confirm('Bu tercihi silmek istiyor musunuz?')) return;
    const res = await deleteNotificationPreference(p.id);
    if (res.success) { setToast({ type: 'success', message: 'Silindi' }); load(); }
    else setToast({ type: 'error', message: res.error || 'Hata' });
  };

  const channelBadge = (enabled: boolean, label: string, color: string) => (
    <span style={{
      fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500,
      background: enabled ? `${color}15` : '#f3f4f6',
      color: enabled ? color : '#d1d5db',
      border: `1px solid ${enabled ? `${color}30` : '#e5e7eb'}`,
    }}>
      {label}
    </span>
  );

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
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>⚙️ Bildirim Tercihleri</h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>
            Hangi etkinliklerden hangi kanallarla bildirim alacağınızı yönetin
          </p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={{
          padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
          background: '#4F46E5', color: '#fff', border: 'none', cursor: 'pointer',
        }}>
          + Tercih Ekle
        </button>
      </div>

      {/* Info Box */}
      <div style={{
        padding: '14px 16px', background: '#EEF2FF', borderRadius: 10,
        marginBottom: 20, fontSize: 13, color: '#4338CA', lineHeight: 1.6,
      }}>
        💡 <strong>Genel tercih</strong> tüm etkinlik türleri için geçerlidir.
        Belirli bir tür için ayrı tercih eklerseniz, o tür için genel tercih yerine
        özel tercih uygulanır.
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Yükleniyor...</div>
      ) : prefs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#f9fafb', borderRadius: 12, color: '#9CA3AF' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚙️</div>
          <p>Henüz bildirim tercihi ayarlanmamış</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Varsayılan olarak uygulama bildirimleri aktiftir</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {prefs.map(p => (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px', background: '#fff', borderRadius: 10,
                border: '1px solid #e5e7eb',
              }}
            >
              <span style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: `${p.event_type_renk}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              }}>
                {p.event_type_ikon}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                  {p.event_type_ad}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {channelBadge(p.app_enabled, '📱 Uygulama', '#3B82F6')}
                  {channelBadge(p.sms_enabled, '💬 SMS', '#10B981')}
                  {channelBadge(p.email_enabled, '📧 E-posta', '#F59E0B')}
                </div>
                {p.sessiz_baslangic && p.sessiz_bitis && (
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                    🌙 Sessiz: {p.sessiz_baslangic} – {p.sessiz_bitis}
                  </div>
                )}
              </div>
              <button onClick={() => { setEditing(p); setShowForm(true); }} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 4,
              }}>✏️</button>
              <button onClick={() => handleDelete(p)} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 4,
              }}>🗑</button>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <PreferenceForm
          editing={editing}
          eventTypes={eventTypes}
          existingPrefs={prefs}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
            setToast({ type: 'success', message: editing ? 'Güncellendi' : 'Oluşturuldu' });
          }}
        />
      )}
    </div>
  );
}

/* ────────── Form ────────── */

function PreferenceForm({
  editing, eventTypes, existingPrefs, onClose, onSaved,
}: {
  editing: UserNotificationPreference | null;
  eventTypes: EventType[];
  existingPrefs: UserNotificationPreference[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [eventTypeId, setEventTypeId] = useState(editing?.event_type_id || '');
  const [appEnabled, setAppEnabled] = useState(editing?.app_enabled ?? true);
  const [smsEnabled, setSmsEnabled] = useState(editing?.sms_enabled ?? false);
  const [emailEnabled, setEmailEnabled] = useState(editing?.email_enabled ?? false);
  const [sessizBaslangic, setSessizBaslangic] = useState(editing?.sessiz_baslangic || '');
  const [sessizBitis, setSessizBitis] = useState(editing?.sessiz_bitis || '');
  const [saving, setSaving] = useState(false);

  // Zaten tercihi olan türleri filtrele (düzenleme hariç)
  const usedTypeIds = new Set(existingPrefs.filter(p => p.id !== editing?.id).map(p => p.event_type_id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const data: Record<string, unknown> = {
      event_type_id: eventTypeId || null,
      app_enabled: appEnabled,
      sms_enabled: smsEnabled,
      email_enabled: emailEnabled,
      sessiz_baslangic: sessizBaslangic || null,
      sessiz_bitis: sessizBitis || null,
    };

    const res = await upsertNotificationPreference(data);
    setSaving(false);
    if (res.success) onSaved();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid #e5e7eb', fontSize: 13, outline: 'none',
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.25)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 12, width: 420, padding: 24,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 20px' }}>
          {editing ? '✏️ Tercihi Düzenle' : '⚙️ Yeni Bildirim Tercihi'}
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Etkinlik Türü */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
              Etkinlik Türü
            </label>
            <select value={eventTypeId} onChange={e => setEventTypeId(e.target.value)} style={inputStyle}>
              <option value="">🔔 Genel (Tüm türler)</option>
              {eventTypes.filter(t => t.is_active && !usedTypeIds.has(t.id)).map(t => (
                <option key={t.id} value={t.id}>{t.ikon} {t.ad}</option>
              ))}
            </select>
          </div>

          {/* Kanal Tercihleri */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 8 }}>
              Bildirim Kanalları
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                { key: 'app', label: '📱 Uygulama Bildirimi', desc: 'Uygulama içi bildirim çanı', value: appEnabled, set: setAppEnabled },
                { key: 'sms', label: '💬 SMS', desc: 'Telefona SMS gönderilir', value: smsEnabled, set: setSmsEnabled },
                { key: 'email', label: '📧 E-posta', desc: 'E-posta adresine gönderilir', value: emailEnabled, set: setEmailEnabled },
              ] as const).map(ch => (
                <label key={ch.key} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${ch.value ? '#c7d2fe' : '#e5e7eb'}`,
                  background: ch.value ? '#EEF2FF' : '#fff',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <input
                    type="checkbox" checked={ch.value}
                    onChange={e => ch.set(e.target.checked)}
                    style={{ accentColor: '#4F46E5' }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{ch.label}</div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>{ch.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Sessiz Saatleri */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
              🌙 Sessiz Saatleri <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(opsiyonel)</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input
                type="time" value={sessizBaslangic}
                onChange={e => setSessizBaslangic(e.target.value)}
                placeholder="Başlangıç"
                style={inputStyle}
              />
              <input
                type="time" value={sessizBitis}
                onChange={e => setSessizBitis(e.target.value)}
                placeholder="Bitiş"
                style={inputStyle}
              />
            </div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
              Bu saatler arasında bildirim gönderilmez
            </div>
          </div>

          {/* Butonlar */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13,
              background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer',
            }}>İptal</button>
            <button type="submit" disabled={saving} style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              background: '#4F46E5', color: '#fff', border: 'none', cursor: 'pointer',
              opacity: saving ? 0.6 : 1,
            }}>
              {saving ? '...' : editing ? 'Güncelle' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
