'use client';

import type { SinavTakvim } from '@/lib/website-api';
import { sinavTurColor } from '@/lib/landing-theme';

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
      <div className="mb-2 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map(w => (
          <div key={w} className="py-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} className="min-h-[4.5rem]" />;
          const dateKey = padDate(day);
          const exams = byDate[dateKey] || [];
          const hasExam = exams.length > 0;
          const primary = exams[0];
          const color = primary ? sinavTurColor(primary.tur) : undefined;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => hasExam && onDayClick(dateKey, exams)}
              disabled={!hasExam}
              className={`relative flex min-h-[4.5rem] flex-col overflow-hidden rounded-xl border text-left transition sm:min-h-[5.25rem] ${
                hasExam
                  ? 'cursor-pointer border-transparent shadow-sm hover:shadow-md'
                  : 'border-slate-100 bg-slate-50/50 text-slate-500'
              } ${isToday(day) ? 'ring-2 ring-[#0262a7] ring-offset-2' : ''}`}
              style={hasExam ? {
                backgroundColor: `${color}12`,
                borderColor: `${color}30`,
              } : undefined}
            >
              <span
                className={`px-2 pt-1.5 text-xs font-bold ${hasExam ? '' : 'text-slate-500'}`}
                style={hasExam ? { color } : undefined}
              >
                {day}
              </span>

              {hasExam && primary && (
                <div className="flex min-h-0 flex-1 flex-col gap-0.5 px-1.5 pb-1.5">
                  <span
                    className="inline-flex w-fit rounded px-1.5 py-0.5 text-[9px] font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {primary.tur}
                  </span>

                  <p
                    className="line-clamp-2 text-[9px] font-semibold leading-tight text-slate-800 sm:text-[10px]"
                    title={primary.baslik}
                  >
                    {primary.baslik}
                  </p>

                  {primary.kapsam === 'turkiye_geneli' && (
                    <span className="mt-auto inline-flex w-fit max-w-full truncate rounded bg-[#0262a7]/10 px-1 py-px text-[8px] font-bold text-[#0262a7] sm:text-[9px]">
                      TR Geneli
                    </span>
                  )}
                </div>
              )}

              {exams.length > 1 && (
                <span className="absolute bottom-1 right-1 rounded bg-black/50 px-1 text-[9px] font-bold text-white">
                  +{exams.length - 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
