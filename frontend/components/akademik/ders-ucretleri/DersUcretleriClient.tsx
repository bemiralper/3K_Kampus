'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, DatePicker, Select, Table } from 'antd';
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
import {
  ContextRequired,
  EmptyState,
  ErrorState,
  Field,
  Hint,
  LoadingState,
  PageHead,
  PageShell,
  Panel,
  StatCard,
  StatGrid,
  Toolbar,
} from '@/components/akademik/ui';
import { IconBanknote, IconClock, IconUser } from '@/components/akademik/ui/icons';
import '@/components/akademik/ders-operasyonlari/ops-common.css';

dayjs.locale('tr');
const { RangePicker } = DatePicker;

const money = (v: number | null | undefined) =>
  v == null ? '—' : `${v.toLocaleString('tr-TR')} ₺`;

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
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bootSeq = useRef(0);
  const loadSeq = useRef(0);

  const boot = useCallback(async () => {
    if (!initialized) return;
    if (!activeKurum || !activeSube) {
      setBooting(false);
      return;
    }
    const seq = ++bootSeq.current;
    setBooting(true);
    setError(null);
    try {
      const [ctx, ops] = await Promise.all([
        fetchClassLessonPlanContext(),
        fetchLessonOpsMeta(),
      ]);
      if (seq !== bootSeq.current) return;
      setContext(ctx);
      setMeta(ops);
      const termIds = new Set(ctx.terms.map((t) => t.id));
      setTermId((p) => (p && termIds.has(p) ? p : ctx.active_term_id ?? ctx.terms[0]?.id ?? null));
      setTeacherId((p) => (p && (ops.teachers || []).some((t) => t.id === p) ? p : null));
    } catch (e) {
      if (seq !== bootSeq.current) return;
      setError(e instanceof Error ? e.message : 'Bağlam yüklenemedi');
    } finally {
      if (seq === bootSeq.current) setBooting(false);
    }
  }, [activeKurum, activeSube, initialized]);

  const subeId = activeSube?.id ?? null;
  const seenSube = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (seenSube.current === undefined) {
      seenSube.current = subeId;
      return;
    }
    if (seenSube.current === subeId) return;
    seenSube.current = subeId;
    setTermId(null);
    setTeacherId(null);
    setRows([]);
  }, [subeId]);

  useEffect(() => {
    boot();
  }, [boot]);

  const load = useCallback(async () => {
    if (!termId) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const data = await fetchLessonPaySummary({
        term_id: termId,
        date_from: range[0].format('YYYY-MM-DD'),
        date_to: range[1].format('YYYY-MM-DD'),
        teacher_id: teacherId ?? undefined,
      });
      if (seq !== loadSeq.current) return;
      setRows(data.teachers);
      setTotals(data.totals);
      setError(null);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(e instanceof Error ? e.message : 'Ücret özeti yüklenemedi');
      setRows([]);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
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
      render: (v: number) => <span className="ops-time">{v.toLocaleString('tr-TR')}</span>,
    },
    {
      title: 'Birim ücret',
      dataIndex: 'unit_rate',
      width: 120,
      render: money,
    },
    {
      title: 'Tahmini tutar',
      dataIndex: 'estimated_amount',
      width: 140,
      render: money,
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

  const estimatedTotal = useMemo(
    () => rows.reduce((sum, r) => sum + (r.estimated_amount ?? 0), 0),
    [rows],
  );

  if (!initialized || booting) return <LoadingState label="Bağlam yükleniyor…" />;
  if (!activeKurum || !activeSube) return <ContextRequired />;

  return (
    <PageShell>
      <PageHead
        description="Tamamlanan ve ücrete dahil oturumlardan öğretmen bazlı özet. Birim ücret, personel sözleşmesindeki ders ücreti tanımından okunur."
        actions={
          <Button icon={<ReloadOutlined />} onClick={() => { boot(); load(); }}>
            Yenile
          </Button>
        }
      />

      {context?.context_year_mismatch ? (
        <Alert
          type="warning"
          showIcon
          message="Üst menüdeki eğitim yılı, ders operasyonlarının kullandığı aktif yıldan farklı. Özet aktif yılın verisini gösterir."
        />
      ) : null}

      <StatGrid>
        <StatCard icon={<IconUser />} tone="blue" value={rows.length} label="Öğretmen" />
        <StatCard
          icon={<IconClock />}
          tone="purple"
          value={totals.session_count}
          label="Ücretli oturum"
        />
        <StatCard
          icon={<IconClock />}
          tone="slate"
          value={totals.total_hours.toLocaleString('tr-TR')}
          label="Toplam saat"
        />
        <StatCard
          icon={<IconBanknote />}
          tone="green"
          value={money(estimatedTotal)}
          label="Tahmini tutar"
        />
      </StatGrid>

      <Toolbar>
        <Field label="Tarih aralığı" width={260}>
          <RangePicker
            value={range}
            onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])}
            format="DD.MM.YYYY"
            allowClear={false}
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Dönem" width={170}>
          <Select
            style={{ width: '100%' }}
            value={termId ?? undefined}
            onChange={setTermId}
            options={(context?.terms || []).map((t) => ({ value: t.id, label: t.name }))}
          />
        </Field>
        <Field label="Öğretmen" width={190}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Tüm öğretmenler"
            style={{ width: '100%' }}
            value={teacherId ?? undefined}
            onChange={(v) => setTeacherId(v ?? null)}
            options={(meta?.teachers || []).map((t) => ({ value: t.id, label: t.name }))}
          />
        </Field>
      </Toolbar>

      <Hint>
        Yalnızca tamamlanmış ve ücrete dahil oturumlar sayılır; iptal ve gelinmedi kayıtları hesaba
        katılmaz. Özel, telafi ve ek dersler tür dağılımı kolonunda ayrı görünür.
      </Hint>

      {error ? <ErrorState description={error} onRetry={load} /> : null}

      <Panel title="Öğretmen özeti" count={rows.length} flush>
        <Table<PaySummaryTeacher>
          rowKey="teacher_id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 'max-content' }}
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
          locale={{
            emptyText: (
              <EmptyState
                icon={<IconBanknote />}
                title="Ücretlendirilecek oturum yok"
                description="Bu aralıkta tamamlanmış ve ücrete dahil oturum bulunmuyor. Oturumları tamamladıkça özet burada oluşur."
              />
            ),
          }}
        />
      </Panel>
    </PageShell>
  );
}
