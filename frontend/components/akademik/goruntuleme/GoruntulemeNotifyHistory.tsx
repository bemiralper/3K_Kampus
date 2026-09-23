'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Spin } from 'antd';
import {
  fetchScheduleNotifyHistory,
  type ScheduleNotifyHistoryItem,
  type ScheduleNotifyRecipient,
} from '@/lib/schedule-notify-api';

type Props = {
  open: boolean;
  onClose: () => void;
  termId: number | null;
  target: 'class' | 'teacher';
};

function roleLabel(kind: ScheduleNotifyRecipient['kind']) {
  if (kind === 'veli') return 'Veli';
  if (kind === 'ogrenci') return 'Öğrenci';
  if (kind === 'ogretmen') return 'Öğretmen';
  return 'Sınıf';
}

function statusLabel(status: string) {
  if (status === 'sent' || status === 'SENT') return 'Gitti';
  if (status === 'failed' || status === 'FAILED') return 'Gitmedi';
  if (status === 'PARTIAL') return 'Kısmi';
  return 'Atlandı';
}

function formatWhen(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function GoruntulemeNotifyHistory({ open, onClose, termId, target }: Props) {
  const [items, setItems] = useState<ScheduleNotifyHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !termId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchScheduleNotifyHistory({ term_id: termId, target })
      .then((res) => {
        if (!cancelled) setItems(res.items || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setItems([]);
          setError(err instanceof Error ? err.message : 'Geçmiş alınamadı');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, termId, target]);

  const batches = useMemo(() => {
    const groups: Array<{
      key: string;
      sent_at: string | null;
      sent_by: string;
      items: ScheduleNotifyHistoryItem[];
    }> = [];
    for (const item of items) {
      const key = item.batch_id || `tek-${item.id}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(item);
      else groups.push({ key, sent_at: item.sent_at, sent_by: item.sent_by, items: [item] });
    }
    return groups;
  }, [items]);

  return (
    <Modal
      title={target === 'teacher' ? 'Öğretmen gönderim geçmişi' : 'Sınıf gönderim geçmişi'}
      open={open}
      onCancel={onClose}
      width={680}
      centered
      destroyOnClose
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          Kapat
        </Button>,
      ]}
    >
      <div className="gv-wa">
        {loading ? (
          <div className="gv-wa-wait">
            <Spin />
            <strong>Geçmiş yükleniyor</strong>
          </div>
        ) : null}
        {error ? <div className="gv-banner gv-banner--warn">{error}</div> : null}
        {!loading && !error && !batches.length ? (
          <div className="gv-wa-empty">Bu dönemde gönderim yok.</div>
        ) : null}
        {!loading && batches.map((batch) => {
          const people = batch.items.flatMap((item) => item.recipients || []);
          const sent = people.filter((row) => row.status === 'sent').length;
          const failed = people.filter((row) => row.status === 'failed').length;
          const fallback = batch.items.reduce(
            (sum, item) => sum + item.veli_count + item.ogrenci_count,
            0,
          );
          return (
            <section key={batch.key} className="gv-wa-history-batch">
              <div className="gv-wa-history-head">
                <div>
                  <strong>{formatWhen(batch.sent_at) || 'Gönderim'}</strong>
                  <small>
                    {batch.items.map((item) => item.title).filter(Boolean).join(', ')}
                    {batch.sent_by ? ` · ${batch.sent_by}` : ''}
                  </small>
                </div>
                <em className={`gv-wa-badge${failed ? ' is-failed' : ' is-sent'}`}>
                  {people.length
                    ? `${sent} gitti${failed ? ` · ${failed} gitmedi` : ''}`
                    : `${fallback} kişi`}
                </em>
              </div>
              <div className="gv-wa-list" style={{ border: 0, borderRadius: 0, maxHeight: 280 }}>
                {people.length ? people.map((row, index) => (
                  <div key={`${row.kind}-${row.id}-${index}`} className="gv-wa-row is-result">
                    <span>
                      <strong>{row.name}</strong>
                      <small>
                        {roleLabel(row.kind)}
                        {row.sinif_ad && row.kind !== 'sinif' ? ` · ${row.sinif_ad}` : ''}
                        {row.error ? ` · ${row.error}` : ''}
                      </small>
                    </span>
                    <em className={`gv-wa-badge is-${row.status}`}>{statusLabel(row.status)}</em>
                  </div>
                )) : batch.items.map((item) => (
                  <div key={item.id} className="gv-wa-row is-result">
                    <span>
                      <strong>{item.title || 'Gönderim'}</strong>
                      <small>
                        {item.veli_count ? `${item.veli_count} veli` : ''}
                        {item.veli_count && item.ogrenci_count ? ' · ' : ''}
                        {item.ogrenci_count ? `${item.ogrenci_count} öğrenci` : ''}
                        {!item.veli_count && !item.ogrenci_count ? 'Alıcı listesi bu kayıtta yok' : ''}
                      </small>
                    </span>
                    <em className="gv-wa-badge">{statusLabel(item.status)}</em>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
