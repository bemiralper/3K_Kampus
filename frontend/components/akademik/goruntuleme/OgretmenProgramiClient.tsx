'use client';

import { useCallback, useEffect, useState } from 'react';
import { Select } from 'antd';
import {
  fetchTeacherScheduleGrid,
  fetchTeachersForAvailability,
  type ClassScheduleGrid,
  type TeacherListItem,
} from '@/lib/academic-api';
import ScheduleViewer from './ScheduleViewer';
import { useGoruntulemeContext } from './useGoruntulemeContext';
import { ContextRequired, Field } from '../ui';

export default function OgretmenProgramiClient() {
  const { termId, setTermId, termOptions, ready, error: contextError } = useGoruntulemeContext();
  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [grid, setGrid] = useState<ClassScheduleGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadTeachers = useCallback(async () => {
    if (!ready) return;
    try {
      const rows = await fetchTeachersForAvailability({ aktif_only: true });
      setTeachers(rows);
      setTeacherId((prev) => prev ?? rows[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Öğretmenler yüklenemedi');
    }
  }, [ready]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  useEffect(() => {
    if (!ready || !teacherId || !termId) {
      setGrid(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Çalışma takvimi filtresi yok: öğretmen tüm takvimlerde ders veriyor olabilir,
    // hepsi tek haftalık görünümde birleştirilir.
    fetchTeacherScheduleGrid({ teacher_id: teacherId, term_id: termId })
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
  }, [ready, teacherId, termId, reloadKey]);

  if (!ready) return <ContextRequired />;

  return (
    <ScheduleViewer
      description="Tüm çalışma takvimlerindeki sınıf dersleri ve birebir özel dersler tek haftalık görünümde."
      grid={grid}
      loading={loading}
      error={error || contextError}
      onRetry={() => setReloadKey((k) => k + 1)}
      showClassroom
      showTeacher={false}
      emptyHint="Bu öğretmen için yerleştirilmiş ders yok."
      requireSelection={!teacherId}
      selectionMissingHint="Görüntülemek için bir öğretmen seçin."
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
          <Field label={`Öğretmen (${teachers.length})`} grow>
            <Select
              value={teacherId ?? undefined}
              onChange={setTeacherId}
              showSearch
              optionFilterProp="label"
              options={teachers.map((t) => ({
                value: t.id,
                label: t.tam_ad || `${t.ad} ${t.soyad}`,
              }))}
              placeholder="Öğretmen seçin"
            />
          </Field>
        </>
      }
    />
  );
}
