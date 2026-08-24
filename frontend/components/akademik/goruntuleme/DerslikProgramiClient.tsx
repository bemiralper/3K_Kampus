'use client';

import { useEffect, useState } from 'react';
import { Select } from 'antd';
import {
  fetchRoomScheduleGrid,
  type ClassScheduleGrid,
  type ScheduleRoomOption,
} from '@/lib/academic-api';
import ScheduleViewer from './ScheduleViewer';
import { useGoruntulemeContext } from './useGoruntulemeContext';
import { ContextRequired, Field } from '../ui';

export default function DerslikProgramiClient() {
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
  const [roomId, setRoomId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<ScheduleRoomOption[]>([]);
  const [grid, setGrid] = useState<ClassScheduleGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!ready || !termId) {
      setGrid(null);
      setRooms([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRoomScheduleGrid({
      term_id: termId,
      weekly_cycle_id: calendarId ?? undefined,
      room_id: roomId ?? undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setGrid(data);
        setRooms(data.rooms || []);
        if (data.error) setError(data.error);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Derslik programı yüklenemedi');
          setGrid(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, termId, calendarId, roomId, reloadKey]);

  if (!ready) return <ContextRequired />;

  return (
    <ScheduleViewer
      description="Fiziksel odanın haftalık kullanımı. Sınıfa atanmış derslik üzerinden hesaplanır."
      grid={grid}
      loading={loading}
      error={error || contextError}
      onRetry={() => setReloadKey((k) => k + 1)}
      info={
        !roomId && rooms.length
          ? 'Bir derslik seçin. Oda ataması olmayan sınıflar listede görünmez.'
          : undefined
      }
      showClassroom
      showTeacher
      emptyHint="Bu derslikte yerleştirilmiş ders yok."
      requireSelection={!roomId}
      selectionMissingHint={
        rooms.length
          ? 'Aşağıdan bir derslik seçin.'
          : 'Bu şubede tanımlı derslik yok. Eğitim Tanımları’ndan oda ekleyip sınıfa atayın.'
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
          <Field label={`Derslik (${rooms.length})`} grow>
            <Select
              value={roomId ?? undefined}
              onChange={setRoomId}
              allowClear
              showSearch
              optionFilterProp="label"
              options={rooms.map((r) => ({
                value: r.id,
                label: `${r.ad}${r.classrooms.length ? ` · ${r.classrooms.map((c) => c.name).join(', ')}` : ''}`,
              }))}
              placeholder="Derslik seçin"
            />
          </Field>
        </>
      }
      picker={
        rooms.length ? (
          <div className="gv-pick-grid">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                className={`gv-pick${roomId === room.id ? ' is-active' : ''}`}
                onClick={() => setRoomId(room.id)}
              >
                <strong>{room.ad}</strong>
                <span>
                  {room.classrooms.length
                    ? room.classrooms.map((c) => c.name).join(', ')
                    : 'Sınıf ataması yok'}
                </span>
                <em>
                  {room.filled_count} dolu saat
                  {room.oda_turu_display ? ` · ${room.oda_turu_display}` : ''}
                </em>
              </button>
            ))}
          </div>
        ) : null
      }
    />
  );
}
