'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
  type ScheduleVersionUsage,
} from '@/lib/academic-api';
import {
  buildDersSaatiSablonPrintHtml,
  openDersSaatiSablonPrintWindow,
} from '@/lib/ders-saatleri-print';
import TemplateEditorDrawer from './TemplateEditorDrawer';
import './ders-saatleri.css';

const { Title, Text } = Typography;

export default function DersSaatleriClient() {
  const { activeKurum, activeSube, initialized } = useKurum();
  const [items, setItems] = useState<ScheduleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorId, setEditorId] = useState<number | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageRows, setUsageRows] = useState<ScheduleVersionUsage[]>([]);
  const [usageTitle, setUsageTitle] = useState('');

  const load = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    setLoading(true);
    try {
      const data = await fetchScheduleTemplates();
      setItems(data);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Liste yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [activeKurum, activeSube, initialized]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.weekly_cycle_name || '').toLowerCase().includes(q),
    );
  }, [items, search]);

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

  if (!initialized) {
    return <div className="ds-loading">Bağlam yükleniyor…</div>;
  }

  if (!activeKurum || !activeSube) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Kurum ve şube seçimi gerekli"
        description="Üst bardaki kurum/şube seçiciden aktif bağlamı seçin."
      />
    );
  }

  return (
    <div className="ds-page">
      <div className="ds-page-head">
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Ders Saati Şablonları
          </Title>
          <Text type="secondary">
            Hafta içi, hafta sonu, yaz okulu gibi farklı zaman planlarını tanımlayın.
          </Text>
        </div>
        <Space wrap>
          <Input.Search
            allowClear
            placeholder="Ara…"
            style={{ width: 220 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button icon={<ReloadOutlined />} onClick={load}>
            Yenile
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Yeni Şablon
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: 'Henüz şablon yok. Yeni Şablon ile başlayın.' }}
      />

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
            { title: 'Program', dataIndex: 'name' },
            { title: 'Dönem', dataIndex: 'term_name', render: (v) => v || '—' },
            { title: 'Eğitim Yılı', dataIndex: 'egitim_yili_name', render: (v) => v || '—' },
            {
              title: 'Durum',
              dataIndex: 'is_active_version',
              render: (v) => (v ? <Tag color="green">Aktif</Tag> : <Tag>Taslak</Tag>),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
