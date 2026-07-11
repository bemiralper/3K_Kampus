'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  cellKey,
  type CalendarGridStructure,
  type SlotAvailabilityStatus,
} from '@/lib/academic-api';
import { STATUS_META, defaultStatus, nextStatus } from './constants';

type Props = {
  calendarId: number;
  structure: CalendarGridStructure | null;
  cells: Record<string, SlotAvailabilityStatus>;
  onChange: (cells: Record<string, SlotAvailabilityStatus>) => void;
  loading?: boolean;
};

function getCellStatus(
  cells: Record<string, SlotAvailabilityStatus>,
  calendarId: number,
  dayOfWeek: number,
  timeslotId: number,
): SlotAvailabilityStatus {
  return cells[cellKey(calendarId, dayOfWeek, timeslotId)] || defaultStatus();
}

export default function SlotAvailabilityGrid({
  calendarId,
  structure,
  cells,
  onChange,
  loading,
}: Props) {
  const [paintStatus, setPaintStatus] = useState<SlotAvailabilityStatus>('AVAILABLE');
  const [isDragging, setIsDragging] = useState(false);
  const dragApplied = useRef(new Set<string>());
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const maxCols = structure?.max_slot_count || 0;

  const slotColumns = useMemo(() => {
    if (!structure) return [];
    const cols: {
      lessonIndex: number;
      label: string;
      subLabel: string;
      tooltip: string;
    }[] = [];
    for (let i = 0; i < maxCols; i += 1) {
      const entries = structure.days
        .filter((d) => d.slots[i])
        .map((d) => ({
          day: d.day_name,
          time: `${d.slots[i].start_time}–${d.slots[i].end_time}`,
          name: d.slots[i].name,
        }));
      const uniqueTimes = [...new Set(entries.map((e) => e.time))];
      const dayLines = entries.map((e) => `${e.day}: ${e.time}${e.name ? ` (${e.name})` : ''}`);
      cols.push({
        lessonIndex: i + 1,
        label: String(i + 1),
        // Başlıkta sadece başlangıç saati; tam aralık tooltip'te
        subLabel: uniqueTimes.length === 1 ? uniqueTimes[0].split('–')[0] : '',
        tooltip: entries.length ? [`Ders ${i + 1}`, ...dayLines].join('\n') : '',
      });
    }
    return cols;
  }, [structure, maxCols]);

  const patchCells = useCallback(
    (updates: Record<string, SlotAvailabilityStatus>) => {
      onChange({ ...cells, ...updates });
    },
    [cells, onChange],
  );

  const applyStatus = useCallback(
    (dayOfWeek: number, timeslotId: number, status: SlotAvailabilityStatus) => {
      const key = cellKey(calendarId, dayOfWeek, timeslotId);
      if (status === 'UNAVAILABLE') {
        const next = { ...cells };
        delete next[key];
        onChange(next);
      } else {
        patchCells({ [key]: status });
      }
    },
    [calendarId, cells, onChange, patchCells],
  );

  const handleCellInteraction = useCallback(
    (
      dayOfWeek: number,
      timeslotId: number,
      opts: { ctrlKey?: boolean; status?: SlotAvailabilityStatus },
    ) => {
      const current = getCellStatus(cells, calendarId, dayOfWeek, timeslotId);
      const next =
        opts.status ??
        (opts.ctrlKey ? paintStatus : nextStatus(current));
      applyStatus(dayOfWeek, timeslotId, next);
    },
    [applyStatus, calendarId, cells, paintStatus],
  );

  const startDrag = useCallback(
    (dayOfWeek: number, timeslotId: number, ctrlKey: boolean) => {
      setIsDragging(true);
      dragApplied.current = new Set();
      const current = getCellStatus(cells, calendarId, dayOfWeek, timeslotId);
      const status = ctrlKey ? paintStatus : nextStatus(current);
      setPaintStatus(status);
      const key = cellKey(calendarId, dayOfWeek, timeslotId);
      dragApplied.current.add(key);
      applyStatus(dayOfWeek, timeslotId, status);
    },
    [applyStatus, calendarId, cells, paintStatus],
  );

  const continueDrag = useCallback(
    (dayOfWeek: number, timeslotId: number) => {
      if (!isDragging) return;
      const key = cellKey(calendarId, dayOfWeek, timeslotId);
      if (dragApplied.current.has(key)) return;
      dragApplied.current.add(key);
      applyStatus(dayOfWeek, timeslotId, paintStatus);
    },
    [applyStatus, calendarId, isDragging, paintStatus],
  );

  useEffect(() => {
    const stop = () => {
      setIsDragging(false);
      dragApplied.current.clear();
    };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  const contextMenuForCell = useCallback(
    (dayOfWeek: number, timeslotId: number): MenuProps['items'] => [
      {
        key: 'avail',
        label: 'Uygun Yap',
        onClick: () => applyStatus(dayOfWeek, timeslotId, 'AVAILABLE'),
      },
      {
        key: 'unavail',
        label: 'Yasakla',
        onClick: () => applyStatus(dayOfWeek, timeslotId, 'UNAVAILABLE'),
      },
      {
        key: 'pref',
        label: 'Tercih Edilir Yap',
        onClick: () => applyStatus(dayOfWeek, timeslotId, 'PREFERRED'),
      },
      { type: 'divider' },
      {
        key: 'row-copy',
        label: 'Satırı Kopyala (bu gün)',
        onClick: () => {
          const day = structure?.days.find((d) => d.day_of_week === dayOfWeek);
          if (!day) return;
          const updates: Record<string, SlotAvailabilityStatus> = {};
          const src = getCellStatus(cells, calendarId, dayOfWeek, timeslotId);
          day.slots.forEach((s) => {
            const k = cellKey(calendarId, dayOfWeek, s.timeslot_id);
            if (src === 'UNAVAILABLE') delete updates[k];
            else updates[k] = src;
          });
          patchCells(updates);
        },
      },
      {
        key: 'week-apply',
        label: 'Pazartesiyi Tüm Haftaya Uygula',
        onClick: () => {
          const monday = structure?.days.find((d) => d.day_of_week === 0);
          if (!monday) return;
          const updates: Record<string, SlotAvailabilityStatus> = {};
          structure?.days.forEach((d) => {
            monday.slots.forEach((ms, idx) => {
              const target = d.slots[idx];
              if (!target) return;
              const src = getCellStatus(cells, calendarId, 0, ms.timeslot_id);
              const k = cellKey(calendarId, d.day_of_week, target.timeslot_id);
              if (src === 'UNAVAILABLE') {
                const next = { ...cells, ...updates };
                delete next[k];
                Object.assign(updates, next);
                delete updates[k];
              } else {
                updates[k] = src;
              }
            });
          });
          onChange({ ...cells, ...updates });
        },
      },
    ],
    [applyStatus, calendarId, cells, onChange, patchCells, structure],
  );

  if (loading || !structure) {
    return (
      <div className="ou-empty-state">
        {loading ? 'Slot grid yükleniyor…' : 'Çalışma takvimi seçin veya grid verisi yok.'}
      </div>
    );
  }

  if (!structure.days.length) {
    return (
      <div className="ou-empty-state">
        Bu çalışma takviminde aktif gün / ders saati şablonu tanımlı değil.
      </div>
    );
  }

  if (isMobile) {
    return (
      <div>
        {structure.days.map((day) => (
          <div key={day.day_of_week} className="ou-mobile-day-card">
            <div className="ou-mobile-day-head">
              {day.day_name}
              <span style={{ fontWeight: 400, fontSize: 12, color: '#64748b', marginLeft: 8 }}>
                {day.schedule_template_name}
              </span>
            </div>
            <div className="ou-mobile-slots">
              {day.slots.map((slot) => {
                const status = getCellStatus(cells, calendarId, day.day_of_week, slot.timeslot_id);
                const meta = STATUS_META[status];
                const lessonNo = slot.lesson_index ?? slot.label;
                return (
                  <button
                    key={slot.timeslot_id}
                    type="button"
                    className="ou-mobile-slot"
                    style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
                    onClick={() => handleCellInteraction(day.day_of_week, slot.timeslot_id, {})}
                  >
                    {meta.short} Ders {lessonNo}
                    <small>
                      {slot.start_time}–{slot.end_time}
                      {slot.name ? ` · ${slot.name}` : ''}
                    </small>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {maxCols > 8 ? (
        <div className="ou-grid-scroll-hint">
          {structure.days.length} gün · {maxCols} ders — sağa kaydırarak tüm slotları görün
        </div>
      ) : null}
      <div className="ou-grid-wrap">
      <table className="ou-grid-table">
        <thead>
          <tr>
            <th className="ou-grid-corner ou-grid-day-head">Gün</th>
            {slotColumns.map((col) => (
              <th key={col.lessonIndex} className="ou-grid-slot-head">
                <Tooltip title={col.tooltip || undefined}>
                  <div className="ou-grid-slot-head-inner">
                    <span className="ou-grid-slot-index">{col.label}</span>
                    {col.subLabel ? (
                      <span className="ou-grid-slot-time">{col.subLabel}</span>
                    ) : null}
                  </div>
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {structure.days.map((day) => (
            <tr key={day.day_of_week}>
              <td className="ou-grid-day-head">
                <div>{day.day_name}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>
                  {day.schedule_template_name}
                </div>
              </td>
              {slotColumns.map((col, colIdx) => {
                const slot = day.slots[colIdx];
                if (!slot) {
                  return (
                    <td
                      key={`${day.day_of_week}-${col.lessonIndex}`}
                      style={{ background: '#fafafa' }}
                    />
                  );
                }
                const status = getCellStatus(
                  cells,
                  calendarId,
                  day.day_of_week,
                  slot.timeslot_id,
                );
                const meta = STATUS_META[status];
                const lessonNo = slot.lesson_index ?? colIdx + 1;
                const tip = `${day.day_name} · Ders ${lessonNo} · ${slot.name} (${slot.start_time}–${slot.end_time}) — ${meta.label}`;

                return (
                  <td key={slot.timeslot_id} className="ou-grid-cell">
                    <Dropdown menu={{ items: contextMenuForCell(day.day_of_week, slot.timeslot_id) }} trigger={['contextMenu']}>
                      <div
                        className={`ou-grid-cell-inner${isDragging ? ' dragging' : ''}`}
                        style={{
                          background: meta.bg,
                          color: meta.color,
                          borderTop: `2px solid ${meta.border}`,
                        }}
                        title={tip}
                        role="button"
                        tabIndex={0}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          startDrag(day.day_of_week, slot.timeslot_id, e.ctrlKey || e.metaKey);
                        }}
                        onMouseEnter={() => continueDrag(day.day_of_week, slot.timeslot_id)}
                        onClick={(e) => {
                          if (isDragging) return;
                          handleCellInteraction(day.day_of_week, slot.timeslot_id, {
                            ctrlKey: e.ctrlKey || e.metaKey,
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleCellInteraction(day.day_of_week, slot.timeslot_id, {});
                          }
                        }}
                      >
                        {meta.short}
                      </div>
                    </Dropdown>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
