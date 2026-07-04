'use client';

import React from 'react';
import type { CalendarEvent } from '@/lib/takvim-api';
import { EVENT_CATEGORY_LABELS, EVENT_STATUS_LABELS } from '@/lib/takvim-api';

interface Props {
  event: CalendarEvent;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
}

const statusBg: Record<string, string> = {
  DRAFT: '#f3f4f6', SCHEDULED: '#dbeafe', IN_PROGRESS: '#fef3c7',
  COMPLETED: '#d1fae5', CANCELLED: '#fee2e2',
};
const statusFg: Record<string, string> = {
  DRAFT: '#6b7280', SCHEDULED: '#1d4ed8', IN_PROGRESS: '#b45309',
  COMPLETED: '#047857', CANCELLED: '#b91c1c',
};

function fmt(iso?: string, allDay?: boolean) {
  if (!iso) return '';
  const d = new Date(iso);
  if (allDay) return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function EventDetailPopup({ event, onClose, onEdit, onDelete }: Props) {
  const et = event.event_type;
  const color = event.renk || et?.renk || '#6366f1';
  const statusInfo = EVENT_STATUS_LABELS[event.durum];

  return (
    <div className="tkv-popup-overlay" onClick={onClose}>
      <div className="tkv-popup" onClick={e => e.stopPropagation()}>
        {/* Renkli band */}
        <div style={{ height: 5, borderRadius: '14px 14px 0 0', background: color }} />

        <div style={{ padding: '20px 24px' }}>
          {/* Başlık */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{et?.ikon || '📅'}</span> {event.baslik}
              </h2>
              <span style={{
                display: 'inline-block', marginTop: 8,
                padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: statusBg[event.durum] || '#f3f4f6',
                color: statusFg[event.durum] || '#6b7280',
              }}>
                {statusInfo.label}
              </span>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9ca3af', padding: 4, lineHeight: 1 }}
            >✕</button>
          </div>

          {/* Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 16 }}>
            {et && <InfoCell icon="🏷️" label="Tür" value={`${et.ikon} ${et.ad}`} />}
            {et && <InfoCell icon="📂" label="Kategori" value={EVENT_CATEGORY_LABELS[et.kategori] || et.kategori} />}
            <InfoCell icon="🕐" label="Başlangıç" value={fmt(event.baslangic, event.tum_gun)} />
            {event.bitis && <InfoCell icon="🕐" label="Bitiş" value={fmt(event.bitis, event.tum_gun)} />}
            {event.salon_adi && <InfoCell icon="📍" label="Salon" value={event.salon_adi} />}
            {event.konum && <InfoCell icon="🗺️" label="Konum" value={event.konum} />}
            {event.tum_gun && <InfoCell icon="📆" label="Süre" value="Tüm gün" />}
          </div>

          {/* Açıklama */}
          {event.aciklama && (
            <div style={{
              background: '#f9fafb', borderRadius: 10, padding: 14,
              fontSize: 13, color: '#374151', lineHeight: 1.7, marginBottom: 16,
              border: '1px solid #f3f4f6',
            }}>
              {event.aciklama}
            </div>
          )}

          {/* Butonlar */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
            <button onClick={() => onDelete(event.id)} className="tkv-btn" style={{ color: '#dc2626', borderColor: '#fecaca' }}>
              🗑 Sil
            </button>
            <button onClick={() => onEdit(event)} className="tkv-btn tkv-btn-primary">
              ✏️ Düzenle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
        <div style={{ fontSize: 13, color: '#111827', fontWeight: 500, marginTop: 1 }}>{value}</div>
      </div>
    </div>
  );
}
