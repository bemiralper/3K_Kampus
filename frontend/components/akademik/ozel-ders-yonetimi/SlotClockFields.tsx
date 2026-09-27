'use client';

import {
  durationBetween,
  shiftTime,
  type PeriodRow,
} from './haftalikGridUtils';

type ClockValue = {
  baslangic: string;
  bitis: string;
  sure_dk: string;
};

type Props = {
  value: ClockValue;
  onChange: (next: ClockValue) => void;
  periods: PeriodRow[];
  defaultSureDk: number;
};

export default function SlotClockFields({ value, onChange, periods, defaultSureDk }: Props) {
  const start = (value.baslangic || '').slice(0, 5);
  const end = (value.bitis || '').slice(0, 5);
  const matched = periods.find((p) => p.baslangic === start && p.bitis === end);
  const sure = durationBetween(start, end);
  const invalid = Boolean(start && end && sure == null);

  function onStart(baslangic: string) {
    const keep = durationBetween(value.baslangic, value.bitis) ?? (Number(value.sure_dk) || defaultSureDk);
    onChange({
      baslangic,
      bitis: baslangic ? shiftTime(baslangic, keep) : value.bitis,
      sure_dk: String(keep),
    });
  }

  function onEnd(bitis: string) {
    const nextSure = durationBetween(value.baslangic, bitis);
    onChange({
      baslangic: value.baslangic,
      bitis,
      sure_dk: nextSure != null ? String(nextSure) : value.sure_dk,
    });
  }

  function onPeriod(key: string) {
    const period = periods.find((p) => p.key === key);
    if (!period) return;
    const nextSure = durationBetween(period.baslangic, period.bitis) ?? defaultSureDk;
    onChange({
      baslangic: period.baslangic,
      bitis: period.bitis,
      sure_dk: String(nextSure),
    });
  }

  return (
    <>
      <div className="od-form-group">
        <label>Tablo satırı</label>
        <select value={matched?.key || ''} onChange={(e) => onPeriod(e.target.value)}>
          <option value="">Özel saat</option>
          {periods.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}: {p.baslangic}–{p.bitis}
            </option>
          ))}
        </select>
        <span className="od-form-hint">
          Çoğu ders satırdan gelir. Bu ders farklıysa başlangıç ve bitişi aşağıdan yazın.
        </span>
      </div>
      <div className="od-form-row">
        <div className="od-form-group">
          <label>
            Başlangıç <span className="req">*</span>
          </label>
          <input
            type="time"
            required
            value={start}
            onChange={(e) => onStart(e.target.value)}
          />
        </div>
        <div className="od-form-group">
          <label>
            Bitiş <span className="req">*</span>
          </label>
          <input
            type="time"
            required
            value={end}
            onChange={(e) => onEnd(e.target.value)}
          />
        </div>
      </div>
      <p className="od-form-hint" style={{ marginTop: 0 }}>
        {invalid
          ? 'Bitiş saati başlangıçtan sonra olmalı.'
          : sure != null
            ? `${sure} dk${matched ? '' : ' · tablodan farklı'}`
            : ''}
      </p>
    </>
  );
}
