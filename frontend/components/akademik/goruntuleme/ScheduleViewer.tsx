'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { colorForKey } from '@/lib/schedule-color';
import type { ClassScheduleGrid, ScheduleGridCell, ScheduleGridDay } from '@/lib/academic-api';
import {
  Badge,
  EmptyState,
  ErrorState,
  Hint,
  LoadingState,
  PageShell,
  Panel,
  Segmented,
  StatCard,
  StatGrid,
  Toolbar,
  ToolbarActions,
} from '../ui';
import {
  IconBookOpen,
  IconCalendar,
  IconGrid,
  IconList,
  IconUser,
  IconUsers,
} from '../ui/icons';
import './goruntuleme.css';

export type ScheduleViewMode = 'week' | 'day';

type Props = {
  description?: string;
  filters?: ReactNode;
  picker?: ReactNode;
  grid: ClassScheduleGrid | null;
  loading?: boolean;
  error?: string | null;
  info?: string | null;
  onRetry?: () => void;
  showClassroom?: boolean;
  showTeacher?: boolean;
  showRoom?: boolean;
  emptyHint?: string;
  requireSelection?: boolean;
  selectionMissingHint?: string;
};

function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return compact;
}

function statusLabel(cell: ScheduleGridCell) {
  if (cell.status === 'EXAM') return 'Sınav';
  if (cell.status === 'HOLIDAY') return 'Tatil';
  return cell.status_display;
}

function cellColor(cell: ScheduleGridCell) {
  if (!cell.lesson) return null;
  return colorForKey(cell.lesson.id) ?? colorForKey(cell.classroom?.id);
}

function parseHm(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function sortSlots<T extends { start?: string | null; end?: string | null; order: number; id: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const as = parseHm(a.start) ?? 99 * 60;
    const bs = parseHm(b.start) ?? 99 * 60;
    if (as !== bs) return as - bs;
    const ae = parseHm(a.end) ?? as;
    const be = parseHm(b.end) ?? bs;
    if (ae !== be) return ae - be;
    if (a.order !== b.order) return a.order - b.order;
    return a.id - b.id;
  });
}

function genericSlotName(name?: string | null) {
  return Boolean(name && /^\d+\.\s*Ders$/i.test(name.trim()));
}

function gapLabel(prevEnd: string | null | undefined, nextStart: string | null | undefined) {
  const end = parseHm(prevEnd);
  const start = parseHm(nextStart);
  if (end == null || start == null || start - end < 40) return null;
  if (end <= 13 * 60 && start >= 13 * 60) return 'Öğle arası';
  return 'Ara';
}

export default function ScheduleViewer({
  description,
  filters,
  picker,
  grid,
  loading,
  error,
  info,
  onRetry,
  showClassroom,
  showTeacher = true,
  showRoom,
  emptyHint,
  requireSelection,
  selectionMissingHint,
}: Props) {
  const compact = useCompact();
  const [mode, setMode] = useState<ScheduleViewMode>('week');
  const [dayId, setDayId] = useState<number | null>(null);

  useEffect(() => {
    setMode(compact ? 'day' : 'week');
  }, [compact]);

  const days = useMemo(
    () => [...(grid?.days || [])].sort((a, b) => a.order - b.order),
    [grid],
  );
  const slots = useMemo(() => sortSlots(grid?.slots || []), [grid]);
  const cells = useMemo(() => grid?.cells || [], [grid]);

  useEffect(() => {
    if (!days.length) {
      setDayId(null);
      return;
    }
    setDayId((prev) => (prev && days.some((d) => d.id === prev) ? prev : days[0].id));
  }, [days]);

  const cellsFor = (day: number, slot: number) =>
    cells.filter((c) => c.day_id === day && c.timeslot_id === slot);

  const filled = cells.filter((c) => Boolean(c.lesson) || c.status === 'FILLED');
  const privateCount = cells.filter((c) => c.kind === 'private').length;
  const examOrHoliday = cells.filter((c) => c.status === 'EXAM' || c.status === 'HOLIDAY');
  const uniqueClasses = new Set(
    filled.filter((c) => c.kind !== 'private').map((c) => c.classroom?.id).filter(Boolean),
  ).size;
  const uniqueTeachers = new Set(filled.map((c) => c.teacher?.id).filter(Boolean)).size;
  const uniqueCalendars = new Set(
    filled.map((c) => c.calendar_name).filter((name): name is string => Boolean(name)),
  ).size;

  const selectedDay = days.find((d) => d.id === dayId) ?? days[0] ?? null;
  const dayLessons = useMemo(() => {
    if (!selectedDay) return [];
    return slots.flatMap((slot) =>
      cells
        .filter((c) => c.day_id === selectedDay.id && c.timeslot_id === slot.id)
        .filter((cell) => cell.lesson || cell.status === 'EXAM' || cell.status === 'HOLIDAY')
        .map((cell) => ({ slot, cell })),
    );
  }, [selectedDay, slots, cells]);

  const hasFrame = Boolean(days.length && slots.length);
  const fatalError = Boolean(error && !hasFrame);
  const showEmpty =
    !loading &&
    !error &&
    (!hasFrame || (filled.length === 0 && examOrHoliday.length === 0));
  const emptySlots = Math.max(
    0,
    days.length * slots.length - filled.length - examOrHoliday.length,
  );

  const modeSwitch = hasFrame && !requireSelection && (
    <Segmented
      ariaLabel="Görünüm"
      value={mode}
      onChange={setMode}
      options={[
        { value: 'week', label: 'Haftalık', icon: <IconGrid size={14} /> },
        { value: 'day', label: 'Günlük', icon: <IconList size={14} /> },
      ]}
    />
  );

  return (
    <PageShell>
      {description && <Hint>{description}</Hint>}

      {(filters || modeSwitch) && (
        <Toolbar>
          {filters}
          {modeSwitch && <ToolbarActions>{modeSwitch}</ToolbarActions>}
        </Toolbar>
      )}

      {picker}

      {error && hasFrame && <div className="gv-banner gv-banner--warn">{error}</div>}
      {info && !error && <div className="gv-banner">{info}</div>}

      {!requireSelection && hasFrame && (
        <StatGrid>
          <StatCard
            icon={<IconBookOpen size={18} />}
            tone="blue"
            value={filled.length}
            label="Dolu saat"
          />
          <StatCard
            icon={<IconCalendar size={18} />}
            tone="slate"
            value={emptySlots}
            label="Boş slot"
          />
          {showClassroom && (
            <StatCard
              icon={<IconUsers size={18} />}
              tone="green"
              value={uniqueClasses}
              label="Sınıf"
            />
          )}
          {showTeacher && (
            <StatCard
              icon={<IconUser size={18} />}
              tone="purple"
              value={uniqueTeachers}
              label="Öğretmen"
            />
          )}
          {privateCount > 0 && (
            <StatCard
              icon={<IconUser size={18} />}
              tone="orange"
              value={privateCount}
              label="Özel ders"
            />
          )}
          {uniqueCalendars > 1 && (
            <StatCard
              icon={<IconCalendar size={18} />}
              tone="blue"
              value={uniqueCalendars}
              label="Çalışma takvimi"
            />
          )}
        </StatGrid>
      )}

      {!(requireSelection && picker) && (
        <Panel flush>
          <div className={`gv-body${loading ? ' is-loading' : ''}`}>
            {requireSelection ? (
              <EmptyState
                title="Seçim bekleniyor"
                description={selectionMissingHint || 'Görüntülemek için bir seçim yapın.'}
              />
            ) : fatalError ? (
              <ErrorState description={error ?? undefined} onRetry={onRetry} />
            ) : loading && !grid ? (
              <LoadingState label="Program yükleniyor…" />
            ) : showEmpty ? (
              <EmptyState
                title="Program boş"
                description={
                  grid?.empty_message || emptyHint || 'Görüntülenecek program bulunamadı.'
                }
              />
            ) : mode === 'day' ? (
              <DayAgenda
                days={days}
                selected={selectedDay}
                onSelect={setDayId}
                rows={dayLessons}
                showClassroom={showClassroom}
                showTeacher={showTeacher}
                showRoom={showRoom}
              />
            ) : (
              <div className="gv-grid-wrap">
                <table className="gv-grid">
                  <thead>
                    <tr>
                      <th className="gv-corner">Saat</th>
                      {days.map((d) => (
                        <th key={d.id}>{d.short_name || d.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slots.flatMap((slot, index) => {
                      const gap = index > 0 ? gapLabel(slots[index - 1].end, slot.start) : null;
                      const rows = [];
                      if (gap) {
                        rows.push(
                          <tr key={`gap-${slot.id}`} className="gv-gap">
                            <td colSpan={days.length + 1}>{gap}</td>
                          </tr>,
                        );
                      }
                      rows.push(
                        <tr key={slot.id}>
                          <td className="gv-time">
                            <span>
                              {slot.start}–{slot.end}
                            </span>
                            {slot.name && !genericSlotName(slot.name) && <small>{slot.name}</small>}
                          </td>
                          {days.map((d) => {
                            const slotCells = cellsFor(d.id, slot.id);
                            return (
                              <td key={d.id}>
                                {slotCells.length ? (
                                  <div className="gv-cell-stack">
                                    {slotCells.map((cell) => (
                                      <GridCell
                                        key={cell.id}
                                        cell={cell}
                                        showClassroom={showClassroom}
                                        showTeacher={showTeacher}
                                        showRoom={showRoom}
                                      />
                                    ))}
                                  </div>
                                ) : (
                                  <GridCell
                                    showClassroom={showClassroom}
                                    showTeacher={showTeacher}
                                    showRoom={showRoom}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>,
                      );
                      return rows;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Panel>
      )}
    </PageShell>
  );
}

function GridCell({
  cell,
  showClassroom,
  showTeacher,
  showRoom,
}: {
  cell?: ScheduleGridCell;
  showClassroom?: boolean;
  showTeacher?: boolean;
  showRoom?: boolean;
}) {
  if (!cell || (!cell.lesson && cell.status !== 'EXAM' && cell.status !== 'HOLIDAY')) {
    return <span className="gv-cell-empty">—</span>;
  }
  if (!cell.lesson) {
    return <span className={`gv-chip gv-chip--${cell.status.toLowerCase()}`}>{statusLabel(cell)}</span>;
  }
  const color = cellColor(cell);
  const isPrivate = cell.kind === 'private';
  const who = cell.student?.name || (showClassroom ? cell.classroom?.name : undefined);
  return (
    <div
      className={`gv-cell${isPrivate ? ' is-private' : ''}`}
      style={color ? { background: color.bg, borderColor: color.border, color: color.text } : undefined}
    >
      {isPrivate && <em className="gv-cell-badge">Özel</em>}
      <strong>{cell.lesson.name}</strong>
      {showTeacher && cell.teacher && <span>{cell.teacher.short_name || cell.teacher.name}</span>}
      {who && <span>{who}</span>}
      {showRoom && cell.room && <span>{cell.room.name}</span>}
      {cell.calendar_name && <span className="gv-cell-cal">{cell.calendar_name}</span>}
    </div>
  );
}

function DayAgenda({
  days,
  selected,
  onSelect,
  rows,
  showClassroom,
  showTeacher,
  showRoom,
}: {
  days: ScheduleGridDay[];
  selected: ScheduleGridDay | null;
  onSelect: (id: number) => void;
  rows: { slot: { id: number; start: string | null; end: string | null; name: string }; cell?: ScheduleGridCell }[];
  showClassroom?: boolean;
  showTeacher?: boolean;
  showRoom?: boolean;
}) {
  return (
    <div className="gv-agenda">
      <div className="gv-day-chips" role="tablist" aria-label="Günler">
        {days.map((d) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={selected?.id === d.id}
            className={`gv-day-chip${selected?.id === d.id ? ' is-active' : ''}`}
            onClick={() => onSelect(d.id)}
          >
            {d.short_name || d.name}
          </button>
        ))}
      </div>
      {!rows.length ? (
        <EmptyState
          title={`${selected?.name || 'Bu gün'} için ders yok`}
          description="Başka bir gün seçebilir veya haftalık görünüme geçebilirsiniz."
        />
      ) : (
        <ul className="gv-agenda-list">
          {rows.map(({ slot, cell }) => {
            if (!cell) return null;
            const color = cell.lesson ? cellColor(cell) : null;
            return (
              <li key={`${slot.id}-${cell.id}`} className="gv-agenda-item">
                <div className="gv-agenda-time">
                  <strong>{slot.start}</strong>
                  <span>{slot.end}</span>
                </div>
                <div
                  className="gv-agenda-card"
                  style={color ? { borderLeftColor: color.border, background: color.bg } : undefined}
                >
                  {cell.lesson ? (
                    <>
                      {cell.kind === 'private' && <Badge tone="purple">Özel</Badge>}
                      <strong>{cell.lesson.name}</strong>
                      <div className="gv-agenda-meta">
                        {[
                          showTeacher ? cell.teacher?.name : null,
                          cell.student?.name || (showClassroom ? cell.classroom?.name : null),
                          showRoom ? cell.room?.name : null,
                          cell.calendar_name,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </>
                  ) : (
                    <span className={`gv-chip gv-chip--${cell.status.toLowerCase()}`}>{statusLabel(cell)}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
