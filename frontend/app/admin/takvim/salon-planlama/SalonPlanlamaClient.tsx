'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchEventsCompact, fetchEventTypes,
  type FCEvent, type EventType,
} from '@/lib/takvim-api';
import CalendarContextBar from '../genel/components/CalendarContextBar';
import '../takvim.css';

/* ════════════════════════════════════════════
   SALON PLANLAMA SAYFASI
   ════════════════════════════════════════════ */

interface SalonGroup {
  salon_adi: string;
  events: FCEvent[];
}

export default function SalonPlanlamaClient() {
  const [events, setEvents] = useState<FCEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));

  // ── Dönem seçimi — localStorage'dan oku (takvimle senkron) ──
  const [selectedDonemId, setSelectedDonemId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('3k_active_donem');
    return stored ? parseInt(stored, 10) : null;
  });

  const load = useCallback(async () => {
    setLoading(true);
    const start = selectedDate + 'T00:00:00';
    const end = selectedDate + 'T23:59:59';
    const filters: Record<string, string | number> = { baslangic: start, bitis: end };
    if (selectedDonemId) filters.donem_id = selectedDonemId;
    const [eRes, tRes] = await Promise.all([
      fetchEventsCompact(filters as any),
      fetchEventTypes(),
    ]);
    if (eRes.success && eRes.data) setEvents(eRes.data);
    if (tRes.success && tRes.data) setEventTypes(tRes.data);
    setLoading(false);
  }, [selectedDate, selectedDonemId]);

  useEffect(() => { load(); }, [load]);

  /* Salon gerektirmeyen kategoriler — bu etkinlikler zaten salon ile ilişkili değil,
     "Salon Atanmamış" listesinde gösterilmemeli. */
  const SALON_GEREKTIRMEYEN = new Set([
    'GORUSME',   // Koç / Öğrenci Görüşmesi
    'ODEV',      // Ödev
    'CALISMA',   // Çalışma Programı
    'TATIL',     // Tatil / İzin
  ]);

  // Sadece salon ile ilişkili olabilecek etkinlikleri al
  const salonRelevantEvents = events.filter(
    e => !SALON_GEREKTIRMEYEN.has(e.extendedProps.kategori ?? ''),
  );

  // Etkinlikleri salona göre grupla
  const salonEvents = salonRelevantEvents.filter(e => e.extendedProps.salon_adi);
  const groups: SalonGroup[] = [];
  const salonMap = new Map<string, FCEvent[]>();

  salonEvents.forEach(e => {
    const key = e.extendedProps.salon_adi ?? '';
    if (!key) return;
    if (!salonMap.has(key)) salonMap.set(key, []);
    salonMap.get(key)!.push(e);
  });

  salonMap.forEach((evts, salon_adi) => {
    groups.push({ salon_adi, events: evts.sort((a, b) => a.start.localeCompare(b.start)) });
  });

  groups.sort((a, b) => a.salon_adi.localeCompare(b.salon_adi));

  const noSalonEvents = salonRelevantEvents.filter(e => !e.extendedProps.salon_adi);

  // Saat formatla
  const fmtTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {/* Dönem / Şube / Eğitim Yılı Context Bar */}
      <CalendarContextBar
        selectedDonemId={selectedDonemId}
        onDonemChange={setSelectedDonemId}
      />

      {/* Başlık */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>🏫 Salon Planlama</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            Günlük salon kullanım planını görüntüleyin
          </p>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db',
            fontSize: 13, outline: 'none',
          }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Yükleniyor...</div>
      ) : groups.length === 0 && noSalonEvents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#f9fafb', borderRadius: 12, color: '#9ca3af' }}>
          <p style={{ fontSize: 36 }}>🏫</p>
          <p>Bu gün için planlanan etkinlik yok.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map(g => (
            <div key={g.salon_adi} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🏫</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{g.salon_adi}</span>
                <span style={{ fontSize: 11, color: '#9ca3af', background: '#f3f4f6', padding: '2px 8px', borderRadius: 10 }}>
                  {g.events.length} etkinlik
                </span>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {g.events.map(e => (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8, background: '#f9fafb',
                      borderLeft: `4px solid ${e.color}`,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{e.extendedProps.ikon}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: '#111827' }}>{e.title}</span>
                    <span style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
                      {fmtTime(e.start)} – {fmtTime(e.end)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {noSalonEvents.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', background: '#fefce8', borderBottom: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#92400e' }}>⚠️ Salon Atanmamış Etkinlikler</span>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {noSalonEvents.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: '#fefce8', borderLeft: '4px solid #fbbf24' }}>
                    <span style={{ fontSize: 14 }}>{e.extendedProps.ikon}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: '#111827' }}>{e.title}</span>
                    <span style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
                      {fmtTime(e.start)} – {fmtTime(e.end)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
