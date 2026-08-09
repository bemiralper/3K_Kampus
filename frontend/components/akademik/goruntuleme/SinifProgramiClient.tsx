'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Select, Spin, Typography, message } from 'antd';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  fetchClassLessonPlanContext,
  fetchAcademicScheduleVersions,
  type ClassLessonPlanContext,
  type AcademicScheduleVersion,
} from '@/lib/academic-api';
import { fetchClassSchedule, type ScheduleGridResponse } from '@/lib/schedule-api';
import ScheduleReadonlyGrid from './ScheduleReadonlyGrid';
import './goruntuleme.css';

const { Title, Text } = Typography;

export default function SinifProgramiClient() {
  const { activeKurum, activeSube, initialized } = useKurum();
  const [context, setContext] = useState<ClassLessonPlanContext | null>(null);
  const [versions, setVersions] = useState<AcademicScheduleVersion[]>([]);
  const [termId, setTermId] = useState<number | null>(null);
  const [classroomId, setClassroomId] = useState<number | null>(null);
  const [versionId, setVersionId] = useState<number | null>(null);
  const [grid, setGrid] = useState<ScheduleGridResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boot = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    try {
      const ctx = await fetchClassLessonPlanContext();
      setContext(ctx);
      setTermId((prev) => prev ?? ctx.active_term_id ?? ctx.terms[0]?.id ?? null);
      setClassroomId((prev) => prev ?? ctx.classrooms[0]?.id ?? null);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Bağlam yüklenemedi');
    }
  }, [activeKurum, activeSube, initialized]);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    if (!termId) return;
    fetchAcademicScheduleVersions({ term_id: termId })
      .then((rows) => {
        setVersions(rows);
        setVersionId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows.find((r) => r.is_active)?.id ?? rows[0]?.id ?? null));
      })
      .catch(() => setVersions([]));
  }, [termId]);

  useEffect(() => {
    if (!classroomId || !termId) {
      setGrid(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchClassSchedule({ classroom_id: classroomId, term_id: termId, version_id: versionId ?? undefined })
      .then((res) => {
        if (!res.success || !res.data) {
          setError(res.error || 'Program yüklenemedi');
          setGrid(null);
          return;
        }
        setGrid(res.data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Program yüklenemedi'))
      .finally(() => setLoading(false));
  }, [classroomId, termId, versionId]);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>Sınıf Programı</Title>
      <Text type="secondary">
        Seçili sınıfın haftalık ders programını salt okunur olarak görüntüler.
      </Text>

      <div className="goruntuleme-toolbar" style={{ marginTop: 16 }}>
        <div className="goruntuleme-filter">
          <label>Dönem</label>
          <Select
            style={{ width: 220 }}
            value={termId ?? undefined}
            onChange={setTermId}
            options={(context?.terms || []).map((t) => ({ value: t.id, label: t.name }))}
            placeholder="Dönem seçin"
          />
        </div>
        <div className="goruntuleme-filter">
          <label>Sınıf</label>
          <Select
            style={{ width: 220 }}
            value={classroomId ?? undefined}
            onChange={setClassroomId}
            showSearch
            optionFilterProp="label"
            options={(context?.classrooms || []).map((c) => ({ value: c.id, label: c.ad }))}
            placeholder="Sınıf seçin"
          />
        </div>
        <div className="goruntuleme-filter">
          <label>Versiyon</label>
          <Select
            style={{ width: 220 }}
            value={versionId ?? undefined}
            onChange={setVersionId}
            options={versions.map((v) => ({
              value: v.id,
              label: `${v.name}${v.is_active ? ' ★' : ''}${v.is_locked ? ' 🔒' : ''}`,
            }))}
            placeholder="Versiyon seçin"
          />
        </div>
      </div>

      {error && <Alert type="warning" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Spin spinning={loading}>
        <ScheduleReadonlyGrid grid={grid} />
      </Spin>
    </div>
  );
}
