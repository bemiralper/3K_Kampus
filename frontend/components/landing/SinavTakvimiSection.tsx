'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SinavTakvim } from '@/lib/website-api';
import { LANDING_COLORS, sinavTurColor } from '@/lib/landing-theme';
import MonthCalendarGrid from './MonthCalendarGrid';
import SinavDetailModal from './SinavDetailModal';

type SinavTab = 'lgs' | 'yks';

type SinavTakvimiSectionProps = {
  sinavlar: SinavTakvim[];
};

const TABS: { id: SinavTab; label: string; hint: string }[] = [
  { id: 'yks', label: 'YKS', hint: 'TYT & AYT' },
  { id: 'lgs', label: 'LGS', hint: 'Liseye Geçiş' },
];

function isInMonth(tarih: string, year: number, month: number) {
  const [y, m] = tarih.split('-').map(Number);
  return y === year && m === month + 1;
}

function filterByTab(list: SinavTakvim[], tab: SinavTab) {
  if (tab === 'lgs') return list.filter(s => s.tur === 'LGS');
  return list.filter(s => s.tur === 'TYT' || s.tur === 'AYT');
}

function buildByDate(list: SinavTakvim[]) {
  const map: Record<string, SinavTakvim[]> = {};
  list.forEach(s => {
    if (!map[s.tarih]) map[s.tarih] = [];
    map[s.tarih].push(s);
  });
  return map;
}

function currentMonthYear() {
  const now = new Date();
  return { month: now.getMonth(), year: now.getFullYear() };
}

export default function SinavTakvimiSection({ sinavlar }: SinavTakvimiSectionProps) {
  const [tab, setTab] = useState<SinavTab>('yks');
  const [{ month, year }, setCalendar] = useState(currentMonthYear);
  const [selected, setSelected] = useState<SinavTakvim | null>(null);
  const [dayPicker, setDayPicker] = useState<SinavTakvim[] | null>(null);

  useEffect(() => {
    setCalendar(currentMonthYear());
  }, [tab]);

  const examsInMonth = useMemo(
    () => sinavlar.filter(s => isInMonth(s.tarih, year, month)),
    [sinavlar, year, month],
  );

  const filtered = useMemo(() => filterByTab(examsInMonth, tab), [examsInMonth, tab]);
  const byDate = useMemo(() => buildByDate(filtered), [filtered]);

  const lgsCount = useMemo(
    () => examsInMonth.filter(s => s.tur === 'LGS').length,
    [examsInMonth],
  );
  const yksCount = useMemo(
    () => examsInMonth.filter(s => s.tur === 'TYT' || s.tur === 'AYT').length,
    [examsInMonth],
  );

  const prevMonth = () => {
    setCalendar(c => {
      if (c.month === 0) return { month: 11, year: c.year - 1 };
      return { ...c, month: c.month - 1 };
    });
  };

  const nextMonth = () => {
    setCalendar(c => {
      if (c.month === 11) return { month: 0, year: c.year + 1 };
      return { ...c, month: c.month + 1 };
    });
  };

  const goToday = () => setCalendar(currentMonthYear());

  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const isCurrentMonth = month === new Date().getMonth() && year === new Date().getFullYear();

  const legendItems = tab === 'lgs'
    ? [{ tur: 'LGS' as const, label: 'LGS' }]
    : [{ tur: 'TYT' as const, label: 'TYT' }, { tur: 'AYT' as const, label: 'AYT' }];

  const handleDayClick = (_dateKey: string, exams: SinavTakvim[]) => {
    if (exams.length === 1) setSelected(exams[0]);
    else setDayPicker(exams);
  };

  return (
    <section id="sinav-takvimi" className="py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: LANDING_COLORS.navy }}>Sınav Takvimi</h2>
          <p className="mt-2 text-slate-500">LGS ve YKS sınav tarihlerini ayrı takvimlerde inceleyin</p>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          {TABS.map(t => {
            const count = t.id === 'lgs' ? lgsCount : yksCount;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTab(t.id); setSelected(null); setDayPicker(null); }}
                className="sinav-cal-tab"
                data-active={active ? 'true' : 'false'}
              >
                <span className="sinav-cal-tab-label">{t.label}</span>
                <span className="sinav-cal-tab-hint">{t.hint}</span>
                {count > 0 && <span className="sinav-cal-tab-count">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-center gap-4">
          {legendItems.map(({ tur, label }) => (
            <span key={tur} className="flex items-center gap-2 text-sm text-slate-600">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: sinavTurColor(tur) }} />
              {label}
            </span>
          ))}
        </div>

        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
          <div className="mb-4 flex items-center justify-between gap-2">
            <button type="button" onClick={prevMonth} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Önceki ay">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>
            <div className="text-center">
              <h3 className="font-semibold text-slate-900">{monthNames[month]} {year}</h3>
              <p className="text-xs text-slate-400">{tab === 'lgs' ? 'LGS Takvimi' : 'YKS Takvimi'}</p>
            </div>
            <div className="flex items-center gap-1">
              {!isCurrentMonth && (
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-[#0262a7] hover:bg-blue-50"
                >
                  Bugün
                </button>
              )}
              <button type="button" onClick={nextMonth} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Sonraki ay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            </div>
          </div>

          <MonthCalendarGrid year={year} month={month} byDate={byDate} onDayClick={handleDayClick} />

          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-slate-400">
              {tab === 'lgs'
                ? `${monthNames[month]} ${year} ayında LGS sınavı bulunmuyor.`
                : `${monthNames[month]} ${year} ayında YKS (TYT/AYT) sınavı bulunmuyor.`}
            </p>
          )}
        </div>
      </div>

      <SinavDetailModal sinav={selected} onClose={() => setSelected(null)} />

      {dayPicker && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setDayPicker(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h4 className="mb-3 text-base font-bold text-slate-900">Sınav Seçin</h4>
            <div className="space-y-2">
              {dayPicker.map(exam => (
                <button
                  key={exam.id}
                  type="button"
                  onClick={() => { setSelected(exam); setDayPicker(null); }}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-[#0262a7] hover:bg-slate-50"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                    style={{ backgroundColor: sinavTurColor(exam.tur) }}
                  >
                    {exam.tur}
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm text-slate-900">{exam.baslik}</strong>
                    <small className="text-xs text-slate-500">
                      {exam.kapsam === 'turkiye_geneli' ? 'Türkiye Geneli' : 'Yerel'}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setDayPicker(null)} className="mt-4 w-full rounded-xl py-2 text-sm text-slate-500 hover:bg-slate-100">
              Kapat
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        .sinav-cal-tab {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.45rem 0.9rem;
          border: 1.5px solid #e2e8f0;
          border-radius: 999px;
          background: #fff;
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .sinav-cal-tab:hover {
          border-color: ${LANDING_COLORS.accent};
          color: ${LANDING_COLORS.accent};
        }
        .sinav-cal-tab[data-active='true'] {
          border-color: ${LANDING_COLORS.accent};
          background: ${LANDING_COLORS.accent};
          color: #fff;
          box-shadow: 0 2px 10px rgba(2, 98, 167, 0.25);
        }
        .sinav-cal-tab-label {
          font-size: 13px;
          font-weight: 700;
        }
        .sinav-cal-tab-hint {
          font-size: 11px;
          font-weight: 500;
          opacity: 0.75;
        }
        .sinav-cal-tab-count {
          font-size: 10px;
          font-weight: 700;
          min-width: 1.1rem;
          height: 1.1rem;
          line-height: 1.1rem;
          text-align: center;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.25);
          padding: 0 0.25rem;
        }
        .sinav-cal-tab[data-active='false'] .sinav-cal-tab-count {
          background: #f1f5f9;
          color: #64748b;
        }
      `}</style>
    </section>
  );
}
