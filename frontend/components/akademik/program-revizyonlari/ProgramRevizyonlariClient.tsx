'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Modal, Select, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LockOutlined, ReloadOutlined, UnlockOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  fetchAcademicScheduleVersions,
  fetchClassLessonPlanContext,
  fetchScheduleRevisions,
  lockAcademicScheduleVersion,
  unlockAcademicScheduleVersion,
  type AcademicScheduleVersion,
  type ClassLessonPlanContext,
  type ScheduleRevisionLog,
} from '@/lib/academic-api';
import {
  Badge,
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
  ToolbarActions,
} from '@/components/akademik/ui';
import {
  IconCalendar,
  IconClock,
  IconFileText,
  IconUser,
} from '@/components/akademik/ui/icons';
import '@/components/akademik/ders-operasyonlari/ops-common.css';

dayjs.locale('tr');

/** Program = (dönem, çalışma takvimi) çifti; kullanıcıya takvim adıyla gösterilir. */
type ProgramOption = {
  versionId: number;
  calendarName: string;
  isLocked: boolean;
  filledCells: number;
};

export default function ProgramRevizyonlariClient() {
  const { activeKurum, activeSube, initialized } = useKurum();
  const [context, setContext] = useState<ClassLessonPlanContext | null>(null);
  const [termId, setTermId] = useState<number | null>(null);
  const [versions, setVersions] = useState<AcademicScheduleVersion[]>([]);
  const [versionId, setVersionId] = useState<number | null>(null);
  const [logs, setLogs] = useState<ScheduleRevisionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const boot = useCallback(async () => {
    if (!initialized) return;
    if (!activeKurum || !activeSube) {
      setBooting(false);
      return;
    }
    setBooting(true);
    setError(null);
    try {
      const ctx = await fetchClassLessonPlanContext();
      setContext(ctx);
      setTermId((p) => p ?? ctx.active_term_id ?? ctx.terms[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bağlam yüklenemedi');
    } finally {
      setBooting(false);
    }
  }, [activeKurum, activeSube, initialized]);

  useEffect(() => {
    boot();
  }, [boot]);

  const loadVersions = useCallback(async () => {
    if (!termId) return;
    const rows = await fetchAcademicScheduleVersions({ term_id: termId });
    setVersions(rows);
    setVersionId((prev) => (prev && rows.some((v) => v.id === prev) ? prev : null));
  }, [termId]);

  useEffect(() => {
    loadVersions().catch(() => setVersions([]));
  }, [loadVersions]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchScheduleRevisions({
        term_id: termId ?? undefined,
        version_id: versionId ?? undefined,
        limit: 200,
      });
      setLogs(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revizyonlar yüklenemedi');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [termId, versionId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  /** Takvim başına tek program: aktif olan, yoksa en dolu olan. */
  const programs = useMemo<ProgramOption[]>(() => {
    const byCycle = new Map<number, ProgramOption>();
    versions
      .filter((v) => v.weekly_cycle)
      .forEach((v) => {
        const cycleId = v.weekly_cycle!.id;
        const current = byCycle.get(cycleId);
        const candidate: ProgramOption = {
          versionId: v.id,
          calendarName: v.weekly_cycle!.name,
          isLocked: v.is_locked,
          filledCells: v.filled_cell_count,
        };
        if (!current || v.is_active || candidate.filledCells > current.filledCells) {
          byCycle.set(cycleId, candidate);
        }
      });
    return Array.from(byCycle.values()).sort((a, b) =>
      a.calendarName.localeCompare(b.calendarName, 'tr'),
    );
  }, [versions]);

  const selected = programs.find((p) => p.versionId === versionId) ?? null;

  const toggleLock = async () => {
    if (!selected) return;
    try {
      if (selected.isLocked) {
        await unlockAcademicScheduleVersion(selected.versionId);
        message.success(`${selected.calendarName} programının kilidi açıldı`);
      } else {
        await lockAcademicScheduleVersion(selected.versionId);
        message.success(`${selected.calendarName} programı kilitlendi`);
      }
      await loadVersions();
      await loadLogs();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'İşlem başarısız');
    }
  };

  const confirmToggleLock = () => {
    if (!selected) return;
    if (selected.isLocked) {
      toggleLock();
      return;
    }
    Modal.confirm({
      title: 'Program kilitlensin mi?',
      content: `"${selected.calendarName}" takviminin ders programı düzenlemeye kapatılacak. Kilit açılana kadar planlama ekranında değişiklik yapılamaz.`,
      okText: 'Kilitle',
      cancelText: 'Vazgeç',
      onOk: toggleLock,
    });
  };

  const columns: ColumnsType<ScheduleRevisionLog> = [
    {
      title: 'Zaman',
      dataIndex: 'created_at',
      width: 150,
      render: (v: string | null) =>
        v ? <span className="ops-time">{dayjs(v).format('DD.MM.YYYY HH:mm')}</span> : '—',
    },
    {
      title: 'İşlem',
      dataIndex: 'action_display',
      width: 160,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    { title: 'Özet', dataIndex: 'summary' },
    {
      title: 'Kullanıcı',
      dataIndex: 'created_by',
      width: 130,
      render: (v: string | null) => v || '—',
    },
  ];

  const stats = useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD');
    const todayCount = logs.filter((l) => (l.created_at || '').startsWith(today)).length;
    const users = new Set(logs.map((l) => l.created_by).filter(Boolean));
    return { todayCount, userCount: users.size };
  }, [logs]);

  if (!initialized || booting) return <LoadingState label="Bağlam yükleniyor…" />;
  if (!activeKurum || !activeSube) return <ContextRequired />;

  return (
    <PageShell>
      <PageHead
        description="Program değişiklik günlüğü: hücre doldurma ve temizleme, oturum üretimi, kilitleme. Bir takvimin programını düzenlemeye kapatmak için de burayı kullanın."
        actions={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              boot();
              loadVersions();
              loadLogs();
            }}
          >
            Yenile
          </Button>
        }
      />

      <StatGrid>
        <StatCard icon={<IconFileText />} tone="blue" value={logs.length} label="Kayıt" />
        <StatCard icon={<IconClock />} tone="purple" value={stats.todayCount} label="Bugün" />
        <StatCard icon={<IconUser />} tone="slate" value={stats.userCount} label="Değişiklik yapan" />
        <StatCard
          icon={<IconCalendar />}
          tone={programs.some((p) => p.isLocked) ? 'orange' : 'green'}
          value={`${programs.filter((p) => p.isLocked).length}/${programs.length}`}
          label="Kilitli program"
        />
      </StatGrid>

      <Toolbar>
        <Field label="Dönem" width={190}>
          <Select
            style={{ width: '100%' }}
            value={termId ?? undefined}
            onChange={setTermId}
            options={(context?.terms || []).map((t) => ({ value: t.id, label: t.name }))}
          />
        </Field>
        <Field label="Çalışma takvimi" width={220}>
          <Select
            allowClear
            placeholder="Tüm takvimler"
            style={{ width: '100%' }}
            value={versionId ?? undefined}
            onChange={(v) => setVersionId(v ?? null)}
            options={programs.map((p) => ({
              value: p.versionId,
              label: p.isLocked ? `${p.calendarName} (kilitli)` : p.calendarName,
            }))}
          />
        </Field>
        <ToolbarActions>
          {selected ? (
            <Badge tone={selected.isLocked ? 'warning' : 'success'}>
              {selected.isLocked ? 'Düzenlemeye kapalı' : 'Düzenlenebilir'}
            </Badge>
          ) : null}
          <Button
            icon={selected?.isLocked ? <UnlockOutlined /> : <LockOutlined />}
            disabled={!selected}
            onClick={confirmToggleLock}
          >
            {selected?.isLocked ? 'Kilidi Aç' : 'Kilitle'}
          </Button>
        </ToolbarActions>
      </Toolbar>

      {!selected ? (
        <Hint>
          Kilitleme işlemi için önce bir çalışma takvimi seçin. Takvim seçilmediğinde günlük, dönemin
          tüm programlarını birlikte gösterir.
        </Hint>
      ) : null}

      {error ? <ErrorState description={error} onRetry={loadLogs} /> : null}

      <Panel title="Değişiklik günlüğü" count={logs.length} flush>
        <Table<ScheduleRevisionLog>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={logs}
          pagination={{ pageSize: 40, hideOnSinglePage: true }}
          scroll={{ x: 800 }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<IconFileText />}
                title="Revizyon kaydı yok"
                description="Ders programında değişiklik yapıldıkça kayıtlar burada listelenir."
              />
            ),
          }}
        />
      </Panel>
    </PageShell>
  );
}
