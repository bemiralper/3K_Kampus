'use client';

import { useEffect, useState } from 'react';
import type { SinavTakvim } from '@/lib/website-api';
import { sinavTurBadge, sinavTurColor } from '@/lib/landing-theme';
import SinavKapsamEtiketi from './SinavKapsamEtiketi';

type MonthCalendarGridProps = {
  year: number;
  month: number;
  byDate: Record<string, SinavTakvim[]>;
  onDayClick: (dateKey: string, exams: SinavTakvim[]) => void;
};

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export default function MonthCalendarGrid({ year, month, byDate, onDayClick }: MonthCalendarGridProps) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const padDate = (d: number) => {
    const m = String(month + 1).padStart(2, '0');
    const day = String(d).padStart(2, '0');
    return `${year}-${m}-${day}`;
  };

  // Sunucu ve tarayıcı gece yarısı farklı günde olabilir; bugün istemcide hesaplanır.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);
  const isToday = (d: number) =>
    !!today && today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  return (
    <div className="stk-cal">
      <div className="stk-weekdays">
        {WEEKDAYS.map((w, i) => (
          <span key={w} data-weekend={i > 4 ? 'true' : undefined}>{w}</span>
        ))}
      </div>
      <div className="stk-grid">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="stk-day-blank" data-weekend={i % 7 >= 5 ? 'true' : undefined} aria-hidden />;
          }
          const dateKey = padDate(day);
          const exams = byDate[dateKey] || [];
          const primary = exams[0];
          const extra = exams.length - 1;
          const color = primary ? sinavTurColor(primary.tur) : undefined;
          const todayCell = isToday(day);

          const weekend = i % 7 >= 5;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => primary && onDayClick(dateKey, exams)}
              disabled={!primary}
              className={`stk-day${primary ? ' stk-day--exam' : ''}${todayCell ? ' stk-day--today' : ''}`}
              data-weekend={weekend ? 'true' : undefined}
              style={color ? { ['--stk-c' as string]: color } : undefined}
              aria-label={
                primary
                  ? `${day}: ${exams
                      .map(e => `${e.baslik} (${e.kapsam === 'yerel' ? 'Yerel' : 'Türkiye Geneli'})`)
                      .join(', ')}`
                  : undefined
              }
            >
              <span className="stk-day-top">
                <span className="stk-day-num">{day}</span>
                {todayCell && <span className="stk-day-today">Bugün</span>}
              </span>

              {primary && (
                <>
                  <span className="stk-event">
                    <span className="stk-day-kicker">
                      <span className="stk-day-badge">{sinavTurBadge(primary.tur)}</span>
                      <SinavKapsamEtiketi kapsam={primary.kapsam} compact />
                      {extra > 0 && <span className="stk-day-more">+{extra}</span>}
                    </span>
                    <span className="stk-day-title" title={primary.baslik}>
                      {primary.baslik}
                    </span>
                  </span>
                  <span className="stk-dots" aria-hidden>
                    {exams.slice(0, 3).map(exam => (
                      <i
                        key={exam.id}
                        style={{ background: sinavTurColor(exam.tur) }}
                        data-yerel={exam.kapsam === 'yerel' ? 'true' : undefined}
                      />
                    ))}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
