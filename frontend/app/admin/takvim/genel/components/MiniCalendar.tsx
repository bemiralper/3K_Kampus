'use client';

import React, { useMemo } from 'react';

interface Props {
  currentDate: Date;
  selectedDate: Date | null;
  onDateClick: (date: Date) => void;
  onMonthChange: (date: Date) => void;
  eventDates?: Set<string>;          // 'YYYY-MM-DD' formatında
}

const DAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function toKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function MiniCalendar({ currentDate, selectedDate, onDateClick, onMonthChange, eventDates }: Props) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = new Date();
  const todayKey = toKey(today);
  const selKey = selectedDate ? toKey(selectedDate) : '';

  const weeks = useMemo(() => {
    const first = new Date(year, month, 1);
    let startDay = first.getDay() - 1; // Pazartesi = 0
    if (startDay < 0) startDay = 6;

    const start = new Date(year, month, 1 - startDay);
    const rows: Date[][] = [];

    for (let w = 0; w < 6; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) {
        week.push(new Date(start));
        start.setDate(start.getDate() + 1);
      }
      rows.push(week);
    }
    return rows;
  }, [year, month]);

  const prev = () => onMonthChange(new Date(year, month - 1, 1));
  const next = () => onMonthChange(new Date(year, month + 1, 1));

  return (
    <div className="tkv-mini-cal">
      <div className="tkv-mini-nav">
        <button onClick={prev}>‹</button>
        <span>{MONTHS[month]} {year}</span>
        <button onClick={next}>›</button>
      </div>

      <table>
        <thead>
          <tr>
            {DAYS.map(d => <th key={d}>{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => {
                const key = toKey(day);
                const isOther = day.getMonth() !== month;
                const isToday = key === todayKey;
                const isSel = key === selKey;
                const hasEvent = eventDates?.has(key);
                const cls = [
                  'tkv-mini-cal-day',
                  isOther && 'other-month',
                  isToday && 'today',
                  isSel && !isToday && 'selected',
                  hasEvent && 'has-event',
                ].filter(Boolean).join(' ');

                return (
                  <td key={di}>
                    <div className={cls} onClick={() => onDateClick(day)}>
                      {day.getDate()}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
