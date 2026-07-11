import type {
  AvailabilitySummary,
  ProgramTipi,
  SlotAvailabilityStatus,
  WorkCalendarOption,
} from '@/lib/academic-api';
import { PROGRAM_TIPI_META } from '@/components/akademik/program-tipi';

function countForCalendar(
  cells: Record<string, SlotAvailabilityStatus>,
  calendarId: number,
) {
  let available = 0;
  let preferred = 0;
  const activeDays = new Set<number>();
  Object.entries(cells).forEach(([key, status]) => {
    if (status === 'UNAVAILABLE') return;
    const parts = key.split(':');
    if (parts.length !== 3 || Number(parts[0]) !== calendarId) return;
    activeDays.add(Number(parts[1]));
    if (status === 'PREFERRED') preferred += 1;
    else if (status === 'AVAILABLE') available += 1;
  });
  return {
    total_available_slots: available,
    total_preferred_slots: preferred,
    weekly_available_days: activeDays.size,
    estimated_max_weekly_lesson_slots: available + preferred,
  };
}

export function computeDetailedLocalSummary(
  cells: Record<string, SlotAvailabilityStatus>,
  calendarIds: number[],
  calendars: WorkCalendarOption[],
): AvailabilitySummary {
  const calMap = new Map(calendars.map((c) => [c.id, c]));
  const byCalendar = calendarIds.map((cid) => {
    const cal = calMap.get(cid);
    const counts = countForCalendar(cells, cid);
    return {
      calendar_id: cid,
      name: cal?.name ?? `Takvim #${cid}`,
      program_tipi: (cal?.program_tipi ?? 'GENEL') as ProgramTipi,
      program_tipi_display: cal?.program_tipi_display ?? PROGRAM_TIPI_META.GENEL.label,
      color: cal?.color ?? '#64748b',
      ...counts,
    };
  });

  const byProgramTipiMap = new Map<
    ProgramTipi,
    { total_available_slots: number; total_preferred_slots: number; calendar_count: number }
  >();
  byCalendar.forEach((row) => {
    const prev = byProgramTipiMap.get(row.program_tipi) ?? {
      total_available_slots: 0,
      total_preferred_slots: 0,
      calendar_count: 0,
    };
    byProgramTipiMap.set(row.program_tipi, {
      total_available_slots: prev.total_available_slots + row.total_available_slots,
      total_preferred_slots: prev.total_preferred_slots + row.total_preferred_slots,
      calendar_count: prev.calendar_count + 1,
    });
  });

  const byProgramTipi = Array.from(byProgramTipiMap.entries()).map(([tip, stats]) => ({
    program_tipi: tip,
    program_tipi_display: PROGRAM_TIPI_META[tip]?.label ?? tip,
    ...stats,
    estimated_max_weekly_lesson_slots:
      stats.total_available_slots + stats.total_preferred_slots,
  }));

  let totalAvailable = 0;
  let totalPreferred = 0;
  const allDays = new Set<number>();
  byCalendar.forEach((row) => {
    totalAvailable += row.total_available_slots;
    totalPreferred += row.total_preferred_slots;
  });
  Object.entries(cells).forEach(([key, status]) => {
    if (status === 'UNAVAILABLE') return;
    const parts = key.split(':');
    if (parts.length !== 3 || !calendarIds.includes(Number(parts[0]))) return;
    allDays.add(Number(parts[1]));
  });

  return {
    total_available_slots: totalAvailable,
    total_preferred_slots: totalPreferred,
    weekly_available_days: allDays.size,
    assigned_calendar_count: calendarIds.length,
    estimated_max_weekly_lesson_slots: totalAvailable + totalPreferred,
    by_calendar: byCalendar,
    by_program_tipi: byProgramTipi,
  };
}

export function summaryForCalendar(
  cells: Record<string, SlotAvailabilityStatus>,
  calendarId: number,
) {
  return countForCalendar(cells, calendarId);
}
