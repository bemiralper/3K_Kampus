'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { trIncludes } from '@/lib/text-format';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  MoreOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  copyScheduleTemplate,
  deleteScheduleTemplate,
  downloadScheduleTemplateExport,
  fetchScheduleTemplate,
  fetchScheduleTemplates,
  fetchTemplateUsage,
  type ScheduleTemplate,
  type ProgramUsage,
} from '@/lib/academic-api';
import {
  buildDersSaatiSablonPrintHtml,
  openDersSaatiSablonPrintWindow,
} from '@/lib/ders-saatleri-print';
import {
  ContextRequired,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHead,
  PageShell,
  Panel,
  StatCard,
  StatGrid,
  Toolbar,
  ToolbarActions,
} from '@/components/akademik/ui';
import TemplateEditorDrawer from './TemplateEditorDrawer';
import './ders-saatleri.css';

const { Text } = Typography;

export default function DersSaatleriClient() {
  const { activeKurum, activeSube, initialized } = useKurum();
  const [items, setItems] = useState<ScheduleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorId, setEditorId] = useState<number | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageRows, setUsageRows] = useState<ProgramUsage[]>([]);
  const [usageTitle, setUsageTitle] = useState('');

  const load = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScheduleTemplates();
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Liste yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [activeKurum, activeSube, initialized]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return items;
    return items.filter(
      (item) =>
        trIncludes(item.name, q) ||
        trIncludes(item.weekly_cycle_name, q),
    );
  }, [items, search]);

  const stats = useMemo(
    () => ({
      total: items.length,
      active: items.filter((t) => t.is_active).length,
      lessons: items.reduce((sum, t) => sum + (t.lesson_count || 0), 0),
      inUse: items.filter((t) => (t.usage_count || 0) > 0).length,
    }),
    [items],
  );

  const openCreate = () => {
    setEditorId(null);
    setEditorOpen(true);
  };

  const openEdit = (id: number) => {
    setEditorId(id);
    setEditorOpen(true);
  };

  const handleCopy = async (row: ScheduleTemplate) => {
    try {
      await copyScheduleTemplate(row.id);
      message.success('Şablon kopyalandı');
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Kopyalama başarısız');
    }
  };

  const handleDelete = (row: ScheduleTemplate) => {
    const isPassive = !row.is_active;

    if (isPassive && row.usage_count > 0) {
      Modal.warning({
        title: 'Kalıcı silinemez',
        content: `Bu şablon ${row.usage_count} programda kullanılıyor; kalıcı silinemez.`,
      });
      return;
    }

    Modal.confirm({
      title: isPassive ? 'Şablon kalıcı silinsin mi?' : 'Şablon pasif yapılsın mı?',
      content: isPassive
        ? 'Pasif şablon listeden tamamen kaldırılır. Bu işlem geri alınamaz.'
        : row.usage_count > 0
          ? `Şablon pasif yapılır; ${row.usage_count} mevcut program etkilenmez ancak yeni programlarda seçilemez.`
          : 'Pasif şablonlar program oluşturmada seçilemez. İsterseniz daha sonra kalıcı silebilirsiniz.',
      okText: isPassive ? 'Kalıcı Sil' : 'Pasif Yap',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const action = await deleteScheduleTemplate(row.id);
          message.success(action === 'deleted' ? 'Şablon kalıcı olarak silindi' : 'Şablon pasif yapıldı');
          load();
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'İşlem başarısız');
          throw e;
        }
      },
    });
  };

  const handleExport = async (row: ScheduleTemplate, format: 'csv' | 'xlsx') => {
    try {
      await downloadScheduleTemplateExport(row.id, row.name, format);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Dışa aktarma başarısız');
    }
  };

  const handlePrint = async (row: ScheduleTemplate) => {
    if (!activeSube) {
      message.warning('Yazdırma için şube seçimi gerekli');
      return;
    }
    try {
      const detail = await fetchScheduleTemplate(row.id);
      const html = buildDersSaatiSablonPrintHtml(detail, {
        sube: activeSube,
        subeAdi: activeSube.ad,
      });
      openDersSaatiSablonPrintWindow(html);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Yazdırma başarısız');
    }
  };

  const showUsage = async (row: ScheduleTemplate) => {
    try {
      const data = await fetchTemplateUsage(row.id);
      setUsageRows(data);
      setUsageTitle(row.name);
      setUsageOpen(true);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Kullanım bilgisi alınamadı');
    }
  };

  const rowMenu = (row: ScheduleTemplate): MenuProps['items'] => [
    { key: 'edit', icon: <EditOutlined />, label: 'Düzenle', onClick: () => openEdit(row.id) },
    { key: 'copy', icon: <CopyOutlined />, label: 'Şablonu Kopyala', onClick: () => handleCopy(row) },
    { key: 'usage', icon: <UnorderedListOutlined />, label: 'Kullanıldığı Programlar', onClick: () => showUsage(row) },
    { type: 'divider' },
    { key: 'export-xlsx', icon: <ExportOutlined />, label: 'Excel Aktar', onClick: () => handleExport(row, 'xlsx') },
    { key: 'export-csv', icon: <ExportOutlined />, label: 'CSV Aktar', onClick: () => handleExport(row, 'csv') },
    { key: 'print', icon: <PrinterOutlined />, label: 'Yazdır', onClick: () => handlePrint(row) },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: row.is_active ? 'Pasif Yap' : 'Kalıcı Sil', danger: true, onClick: () => handleDelete(row) },
  ];

  const columns: ColumnsType<ScheduleTemplate> = [
    {
      title: 'Adı',
      dataIndex: 'name',
      render: (name, row) => (
        <Space direction="vertical" size={0}>
          <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => openEdit(row.id)}>
            {name}
          </Button>
          {row.is_default && <Tag color="blue">Varsayılan</Tag>}
        </Space>
      ),
    },
    {
      title: 'Gün Yapısı',
      dataIndex: 'weekly_cycle_name',
      render: (v) => v || '—',
    },
    {
      title: 'Ders Sayısı',
      dataIndex: 'lesson_count',
      width: 110,
      align: 'center',
    },
    {
      title: 'Durum',
      dataIndex: 'is_active',
      width: 100,
      render: (active: boolean) => (
        <Tag color={active ? 'success' : 'default'}>{active ? 'Aktif' : 'Pasif'}</Tag>
      ),
    },
    {
      title: 'Kullanım',
      dataIndex: 'usage_count',
      width: 120,
      render: (count: number, row) =>
        count > 0 ? (
          <Button type="link" size="small" onClick={() => showUsage(row)}>
            {count} Program
          </Button>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'İşlem',
      width: 72,
      align: 'center',
      render: (_, row) => (
        <Dropdown menu={{ items: rowMenu(row) }} trigger={['click']}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  if (!initialized) return <LoadingState label="Bağlam yükleniyor…" />;
  if (!activeKurum || !activeSube) return <ContextRequired />;

  return (
    <PageShell>
      <PageHead
        title="Ders Saati Şablonları"
        description="Hafta içi, hafta sonu, yaz okulu gibi farklı zaman planlarını tanımlayın."
      />

      <StatGrid>
        <StatCard
          icon={<UnorderedListOutlined />}
          tone="blue"
          value={stats.total}
          label="Şablon"
        />
        <StatCard tone="green" value={stats.active} label="Aktif" />
        <StatCard tone="purple" value={stats.lessons} label="Toplam ders saati" />
        <StatCard tone="orange" value={stats.inUse} label="Programda kullanılan" />
      </StatGrid>

      <Panel flush>
        <Toolbar>
          <Field label="Ara" width={240}>
            <Input.Search
              allowClear
              placeholder="Şablon veya gün yapısı…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <ToolbarActions>
            <Button icon={<ReloadOutlined />} onClick={load}>
              Yenile
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Yeni Şablon
            </Button>
          </ToolbarActions>
        </Toolbar>

        {error ? (
          <ErrorState description={error} onRetry={load} />
        ) : loading ? (
          <LoadingState label="Şablonlar yükleniyor…" />
        ) : !items.length ? (
          <EmptyState
            icon={<UnorderedListOutlined />}
            title="Henüz ders saati şablonu yok"
            description="Bir şablon, günün kaçta başlayıp hangi aralıklarla ders yapıldığını tanımlar. Programlar bu şablonlar üzerine kurulur."
            action={
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                İlk şablonu oluştur
              </Button>
            }
          />
        ) : !filtered.length ? (
          <EmptyState
            title="Aramayla eşleşen şablon yok"
            description={`"${search}" için sonuç bulunamadı.`}
            action={<Button onClick={() => setSearch('')}>Aramayı temizle</Button>}
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={filtered}
            pagination={{ pageSize: 10, showSizeChanger: false }}
          />
        )}
      </Panel>

      <TemplateEditorDrawer
        open={editorOpen}
        templateId={editorId}
        onClose={() => setEditorOpen(false)}
        onSaved={(newId) => {
          load();
          if (newId) {
            setEditorId(newId);
            setEditorOpen(true);
          }
        }}
      />

      <Modal
        title={`Kullanıldığı Programlar — ${usageTitle}`}
        open={usageOpen}
        onCancel={() => setUsageOpen(false)}
        footer={null}
        width={640}
      >
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={usageRows}
          locale={{ emptyText: 'Bu şablonu kullanan program yok.' }}
          columns={[
            { title: 'Dönem', dataIndex: 'term_name', render: (v) => v || '—' },
            { title: 'Çalışma Takvimi', dataIndex: 'calendar_name', render: (v) => v || '—' },
            { title: 'Eğitim Yılı', dataIndex: 'egitim_yili_name', render: (v) => v || '—' },
            {
              title: 'Dolu Ders',
              dataIndex: 'filled_cell_count',
              width: 100,
              render: (v: number) => v ?? 0,
            },
            {
              title: 'Durum',
              dataIndex: 'is_locked',
              width: 110,
              render: (v: boolean) =>
                v ? <Tag color="orange">Kilitli</Tag> : <Tag color="green">Düzenlenebilir</Tag>,
            },
          ]}
        />
      </Modal>
    </PageShell>
  );
}
