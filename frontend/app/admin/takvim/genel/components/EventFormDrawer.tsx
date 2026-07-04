'use client';

import React, { useState, useEffect } from 'react';
import type { CalendarEvent, EventType, RecurrenceType, EventStatus } from '@/lib/takvim-api';

interface Props {
  mode: 'create' | 'edit';
  defaults: Partial<CalendarEvent>;
  eventTypes: EventType[];
  onSave: (data: Partial<CalendarEvent>) => Promise<void>;
  onClose: () => void;
}

const RENKLER = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4',
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#6B7280',
];

export default function EventFormDrawer({ mode, defaults, eventTypes, onSave, onClose }: Props) {
  const [baslik, setBaslik] = useState(defaults.baslik || '');
  const [aciklama, setAciklama] = useState(defaults.aciklama || '');
  const [eventTypeId, setEventTypeId] = useState(defaults.event_type_id || '');
  const [durum, setDurum] = useState<EventStatus>(defaults.durum || 'SCHEDULED');
  const [baslangic, setBaslangic] = useState(defaults.baslangic || '');
  const [bitis, setBitis] = useState(defaults.bitis || '');
  const [tumGun, setTumGun] = useState(defaults.tum_gun ?? false);
  const [tekrarTipi, setTekrarTipi] = useState<RecurrenceType>(defaults.tekrar_tipi || 'NONE');
  const [tekrarBitis, setTekrarBitis] = useState(defaults.tekrar_bitis || '');
  const [salonAdi, setSalonAdi] = useState(defaults.salon_adi || '');
  const [konum, setKonum] = useState(defaults.konum || '');
  const [renk, setRenk] = useState(defaults.renk || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!renk && eventTypeId) {
      const et = eventTypes.find(t => t.id === eventTypeId);
      if (et) setRenk(et.renk);
    }
  }, [eventTypeId, eventTypes, renk]);

  useEffect(() => {
    if (mode === 'create' && !defaults.event_type_id && !eventTypeId && eventTypes.length) {
      const def = eventTypes.find(t => t.varsayilan_mi && t.is_active) || eventTypes.find(t => t.is_active);
      if (def) {
        setEventTypeId(def.id);
        if (!renk) setRenk(def.renk);
      }
    }
  }, [mode, defaults.event_type_id, eventTypeId, eventTypes, renk]);

  const toLocal = (iso: string) => {
    if (!iso) return '';
    try { return new Date(iso).toISOString().slice(0, 16); } catch { return ''; }
  };
  const toDate = (iso: string) => {
    if (!iso) return '';
    try { return new Date(iso).toISOString().slice(0, 10); } catch { return ''; }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        baslik, aciklama, event_type_id: eventTypeId, durum,
        baslangic, bitis, tum_gun: tumGun,
        tekrar_tipi: tekrarTipi, tekrar_bitis: tekrarBitis || null,
        salon_adi: salonAdi, konum, renk,
      });
    } finally { setSaving(false); }
  };

  const selectedType = eventTypes.find(t => t.id === eventTypeId);
  const borderColor = renk || selectedType?.renk || '#6366f1';

  return (
    <div className="tkv-drawer-overlay" onClick={onClose}>
      <div className="tkv-drawer" onClick={e => e.stopPropagation()}>
        {/* Renkli üst band */}
        <div style={{ height: 4, background: borderColor }} />

        {/* Header */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {mode === 'create' ? '📅 Yeni Etkinlik' : '✏️ Etkinliği Düzenle'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9ca3af' }}>✕</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Etkinlik Türü */}
          <div>
            <label className="tkv-label">Etkinlik Türü *</label>
            <select required value={eventTypeId} onChange={e => setEventTypeId(e.target.value)} className="tkv-input">
              <option value="">Seçiniz</option>
              {eventTypes.filter(t => t.is_active).map(t => (
                <option key={t.id} value={t.id}>{t.ikon} {t.ad}</option>
              ))}
            </select>
          </div>

          {/* Başlık */}
          <div>
            <label className="tkv-label">Başlık *</label>
            <input required value={baslik} onChange={e => setBaslik(e.target.value)} placeholder="Etkinlik başlığı" className="tkv-input" />
          </div>

          {/* Açıklama */}
          <div>
            <label className="tkv-label">Açıklama</label>
            <textarea value={aciklama} onChange={e => setAciklama(e.target.value)} placeholder="Opsiyonel açıklama..." rows={3}
              className="tkv-input" style={{ resize: 'vertical' }} />
          </div>

          {/* Tüm gün */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={tumGun} onChange={e => setTumGun(e.target.checked)} style={{ accentColor: '#4f46e5', width: 16, height: 16 }} />
            <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Tüm gün etkinliği</span>
          </label>

          {/* Tarihler */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="tkv-label">Başlangıç *</label>
              <input required type={tumGun ? 'date' : 'datetime-local'}
                value={tumGun ? toDate(baslangic) : toLocal(baslangic)}
                onChange={e => setBaslangic(e.target.value)} className="tkv-input" />
            </div>
            <div>
              <label className="tkv-label">Bitiş *</label>
              <input required type={tumGun ? 'date' : 'datetime-local'}
                value={tumGun ? toDate(bitis) : toLocal(bitis)}
                onChange={e => setBitis(e.target.value)} className="tkv-input" />
            </div>
          </div>

          {/* Durum */}
          <div>
            <label className="tkv-label">Durum</label>
            <select value={durum} onChange={e => setDurum(e.target.value as EventStatus)} className="tkv-input">
              <option value="SCHEDULED">Planlandı</option>
              <option value="DRAFT">Taslak</option>
              <option value="IN_PROGRESS">Devam Ediyor</option>
              <option value="COMPLETED">Tamamlandı</option>
              <option value="CANCELLED">İptal</option>
            </select>
          </div>

          {/* Tekrar */}
          <div>
            <label className="tkv-label">Tekrar</label>
            <select value={tekrarTipi} onChange={e => setTekrarTipi(e.target.value as RecurrenceType)} className="tkv-input">
              <option value="NONE">Tekrar etmez</option>
              <option value="DAILY">Her gün</option>
              <option value="WEEKLY">Her hafta</option>
              <option value="BIWEEKLY">İki haftada bir</option>
              <option value="MONTHLY">Her ay</option>
            </select>
          </div>

          {tekrarTipi !== 'NONE' && (
            <div>
              <label className="tkv-label">Tekrar Bitiş Tarihi</label>
              <input type="date" value={toDate(tekrarBitis)} onChange={e => setTekrarBitis(e.target.value)} className="tkv-input" />
            </div>
          )}

          {/* Konum / Salon */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="tkv-label">Salon Adı</label>
              <input value={salonAdi} onChange={e => setSalonAdi(e.target.value)} placeholder="Salon..." className="tkv-input" />
            </div>
            <div>
              <label className="tkv-label">Konum</label>
              <input value={konum} onChange={e => setKonum(e.target.value)} placeholder="Konum..." className="tkv-input" />
            </div>
          </div>

          {/* Renk */}
          <div>
            <label className="tkv-label">Renk</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {RENKLER.map(c => (
                <button key={c} type="button" onClick={() => setRenk(c)}
                  style={{
                    width: 26, height: 26, borderRadius: '50%', background: c, border: 'none',
                    cursor: 'pointer', outline: renk === c ? '2px solid #111' : 'none', outlineOffset: 2,
                    transition: 'transform 0.1s',
                  }} />
              ))}
              <input type="color" value={renk || '#6366f1'} onChange={e => setRenk(e.target.value)}
                style={{ width: 26, height: 26, border: 'none', cursor: 'pointer', borderRadius: '50%' }} />
              {renk && (
                <button type="button" onClick={() => setRenk('')}
                  style={{ fontSize: 11, color: '#6b7280', cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline' }}>
                  Sıfırla
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Butonlar */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
            <button type="button" onClick={onClose} className="tkv-btn">İptal</button>
            <button type="submit" disabled={saving} className="tkv-btn tkv-btn-primary"
              style={{ opacity: saving ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer', minWidth: 100 }}>
              {saving ? 'Kaydediliyor...' : mode === 'create' ? 'Oluştur' : 'Güncelle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
