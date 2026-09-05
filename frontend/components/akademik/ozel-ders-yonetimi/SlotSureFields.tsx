'use client';

import { addWeeksToDate, slotSureHint, type SlotSureForm } from './slotSure';

type Props = {
  value: SlotSureForm;
  onChange: (next: SlotSureForm) => void;
  programStart?: string | null;
  programEnd?: string | null;
  gunLabel?: string;
  saatLabel?: string;
  onEndEarly?: () => void;
  endingEarly?: boolean;
};

export default function SlotSureFields({
  value,
  onChange,
  programStart,
  programEnd,
  gunLabel,
  saatLabel,
  onEndEarly,
  endingEarly,
}: Props) {
  const startFallback = value.baslangic_tarihi || programStart || '';

  function applyWeeks(weeks: number) {
    const start = startFallback;
    onChange({
      ...value,
      baslangic_tarihi: start || value.baslangic_tarihi,
      bitis_tarihi: addWeeksToDate(start, weeks),
    });
  }

  const hint = slotSureHint(value, { gunLabel, saat: saatLabel });

  return (
    <div className="od-drawer-section">
      <div className="od-form-section-title">Ders süresi</div>
      <p className="od-form-hint" style={{ marginTop: 0 }}>
        Boş bırakılırsa program dönemi kullanılır
        {programStart ? ` (${programStart}${programEnd ? ` – ${programEnd}` : ' · süresiz'})` : ''}.
        Aynı dersin diğer şablon saatleri bu tarih ve kotayı paylaşır.
      </p>
      <div className="od-form-row">
        <div className="od-form-group">
          <label>Başlangıç</label>
          <input
            type="date"
            value={value.baslangic_tarihi}
            min={programStart || undefined}
            max={programEnd || undefined}
            onChange={(e) => onChange({ ...value, baslangic_tarihi: e.target.value })}
          />
        </div>
        <div className="od-form-group">
          <label>Bitiş</label>
          <input
            type="date"
            value={value.bitis_tarihi}
            min={value.baslangic_tarihi || programStart || undefined}
            max={programEnd || undefined}
            onChange={(e) => onChange({ ...value, bitis_tarihi: e.target.value })}
          />
        </div>
      </div>
      <div className="od-form-row" style={{ alignItems: 'flex-end' }}>
        <div className="od-form-group" style={{ flex: 1 }}>
          <label>Hedef saat</label>
          <input
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            placeholder="Örn. 5"
            value={value.hedef_saat}
            onChange={(e) => onChange({ ...value, hedef_saat: e.target.value })}
          />
          <span className="od-form-hint">İşlenen + planlanan süre bu saate düşünce oturum üretilmez.</span>
        </div>
        <div className="od-form-group" style={{ flex: '0 0 auto' }}>
          <div className="od-attend-actions" role="group" aria-label="Hafta kısayolu">
            <button type="button" className="od-btn od-btn-secondary od-btn-sm" onClick={() => applyWeeks(3)}>
              +3 hafta
            </button>
            <button type="button" className="od-btn od-btn-secondary od-btn-sm" onClick={() => applyWeeks(4)}>
              +4 hafta
            </button>
          </div>
        </div>
      </div>
      {hint && <p className="od-form-hint">{hint}</p>}
      {onEndEarly ? (
        <>
          <button
            type="button"
            className="od-btn od-btn-secondary od-btn-sm"
            disabled={endingEarly}
            onClick={onEndEarly}
          >
            {endingEarly ? 'Kapatılıyor…' : 'Dersi erken bitir'}
          </button>
          <span className="od-form-hint">
            İşlenen dersler kalır; bugünden sonraki planlı oturumlar kapanır. Saat kotası varsa işlenen süreye çekilir.
          </span>
        </>
      ) : null}
    </div>
  );
}
