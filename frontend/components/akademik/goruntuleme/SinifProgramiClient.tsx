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

  // Seçili çalışma takvimine ait sınıflar; eşleşme yoksa tüm sınıflar
  const classrooms = useMemo(() => {
    const all = context?.classrooms || [];
    if (!calendarId) return all;
    const scoped = all.filter((c) => c.weekly_cycle_ids?.includes(calendarId));
    return scoped.length ? scoped : all;
  }, [context, calendarId]);

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
              options={classrooms.map((c) => ({
                value: c.id,
                label: c.oda_ad ? `${c.ad} · ${c.oda_ad}` : c.ad,
              }))}
              placeholder="Sınıf seçin"
            />
          </Field>
        </>
      }
    />
  );
}
