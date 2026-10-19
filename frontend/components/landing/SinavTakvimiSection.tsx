'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SinavTakvim } from '@/lib/website-api';
import { sinavTurBadge, sinavTurColor } from '@/lib/landing-theme';
import { SINAV_TABS, filterSinavByTab, sinavTabById, type SinavTabId } from '@/lib/sinav-takvim';
import MonthCalendarGrid from './MonthCalendarGrid';
import SinavDetailModal from './SinavDetailModal';
import SinavKapsamEtiketi from './SinavKapsamEtiketi';
import './public-home.css';

type SinavTakvimiSectionProps = {
  sinavlar: SinavTakvim[];
};

function isInMonth(tarih: string, year: number, month: number) {
  const [y, m] = tarih.split('-').map(Number);
  return y === year && m === month + 1;
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
  const [tab, setTab] = useState<SinavTabId>('yks');
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

  const filtered = useMemo(() => filterSinavByTab(examsInMonth, tab), [examsInMonth, tab]);
  const byDate = useMemo(() => buildByDate(filtered), [filtered]);
  const activeTab = sinavTabById(tab);

  const counts = useMemo(() => {
    const map: Record<SinavTabId, number> = { yks: 0, sinif11: 0, lgs: 0, sinif7: 0 };
    SINAV_TABS.forEach(item => {
      map[item.id] = filterSinavByTab(examsInMonth, item.id).length;
    });
    return map;
  }, [examsInMonth]);

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

  const legendItems = activeTab.types;

  const handleDayClick = (_dateKey: string, exams: SinavTakvim[]) => {
    if (exams.length === 1) setSelected(exams[0]);
    else setDayPicker(exams);
  };

  const agenda = useMemo(
    () => [...filtered].sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.saat || '').localeCompare(b.saat || '')),
    [filtered],
  );

  return (
    <section id="sinav-takvimi" className="stk">
      <div className="stk-wrap">
        <header className="stk-head">
          <div>
            <h2>Sınav Takvimi</h2>
            <p>YKS, 11. sınıf, LGS ve 7. sınıf sınav tarihlerini ayrı takvimlerde inceleyin</p>
          </div>
        </header>

        <div className="stk-toolbar">
          <div className="stk-tabs" role="tablist" aria-label="Sınav türü">
            {SINAV_TABS.map(t => {
              const count = counts[t.id];
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => { setTab(t.id); setSelected(null); setDayPicker(null); }}
                  className="stk-tab"
                  data-active={active ? 'true' : 'false'}
                >
                  <span>{t.label}</span>
                  <span className="stk-tab-hint">{t.hint}</span>
                  {count > 0 && <span className="stk-tab-count">{count}</span>}
                </button>
              );
            })}
          </div>
          <div className="stk-legend">
            <div className="stk-legend-group" aria-label="Sınav türü">
              {legendItems.map(({ value, label }) => (
                <span key={value}>
                  <i style={{ backgroundColor: sinavTurColor(value) }} />
                  {label}
                </span>
              ))}
            </div>
            <div className="stk-legend-group" aria-label="Kapsam">
              <SinavKapsamEtiketi kapsam="turkiye_geneli" />
              <SinavKapsamEtiketi kapsam="yerel" />
            </div>
          </div>
        </div>

        <div className="stk-board">
          <div className="stk-month">
            <button type="button" onClick={prevMonth} className="stk-nav" aria-label="Önceki ay">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>
            <div>
              <h3>{monthNames[month]} {year}</h3>
              <p>{activeTab.calendarLabel}</p>
            </div>
            <div className="stk-month-side">
              {!isCurrentMonth && (
                <button type="button" onClick={goToday} className="stk-today">
                  Bugün
                </button>
              )}
              <button type="button" onClick={nextMonth} className="stk-nav" aria-label="Sonraki ay">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            </div>
          </div>

          <MonthCalendarGrid year={year} month={month} byDate={byDate} onDayClick={handleDayClick} />

          {filtered.length === 0 && (
            <p className="stk-empty">
              {monthNames[month]} {year} ayında {activeTab.emptyMonth}
            </p>
          )}

          {agenda.length > 0 && (
            <div className="stk-agenda">
              <h4>{monthNames[month]} sınavları</h4>
              {agenda.map(exam => {
                const day = Number(exam.tarih.slice(8, 10));
                return (
                  <button
                    key={exam.id}
                    type="button"
                    onClick={() => setSelected(exam)}
                    style={{ ['--stk-c' as string]: sinavTurColor(exam.tur) }}
                  >
                    <time dateTime={exam.tarih}>
                      <b>{day}</b>
                      {monthNames[month].slice(0, 3)}
                    </time>
                    <span>
                      <strong>{exam.baslik}</strong>
                      <small>
                        <em>{sinavTurBadge(exam.tur)}</em>
                        {exam.saat ? <span>{exam.saat}</span> : null}
                        <SinavKapsamEtiketi kapsam={exam.kapsam} />
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <SinavDetailModal sinav={selected} onClose={() => setSelected(null)} />

      {dayPicker && (
        <div className="stk-shade" onClick={() => setDayPicker(null)}>
          <div
            className="stk-pick"
            role="dialog"
            aria-modal="true"
            aria-label="Sınav seçin"
            onClick={event => event.stopPropagation()}
          >
            <h4>Sınav seçin</h4>
            <div className="stk-pick-list">
              {dayPicker.map(exam => (
                <button
                  key={exam.id}
                  type="button"
                  onClick={() => { setSelected(exam); setDayPicker(null); }}
                >
                  <span className="stk-pick-mark" style={{ backgroundColor: sinavTurColor(exam.tur) }}>
                    {sinavTurBadge(exam.tur)}
                  </span>
                  <span>
                    <strong>{exam.baslik}</strong>
                    <small><SinavKapsamEtiketi kapsam={exam.kapsam} /></small>
                  </span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setDayPicker(null)} className="stk-pick-close">
              Kapat
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
