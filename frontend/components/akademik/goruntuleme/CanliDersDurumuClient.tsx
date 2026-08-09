'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, DatePicker, Empty, Select, Spin, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/tr';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  fetchClassLessonPlanContext,
  fetchAcademicScheduleVersions,
  type ClassLessonPlanContext,
} from '@/lib/academic-api';
import { fetchDailyFlow } from '@/lib/schedule-api';
import './goruntuleme.css';

dayjs.locale('tr');
const { Title, Text } = Typography;

type FlowItem = {
  timeslot_id: number;
  start: string | null;
  end: string | null;
  status: string;
  status_display: string;
  lesson: { id: number; name: string } | null;
  teacher: { id: number; name: string } | null;
  classroom: { id: number; name: string } | null;
};

export default function CanliDersDurumuClient() {
  const { activeKurum, activeSube, initialized } = useKurum();
  const [context, setContext] = useState<ClassLessonPlanContext | null>(null);
  const [termId, setTermId] = useState<number | null>(null);
  const [classroomId, setClassroomId] = useState<number | null>(null);
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [items, setItems] = useState<FlowItem[]>([]);
  const [dayName, setDayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boot = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    try {
      const ctx = await fetchClassLessonPlanContext();
      setContext(ctx);
      setTermId((prev) => prev ?? ctx.active_term_id ?? ctx.terms[0]?.id ?? null);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Bağlam yüklenemedi');
    }
  }, [activeKurum, activeSube, initialized]);

  useEffect(() => {
    boot();
  }, [boot]);

  const load = useCallback(async () => {
    if (!termId) return;
    setLoading(true);
    setError(null);
    try {
      const versions = await fetchAcademicScheduleVersions({ term_id: termId });
      const versionId = versions.find((v) => v.is_active)?.id ?? versions[0]?.id;
      const res = await fetchDailyFlow({
        date: date.format('YYYY-MM-DD'),
        classroom_id: classroomId ?? undefined,
        version_id: versionId,
      });
      if (!res.success || !res.data) {
        setError(res.error || 'Günlük akış yüklenemedi');
        setItems([]);
        return;
      }
      const data = res.data as unknown as { items: FlowItem[]; day_name: string | null; info?: string };
      setItems(data.items || []);
      setDayName(data.day_name || null);
      if (data.info) setError(data.info);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Günlük akış yüklenemedi');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [classroomId, date, termId]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: ColumnsType<FlowItem> = useMemo(
    () => [
      {
        title: 'Saat',
        key: 'time',
        width: 120,
        render: (_, row) => <span className="ops-time">{row.start}–{row.end}</span>,
      },
      { title: 'Ders', key: 'lesson', render: (_, row) => row.lesson?.name || '—' },
      { title: 'Sınıf', key: 'classroom', render: (_, row) => row.classroom?.name || '—' },
      { title: 'Öğretmen', key: 'teacher', render: (_, row) => row.teacher?.name || '—' },
      {
        title: 'Durum',
        key: 'status',
        width: 120,
        render: (_, row) => (
          <Tag color={row.status === 'EXAM' ? 'orange' : row.status === 'HOLIDAY' ? 'red' : 'blue'}>
            {row.status_display}
          </Tag>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>Canlı Ders Durumu</Title>
      <Text type="secondary">
        Seçili güne ait dersleri kronolojik sırada listeler.{dayName ? ` (${dayName})` : ''}
      </Text>

      <div className="goruntuleme-toolbar" style={{ marginTop: 16 }}>
        <div className="goruntuleme-filter">
          <label>Tarih</label>
          <DatePicker value={date} onChange={(v) => v && setDate(v)} format="DD.MM.YYYY" allowClear={false} />
        </div>
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
          <label>Sınıf (opsiyonel)</label>
          <Select
            style={{ width: 220 }}
            value={classroomId ?? undefined}
            onChange={setClassroomId}
            allowClear
            showSearch
            optionFilterProp="label"
            options={(context?.classrooms || []).map((c) => ({ value: c.id, label: c.ad }))}
            placeholder="Tüm sınıflar"
          />
        </div>
      </div>

      {error && <Alert type="warning" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Spin spinning={loading}>
        <Table
          rowKey="timeslot_id"
          columns={columns}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: <Empty description="Bu tarih için ders bulunamadı." /> }}
        />
      </Spin>
    </div>
  );
}
