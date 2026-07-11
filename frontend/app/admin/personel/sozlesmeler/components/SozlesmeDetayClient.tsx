'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { fetchSozlesme, downloadSozlesmePdf, fetchPrintToken, getPrintTokenUrl } from '../services/api';
import type { Sozlesme, MaasPlaniSatiri } from '../types';
import { DURUM_LABELS } from '../types';
import { fmtTL, fmtTarih, fmtAySuresi, GUN_ADLARI, contractNetMaas } from '../lib/contractCalc';

const { Title, Text } = Typography;

const durumTagColor = (durum: string) => {
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

interface Props {
  sozlesmeId: number;
}

export default function SozlesmeDetayClient({ sozlesmeId }: Props) {
  const router = useRouter();
  const [sozlesme, setSozlesme] = useState<Sozlesme | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetchSozlesme(sozlesmeId);
      if (res.success && res.data) {
        setSozlesme(res.data);
      } else {
        setError(res.error || 'Sözleşme bulunamadı.');
      }
      setLoading(false);
    })();
  }, [sozlesmeId]);

  const handlePdf = async () => {
    if (!sozlesme) return;
    const res = await downloadSozlesmePdf(sozlesme.id);
    if (!res.success) message.error(res.error || 'PDF indirilemedi.');
  };

  const handlePreview = async () => {
    if (!sozlesme) return;
    const res = await fetchPrintToken(sozlesme.id);
    if (res.success && res.token) {
      window.open(getPrintTokenUrl(sozlesme.id, res.token), '_blank');
    } else {
      message.error(res.error || 'Önizleme açılamadı.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
        Yükleniyor…
      </div>
    );
  }

  if (error || !sozlesme) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Text type="danger">{error || 'Sözleşme bulunamadı.'}</Text>
        <div style={{ marginTop: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/admin/personel/sozlesmeler')}>
            Listeye Dön
          </Button>
        </div>
      </div>
    );
  }

  const s = sozlesme;
  const ozet = s.ozet;
  const belgeBasligi = s.belge_basligi || (s.is_ogretmen ? 'Öğretmen İş Sözleşmesi' : 'Personel İş Sözleşmesi');

  const maasColumns: ColumnsType<MaasPlaniSatiri> = [
    { title: 'Ay', dataIndex: 'sira_no', width: 60, render: (v) => `${v}. Ay` },
    { title: 'Başlangıç', dataIndex: 'baslangic_tarihi', render: (v) => fmtTarih(v) },
    { title: 'Bitiş', dataIndex: 'bitis_tarihi', render: (v) => fmtTarih(v) },
    { title: 'Gün', dataIndex: 'calisilan_gun', width: 70, align: 'center' },
    { title: 'Net Maaş', dataIndex: 'maas', align: 'right', render: (v) => <Text strong>{fmtTL(v)}</Text> },
  ];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
          borderRadius: 16,
          padding: '22px 26px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar
            size={64}
            src={s.personel_foto || undefined}
            style={{ background: 'rgba(255,255,255,.2)', border: '2px solid rgba(255,255,255,.3)' }}
          >
            {s.personel_ad.charAt(0)}
          </Avatar>
          <div>
            <Title level={3} style={{ margin: 0, color: '#fff' }}>
              {s.personel_ad}
            </Title>
            <Text style={{ color: 'rgba(255,255,255,.75)', fontSize: 13 }}>
              {s.sozlesme_no} · {belgeBasligi}
            </Text>
            <div style={{ marginTop: 8 }}>
              <Space size={6} wrap>
                <Tag color="blue" style={{ margin: 0 }}>{s.sozlesme_turu_display}</Tag>
                <Tag color={durumTagColor(s.durum)} style={{ margin: 0 }}>
                  {DURUM_LABELS[s.durum] || s.durum_display}
                </Tag>
                {s.brans_snapshot && (
                  <Tag style={{ margin: 0, background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none' }}>
                    {s.brans_snapshot}
                  </Tag>
                )}
              </Space>
            </div>
          </div>
        </div>
        <Space wrap>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => router.push('/admin/personel/sozlesmeler')}
            style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', color: '#fff' }}
          >
            Liste
          </Button>
          <Button
            icon={<EyeOutlined />}
            onClick={handlePreview}
            style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', color: '#fff' }}
          >
            Önizle
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handlePdf}
            style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', color: '#fff' }}
          >
            PDF İndir
          </Button>
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => router.push(`/admin/personel/sozlesmeler/${s.id}/duzenle`)}
            style={{ background: '#fff', color: '#4338ca', border: 'none', fontWeight: 600 }}
          >
            Düzenle
          </Button>
        </Space>
      </div>

      {/* KPI */}
      {ozet && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12 }}>
              <Statistic title="Toplam Maaş" value={fmtTL(ozet.toplam_maas)} valueStyle={{ fontSize: 18 }} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12 }}>
              <Statistic
                title="Çalışma Süresi"
                value={fmtAySuresi(ozet.toplam_calisma_suresi_ay)}
                valueStyle={{ fontSize: 18 }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12 }}>
              <Statistic
                title="Haftalık Saat"
                value={`${ozet.haftalik_calisma_saati.toFixed(1)} saat`}
                valueStyle={{ fontSize: 18 }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12 }}>
              <Statistic
                title="Tahmini Aylık"
                value={fmtTL(ozet.tahmini_aylik_maliyet)}
                valueStyle={{ fontSize: 18 }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Genel Bilgiler" bordered={false} style={{ borderRadius: 12, height: '100%' }}>
            <Descriptions column={1} size="small" labelStyle={{ color: '#64748b', width: 140 }}>
              <Descriptions.Item label="Eğitim Yılı">{s.egitim_yili_display}</Descriptions.Item>
              <Descriptions.Item label="Şube">{s.sube_ad || '—'}</Descriptions.Item>
              <Descriptions.Item label="Başlangıç">{fmtTarih(s.baslangic_tarihi)}</Descriptions.Item>
              <Descriptions.Item label="Bitiş">{fmtTarih(s.bitis_tarihi)}</Descriptions.Item>
              <Descriptions.Item label="Net Maaş">{fmtTL(contractNetMaas(s))}</Descriptions.Item>
              <Descriptions.Item label="SGK Gün">{s.sgk_gun}</Descriptions.Item>
              {s.gorev_snapshot && <Descriptions.Item label="Görev">{s.gorev_snapshot}</Descriptions.Item>}
              {s.departman_snapshot && <Descriptions.Item label="Departman">{s.departman_snapshot}</Descriptions.Item>}
              {s.personel_no_snapshot && <Descriptions.Item label="Personel No">{s.personel_no_snapshot}</Descriptions.Item>}
            </Descriptions>
            {s.notlar && (
              <div style={{ marginTop: 16, padding: 12, background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Notlar</Text>
                {s.notlar}
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          {s.mesai_saatleri && s.mesai_saatleri.length > 0 && (
            <Card title="Mesai Saatleri" bordered={false} style={{ borderRadius: 12, marginBottom: 16 }}>
              <Descriptions column={1} size="small" labelStyle={{ color: '#64748b', width: 100 }}>
                {s.mesai_saatleri.map((m) => (
                  <Descriptions.Item key={m.gun} label={GUN_ADLARI[m.gun]}>
                    {m.aktif && m.baslangic && m.bitis
                      ? `${m.baslangic} – ${m.bitis}${m.mola_dakika ? ` (${m.mola_dakika} dk mola)` : ''}`
                      : 'İzin'}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </Card>
          )}

          {s.ders_ucreti_aktif && s.ders_ucretleri.length > 0 && (
            <Card title="Ders Ücretleri" bordered={false} style={{ borderRadius: 12 }}>
              {s.ders_ucretleri.map((du, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: idx < s.ders_ucretleri.length - 1 ? '1px solid #f1f5f9' : undefined,
                  }}
                >
                  <Text>{du.brans_ad || 'Genel'}</Text>
                  <Text strong>{fmtTL(du.birim_ucret)}</Text>
                </div>
              ))}
            </Card>
          )}
        </Col>
      </Row>

      {s.maas_plani && s.maas_plani.length > 0 && (
        <Card
          title="Maaş Planı"
          bordered={false}
          style={{ borderRadius: 12, marginTop: 16 }}
          extra={
            <Text type="secondary">
              Toplam: {fmtTL(s.toplam_sozlesme_bedeli ?? ozet?.toplam_maas ?? 0)}
              {' · '}
              {fmtAySuresi(s.toplam_calisma_suresi_ay ?? ozet?.toplam_calisma_suresi_ay ?? 0)}
            </Text>
          }
        >
          <Table
            rowKey="sira_no"
            columns={maasColumns}
            dataSource={s.maas_plani}
            pagination={false}
            size="small"
          />
        </Card>
      )}

      {s.maddeler && s.maddeler.length > 0 && (
        <Card title="Sözleşme Maddeleri" bordered={false} style={{ borderRadius: 12, marginTop: 16 }}>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
            {s.maddeler.map((m) => (
              <li key={m.sira} style={{ marginBottom: 8 }}>{m.metin}</li>
            ))}
          </ol>
        </Card>
      )}

      {s.durum === 'FESHEDILDI' && (
        <Card
          title="Fesih Bilgileri"
          bordered={false}
          style={{ borderRadius: 12, marginTop: 16, border: '1px solid #fecaca' }}
        >
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Fesih Tarihi">{fmtTarih(s.fesih_tarihi)}</Descriptions.Item>
            {s.fesih_sebebi && (
              <Descriptions.Item label="Sebep">{s.fesih_sebebi}</Descriptions.Item>
            )}
          </Descriptions>
        </Card>
      )}

      {s.dogrulama_kodu && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            <FileTextOutlined /> Doğrulama kodu: {s.dogrulama_kodu}
          </Text>
        </div>
      )}
    </div>
  );
}
