'use client';

import type { SinavTakvim } from '@/lib/website-api';
import { sinavTurBadge, sinavTurColor } from '@/lib/landing-theme';

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

  const today = new Date();
  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  return (
    <div>
      <div className="stk-weekdays">
        {WEEKDAYS.map(w => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="stk-grid">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} aria-hidden />;
          const dateKey = padDate(day);
          const exams = byDate[dateKey] || [];
          const hasExam = exams.length > 0;
          const visible = exams.slice(0, 2);
          const extra = exams.length - visible.length;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => hasExam && onDayClick(dateKey, exams)}
              disabled={!hasExam}
              className={`stk-day${hasExam ? ' stk-day--exam' : ''}${isToday(day) ? ' stk-day--today' : ''}`}
              aria-label={
                hasExam
                  ? `${day} ${exams.map(exam => exam.baslik).join(', ')}`
                  : undefined
              }
            >
              <span className="stk-day-num">{day}</span>
              {hasExam && (
                <span className="stk-dots" aria-hidden>
                  {exams.slice(0, 3).map(exam => (
                    <i key={exam.id} style={{ background: sinavTurColor(exam.tur) }} />
                  ))}
                </span>
              )}
              {hasExam && (
                <span className="stk-chips">
                  {visible.map(exam => (
                    <span
                      key={exam.id}
                      className="stk-chip"
                      style={{ ['--stk-c' as string]: sinavTurColor(exam.tur) }}
                      title={exam.baslik}
                    >
                      <em>{sinavTurBadge(exam.tur)}</em>
                      {exam.baslik}
                    </span>
                  ))}
                  {extra > 0 && <span className="stk-more">+{extra} sınav</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
