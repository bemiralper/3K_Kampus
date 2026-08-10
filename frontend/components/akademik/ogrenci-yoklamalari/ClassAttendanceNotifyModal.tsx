'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Modal, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  previewClassAttendanceNotify,
  sendClassAttendanceNotify,
  type ClassAttendanceNotifyRecipient,
  type ClassAttendanceNotifySource,
} from '@/lib/academic-api';

const { Text } = Typography;

type Props = {
  open: boolean;
  sourceType: ClassAttendanceNotifySource;
  sourceId: number;
  title?: string;
  onClose: () => void;
  onSent?: (sent: number) => void;
};

export default function ClassAttendanceNotifyModal({
  open,
  sourceType,
  sourceId,
  title,
  onClose,
  onSent,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [oturumAd, setOturumAd] = useState('');
  const [recipients, setRecipients] = useState<ClassAttendanceNotifyRecipient[]>([]);
  const [sendVeli, setSendVeli] = useState(true);
  const [sendOgrenci, setSendOgrenci] = useState(false);

  const recipientTypes = useMemo(() => {
    const types: Array<'VELI' | 'OGRENCI'> = [];
    if (sendVeli) types.push('VELI');
    if (sendOgrenci) types.push('OGRENCI');
    return types;
  }, [sendVeli, sendOgrenci]);

  useEffect(() => {
    if (!open || !sourceId || recipientTypes.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await previewClassAttendanceNotify({
          source_type: sourceType,
          source_id: sourceId,
          recipient_types: recipientTypes,
        });
        if (cancelled) return;
        setOturumAd(res.oturum_ad || '');
        setRecipients(res.recipients || []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Önizleme yüklenemedi');
          setRecipients([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sourceId, sourceType, recipientTypes.join('|')]);

  const pending = useMemo(
    () => recipients.filter((r) => !r.skip_reason && r.recipient_id),
    [recipients],
  );

  const handleSend = async () => {
    if (recipientTypes.length === 0 || pending.length === 0) return;
    setSending(true);
    setError('');
    try {
      const res = await sendClassAttendanceNotify({
        source_type: sourceType,
        source_id: sourceId,
        recipient_types: recipientTypes,
      });
      onSent?.(res.sent);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gönderim başarısız');
    } finally {
      setSending(false);
    }
  };

  const columns: ColumnsType<ClassAttendanceNotifyRecipient> = [
    { title: 'Öğrenci', dataIndex: 'ogrenci_ad' },
    {
      title: 'Durum',
      dataIndex: 'status',
      width: 90,
      render: (v) => (
        <Tag color={v === 'LATE' ? 'orange' : 'red'}>{v === 'LATE' ? 'Geç' : 'Yok'}</Tag>
      ),
    },
    {
      title: 'Alıcı',
      dataIndex: 'recipient_type',
      width: 90,
      render: (v) => (v === 'OGRENCI' ? 'Öğrenci' : 'Veli'),
    },
    { title: 'Ad', dataIndex: 'recipient_ad' },
    { title: 'Tel', dataIndex: 'telefon', width: 110 },
    {
      title: 'Durum',
      dataIndex: 'skip_reason',
      render: (v) =>
        v ? <Text type="secondary">{v}</Text> : <Tag color="green">Gönderilecek</Tag>,
    },
  ];

  return (
    <Modal
      open={open}
      title={title || 'Yoklama bildirimi'}
      onCancel={onClose}
      width={820}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Vazgeç
        </Button>,
        <Button
          key="send"
          type="primary"
          loading={sending}
          disabled={pending.length === 0 || recipientTypes.length === 0}
          onClick={handleSend}
        >
          Gönder ({pending.length})
        </Button>,
      ]}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text type="secondary">
          {oturumAd
            ? `${oturumAd} — yalnızca Yok ve Geç kayıtları`
            : 'Yalnızca Yok ve Geç kayıtları bildirilir'}
        </Text>
        <Space>
          <Checkbox checked={sendVeli} onChange={(e) => setSendVeli(e.target.checked)}>
            Veli (varsayılan)
          </Checkbox>
          <Checkbox checked={sendOgrenci} onChange={(e) => setSendOgrenci(e.target.checked)}>
            Öğrenci
          </Checkbox>
        </Space>
        {error ? <Alert type="error" showIcon message={error} /> : null}
        {recipientTypes.length === 0 ? (
          <Alert type="warning" showIcon message="En az bir alıcı tipi seçin." />
        ) : null}
        <Table
          size="small"
          rowKey={(r) => `${r.ogrenci_id}:${r.recipient_type}:${r.recipient_id}:${r.event_key}`}
          loading={loading}
          columns={columns}
          dataSource={recipients}
          pagination={false}
          locale={{ emptyText: 'Bildirilecek Yok/Geç kaydı yok' }}
        />
      </Space>
    </Modal>
  );
}
