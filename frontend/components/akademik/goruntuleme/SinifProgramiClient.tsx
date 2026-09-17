'use client';

import { useEffect, useMemo, useState } from 'react';
import { Select } from 'antd';
import { fetchClassScheduleGrid, type ClassScheduleGrid } from '@/lib/academic-api';
import ScheduleViewer from './ScheduleViewer';
import { useGoruntulemeContext } from './useGoruntulemeContext';
import { ContextRequired, Field } from '../ui';

export default function SinifProgramiClient() {
  const {
    context,
    calendarOptions,
    calendarId,
    setCalendarId,
    termId,
    setTermId,
    termOptions,
    ready,
    error: contextError,
  } = useGoruntulemeContext();
  const [classroomId, setClassroomId] = useState<number | null>(null);
  const [grid, setGrid] = useState<ClassScheduleGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Tüm aktif sınıflar — takvime bağlı olanlar üstte
  const classrooms = useMemo(() => {
    const all = [...(context?.classrooms || [])].filter((c) => {
      if (!termId) return true;
      if (c.term_id === termId) return true;
      if (c.term_id == null && termId === context?.active_term_id) return true;
      return false;
    });
    if (!calendarId) return all;
    return all.sort((a, b) => {
      const aOn = a.weekly_cycle_ids?.includes(calendarId) ? 0 : 1;
      const bOn = b.weekly_cycle_ids?.includes(calendarId) ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
      return a.ad.localeCompare(b.ad, 'tr');
    });
  }, [context, calendarId, termId]);

  useEffect(() => {
    if (!classrooms.length) {
      setClassroomId(null);
      return;
    }
    setClassroomId((prev) =>
      prev && classrooms.some((c) => c.id === prev) ? prev : classrooms[0].id,
    );
  }, [classrooms]);

  useEffect(() => {
    if (!ready || !classroomId || !termId) {
      setGrid(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchClassScheduleGrid({
      classroom_id: classroomId,
      term_id: termId,
      weekly_cycle_id: calendarId ?? undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setGrid(data);
        if (data.error) setError(data.error);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Program yüklenemedi');
          setGrid(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, classroomId, termId, calendarId, reloadKey]);

  if (!ready) return <ContextRequired />;

  return (
    <ScheduleViewer
      description="Seçili sınıfın haftalık ders programı. Telefonda gün gün, masaüstünde haftalık ızgara."
      grid={grid}
      loading={loading}
      error={error || contextError}
      onRetry={() => setReloadKey((k) => k + 1)}
      showTeacher
      emptyHint="Bu sınıf için henüz yerleştirilmiş ders yok."
      requireSelection={!classroomId}
      selectionMissingHint="Görüntülemek için bir sınıf seçin."
      filters={
        <>
          <Field label="Dönem" width={190}>
            <Select
              value={termId ?? undefined}
              onChange={setTermId}
              options={termOptions}
              placeholder="Dönem"
            />
          </Field>
          <Field label="Çalışma Takvimi" width={200}>
            <Select
              value={calendarId ?? undefined}
              onChange={setCalendarId}
              options={calendarOptions}
              placeholder="Takvim"
              notFoundContent="Program yok"
            />
          </Field>
          <Field label={`Sınıf (${classrooms.length})`} grow>
            <Select
              value={classroomId ?? undefined}
              onChange={setClassroomId}
              showSearch
              optionFilterProp="label"
              options={classrooms.map((c) => {
                const onCal = calendarId
                  ? Boolean(c.weekly_cycle_ids?.includes(calendarId))
                  : false;
                const base = c.oda_ad ? `${c.ad} · ${c.oda_ad}` : c.ad;
                return {
                  value: c.id,
                  label: onCal ? `${base} · bu takvimde` : base,
                };
              })}
              placeholder="Sınıf seçin"
            />
          </Field>
        </>
      }
    />
  );
}
