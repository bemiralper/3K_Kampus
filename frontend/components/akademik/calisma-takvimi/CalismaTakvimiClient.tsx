'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Input,
  Modal,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  CalendarOutlined,
  CopyOutlined,
  DeleteOutlined,
  ExportOutlined,
  ImportOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  copyWorkCalendar,
  createWorkCalendar,
  deleteWorkCalendar,
  exportWorkCalendarJson,
  fetchWorkCalendar,
  fetchWorkCalendarUsage,
  fetchWorkCalendars,
  fetchScheduleTemplates,
  saveWorkCalendarPlan,
  updateWorkCalendar,
  type ScheduleVersionUsage,
  type WorkCalendar,
} from '@/lib/academic-api';
import { takvimIconNode } from './constants';
import { programTipiMeta } from '@/components/akademik/program-tipi';
import TakvimEditorDrawer from './TakvimEditorDrawer';
import './calisma-takvimi.css';

const { Title, Text, Paragraph } = Typography;

type ViewMode = 'cards' | 'list';

export default function CalismaTakvimiClient() {
  const { activeKurum, activeSube, initialized } = useKurum();
  const [items, setItems] = useState<WorkCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorId, setEditorId] = useState<number | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageRows, setUsageRows] = useState<ScheduleVersionUsage[]>([]);
  const [usageTitle, setUsageTitle] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    setLoading(true);
    try {
      const data = await fetchWorkCalendars();
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
        (item.description || '').toLowerCase().includes(q) ||
        item.used_templates.some((t) => t.name.toLowerCase().includes(q)),
    );
  }, [items, search]);

  const selected = useMemo(
    () => (selectedId ? items.find((i) => i.id === selectedId) : undefined),
    [items, selectedId],
  );

  const openCreate = () => {
    setEditorId(null);
    setEditorOpen(true);
  };

  const openEdit = (id: number) => {
    setEditorId(id);
    setEditorOpen(true);
  };

  const handleCopy = async (row?: WorkCalendar) => {
    const target = row || selected;
    if (!target) {
      message.info('Kopyalamak için bir takvim seçin');
      return;
    }
    try {
      await copyWorkCalendar(target.id);
      message.success('Takvim kopyalandı');
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Kopyalama başarısız');
    }
  };

  const handleDeactivate = (row?: WorkCalendar) => {
    const target = row || selected;
    if (!target) {
      message.info('Pasife almak için bir takvim seçin');
      return;
    }
    if (!target.is_active) {
      message.info('Takvim zaten pasif');
      return;
    }
    Modal.confirm({
      title: 'Takvim pasife alınsın mı?',
      content: 'Pasif takvimler yeni programlarda seçilemez.',
      okText: 'Pasife Al',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteWorkCalendar(target.id);
          message.success('Takvim pasif yapıldı');
          setSelectedId(null);
          load();
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'İşlem başarısız');
          throw e;
        }
      },
    });
  };

  const handleDelete = (row?: WorkCalendar) => {
    const target = row || selected;
    if (!target) {
      message.info('Silmek için bir takvim seçin');
      return;
    }
    const isPassive = !target.is_active;
    if (!isPassive) {
      handleDeactivate(target);
      return;
    }
    if (target.usage_count > 0) {
      Modal.warning({
        title: 'Kalıcı silinemez',
        content: `Bu takvim ${target.usage_count} programda kullanılıyor.`,
      });
      return;
    }
    Modal.confirm({
      title: 'Takvim kalıcı silinsin mi?',
      content: 'Bu işlem geri alınamaz.',
      okText: 'Kalıcı Sil',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteWorkCalendar(target.id);
          message.success('Takvim silindi');
          setSelectedId(null);
          load();
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Silme başarısız');
          throw e;
        }
      },
    });
  };

  const handleSetDefault = async (row?: WorkCalendar) => {
    const target = row || selected;
    if (!target) return;
    try {
      await updateWorkCalendar(target.id, { is_default: true, is_active: true });
      message.success('Varsayılan takvim ayarlandı');
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Güncelleme başarısız');
    }
  };

  const handleExport = async (row?: WorkCalendar) => {
    const target = row || selected;
    if (!target) {
      message.info('Dışa aktarmak için bir takvim seçin');
      return;
    }
    try {
      const detail = await fetchWorkCalendar(target.id);
      exportWorkCalendarJson(detail);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Dışa aktarma başarısız');
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const cal = parsed.calendar || parsed;
      if (!cal?.name) throw new Error('Geçersiz dosya formatı');

      const templates = await fetchScheduleTemplates();
      const byName = new Map(templates.filter((t) => t.is_active).map((t) => [t.name.toLowerCase(), t.id]));

      const days = (cal.days || []).map(
        (d: {
          day_of_week: number;
          name?: string;
          order?: number;
          is_active: boolean;
          schedule_template_name?: string;
          note?: string;
        }) => ({
          day_of_week: d.day_of_week,
          name: d.name,
          order: d.order ?? d.day_of_week + 1,
          is_active: d.is_active,
          schedule_template: d.schedule_template_name
            ? byName.get(String(d.schedule_template_name).toLowerCase()) ?? null
            : null,
          note: d.note || '',
        }),
      );

      const created = await createWorkCalendar({
        name: `${cal.name} (İçe Aktarım)`,
        description: cal.description || '',
        is_active: cal.is_active !== false,
        is_default: false,
        color: cal.color || '#0262a7',
        icon: cal.icon || 'calendar',
        program_tipi: cal.program_tipi || 'GENEL',
        create_default_days: false,
      });
      await saveWorkCalendarPlan(created.id, days);
      message.success('Takvim içe aktarıldı');
      load();
      openEdit(created.id);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'İçe aktarma başarısız');
    }
  };

  const showUsage = async (row: WorkCalendar) => {
    try {
      const data = await fetchWorkCalendarUsage(row.id);
      setUsageRows(data);
      setUsageTitle(row.name);
      setUsageOpen(true);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Kullanım bilgisi alınamadı');
    }
  };

  const rowMenu = (row: WorkCalendar): MenuProps['items'] => [
    { key: 'edit', label: 'Düzenle', onClick: () => openEdit(row.id) },
    { key: 'copy', icon: <CopyOutlined />, label: 'Kopyala', onClick: () => handleCopy(row) },
    {
      key: 'default',
      label: 'Varsayılan Yap',
      disabled: row.is_default,
      onClick: () => handleSetDefault(row),
    },
    {
      key: 'usage',
      icon: <UnorderedListOutlined />,
      label: 'Kullanıldığı Programlar',
      onClick: () => showUsage(row),
    },
    { type: 'divider' },
    { key: 'export', icon: <ExportOutlined />, label: 'Dışa Aktar', onClick: () => handleExport(row) },
    {
      key: 'deactivate',
      icon: <StopOutlined />,
      label: 'Pasife Al',
      disabled: !row.is_active,
      onClick: () => handleDeactivate(row),
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: row.is_active ? 'Pasife Al' : 'Kalıcı Sil',
      danger: true,
      onClick: () => handleDelete(row),
    },
  ];

  const columns: ColumnsType<WorkCalendar> = [
    {
      title: 'Takvim Adı',
      dataIndex: 'name',
      render: (name, row) => (
        <Space>
          <span className="ct-card-icon" style={{ background: `${row.color}18`, width: 32, height: 32 }}>
            {takvimIconNode(row.icon, row.color)}
          </span>
          <Space direction="vertical" size={0}>
            <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => openEdit(row.id)}>
              {name}
            </Button>
            {row.is_default && <Tag color="blue">Varsayılan</Tag>}
          </Space>
        </Space>
      ),
    },
    {
      title: 'Program Tipi',
      dataIndex: 'program_tipi',
      width: 130,
      render: (_: unknown, row: WorkCalendar) => {
        const meta = programTipiMeta(row.program_tipi);
        return (
          <Tag style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}>
            {row.program_tipi_display || meta.label}
          </Tag>
        );
      },
    },
    {
      title: 'Açıklama',
      dataIndex: 'description',
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'Aktif Gün',
      dataIndex: 'active_day_count',
      width: 100,
      align: 'center',
      render: (c) => `${c} Gün`,
    },
    {
      title: 'Kullanılan Ders Saati Şablonları',
      dataIndex: 'used_templates',
      render: (tpls: WorkCalendar['used_templates']) =>
        tpls.length ? (
          <Space wrap size={[4, 4]}>
            {tpls.map((t) => (
              <Tag key={t.id}>{t.name}</Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Program',
      dataIndex: 'usage_count',
      width: 110,
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
      title: 'Durum',
      dataIndex: 'is_active',
      width: 90,
      render: (active: boolean) => (
        <Tag color={active ? 'success' : 'default'}>{active ? 'Aktif' : 'Pasif'}</Tag>
      ),
    },
    {
      title: '',
      width: 56,
      align: 'center',
      render: (_, row) => (
        <Dropdown menu={{ items: rowMenu(row) }} trigger={['click']}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  if (!initialized) {
    return <div className="ct-loading">Bağlam yükleniyor…</div>;
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
    <div className="ct-page">
      <div className="ct-page-head">
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Çalışma Takvimi
          </Title>
          <Text type="secondary">Haftalık eğitim düzenlerini yönetin.</Text>
        </div>
        <div className="ct-toolbar">
          <Input.Search
            allowClear
            placeholder="Ara…"
            style={{ width: 200 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button icon={<ReloadOutlined />} onClick={load}>
            Yenile
          </Button>
          <Button icon={<CopyOutlined />} disabled={!selected} onClick={() => handleCopy()}>
            Kopyala
          </Button>
          <Button icon={<StopOutlined />} disabled={!selected?.is_active} onClick={() => handleDeactivate()}>
            Pasife Al
          </Button>
          <Button danger icon={<DeleteOutlined />} disabled={!selected} onClick={() => handleDelete()}>
            Sil
          </Button>
          <Button
            icon={<ImportOutlined />}
            onClick={() => importRef.current?.click()}
          >
            İçe Aktar
          </Button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = '';
            }}
          />
          <Button icon={<ExportOutlined />} disabled={!selected} onClick={() => handleExport()}>
            Dışa Aktar
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Yeni Takvim
          </Button>
        </div>
      </div>

      <div className="ct-view-toggle">
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          options={[
            { label: 'Kart', value: 'cards', icon: <AppstoreOutlined /> },
            { label: 'Liste', value: 'list', icon: <UnorderedListOutlined /> },
          ]}
        />
      </div>

      {loading ? (
        <div className="ct-loading">Yükleniyor…</div>
      ) : filtered.length === 0 ? (
        <div className="ct-empty">
          <CalendarOutlined style={{ fontSize: 40, color: '#94a3b8' }} />
          <h3>Henüz çalışma takvimi yok</h3>
          <Paragraph>Haftalık eğitim düzeninizi tanımlamak için yeni takvim oluşturun.</Paragraph>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Yeni Takvim
          </Button>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="ct-card-grid">
          {filtered.map((row) => (
            <article
              key={row.id}
              className={`ct-card${selectedId === row.id ? ' ct-card--selected' : ''}`}
              onClick={() => setSelectedId(row.id)}
              onDoubleClick={() => openEdit(row.id)}
            >
              <div className="ct-card-head">
                <div className="ct-card-icon" style={{ background: `${row.color}18` }}>
                  {takvimIconNode(row.icon, row.color)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="ct-card-title">{row.name}</p>
                  <p className="ct-card-desc">{row.description || '—'}</p>
                </div>
                <Dropdown menu={{ items: rowMenu(row) }} trigger={['click']}>
                  <Button
                    type="text"
                    size="small"
                    icon={<MoreOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              </div>
              <Space wrap size={[4, 4]}>
                <Tag color={row.is_active ? 'success' : 'default'}>{row.is_active ? 'Aktif' : 'Pasif'}</Tag>
                {row.is_default && <Tag color="blue">Varsayılan</Tag>}
                <Tag
                  style={{
                    color: programTipiMeta(row.program_tipi).color,
                    background: programTipiMeta(row.program_tipi).bg,
                    borderColor: programTipiMeta(row.program_tipi).border,
                  }}
                >
                  {row.program_tipi_display || programTipiMeta(row.program_tipi).label}
                </Tag>
              </Space>
              <div className="ct-card-meta">
                <span className="ct-card-stat">{row.active_day_count} Gün</span>
                {row.used_templates.slice(0, 2).map((t) => (
                  <span key={t.id} className="ct-card-stat">
                    {t.name}
                  </span>
                ))}
                {row.used_templates.length > 2 && (
                  <span className="ct-card-stat">+{row.used_templates.length - 2}</span>
                )}
                {row.usage_count > 0 && (
                  <span className="ct-card-stat">{row.usage_count} Program</span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selectedId ? [selectedId] : [],
            onChange: (keys) => setSelectedId((keys[0] as number) ?? null),
          }}
          onRow={(row) => ({
            onClick: () => setSelectedId(row.id),
            onDoubleClick: () => openEdit(row.id),
          })}
        />
      )}

      <TakvimEditorDrawer
        open={editorOpen}
        calendarId={editorId}
        onClose={() => setEditorOpen(false)}
        onSaved={(newId) => {
          load();
          if (newId) {
            setEditorId(newId);
            setSelectedId(newId);
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
          locale={{ emptyText: 'Bu takvimi kullanan program yok.' }}
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
