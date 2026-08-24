'use client';

import { useEffect, useState } from 'react';
import { Select } from 'antd';
import {
  fetchBranchScheduleGrid,
  type ClassScheduleGrid,
  type ScheduleBranchOption,
} from '@/lib/academic-api';
import ScheduleViewer from './ScheduleViewer';
import { useGoruntulemeContext } from './useGoruntulemeContext';
import { ContextRequired, Field } from '../ui';

export default function BransProgramiClient() {
  const {
    calendarOptions,
    calendarId,
    setCalendarId,
    termId,
    setTermId,
    termOptions,
    ready,
    error: contextError,
  } = useGoruntulemeContext();
  const [dersId, setDersId] = useState<number | null>(null);
  const [dersler, setDersler] = useState<ScheduleBranchOption[]>([]);
  const [grid, setGrid] = useState<ClassScheduleGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!ready || !termId) {
      setGrid(null);
      setDersler([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBranchScheduleGrid({
      term_id: termId,
      weekly_cycle_id: calendarId ?? undefined,
      ders_id: dersId ?? undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setGrid(data);
        setDersler(data.dersler || []);
        if (data.error) setError(data.error);
        if (dersId && !data.dersler?.some((d) => d.id === dersId)) {
          setDersId(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Branş programı yüklenemedi');
          setGrid(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, termId, calendarId, dersId, reloadKey]);

  if (!ready) return <ContextRequired />;

  return (
    <ScheduleViewer
      description="Seçili dersin tüm sınıflardaki yerleşimi. Hangi gün, hangi öğretmen ve hangi sınıfta olduğunu görün."
      grid={grid}
      loading={loading}
      error={error || contextError}
      onRetry={() => setReloadKey((k) => k + 1)}
      showClassroom
      showTeacher
      emptyHint="Bu branş için yerleştirilmiş ders yok."
      requireSelection={!dersId}
      selectionMissingHint={
        dersler.length
          ? 'Programda geçen bir branş seçin.'
          : 'Seçili çalışma takviminde henüz yerleştirilmiş ders yok.'
      }
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
          <Field label={`Branş (${dersler.length})`} grow>
            <Select
              value={dersId ?? undefined}
              onChange={setDersId}
              allowClear
              showSearch
              optionFilterProp="label"
              options={dersler.map((d) => ({
                value: d.id,
                label: `${d.ad}${d.kod ? ` (${d.kod})` : ''} · ${d.filled_count} saat`,
              }))}
              placeholder="Branş seçin"
            />
          </Field>
        </>
      }
      picker={
        dersler.length ? (
          <div className="gv-pick-grid">
            {dersler.map((ders) => (
              <button
                key={ders.id}
                type="button"
                className={`gv-pick${dersId === ders.id ? ' is-active' : ''}`}
                onClick={() => setDersId(ders.id)}
              >
                <strong>{ders.ad}</strong>
                <span>{ders.kod || 'Branş'}</span>
                <em>
                  {ders.filled_count} saat · {ders.classroom_count} sınıf · {ders.teacher_count} öğretmen
                </em>
              </button>
            ))}
          </div>
        ) : null
      }
    />
  );
}
