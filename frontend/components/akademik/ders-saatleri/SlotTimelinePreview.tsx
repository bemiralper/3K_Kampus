'use client';

import type { GeneratedSlotPreview, TimeSlot } from '@/lib/academic-api';
import { displaySlotName, slotTypeMeta } from './constants';
import './ders-saatleri.css';

type PreviewSlot = TimeSlot | GeneratedSlotPreview;

type Props = {
  slots: PreviewSlot[];
  title?: string;
  /** Şube tema_rengi — öğle arası arka planı için */
  subeThemeHex?: string | null;
};

function timeLabel(slot: PreviewSlot): string {
  if ('start_time_display' in slot && slot.start_time_display) return slot.start_time_display;
  return String(slot.start_time).slice(0, 5);
}

function endLabel(slot: PreviewSlot): string {
  if ('end_time_display' in slot && slot.end_time_display) return slot.end_time_display;
  return String(slot.end_time).slice(0, 5);
}

export default function SlotTimelinePreview({
  slots,
  title = 'Canlı Önizleme',
  subeThemeHex,
}: Props) {
  const sorted = [...slots].sort((a, b) => a.order - b.order);

  return (
    <div className="ds-preview">
      <div className="ds-preview-head">
        <h3>{title}</h3>
        <span>{sorted.length} blok</span>
      </div>
      <div className="ds-preview-track">
        {sorted.length === 0 ? (
          <p className="ds-preview-empty">Henüz ders saati tanımlanmadı.</p>
        ) : (
          sorted.map((slot) => {
            const meta = slotTypeMeta(slot.slot_type, subeThemeHex);
            const label = displaySlotName(slot.name, slot.slot_type);
            return (
              <div key={`${slot.order}-${slot.slot_type}-${label}`} className="ds-preview-row">
                <div className="ds-preview-time">{timeLabel(slot)}</div>
                <div className="ds-preview-line" style={{ borderColor: meta.color }}>
                  <div
                    className="ds-preview-chip"
                    style={{ background: meta.bg, borderColor: meta.color, color: meta.color }}
                  >
                    <strong>{label}</strong>
                    <span>{meta.label}</span>
                    <em>{slot.duration} dk</em>
                  </div>
                </div>
                <div className="ds-preview-time">{endLabel(slot)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
