'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GUN_LABELS,
  resolveDersLabel,
  type BirebirOturum,
  type DonemTatilGun,
} from '@/lib/ozel-ders-api';
import { IconChevronLeft, IconChevronRight, IconFileText } from './icons';
import {
  addDaysIso,
  formatWeekRangeTr,
  matchLessonToPeriod,
  startOfIsoWeek,
  todayIso,
  type PeriodRow,
} from './haftalikGridUtils';

type Props = {
  weekStart: string;
  periods: PeriodRow[];
  oturumlar: BirebirOturum[];
  holidays?: DonemTatilGun[];
  useKisaAd: boolean;
  loading?: boolean;
  moving?: boolean;
  pdfBusy?: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onAddAt: (date: string, period: PeriodRow) => void;
  onOpenOturum: (oturum: BirebirOturum) => void;
  onMove: (oturum: BirebirOturum, date: string, period: PeriodRow) => void;
  onSwap: (a: BirebirOturum, b: BirebirOturum) => void;
  onDownloadPdf: () => void;
};

const LEGEND = [
  { key: 'plan', label: 'Planlandı' },
  { key: 'done', label: 'İşlendi' },
  { key: 'miss', label: 'Gelmedi' },
  { key: 'cancel', label: 'İptal' },
  { key: 'telafi', label: 'Telafi' },
] as const;

function durumKey(o: BirebirOturum): string {
  if (o.oturum_turu === 'TELAFI') return 'telafi';
  if (o.durum === 'ISLENDI' || o.durum === 'ONLINE') return 'done';
  if (o.durum === 'IPTAL') return 'cancel';
  if (o.durum === 'OGRENCI_GELMEDI' || o.durum === 'OGRETMEN_GELMEDI') return 'miss';
  return 'plan';
}

function durumLine(o: BirebirOturum): string {
  if (o.oturum_turu === 'TELAFI') return 'Telafi';
  if (o.oturum_turu === 'EK') return 'Ek ders';
  if (o.durum === 'ISLENDI' || o.durum === 'ONLINE') return o.durum_display || 'İşlendi';
  if (o.durum === 'IPTAL') return 'İptal';
  if (o.durum === 'OGRENCI_GELMEDI' || o.durum === 'OGRETMEN_GELMEDI') {
    return o.durum_display || 'Gelmedi';
  }
  return o.durum_display || 'Planlandı';
}

export default function OgrenciHaftalikTakvim({
  weekStart,
  periods,
  oturumlar,
  holidays = [],
  useKisaAd,
  loading,
  moving,
  pdfBusy,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  onAddAt,
  onOpenOturum,
  onMove,
  onSwap,
  onDownloadPdf,
}: Props) {
  const dragIdRef = useRef<number | null>(null);
  const dropKeyRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const today = todayIso();
  const thisWeek = weekStart === startOfIsoWeek();
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart],
  );
  const lessonPeriods = useMemo(() => periods.filter((p) => !p.isBreak), [periods]);

  const holidayByDate = useMemo(() => {
    const map = new Map<string, DonemTatilGun>();
    for (const h of holidays) {
      if (h.date >= weekStart && h.date <= addDaysIso(weekStart, 6)) {
        map.set(h.date, h);
      }
    }
    return map;
  }, [holidays, weekStart]);

  const cellMap = useMemo(() => {
    const map = new Map<string, BirebirOturum[]>();
    const extra: BirebirOturum[] = [];
    for (const o of oturumlar) {
      const period = matchLessonToPeriod({ baslangic: o.start_time }, periods);
      if (!period) {
        extra.push(o);
        continue;
      }
      const key = `${o.session_date}:${period.key}`;
      const list = map.get(key) || [];
      list.push(o);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    extra.sort((a, b) =>
      `${a.session_date}${a.start_time}`.localeCompare(`${b.session_date}${b.start_time}`),
    );
    return { map, extra };
  }, [oturumlar, periods]);

  const stats = useMemo(() => {
    let done = 0;
    let wait = 0;
    let miss = 0;
    let cancel = 0;
    for (const o of oturumlar) {
      const k = durumKey(o);
      if (k === 'done') done += 1;
      else if (k === 'miss') miss += 1;
      else if (k === 'cancel') cancel += 1;
      else wait += 1;
    }
    return { total: oturumlar.length, done, wait, miss, cancel };
  }, [oturumlar]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') onPrevWeek();
      if (e.key === 'ArrowRight') onNextWeek();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrevWeek, onNextWeek]);

  function endDrag() {
    dragIdRef.current = null;
    dropKeyRef.current = null;
    setDraggingId(null);
    setDropKey(null);
  }

  function startDrag(e: React.DragEvent, oturum: BirebirOturum) {
    if (!oturum.source_slot) return;
    dragIdRef.current = oturum.id;
    setDraggingId(oturum.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(oturum.id));
    const el = e.currentTarget as HTMLElement;
    try {
      e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
    } catch {
      /* ignore */
    }
  }

  function onCellDragOver(e: React.DragEvent, key: string) {
    if (dragIdRef.current == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropKeyRef.current !== key) {
      dropKeyRef.current = key;
      setDropKey(key);
    }
  }

  function onCellDrop(e: React.DragEvent, date: string, period: PeriodRow) {
    e.preventDefault();
    const id = dragIdRef.current;
    endDrag();
    if (!id) return;
    const dragged = oturumlar.find((o) => o.id === id);
    if (!dragged) return;
    suppressClickRef.current = true;
    const target = (cellMap.map.get(`${date}:${period.key}`) || [])[0];
    if (target && target.id !== dragged.id) {
      onSwap(dragged, target);
      return;
    }
    if (dragged.session_date !== date || dragged.start_time.slice(0, 5) !== period.baslangic) {
      onMove(dragged, date, period);
    }
  }

  function openChip(o: BirebirOturum) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpenOturum(o);
  }

  return (
    <div className={`od-week-cal${loading ? ' is-loading' : ''}`}>
      <div className="od-week-cal-bar">
        <div className="od-week-cal-nav">
          <button type="button" className="od-week-cal-arrow" onClick={onPrevWeek} aria-label="Önceki hafta">
            <IconChevronLeft size={16} />
          </button>
          <div className="od-week-cal-title">
            <strong>{formatWeekRangeTr(weekStart)}</strong>
            {thisWeek ? (
              <span className="od-week-cal-now">Bu hafta</span>
            ) : (
              <button type="button" className="od-week-cal-now is-btn" onClick={onThisWeek}>
                Bugüne dön
              </button>
            )}
          </div>
          <button type="button" className="od-week-cal-arrow" onClick={onNextWeek} aria-label="Sonraki hafta">
            <IconChevronRight size={16} />
          </button>
        </div>

        <div className="od-week-cal-stats" aria-label="Haftalık özet">
          <span><strong>{stats.total}</strong> ders</span>
          <span className="is-done"><strong>{stats.done}</strong> işlendi</span>
          <span className="is-wait"><strong>{stats.wait}</strong> bekliyor</span>
          {stats.miss > 0 && <span className="is-miss"><strong>{stats.miss}</strong> gelmedi</span>}
          {stats.cancel > 0 && <span className="is-cancel"><strong>{stats.cancel}</strong> iptal</span>}
          <button
            type="button"
            className="od-btn od-btn-secondary od-btn-sm"
            disabled={pdfBusy}
            onClick={onDownloadPdf}
          >
            <IconFileText size={14} /> {pdfBusy ? 'İndiriliyor…' : 'Haftalık PDF'}
          </button>
        </div>
      </div>

      <div className={`od-week-cal-shell${moving ? ' is-moving' : ''}`}>
        <div className="od-table-scroll">
          <table className="od-grid-table od-week-cal-table">
            <thead>
              <tr>
                <th className="od-grid-time-col">Saat</th>
                {days.map((date, i) => {
                  const holiday = holidayByDate.get(date);
                  const count = oturumlar.filter((o) => o.session_date === date).length;
                  const weekend = i >= 5;
                  return (
                    <th
                      key={date}
                      className={[
                        date === today ? 'is-today' : '',
                        holiday ? 'is-holiday' : '',
                        weekend ? 'is-weekend' : '',
                      ].filter(Boolean).join(' ') || undefined}
                    >
                      <span className="od-week-head-day">{GUN_LABELS[i + 1]}</span>
                      <span className="od-week-head-date">{date.slice(8)}</span>
                      <span className="od-week-head-count">
                        {holiday ? holiday.title : count ? `${count} ders` : '—'}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {lessonPeriods.map((period) => (
                <tr key={period.key}>
                  <td className="od-grid-time-col">
                    <strong>{period.baslangic}</strong>
                    <span>{period.bitis}</span>
                  </td>
                  {days.map((date, i) => {
                    const items = cellMap.map.get(`${date}:${period.key}`) || [];
                    const holiday = holidayByDate.get(date);
                    const past = date < today;
                    const key = `${date}:${period.key}`;
                    return (
                      <td
                        key={date}
                        className={[
                          'od-grid-cell',
                          items.length ? 'is-filled' : '',
                          date === today ? 'is-today' : '',
                          holiday ? 'is-holiday' : '',
                          past ? 'is-past' : '',
                          i >= 5 ? 'is-weekend' : '',
                          dropKey === key ? 'is-drop' : '',
                        ].filter(Boolean).join(' ')}
                        onDragOver={(e) => onCellDragOver(e, key)}
                        onDragLeave={() => {
                          if (dropKeyRef.current === key) {
                            dropKeyRef.current = null;
                            setDropKey(null);
                          }
                        }}
                        onDrop={(e) => onCellDrop(e, date, period)}
                        onClick={() => {
                          if (suppressClickRef.current) {
                            suppressClickRef.current = false;
                            return;
                          }
                          if (items.length === 1) openChip(items[0]);
                          else if (items.length === 0) onAddAt(date, period);
                        }}
                      >
                        {items.length ? (
                          items.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              draggable={Boolean(o.source_slot) && !moving}
                              className={`od-week-chip is-${durumKey(o)}${draggingId === o.id ? ' is-dragging' : ''}`}
                              onDragStart={(e) => {
                                e.stopPropagation();
                                startDrag(e, o);
                              }}
                              onDragEnd={endDrag}
                              onClick={(e) => {
                                e.stopPropagation();
                                openChip(o);
                              }}
                            >
                              <span className="od-week-chip-title">{resolveDersLabel(o, useKisaAd)}</span>
                              <span className="od-week-chip-sub">{o.ogretmen_ad}</span>
                              <span className="od-week-chip-status">{durumLine(o)}</span>
                            </button>
                          ))
                        ) : (
                          <span className="od-grid-empty">{holiday ? 'Tatil' : '+'}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {cellMap.extra.length > 0 && (
                <tr>
                  <td className="od-grid-time-col">
                    <strong>Diğer</strong>
                    <span>Saat dışı</span>
                  </td>
                  {days.map((date) => {
                    const items = cellMap.extra.filter((o) => o.session_date === date);
                    return (
                      <td key={date} className={`od-grid-cell${items.length ? ' is-filled' : ''}`}>
                        {items.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            className={`od-week-chip is-${durumKey(o)}`}
                            onClick={() => onOpenOturum(o)}
                          >
                            <span className="od-week-chip-title">{resolveDersLabel(o, useKisaAd)}</span>
                            <span className="od-week-chip-sub">
                              {o.start_time.slice(0, 5)} · {o.ogretmen_ad}
                            </span>
                            <span className="od-week-chip-status">{durumLine(o)}</span>
                          </button>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="od-week-cal-legend">
        {LEGEND.map((item) => (
          <span key={item.key} className="od-week-cal-legend-item">
            <i className={`od-week-dot is-${item.key}`} />
            {item.label}
          </span>
        ))}
        <span className="od-week-cal-hint">Sürükleyerek taşı · ← → hafta · boş hücreye tıklayınca ekle</span>
      </div>
    </div>
  );
}
