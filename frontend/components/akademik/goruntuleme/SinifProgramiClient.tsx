'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Select } from 'antd';
import { fetchClassScheduleGrid, type ClassScheduleGrid } from '@/lib/academic-api';
import ScheduleViewer from './ScheduleViewer';
import GoruntulemeExportModal from './GoruntulemeExportModal';
import GoruntulemeNotifyModal from './GoruntulemeNotifyModal';
import GoruntulemeNotifyHistory from './GoruntulemeNotifyHistory';
import { useGoruntulemeContext } from './useGoruntulemeContext';
import { ContextRequired, Field } from '../ui';
import { IconDownload, IconSend } from '../ui/icons';

export default function SinifProgramiClient() {
  const {
    context,
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
  const [exportOpen, setExportOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const classrooms = useMemo(() => {
    const all = [...(context?.classrooms || [])].filter((c) => {
      if (!termId) return true;
      if (c.term_id === termId) return true;
      if (c.term_id == null && termId === context?.active_term_id) return true;
      return false;
    });
    return all.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  }, [context, termId]);

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
  }, [ready, classroomId, termId, reloadKey]);

  if (!ready) return <ContextRequired />;

  return (
    <>
      <ScheduleViewer
        description="Gün sütunlarında ders kartları saat sırasındadır. Dersler farklı renklerdedir."
        grid={grid}
        loading={loading}
        error={error || contextError}
        onRetry={() => setReloadKey((k) => k + 1)}
        showTeacher
        showTimesOnCards
        colorBy="lesson"
        layout="day-columns"
        emptyHint="Bu sınıf için henüz yerleştirilmiş ders yok."
        requireSelection={!classroomId}
        selectionMissingHint="Görüntülemek için bir sınıf seçin."
        actions={
          <>
            <Button
              icon={<IconDownload size={14} />}
              disabled={!termId || !classroomId}
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
              disabled={!termId || !classroomId}
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
      <GoruntulemeExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        mode="class"
        termId={termId}
        currentClassroomId={classroomId}
        classrooms={classrooms}
      />
      <GoruntulemeNotifyModal
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        mode="class"
        termId={termId}
        currentClassroomId={classroomId}
        classrooms={classrooms}
      />
      <GoruntulemeNotifyHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        termId={termId}
        target="class"
      />
    </>
  );
}
