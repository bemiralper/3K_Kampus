'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Select } from 'antd';
import {
  fetchTeacherScheduleGrid,
  fetchTeachersForAvailability,
  type ClassScheduleGrid,
  type TeacherListItem,
} from '@/lib/academic-api';
import ScheduleViewer from './ScheduleViewer';
import GoruntulemeExportModal from './GoruntulemeExportModal';
import GoruntulemeNotifyModal from './GoruntulemeNotifyModal';
import GoruntulemeNotifyHistory from './GoruntulemeNotifyHistory';
import { useGoruntulemeContext } from './useGoruntulemeContext';
import { ContextRequired, Field } from '../ui';
import { IconDownload, IconSend } from '../ui/icons';

export default function OgretmenProgramiClient() {
  const { termId, setTermId, termOptions, ready, error: contextError } = useGoruntulemeContext();
  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [grid, setGrid] = useState<ClassScheduleGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

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

  const teacherName =
    teachers.find((t) => t.id === teacherId)?.tam_ad ||
    teachers.find((t) => t.id === teacherId)?.ad ||
    '';

  return (
    <>
      <ScheduleViewer
        description="Gün sütunlarında ders kartları saat sırasındadır. Sınıf grupları farklı renklerdedir."
        grid={grid}
        loading={loading}
        error={error || contextError}
        onRetry={() => setReloadKey((k) => k + 1)}
        showClassroom
        showTeacher={false}
        showTimesOnCards
        colorBy="classroom"
        layout="day-columns"
        showGenericGaps={false}
        emptyHint="Bu öğretmen için yerleştirilmiş ders yok."
        requireSelection={!teacherId}
        selectionMissingHint="Görüntülemek için bir öğretmen seçin."
        actions={
          <>
            <Button
              icon={<IconDownload size={14} />}
              disabled={!termId || !teacherId}
              onClick={() => setExportOpen(true)}
            >
              İndir
            </Button>
            <Button
              disabled={!termId}
              onClick={() => setHistoryOpen(true)}
            >
              Geçmiş
            </Button>
            <Button
              type="primary"
              icon={<IconSend size={14} />}
              disabled={!termId || !teacherId}
              onClick={() => setNotifyOpen(true)}
            >
              WhatsApp
            </Button>
          </>
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
      <GoruntulemeExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        mode="teacher"
        termId={termId}
        teacherId={teacherId}
        teacherName={teacherName}
      />
      <GoruntulemeNotifyModal
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        mode="teacher"
        termId={termId}
        teacherId={teacherId}
        teacherIds={teachers.map((t) => t.id)}
        teacherName={teacherName}
      />
      <GoruntulemeNotifyHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        termId={termId}
        target="teacher"
      />
    </>
  );
}
