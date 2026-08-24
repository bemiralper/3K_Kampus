'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  fetchAcademicScheduleVersions,
  fetchClassLessonPlanContext,
  type ClassLessonPlanContext,
} from '@/lib/academic-api';

export type GoruntulemeCalendar = {
  id: number;
  name: string;
  filledCells: number;
};

/**
 * Görüntüleme sekmelerinin ortak bağlamı: dönem + çalışma takvimi.
 *
 * Kullanıcı program "versiyonu" seçmez. Her dönem-çalışma takvimi çiftinin tek
 * programı vardır, o yüzden takvim listesi programlardan türetilir ve istekler
 * `weekly_cycle_id` ile atılır.
 */
export function useGoruntulemeContext() {
  const { activeKurum, activeSube, initialized } = useKurum();
  const [context, setContext] = useState<ClassLessonPlanContext | null>(null);
  const [calendars, setCalendars] = useState<GoruntulemeCalendar[]>([]);
  const [termId, setTermId] = useState<number | null>(null);
  const [calendarId, setCalendarId] = useState<number | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(initialized && activeKurum && activeSube);

  const boot = useCallback(async () => {
    if (!ready) {
      setBooting(false);
      return;
    }
    setBooting(true);
    setError(null);
    try {
      const ctx = await fetchClassLessonPlanContext();
      setContext(ctx);
      setTermId((prev) => prev ?? ctx.active_term_id ?? ctx.terms[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bağlam yüklenemedi');
      setContext(null);
    } finally {
      setBooting(false);
    }
  }, [ready]);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    if (!termId) {
      setCalendars([]);
      setCalendarId(null);
      return;
    }
    let cancelled = false;
    fetchAcademicScheduleVersions({ term_id: termId })
      .then((rows) => {
        if (cancelled) return;
        const seen = new Map<number, GoruntulemeCalendar>();
        for (const row of rows) {
          const cycle = row.weekly_cycle;
          if (!cycle) continue;
          const prev = seen.get(cycle.id);
          seen.set(cycle.id, {
            id: cycle.id,
            name: cycle.name,
            filledCells: (prev?.filledCells ?? 0) + (row.filled_cell_count || 0),
          });
        }
        // Dolu programı olan takvim önce gelsin — kullanıcı boş ekranla karşılaşmasın
        const list = [...seen.values()].sort(
          (a, b) => b.filledCells - a.filledCells || a.name.localeCompare(b.name, 'tr'),
        );
        setCalendars(list);
        setCalendarId((prev) =>
          prev && list.some((c) => c.id === prev) ? prev : list[0]?.id ?? null,
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setCalendars([]);
        setCalendarId(null);
        setError(e instanceof Error ? e.message : 'Çalışma takvimleri yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [termId]);

  const termOptions = useMemo(
    () => (context?.terms || []).map((t) => ({ value: t.id, label: t.name })),
    [context],
  );

  const calendarOptions = useMemo(
    () => calendars.map((c) => ({ value: c.id, label: c.name })),
    [calendars],
  );

  return {
    context,
    calendars,
    calendarOptions,
    calendarId,
    setCalendarId,
    termId,
    setTermId,
    termOptions,
    booting,
    error,
    initialized,
    ready,
  };
}
