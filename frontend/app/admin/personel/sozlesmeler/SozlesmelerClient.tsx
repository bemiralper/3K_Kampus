'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  Table,
  Button,
  Input,
  Select,
  Dropdown,
  Avatar,
  Modal,
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
import type { Sozlesme, SozlesmeStats, HelperData, FesihData } from './types';
import { DURUM_LABELS } from './types';
import { contractNetMaas } from './lib/contractCalc';
import AppDatePicker from '@/components/ui/AppDatePicker';
import styles from './sozlesmeler.module.css';

const { Text } = Typography;
const { TextArea } = Input;

const fmtPara = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const fmtTarih = (d: string | null | undefined) => {
  if (!d) return '—';
  return dayjs(d).format('DD.MM.YYYY');
};

const durumClass = (durum: string) => {
  const map: Record<string, string> = {
    TASLAK: styles.durum_TASLAK,
    AKTIF: styles.durum_AKTIF,
    PASIF: styles.durum_PASIF,
    ASKIDA: styles.durum_ASKIDA,
    FESHEDILDI: styles.durum_FESHEDILDI,
    SURESI_DOLMU: styles.durum_SURESI_DOLMU,
    SONA_ERDI: styles.durum_SONA_ERDI,
  };
  return map[durum] || styles.durum_TASLAK;
};

const turClass = (tur: string) => {
  const map: Record<string, string> = {
    TAM_ZAMANLI: styles.tur_TAM_ZAMANLI,
    DERS_UCRETLI: styles.tur_DERS_UCRETLI,
    KARMA: styles.tur_KARMA,
  };
  return map[tur] || styles.durum_TASLAK;
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
  const [fesihTarihi, setFesihTarihi] = useState(dayjs().format('YYYY-MM-DD'));

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
      fesih_tarihi: fesihTarihi,
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
        setFesihTarihi(dayjs().format('YYYY-MM-DD'));
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
        <div className={styles.person}>
          <Avatar
            className={styles.avatar}
            size={40}
            src={s.personel_foto || undefined}
          >
            {s.personel_ad.charAt(0)}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <div className={styles.personName}>{s.personel_ad}</div>
            <div className={styles.personMeta}>
              {s.sozlesme_no || 'Numarasız'}
              {s.brans_snapshot ? ` · ${s.brans_snapshot}` : ''}
              {s.gorev_snapshot ? ` · ${s.gorev_snapshot}` : ''}
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
        <span className={`${styles.pill} ${turClass(s.sozlesme_turu)}`}>
          {s.sozlesme_turu_display}
        </span>
      ),
    },
    {
      title: 'Durum',
      dataIndex: 'durum',
      width: 110,
      render: (_, s) => (
        <span className={`${styles.pill} ${durumClass(s.durum)}`}>
          {DURUM_LABELS[s.durum] || s.durum_display}
        </span>
      ),
    },
    {
      title: 'Net Maaş',
      key: 'net_maas',
      width: 120,
      align: 'right',
      render: (_, s) => (
        <span className={styles.money}>{fmtPara(contractNetMaas(s))}</span>
      ),
    },
    {
      title: 'Süre',
      key: 'tarih',
      width: 180,
      render: (_, s) => (
        <div className={styles.range}>
          <span>{fmtTarih(s.baslangic_tarihi)}</span>
          <span className={styles.rangeEnd}>{fmtTarih(s.bitis_tarihi)}</span>
        </div>
      ),
    },
    {
      title: 'Detay',
      key: 'meta',
      width: 140,
      render: (_, s) => {
        const plan = s.maas_plani?.length ?? 0;
        if (!plan && !s.ders_ucreti_aktif) {
          return <span className={styles.personMeta}>—</span>;
        }
        return (
          <div className={styles.meta}>
            {plan > 0 && (
              <span className={`${styles.pill} ${styles.tur_TAM_ZAMANLI}`}>{plan} aylık plan</span>
            )}
            {s.ders_ucreti_aktif && (
              <span className={`${styles.pill} ${styles.tur_DERS_UCRETLI}`}>Ders ücreti</span>
            )}
          </div>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      fixed: 'right',
      align: 'right',
      render: (_, s) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Tooltip title="PDF İndir">
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handlePdfDownload(s.id)}
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
        </div>
      ),
    },
  ], [router]);

  const yilEtiket = activeEgitimYili
    ? `${activeEgitimYili.baslangic_yil}–${activeEgitimYili.bitis_yil}`
    : '';
  const konum = [activeSube?.ad, tumYillar ? 'Tüm yıllar' : yilEtiket].filter(Boolean).join(' · ');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.titleBlock}>
            <div className={styles.titleIcon} aria-hidden>
              <FileTextOutlined />
            </div>
            <div>
              <h1 className={styles.title}>Personel Sözleşmeleri</h1>
              <p className={styles.subtitle}>
                {konum || 'Sözleşme, maaş planı ve belge'}
              </p>
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.action} onClick={() => router.push('/admin/personel/sozlesmeler/rapor')}>
              <BarChartOutlined /> Rapor
            </button>
            <button type="button" className={styles.action} onClick={() => router.push('/admin/personel/sozlesmeler/odeme-onay')}>
              <AuditOutlined /> Ödeme Onay
            </button>
            <button type="button" className={styles.action} onClick={() => router.push('/admin/personel/sozlesmeler/puantaj')}>
              <DollarOutlined /> Maaş Bordrosu
            </button>
            <button type="button" className={`${styles.action} ${styles.actionPrimary}`} onClick={() => router.push('/admin/personel/sozlesmeler/yeni')}>
              <PlusOutlined /> Yeni Sözleşme
            </button>
          </div>
        </div>
        <div className={styles.metrics}>
          <button
            type="button"
            className={`${styles.metric} ${!durumFiltre ? styles.metricActive : ''}`}
            onClick={() => setDurumFiltre('')}
          >
            <span className={styles.metricValue}>{stats?.toplam ?? '—'}</span>
            <span className={styles.metricLabel}>Toplam sözleşme</span>
          </button>
          <button
            type="button"
            className={`${styles.metric} ${durumFiltre === 'AKTIF' ? styles.metricActive : ''}`}
            onClick={() => setDurumFiltre(durumFiltre === 'AKTIF' ? '' : 'AKTIF')}
          >
            <span className={styles.metricValue}>{stats?.aktif ?? '—'}</span>
            <span className={styles.metricLabel}>Aktif</span>
          </button>
          <button
            type="button"
            className={`${styles.metric} ${durumFiltre === 'TASLAK' ? styles.metricActive : ''}`}
            onClick={() => setDurumFiltre(durumFiltre === 'TASLAK' ? '' : 'TASLAK')}
          >
            <span className={styles.metricValue}>{stats?.taslak ?? '—'}</span>
            <span className={styles.metricLabel}>Taslak</span>
          </button>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats ? fmtPara(stats.toplam_brut_maas) : '—'}</span>
            <span className={styles.metricLabel}>Toplam net</span>
          </div>
        </div>
      </header>

      {loadError && (
        <Alert
          className={styles.error}
          type="error"
          showIcon
          message={loadError}
          action={<Button size="small" onClick={load}>Tekrar dene</Button>}
        />
      )}

      <div className={styles.toolbar}>
        <Input
          className={styles.search}
          allowClear
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          placeholder="Personel veya sözleşme no ara"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className={styles.filter}
          allowClear
          placeholder="Durum"
          value={durumFiltre || undefined}
          onChange={(v) => setDurumFiltre(v || '')}
          options={helper?.sozlesme_durumlari.map((d) => ({ value: d.value, label: d.label }))}
        />
        <Select
          className={styles.filter}
          allowClear
          placeholder="Çalışma tipi"
          value={turFiltre || undefined}
          onChange={(v) => setTurFiltre(v || '')}
          options={helper?.sozlesme_turleri.map((t) => ({ value: t.value, label: t.label }))}
        />
        <label className={styles.yearToggle}>
          <Checkbox checked={tumYillar} onChange={(e) => setTumYillar(e.target.checked)} />
          Tüm yıllar
        </label>
        <button type="button" className={styles.refresh} onClick={load}>
          <ReloadOutlined spin={loading} /> Yenile
        </button>
      </div>

      <div className={styles.tableCard}>
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
      </div>

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
              <AppDatePicker
                value={fesihTarihi}
                onChange={(iso) => setFesihTarihi(iso || dayjs().format('YYYY-MM-DD'))}
                allowClear={false}
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
