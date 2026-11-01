'use client';

import { useEffect, useState } from 'react';
import type { SinavTakvim } from '@/lib/website-api';
import SinavPoster from './SinavPoster';

type MonthCalendarGridProps = {
  year: number;
  month: number;
  exams: SinavTakvim[];
  selectedId: number | null;
  onSelect: (exam: SinavTakvim) => void;
};

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function chipTone(tur: string) {
  switch (tur) {
    case 'AYT':
      return { bg: '#f4e9ff', fg: '#6d28d9' };
    case 'S11':
      return { bg: '#f3e8ff', fg: '#7c3aed' };
    case 'S7':
      return { bg: '#e7f6f2', fg: '#0f766e' };
    case 'LGS':
      return { bg: '#e7f1ff', fg: '#1d4e89' };
    default:
      return { bg: '#e7f2ff', fg: '#1d4f91' };
  }
}

function clock(value?: string | null) {
  return value ? value.slice(0, 5) : '';
}

export default function MonthCalendarGrid({ year, month, exams, selectedId, onSelect }: MonthCalendarGridProps) {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const padDate = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const byDate: Record<string, SinavTakvim[]> = {};
  exams.forEach(exam => {
    if (!byDate[exam.tarih]) byDate[exam.tarih] = [];
    byDate[exam.tarih].push(exam);
  });

  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);
  const isToday = (d: number) =>
    !!today && today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  const selectedDate = exams.find(exam => exam.id === selectedId)?.tarih;

  return (
    <div className="stk-cal">
      <div className="stk-weekdays">
        {WEEKDAYS.map(name => <span key={name}>{name}</span>)}
      </div>
      <div className="stk-grid">
        {cells.map((day, index) => {
          if (day === null) return <div key={`pad-${index}`} className="stk-day-blank" />;
          const dateKey = padDate(day);
          const dayExams = byDate[dateKey] || [];
          const expanded = expandedDates.has(dateKey);
          const shown = expanded ? dayExams : dayExams.slice(0, 2);
          const extra = dayExams.length - shown.length;
          const todayCell = isToday(day);
          const selectedCell = selectedDate === dateKey;
          return (
            <div
              key={dateKey}
              className={`stk-day${selectedCell ? ' stk-day--on' : ''}${todayCell ? ' stk-day--today' : ''}`}
            >
              <span className="stk-day-num">{day}</span>
              {shown.map(exam => {
                const tone = chipTone(exam.tur);
                const time = clock(exam.saat);
                return (
                  <button
                    key={exam.id}
                    type="button"
                    className="stk-chip stk-chip--poster"
                    data-on={exam.id === selectedId ? 'true' : undefined}
                    style={{ background: tone.bg, color: tone.fg }}
                    aria-label={`${exam.baslik}, ${exam.tarih}${time ? ` ${time}` : ''} — detayları aç`}
                    onClick={() => onSelect(exam)}
                  >
                    <SinavPoster url={exam.gorsel_url} className="stk-chip-poster" />
                    {exam.kapsam === 'turkiye_geneli' && <span className="stk-national">Türkiye Geneli</span>}
                  </button>
                );
              })}
              {(extra > 0 || expanded) && (
                <button type="button" className="stk-more" aria-expanded={expanded}
                  onClick={() => setExpandedDates(previous => {
                    const next = new Set(previous);
                    if (next.has(dateKey)) next.delete(dateKey); else next.add(dateKey);
                    return next;
                  })}>
                  {expanded ? 'Daha az' : `+${extra} sınav`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
