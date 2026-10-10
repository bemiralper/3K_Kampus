'use client';

import { useState } from 'react';
import { examApi } from '../api';
import type { DenemeSalon } from '../types';
import { formatInactiveSeats, parseInactiveSeats } from './seating';
import r from './roster.module.css';

function SalonRow({
  salon,
  onSaved,
  onDeleted,
  onError,
}: {
  salon: DenemeSalon;
  onSaved: (row: DenemeSalon) => void;
  onDeleted: (id: number) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(salon.name);
  const [capacity, setCapacity] = useState(String(salon.capacity));
  const [passive, setPassive] = useState(formatInactiveSeats(salon.inactive_seats));
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  const save = async () => {
    const nextName = name.trim();
    if (!nextName) {
      onError('Salon adı yazın.');
      return;
    }
    setBusy('save');
    try {
      const saved = await examApi.updateDenemeSalon(
        salon.id,
        nextName,
        Math.max(1, Number(capacity) || 1),
        parseInactiveSeats(passive),
      );
      setPassive(formatInactiveSeats(saved.inactive_seats));
      onSaved(saved);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Salon güncellenemedi.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(`${salon.name} kayıtlı listeden silinsin mi? Eski sınavlardaki salon durur.`)) return;
    setBusy('delete');
    try {
      await examApi.deleteDenemeSalon(salon.id);
      onDeleted(salon.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Salon silinemedi.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={r.salonCard}>
      <div className={r.salonRow}>
        <input aria-label="Salon adı" value={name} onChange={e => setName(e.target.value)} />
        <input
          aria-label="Kapasite"
          type="number"
          min={1}
          inputMode="numeric"
          value={capacity}
          onChange={e => setCapacity(e.target.value)}
        />
        <button type="button" className={r.salonSave} disabled={busy != null} onClick={save}>
          {busy === 'save' ? '…' : 'Güncelle'}
        </button>
        <button type="button" className={r.ghost} disabled={busy != null} onClick={remove}>
          {busy === 'delete' ? '…' : 'Sil'}
        </button>
      </div>
      <label className={r.field}>
        <span>Pasif sıralar</span>
        <input
          aria-label={`${salon.name} pasif sıralar`}
          value={passive}
          placeholder="5, 12, 18-20"
          onChange={e => setPassive(e.target.value)}
        />
      </label>
    </div>
  );
}

export default function DenemeSalonCatalog({
  salonlar,
  onChange,
  onError,
}: {
  salonlar: DenemeSalon[];
  onChange: (next: DenemeSalon[]) => void;
  onError: (message: string) => void;
}) {
  if (salonlar.length === 0) return null;
  return (
    <div className={r.salonCatalog}>
      <p className={r.roomHint}>
        Kayıtlı salonlar. Ad, kapasite ve pasif sıraları değiştirip Güncelle. Sil, yalnızca bu listeyi temizler. Pasif sıralar salonu seçince sınava kopyalanır.
      </p>
      {salonlar.map(salon => (
        <SalonRow
          key={salon.id}
          salon={salon}
          onError={onError}
          onSaved={saved => onChange(
            [...salonlar.filter(s => s.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
          )}
          onDeleted={id => onChange(salonlar.filter(s => s.id !== id))}
        />
      ))}
    </div>
  );
}
