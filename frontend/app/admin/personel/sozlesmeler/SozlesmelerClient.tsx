'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  Table,
  Card,
  Row,
  Col,
  Statistic,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Dropdown,
  Avatar,
  Modal,
  DatePicker,
  Typography,
  Tooltip,
  Checkbox,
  Alert,
  Empty,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  FileTextOutlined,
  EditOutlined,
  EyeOutlined,
  DownloadOutlined,
  MoreOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DollarOutlined,
  AuditOutlined,
  BarChartOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  fetchSozlesmeler,
  fetchSozlesmeStats,
  fetchHelperData,
  deleteSozlesme,
  changeSozlesmeDurum,
  downloadSozlesmePdf,
  fetchPrintToken,
  getPrintTokenUrl,
} from './services/api';
import type { Sozlesme, SozlesmeStats, HelperData, FesihData, SozlesmeDurumu } from './types';
import { DURUM_LABELS } from './types';
import { contractNetMaas } from './lib/contractCalc';

const { Title, Text } = Typography;
const { TextArea } = Input;

const fmtPara = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const fmtTarih = (d: string | null | undefined) => {
  if (!d) return '—';
  return dayjs(d).format('DD.MM.YYYY');
};

const durumTagColor = (durum: SozlesmeDurumu): string => {
  const map: Record<string, string> = {
    TASLAK: 'default',
    AKTIF: 'success',
    PASIF: 'warning',
    ASKIDA: 'warning',
    FESHEDILDI: 'error',
    SURESI_DOLMU: 'default',
    SONA_ERDI: 'default',
  };
  return map[durum] || 'default';
};

const turTagColor = (tur: string): string => {
  const map: Record<string, string> = {
    TAM_ZAMANLI: 'blue',
    DERS_UCRETLI: 'purple',
    KARMA: 'cyan',
  };
  return map[tur] || 'default';
};

export default function SozlesmelerClient() {
  const router = useRouter();
  const { activeKurum, activeEgitimYili, activeSube, initialized } = useKurum();

  const [sozlesmeler, setSozlesmeler] = useState<Sozlesme[]>([]);
  const [stats, setStats] = useState<SozlesmeStats | null>(null);
  const [helper, setHelper] = useState<HelperData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [durumFiltre, setDurumFiltre] = useState('');
  const [turFiltre, setTurFiltre] = useState('');
  const [tumYillar, setTumYillar] = useState(false);

  const [fesihItem, setFesihItem] = useState<Sozlesme | null>(null);
  const [fesihSebebi, setFesihSebebi] = useState('');
  const [fesihTarihi, setFesihTarihi] = useState(dayjs());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!initialized || !activeKurum) return;
    setLoading(true);
    setLoadError('');
    const filters: Record<string, string> = {};
    if (debouncedSearch) filters.search = debouncedSearch;
    if (durumFiltre) filters.durum = durumFiltre;
    if (turFiltre) filters.sozlesme_turu = turFiltre;
    if (tumYillar) filters.tum_yillar = '1';

    const [sRes, stRes, hRes] = await Promise.all([
      fetchSozlesmeler(filters),
      fetchSozlesmeStats(),
      fetchHelperData(),
    ]);
    if (sRes.success && Array.isArray(sRes.data)) {
      setSozlesmeler(sRes.data);
    } else {
      setSozlesmeler([]);
      setLoadError(sRes.error || 'Sözleşmeler yüklenemedi.');
      if (sRes.error) message.error(sRes.error);
    }
    if (stRes.success && stRes.data) setStats(stRes.data);
    if (hRes.success && hRes.data) setHelper(hRes.data);
    setLoading(false);
  }, [initialized, activeKurum, activeSube?.id, activeEgitimYili?.id, debouncedSearch, durumFiltre, turFiltre, tumYillar]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: 'Sözleşmeyi sil',
      content: 'Bu sözleşme kalıcı olarak silinecek. Devam etmek istiyor musunuz?',
      okText: 'Sil',
      okType: 'danger',
      cancelText: 'İptal',
      onOk: async () => {
        const res = await deleteSozlesme(id);
        if (res.success) {
          message.success('Sözleşme silindi.');
          load();
        } else {
          message.error(res.error || 'Silinemedi.');
        }
      },
    });
  };

  const handleDurum = async (id: number, durum: string) => {
    const res = await changeSozlesmeDurum(id, durum);
    if (res.success) {
      message.success('Durum güncellendi.');
      load();
    } else {
      message.error(res.error || 'Durum değiştirilemedi.');
    }
  };

  const handleFesih = async () => {
    if (!fesihItem) return;
    if (!fesihSebebi.trim()) {
      message.warning('Fesih sebebi zorunludur.');
      return;
    }
    const data: FesihData = {
      fesih_sebebi: fesihSebebi.trim(),
      fesih_tarihi: fesihTarihi.format('YYYY-MM-DD'),
    };
    const res = await changeSozlesmeDurum(fesihItem.id, 'FESHEDILDI', data);
    if (res.success) {
      message.success('Sözleşme feshedildi.');
      setFesihItem(null);
      setFesihSebebi('');
      load();
    } else {
      message.error(res.error || 'Fesih işlemi başarısız.');
    }
  };

  const handlePdfDownload = async (id: number) => {
    const res = await downloadSozlesmePdf(id);
    if (!res.success) message.error(res.error || 'PDF indirilemedi.');
  };

  const handlePdfPreview = async (id: number) => {
    const res = await fetchPrintToken(id);
    if (res.success && res.token) {
      window.open(getPrintTokenUrl(id, res.token), '_blank');
    } else {
      message.error(res.error || 'Önizleme açılamadı.');
    }
  };

  const actionMenu = (s: Sozlesme): MenuProps => ({
    items: [
      { key: 'view', icon: <EyeOutlined />, label: 'Detay Görüntüle' },
      { key: 'edit', icon: <EditOutlined />, label: 'Düzenle' },
      { type: 'divider' },
      { key: 'pdf', icon: <DownloadOutlined />, label: 'PDF İndir' },
      { key: 'preview', icon: <FileTextOutlined />, label: 'PDF Önizle' },
      ...(s.durum === 'TASLAK'
        ? [{ key: 'activate', icon: <CheckCircleOutlined />, label: 'Aktifleştir' }]
        : []),
      ...(s.durum === 'AKTIF'
        ? [{ key: 'pause', icon: <PauseCircleOutlined />, label: 'Askıya Al' }]
        : []),
      ...(s.durum === 'ASKIDA' || s.durum === 'PASIF'
        ? [{ key: 'resume', icon: <CheckCircleOutlined />, label: 'Aktif Et' }]
        : []),
      ...(s.durum === 'AKTIF' || s.durum === 'ASKIDA' || s.durum === 'TASLAK' || s.durum === 'PASIF'
        ? [{ type: 'divider' as const }, { key: 'terminate', icon: <CloseCircleOutlined />, label: 'Feshet', danger: true }]
        : []),
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, label: 'Sil', danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'view') router.push(`/admin/personel/sozlesmeler/${s.id}`);
      else if (key === 'edit') router.push(`/admin/personel/sozlesmeler/${s.id}/duzenle`);
      else if (key === 'pdf') handlePdfDownload(s.id);
      else if (key === 'preview') handlePdfPreview(s.id);
      else if (key === 'activate' || key === 'resume') handleDurum(s.id, 'AKTIF');
      else if (key === 'pause') handleDurum(s.id, 'PASIF');
      else if (key === 'terminate') {
        setFesihItem(s);
        setFesihSebebi('');
        setFesihTarihi(dayjs());
      }
      else if (key === 'delete') handleDelete(s.id);
    },
  });

  const columns: ColumnsType<Sozlesme> = useMemo(() => [
    {
      title: 'Personel',
      key: 'personel',
      fixed: 'left',
      width: 260,
      render: (_, s) => (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
          onClick={() => router.push(`/admin/personel/sozlesmeler/${s.id}`)}
        >
          <Avatar
            size={40}
            src={s.personel_foto || undefined}
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', flexShrink: 0 }}
          >
            {s.personel_ad.charAt(0)}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{s.personel_ad}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {s.sozlesme_no || '—'}
              {s.brans_snapshot ? ` · ${s.brans_snapshot}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Tür',
      dataIndex: 'sozlesme_turu',
      width: 130,
      render: (_, s) => (
        <Tag color={turTagColor(s.sozlesme_turu)} style={{ margin: 0, borderRadius: 6 }}>
          {s.sozlesme_turu_display}
        </Tag>
      ),
    },
    {
      title: 'Durum',
      dataIndex: 'durum',
      width: 110,
      render: (_, s) => (
        <Tag color={durumTagColor(s.durum)} style={{ margin: 0, borderRadius: 6 }}>
          {DURUM_LABELS[s.durum] || s.durum_display}
        </Tag>
      ),
    },
    {
      title: 'Net Maaş',
      key: 'net_maas',
      width: 120,
      align: 'right',
      render: (_, s) => (
        <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#0f172a' }}>
          {fmtPara(contractNetMaas(s))}
        </span>
      ),
    },
    {
      title: 'Süre',
      key: 'tarih',
      width: 180,
      render: (_, s) => (
        <div style={{ fontSize: 12, color: '#475569' }}>
          <div>{fmtTarih(s.baslangic_tarihi)}</div>
          <div style={{ color: '#94a3b8' }}>{fmtTarih(s.bitis_tarihi)}</div>
        </div>
      ),
    },
    {
      title: 'Detay',
      key: 'meta',
      width: 140,
      render: (_, s) => (
        <Space size={4} wrap>
          {(s.maas_plani?.length ?? 0) > 0 && (
            <Tag bordered={false} style={{ background: '#eff6ff', color: '#2563eb', fontSize: 11 }}>
              {s.maas_plani!.length} ay plan
            </Tag>
          )}
          {s.ders_ucreti_aktif && (
            <Tag bordered={false} style={{ background: '#f5f3ff', color: '#7c3aed', fontSize: 11 }}>
              Ders ücreti
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      fixed: 'right',
      align: 'right',
      render: (_, s) => (
        <Space size={4}>
          <Tooltip title="PDF İndir">
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handlePdfDownload(s.id)}
              style={{ color: '#6366f1' }}
            />
          </Tooltip>
          <Tooltip title="Düzenle">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => router.push(`/admin/personel/sozlesmeler/${s.id}/duzenle`)}
            />
          </Tooltip>
          <Dropdown menu={actionMenu(s)} trigger={['click']} placement="bottomRight">
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ], [router]);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
          borderRadius: 16,
          padding: '24px 28px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0, color: '#fff', fontWeight: 700 }}>
            Personel Sözleşmeleri
          </Title>
          <Text style={{ color: 'rgba(255,255,255,.75)', fontSize: 13 }}>
            Sözleşme oluşturma, maaş planı ve belge yönetimi
          </Text>
        </div>
        <Space wrap>
          <Button
            icon={<BarChartOutlined />}
            href="/admin/personel/sozlesmeler/rapor"
            style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', color: '#fff' }}
          >
            Rapor
          </Button>
          <Button
            icon={<AuditOutlined />}
            href="/admin/personel/sozlesmeler/odeme-onay"
            style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', color: '#fff' }}
          >
            Ödeme Onay
          </Button>
          <Button
            icon={<DollarOutlined />}
            href="/admin/personel/sozlesmeler/puantaj"
            style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', color: '#fff' }}
          >
            Maaş Bordrosu
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => router.push('/admin/personel/sozlesmeler/yeni')}
            style={{ background: '#fff', color: '#4338ca', border: 'none', fontWeight: 600, boxShadow: '0 4px 14px rgba(0,0,0,.15)' }}
          >
            Yeni Sözleşme
          </Button>
        </Space>
      </div>

      {/* Stats */}
      {stats && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <Statistic
                title={<span style={{ fontSize: 12, color: '#64748b' }}>Toplam Sözleşme</span>}
                value={stats.toplam}
                prefix={<TeamOutlined style={{ color: '#6366f1' }} />}
                valueStyle={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <Statistic
                title={<span style={{ fontSize: 12, color: '#64748b' }}>Aktif</span>}
                value={stats.aktif}
                prefix={<CheckCircleOutlined style={{ color: '#10b981' }} />}
                valueStyle={{ fontSize: 22, fontWeight: 700, color: '#059669' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <Statistic
                title={<span style={{ fontSize: 12, color: '#64748b' }}>Taslak</span>}
                value={stats.taslak}
                prefix={<FileTextOutlined style={{ color: '#94a3b8' }} />}
                valueStyle={{ fontSize: 22, fontWeight: 700, color: '#64748b' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <Statistic
                title={<span style={{ fontSize: 12, color: '#64748b' }}>Toplam Net</span>}
                value={stats.toplam_brut_maas}
                formatter={(v) => fmtPara(Number(v))}
                prefix={<DollarOutlined style={{ color: '#f59e0b' }} />}
                valueStyle={{ fontSize: 18, fontWeight: 700, color: '#d97706' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {loadError && (
        <Alert
          type="error"
          showIcon
          message={loadError}
          style={{ marginBottom: 16, borderRadius: 10 }}
          action={
            <Button size="small" onClick={load}>
              Tekrar dene
            </Button>
          }
        />
      )}

      {/* Toolbar */}
      <Card
        bordered={false}
        style={{ borderRadius: 12, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}
        styles={{ body: { padding: '14px 16px' } }}
      >
        <Space wrap style={{ width: '100%' }} size={12}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Personel veya sözleşme no ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280, borderRadius: 8 }}
          />
          <Select
            allowClear
            placeholder="Durum"
            value={durumFiltre || undefined}
            onChange={(v) => setDurumFiltre(v || '')}
            style={{ width: 150 }}
            options={helper?.sozlesme_durumlari.map((d) => ({ value: d.value, label: d.label }))}
          />
          <Select
            allowClear
            placeholder="Çalışma tipi"
            value={turFiltre || undefined}
            onChange={(v) => setTurFiltre(v || '')}
            style={{ width: 170 }}
            options={helper?.sozlesme_turleri.map((t) => ({ value: t.value, label: t.label }))}
          />
          <Checkbox
            checked={tumYillar}
            onChange={(e) => setTumYillar(e.target.checked)}
          >
            Tüm eğitim yılları
          </Checkbox>
          {activeEgitimYili && !tumYillar && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {activeEgitimYili.baslangic_yil}-{activeEgitimYili.bitis_yil}
            </Text>
          )}
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            Yenile
          </Button>
        </Space>
      </Card>

      {/* Table */}
      <Card
        bordered={false}
        style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={sozlesmeler}
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `${total} sözleşme`,
            style: { padding: '12px 16px' },
          }}
          scroll={{ x: 1100 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Henüz sözleşme bulunmuyor"
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => router.push('/admin/personel/sozlesmeler/yeni')}
                >
                  İlk Sözleşmeyi Oluştur
                </Button>
              </Empty>
            ),
          }}
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onClick: (e) => {
              const target = e.target as HTMLElement;
              if (target.closest('button') || target.closest('.ant-dropdown')) return;
              router.push(`/admin/personel/sozlesmeler/${record.id}`);
            },
          })}
        />
      </Card>

      {/* Fesih Modal */}
      <Modal
        title="Sözleşme Fesih"
        open={!!fesihItem}
        onCancel={() => setFesihItem(null)}
        onOk={handleFesih}
        okText="Feshet"
        okButtonProps={{ danger: true }}
        cancelText="İptal"
        destroyOnClose
      >
        {fesihItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Text type="secondary">
              <strong>{fesihItem.personel_ad}</strong> adlı personelin sözleşmesi feshedilecek.
            </Text>
            <div>
              <Text style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Fesih Tarihi</Text>
              <DatePicker
                value={fesihTarihi}
                onChange={(d) => d && setFesihTarihi(d)}
                style={{ width: '100%' }}
                format="DD.MM.YYYY"
              />
            </div>
            <div>
              <Text style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Fesih Sebebi</Text>
              <TextArea
                rows={4}
                value={fesihSebebi}
                onChange={(e) => setFesihSebebi(e.target.value)}
                placeholder="Fesih gerekçesini yazınız..."
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
