'use client';

import { useEffect, useState } from 'react';
import type { ExamRoomItem } from '../types';
import {
  candidateSeats,
  formatInactiveSeats,
  parseInactiveSeats,
  seatNumbers,
} from './seating';
import s from './passive-seats.module.css';

const GRID_LIMIT = 240;

export default function PassiveSeatsField({
  room,
  onChange,
  className,
}: {
  room: Pick<ExamRoomItem, 'capacity' | 'seat_start' | 'seat_gap' | 'inactive_seats'>;
  onChange: (seats: number[]) => void;
  className?: string;
}) {
  const incoming = formatInactiveSeats(room.inactive_seats);
  const [text, setText] = useState(incoming);
  useEffect(() => { setText(incoming); }, [incoming]);

  const candidates = candidateSeats(room);
  const usable = seatNumbers({ ...room, inactive_seats: parseInactiveSeats(text) }).length;
  const passive = candidates.filter(n => parseInactiveSeats(text).includes(n)).length;
  const showGrid = candidates.length > 0 && candidates.length <= GRID_LIMIT;

  const commit = (next: number[]) => {
    onChange(next);
    setText(formatInactiveSeats(next));
  };

  const toggle = (n: number) => {
    const set = new Set(parseInactiveSeats(text));
    if (set.has(n)) set.delete(n);
    else set.add(n);
    commit([...set].sort((a, b) => a - b));
  };

  return (
    <div className={`${s.wrap} ${className || ''}`}>
      <label className={s.field}>
        <span>Pasif sıralar</span>
        <input
          value={text}
          inputMode="text"
          placeholder="5, 12, 18-20"
          aria-label="Pasif sıralar"
          onChange={e => setText(e.target.value)}
          onBlur={() => commit(parseInactiveSeats(text))}
        />
      </label>
      <p className={`${s.note} ${usable === 0 && candidates.length > 0 ? s.warn : ''}`}>
        {passive
          ? `${usable} kullanılabilir sıra · ${passive} pasif. Pasif numaralara öğrenci oturmaz.`
          : 'Pasif yapmak istediğiniz sıra numarasına tıklayın veya 5, 12, 18-20 yazın.'}
        {candidates.length > GRID_LIMIT ? ' Çok sıra var; numaraları yazın.' : ''}
      </p>
      {showGrid && (
        <div className={s.grid} role="group" aria-label="Sıra numaraları">
          {candidates.map(n => {
            const off = parseInactiveSeats(text).includes(n);
            return (
              <button
                key={n}
                type="button"
                className={off ? s.seatOff : s.seat}
                aria-pressed={off}
                aria-label={off ? `Sıra ${n} pasif` : `Sıra ${n}`}
                onClick={() => toggle(n)}
              >
                {n}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
