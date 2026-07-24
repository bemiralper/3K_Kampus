'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/tr';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  fetchClassLessonPlanContext,
  fetchLessonOpsMeta,
  fetchLessonPaySummary,
  type ClassLessonPlanContext,
  type LessonOpsMeta,
  type PaySummaryTeacher,
} from '@/lib/academic-api';
import '@/components/akademik/ders-operasyonlari/ops-common.css';

dayjs.locale('tr');
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function DersUcretleriClient() {
  const { activeKurum, activeSube, initialized } = useKurum();
  const [context, setContext] = useState<ClassLessonPlanContext | null>(null);
  const [meta, setMeta] = useState<LessonOpsMeta | null>(null);
  const [termId, setTermId] = useState<number | null>(null);
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);
  const [rows, setRows] = useState<PaySummaryTeacher[]>([]);
  const [totals, setTotals] = useState({ session_count: 0, total_minutes: 0, total_hours: 0 });
  const [loading, setLoading] = useState(false);

  const boot = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    try {
      const [ctx, ops] = await Promise.all([
        fetchClassLessonPlanContext(),
        fetchLessonOpsMeta(),
      ]);
      setContext(ctx);
      setMeta(ops);
      setTermId((p) => p ?? ctx.active_term_id ?? ctx.terms[0]?.id ?? null);
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
    try {
      const data = await fetchLessonPaySummary({
        term_id: termId,
        date_from: range[0].format('YYYY-MM-DD'),
        date_to: range[1].format('YYYY-MM-DD'),
        teacher_id: teacherId ?? undefined,
      });
      setRows(data.teachers);
      setTotals(data.totals);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ücret özeti yüklenemedi');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [range, teacherId, termId]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: ColumnsType<PaySummaryTeacher> = [
    { title: 'Öğretmen', dataIndex: 'teacher_name' },
    { title: 'Oturum', dataIndex: 'session_count', width: 90 },
    {
      title: 'Saat',
      dataIndex: 'total_hours',
      width: 90,
      render: (v: number) => v.toLocaleString('tr-TR'),
    },
    {
      title: 'Birim ücret',
      dataIndex: 'unit_rate',
      width: 120,
      render: (v: number | null) =>
        v == null ? '—' : `${v.toLocaleString('tr-TR')} ₺`,
    },
    {
      title: 'Tahmini tutar',
      dataIndex: 'estimated_amount',
      width: 140,
      render: (v: number | null) =>
        v == null ? '—' : `${v.toLocaleString('tr-TR')} ₺`,
    },
    {
      title: 'Tür dağılımı',
      dataIndex: 'by_kind',
      render: (v: Record<string, number>) =>
        Object.entries(v || {})
          .map(([k, n]) => `${k}: ${n}`)
          .join(' · ') || '—',
    },
  ];

  if (!initialized) return <div className="ops-empty">Bağlam yükleniyor…</div>;
  if (!activeKurum || !activeSube) {
    return <Alert type="warning" showIcon message="Kurum ve şube seçimi gerekli" />;
  }

  return (
    <div className="ops-page">
      <div className="ops-toolbar">
        <div>
          <Title level={3} style={{ margin: 0 }}>Ders Ücretleri</Title>
          <Text type="secondary">
            Tamamlanan ve ücrete dahil oturumlardan öğretmen bazlı özet.
            Birim ücret personel sözleşmesindeki ders ücreti tanımından okunur.
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => { boot(); load(); }}>
          Yenile
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        message="Yalnızca COMPLETED + payable oturumlar sayılır"
        description="İptal / gelmedi kayıtları ücrete dahil edilmez. Özel, telafi ve ek dersler tür dağılımında görünür."
      />

      <div className="ops-card">
        <div className="ops-filters">
          <div className="ops-filter-item" style={{ minWidth: 260 }}>
            <label>Dönem aralığı</label>
            <RangePicker
              value={range}
              onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])}
              format="DD.MM.YYYY"
              allowClear={false}
            />
          </div>
          <div className="ops-filter-item">
            <label>Dönem</label>
            <Select
              style={{ minWidth: 160 }}
              value={termId ?? undefined}
              onChange={setTermId}
              options={(context?.terms || []).map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
          <div className="ops-filter-item">
            <label>Öğretmen</label>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ minWidth: 180 }}
              value={teacherId ?? undefined}
              onChange={(v) => setTeacherId(v ?? null)}
              options={(meta?.teachers || []).map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
        </div>
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <Text strong>
            {totals.session_count} oturum · {totals.total_hours} saat
          </Text>
        </div>
        <Table<PaySummaryTeacher>
          rowKey="teacher_id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={false}
          expandable={{
            expandedRowRender: (r) => (
              <Table
                size="small"
                pagination={false}
                rowKey="id"
                dataSource={r.sessions}
                columns={[
                  { title: 'Tarih', dataIndex: 'date', width: 110 },
                  { title: 'Ders', dataIndex: 'ders' },
                  { title: 'Sınıf', dataIndex: 'sinif' },
                  { title: 'Tür', dataIndex: 'kind', width: 100 },
                  { title: 'Dk', dataIndex: 'minutes', width: 70 },
                ]}
              />
            ),
          }}
          locale={{ emptyText: 'Bu aralıkta tamamlanmış ücretlendirilebilir oturum yok.' }}
        />
      </div>
    </div>
  );
}
