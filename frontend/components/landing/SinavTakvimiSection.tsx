'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SinavTakvim } from '@/lib/website-api';
import { sinavTurBadge } from '@/lib/landing-theme';
import { SINAV_TABS, filterSinavByTab, sinavTabById, type SinavTabId } from '@/lib/sinav-takvim';
import MonthCalendarGrid, { chipTone } from './MonthCalendarGrid';
import SinavDetailModal from './SinavDetailModal';
import SinavSecimKarti from './SinavSecimKarti';
import './public-home.css';
import './sinav-takvim.css';

type SinavTakvimiSectionProps = {
  sinavlar: SinavTakvim[];
  kurumAdi?: string;
};

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function isInMonth(tarih: string, year: number, month: number) {
  const [y, m] = tarih.split('-').map(Number);
  return y === year && m === month + 1;
}

function clock(value?: string | null) {
  return value ? value.slice(0, 5) : '';
}

function currentMonthYear() {
  const now = new Date();
  return { month: now.getMonth(), year: now.getFullYear() };
}

function icsEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function icsStamp(tarih: string, time?: string | null) {
  const day = tarih.replace(/-/g, '');
  if (!time) return day;
  const [hh, mm] = time.slice(0, 5).split(':');
  return `${day}T${hh || '00'}${mm || '00'}00`;
}

function icsEnd(exam: SinavTakvim) {
  const [y, m, d] = exam.tarih.split('-').map(Number);
  const p = (n: number) => String(n).padStart(2, '0');
  if (!exam.saat) {
    const next = new Date(y, m - 1, d + 1);
    return `${next.getFullYear()}${p(next.getMonth() + 1)}${p(next.getDate())}`;
  }
  if (exam.saat_bitis) return icsStamp(exam.tarih, exam.saat_bitis);
  const [hh, mm] = exam.saat.slice(0, 5).split(':').map(Number);
  const end = new Date(y, m - 1, d, (hh || 0) + 2, mm || 0);
  return `${end.getFullYear()}${p(end.getMonth() + 1)}${p(end.getDate())}T${p(end.getHours())}${p(end.getMinutes())}00`;
}

function downloadIcs(exams: SinavTakvim[], kurumAdi: string) {
  const events = exams.map(exam => {
    const start = icsStamp(exam.tarih, exam.saat);
    const end = icsEnd(exam);
    const timed = Boolean(exam.saat);
    const summary = exam.yayin_adi ? `${exam.yayin_adi} ${exam.baslik}` : exam.baslik;
    return [
      'BEGIN:VEVENT',
      `UID:sinav-${exam.id}@3kkampus`,
      timed ? `DTSTART:${start}` : `DTSTART;VALUE=DATE:${start}`,
      timed ? `DTEND:${end}` : `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsEscape(summary)}`,
      `LOCATION:${icsEscape(kurumAdi)}`,
      exam.aciklama ? `DESCRIPTION:${icsEscape(exam.aciklama)}` : '',
      'END:VEVENT',
    ].filter(Boolean).join('\r\n');
  });
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//3K Kampus//Sinav Takvimi//TR', ...events, 'END:VCALENDAR'].join('\r\n');
  const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sinav-takvimi.ics';
  link.click();
  URL.revokeObjectURL(url);
}

export default function SinavTakvimiSection({ sinavlar, kurumAdi = '3K Kampüs' }: SinavTakvimiSectionProps) {
  const [tab, setTab] = useState<SinavTabId>('yks');
  const [{ month, year }, setCalendar] = useState(currentMonthYear);
  const [turFilter, setTurFilter] = useState<string>('all');
  const [onlyNational, setOnlyNational] = useState(false);
  const [view, setView] = useState<'ay' | 'liste'>('ay');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SinavTakvim | null>(null);

  useEffect(() => {
    setCalendar(currentMonthYear());
    setTurFilter('all');
    setOnlyNational(false);
  }, [tab]);

  const activeTab = sinavTabById(tab);
  const examsInMonth = useMemo(
    () => sinavlar.filter(exam => isInMonth(exam.tarih, year, month)),
    [sinavlar, year, month],
  );
  const tabMonth = useMemo(() => filterSinavByTab(examsInMonth, tab), [examsInMonth, tab]);
  const visible = useMemo(() => tabMonth.filter(exam => {
    if (turFilter !== 'all' && exam.tur !== turFilter) return false;
    if (onlyNational && exam.kapsam !== 'turkiye_geneli') return false;
    return true;
  }).sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.saat || '').localeCompare(b.saat || '')), [tabMonth, turFilter, onlyNational]);

  const counts = useMemo(() => {
    const map: Record<SinavTabId, number> = { yks: 0, sinif11: 0, lgs: 0, sinif7: 0 };
    SINAV_TABS.forEach(item => {
      map[item.id] = filterSinavByTab(examsInMonth, item.id).length;
    });
    return map;
  }, [examsInMonth]);

  useEffect(() => {
    if (visible.some(exam => exam.id === selectedId)) return;
    setSelectedId(visible[0]?.id ?? null);
  }, [visible, selectedId]);

  const selected = visible.find(exam => exam.id === selectedId) || null;
  const isCurrentMonth = month === new Date().getMonth() && year === new Date().getFullYear();

  const chooseExam = (exam: SinavTakvim) => {
    setSelectedId(exam.id);
    if (window.matchMedia('(max-width: 980px)').matches) setDetail(exam);
  };

  const prevMonth = () => {
    setCalendar(current => current.month === 0
      ? { month: 11, year: current.year - 1 }
      : { ...current, month: current.month - 1 });
  };
  const nextMonth = () => {
    setCalendar(current => current.month === 11
      ? { month: 0, year: current.year + 1 }
      : { ...current, month: current.month + 1 });
  };

  const downloadable = useMemo(() => filterSinavByTab(sinavlar, tab).filter(exam => {
    if (turFilter !== 'all' && exam.tur !== turFilter) return false;
    if (onlyNational && exam.kapsam !== 'turkiye_geneli') return false;
    return true;
  }), [sinavlar, tab, turFilter, onlyNational]);

  return (
    <section id="sinav-takvimi" className="stk">
      <div className="stk-wrap">
        <header className="stk-head">
          <div>
            <h2>Sınav Takvimi</h2>
            <p>Denemelerini planla, gelişimini takip et.</p>
          </div>
          <button
            type="button"
            className="stk-download"
            onClick={() => downloadIcs(downloadable, kurumAdi)}
            disabled={downloadable.length === 0}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18M12 14v5M9.5 16.5L12 19l2.5-2.5" />
            </svg>
            Takvimi indir
          </button>
        </header>

        <div className="stk-tabs" role="tablist" aria-label="Sınav türü">
          {SINAV_TABS.map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className="stk-tab"
              data-active={tab === item.id ? 'true' : 'false'}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              <span className="stk-tab-count">{counts[item.id]}</span>
            </button>
          ))}
        </div>

        <div className="stk-layout">
          <div className="stk-main">
            <div className="stk-calhead">
              <div className="stk-caltitle">
                <h3>{MONTHS[month]} {year}</h3>
                <span>{visible.length} sınav</span>
              </div>
              <div className="stk-caltools">
                <div className="stk-navgroup">
                  <button type="button" className="stk-nav" onClick={prevMonth} aria-label="Önceki ay">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                  <button type="button" className="stk-today" onClick={() => setCalendar(currentMonthYear())} disabled={isCurrentMonth}>
                    Bugün
                  </button>
                  <button type="button" className="stk-nav" onClick={nextMonth} aria-label="Sonraki ay">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </div>
                <div className="stk-view" role="group" aria-label="Görünüm">
                  <button type="button" data-active={view === 'ay' ? 'true' : 'false'} onClick={() => setView('ay')}>Ay</button>
                  <button type="button" data-active={view === 'liste' ? 'true' : 'false'} onClick={() => setView('liste')}>Liste</button>
                </div>
              </div>
            </div>

            <div className="stk-filters">
              <button type="button" className="stk-filter" data-active={turFilter === 'all' ? 'true' : 'false'} onClick={() => setTurFilter('all')}>
                Tümü
              </button>
              {activeTab.types.map(type => (
                <button
                  key={type.value}
                  type="button"
                  className="stk-filter"
                  data-active={turFilter === type.value ? 'true' : 'false'}
                  onClick={() => setTurFilter(type.value)}
                >
                  <i style={{ background: chipTone(type.value).fg }} />
                  {type.label}
                </button>
              ))}
              <button
                type="button"
                className="stk-filter stk-filter--flag"
                data-active={onlyNational ? 'true' : 'false'}
                onClick={() => setOnlyNational(value => !value)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <path d="M4 22v-7" />
                </svg>
                Türkiye Geneli
              </button>
            </div>

            {view === 'ay' ? (
              <MonthCalendarGrid
                year={year}
                month={month}
                exams={visible}
                selectedId={selectedId}
                onSelect={chooseExam}
              />
            ) : (
              <div className="stk-list">
                {visible.length === 0 ? (
                  <p className="stk-empty">{MONTHS[month]} {year} ayında {activeTab.emptyMonth}</p>
                ) : visible.map(exam => {
                  const tone = chipTone(exam.tur);
                  const day = Number(exam.tarih.slice(8, 10));
                  return (
                    <button
                      key={exam.id}
                      type="button"
                      className="stk-list-item"
                      data-on={exam.id === selectedId ? 'true' : 'false'}
                      onClick={() => chooseExam(exam)}
                    >
                      <time dateTime={exam.tarih}>
                        <b>{day}</b>
                        {MONTH_SHORT[month]}
                      </time>
                      <span>
                        <strong>{exam.baslik}</strong>
                        <small>
                          <em style={{ color: tone.fg }}>{sinavTurBadge(exam.tur)}</em>
                          {clock(exam.saat) && <span>{clock(exam.saat)}{exam.saat_bitis ? `–${clock(exam.saat_bitis)}` : ''}</span>}
                          {exam.yayin_adi && <span>{exam.yayin_adi}</span>}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {view === 'ay' && (
              <div className="stk-key">
                {activeTab.types.map(type => (
                  <span key={type.value}>
                    <i style={{ background: chipTone(type.value).fg }} />
                    {type.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <aside className="stk-side" aria-label="Seçilen sınav">
            {selected ? (
              <SinavSecimKarti
                sinav={selected}
                kurumAdi={kurumAdi}
                onPosterClick={() => setDetail(selected)}
              />
            ) : (
              <p className="stk-side-empty">Bu görünümde seçilecek sınav yok.</p>
            )}
          </aside>
        </div>
      </div>

      <SinavDetailModal sinav={detail} kurumAdi={kurumAdi} onClose={() => setDetail(null)} />
    </section>
  );
}
