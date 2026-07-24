'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  LockOutlined,
  ReloadOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  activateAcademicScheduleVersion,
  fetchAcademicScheduleVersions,
  fetchClassLessonPlanContext,
  fetchScheduleRevisions,
  lockAcademicScheduleVersion,
  unlockAcademicScheduleVersion,
  type AcademicScheduleVersion,
  type ClassLessonPlanContext,
  type ScheduleRevisionLog,
} from '@/lib/academic-api';
import '@/components/akademik/ders-operasyonlari/ops-common.css';

dayjs.locale('tr');
const { Title, Text } = Typography;

export default function ProgramRevizyonlariClient() {
  const { activeKurum, activeSube, initialized } = useKurum();
  const [context, setContext] = useState<ClassLessonPlanContext | null>(null);
  const [termId, setTermId] = useState<number | null>(null);
  const [versions, setVersions] = useState<AcademicScheduleVersion[]>([]);
  const [versionId, setVersionId] = useState<number | null>(null);
  const [logs, setLogs] = useState<ScheduleRevisionLog[]>([]);
  const [loading, setLoading] = useState(false);

  const boot = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    try {
      const ctx = await fetchClassLessonPlanContext();
      setContext(ctx);
      setTermId((p) => p ?? ctx.active_term_id ?? ctx.terms[0]?.id ?? null);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Bağlam yüklenemedi');
    }
  }, [activeKurum, activeSube, initialized]);

  useEffect(() => {
    boot();
  }, [boot]);

  const loadVersions = useCallback(async () => {
    if (!termId) return;
    const rows = await fetchAcademicScheduleVersions({ term_id: termId });
    setVersions(rows);
    setVersionId((prev) => prev ?? rows.find((v) => v.is_active)?.id ?? rows[0]?.id ?? null);
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
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Revizyonlar yüklenemedi');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [termId, versionId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const selected = versions.find((v) => v.id === versionId);

  const columns: ColumnsType<ScheduleRevisionLog> = [
    {
      title: 'Zaman',
      dataIndex: 'created_at',
      width: 160,
      render: (v: string | null) => (v ? dayjs(v).format('DD.MM.YYYY HH:mm') : '—'),
    },
    {
      title: 'İşlem',
      dataIndex: 'action_display',
      width: 160,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    { title: 'Özet', dataIndex: 'summary' },
    {
      title: 'Versiyon',
      dataIndex: 'version_name',
      width: 160,
      render: (v: string | null) => v || '—',
    },
    {
      title: 'Kullanıcı',
      dataIndex: 'created_by',
      width: 120,
      render: (v: string | null) => v || '—',
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
          <Title level={3} style={{ margin: 0 }}>Program Revizyonları</Title>
          <Text type="secondary">
            Versiyon yönetimi ve program değişiklik günlüğü (hücre doldurma/temizleme, oturum üretimi, aktifleştirme).
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => { boot(); loadVersions(); loadLogs(); }}>
          Yenile
        </Button>
      </div>

      <div className="ops-card">
        <div className="ops-filters">
          <div className="ops-filter-item">
            <label>Dönem</label>
            <Select
              style={{ minWidth: 180 }}
              value={termId ?? undefined}
              onChange={setTermId}
              options={(context?.terms || []).map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
          <div className="ops-filter-item">
            <label>Versiyon filtresi</label>
            <Select
              allowClear
              style={{ minWidth: 200 }}
              value={versionId ?? undefined}
              onChange={(v) => setVersionId(v ?? null)}
              options={versions.map((v) => ({
                value: v.id,
                label: `${v.name}${v.is_active ? ' ★' : ''}${v.is_locked ? ' 🔒' : ''}`,
              }))}
            />
          </div>
          <Space wrap style={{ marginBottom: 2 }}>
            <Button
              disabled={!versionId || selected?.is_active}
              onClick={async () => {
                if (!versionId) return;
                try {
                  await activateAcademicScheduleVersion(versionId);
                  message.success('Versiyon aktif');
                  loadVersions();
                  loadLogs();
                } catch (e) {
                  message.error(e instanceof Error ? e.message : 'Aktifleştirme başarısız');
                }
              }}
            >
              Aktif Yap
            </Button>
            <Button
              icon={selected?.is_locked ? <UnlockOutlined /> : <LockOutlined />}
              disabled={!versionId}
              onClick={async () => {
                if (!versionId || !selected) return;
                try {
                  if (selected.is_locked) {
                    await unlockAcademicScheduleVersion(versionId);
                    message.success('Kilit açıldı');
                  } else {
                    await lockAcademicScheduleVersion(versionId);
                    message.success('Kilitlendi');
                  }
                  loadVersions();
                  loadLogs();
                } catch (e) {
                  message.error(e instanceof Error ? e.message : 'İşlem başarısız');
                }
              }}
            >
              {selected?.is_locked ? 'Kilidi Aç' : 'Kilitle'}
            </Button>
          </Space>
        </div>
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <Text strong>Değişiklik günlüğü</Text>
          <Text type="secondary">{logs.length} kayıt</Text>
        </div>
        <Table<ScheduleRevisionLog>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={logs}
          pagination={{ pageSize: 40 }}
          locale={{ emptyText: 'Henüz revizyon kaydı yok.' }}
        />
      </div>
    </div>
  );
}
