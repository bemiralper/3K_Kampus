'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { examApi } from './api';
import type { ExamPublishDispatch, ExamPublishStatus } from './types';
import ExamPublishNotifyModal from './ExamPublishNotifyModal';

function fmtShort(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusText(row: ExamPublishDispatch) {
  if (row.status === 'sent') return `Gönderildi · ${row.sent_count}`;
  if (row.status === 'cancelled') return 'Zamanlama iptal';
  if (row.status === 'overdue_unread') return row.ready ? 'Saat geçti' : 'Saat geçti · hazır değil';
  if (row.is_enabled && row.scheduled_at) return row.ready ? 'Zamanlı · açık' : 'Zamanlı · hazır değil';
  return row.ready ? 'Manuel' : 'Hazır değil';
}

function Row({
  examId,
  examName,
  label,
  kindLabel,
  row,
  onChanged,
}: {
  examId: number;
  examName: string;
  label: string;
  kindLabel: string;
  row: ExamPublishDispatch;
  onChanged: (next: ExamPublishStatus) => void;
}) {
  const [busy, setBusy] = useState('');
  const [openTime, setOpenTime] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [when, setWhen] = useState(toLocalInput(row.scheduled_at));
  const [error, setError] = useState('');

  useEffect(() => { setWhen(toLocalInput(row.scheduled_at)); }, [row.scheduled_at]);

  const saveSchedule = async (enabled: boolean, at: string) => {
    if (enabled && !at) {
      setError('Zamanlı gönderimi açmak için saat seçin');
      setOpenTime(true);
      return;
    }
    setBusy('schedule');
    setError('');
    try {
      onChanged(await examApi.publishReschedule(examId, row.kind, at || null, enabled));
      setOpenTime(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally { setBusy(''); }
  };

  const tone = row.status === 'overdue_unread'
    ? '#b45309'
    : row.status === 'sent'
      ? '#15803d'
      : row.is_enabled
        ? '#0369a1'
        : '#475569';

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '96px minmax(0, 1fr) auto',
        gap: 8,
        alignItems: 'center',
        fontSize: 12,
        lineHeight: 1.3,
      }}>
        <span style={{ fontWeight: 650, color: '#334155' }}>{label}</span>
        <span style={{ color: tone, minWidth: 0 }}>
          {row.is_enabled ? fmtShort(row.scheduled_at) : (row.scheduled_at ? `Kapalı · ${fmtShort(row.scheduled_at)}` : 'Zamanlama yok')}
          <span style={{ marginLeft: 6, color: '#94a3b8' }}>{statusText(row)}</span>
        </span>
        <span style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#475569' }}>
            <input
              type="checkbox"
              checked={row.is_enabled}
              disabled={busy !== '' || row.status === 'sent'}
              onChange={e => {
                const next = e.target.checked;
                if (next && !when) {
                  setOpenTime(true);
                  setError('Zamanlı gönderimi açmak için saat seçin');
                  return;
                }
                saveSchedule(next, when);
              }}
            />
            Zamanlı
          </label>
          <button
            type="button"
            className="btn-modern btn-primary"
            style={{ padding: '3px 8px', fontSize: 11, height: 26 }}
            disabled={busy !== ''}
            onClick={() => { setPickerOpen(true); setError(''); }}
          >
            Gönder
          </button>
          <button
            type="button"
            className="btn-modern btn-secondary"
            style={{ padding: '3px 8px', fontSize: 11, height: 26 }}
            disabled={busy !== ''}
            onClick={() => setOpenTime(v => !v)}
          >
            Saat
          </button>
        </span>
      </div>
      {row.campaign_id && (
        <div style={{ fontSize: 11, textAlign: 'right' }}>
          <Link href={`/admin/iletisim/kampanyalar/${row.campaign_id}`} style={{ color: '#0262a7', fontWeight: 600 }}>
            Gönderim geçmişi
          </Link>
        </div>
      )}
      {openTime && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <input
            type="datetime-local"
            value={when}
            onChange={e => setWhen(e.target.value)}
            style={{ padding: '3px 6px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' }}
          />
          <button
            type="button"
            className="btn-modern btn-secondary"
            style={{ padding: '3px 8px', fontSize: 11, height: 26 }}
            disabled={busy !== ''}
            onClick={() => saveSchedule(false, '')}
          >
            Temizle
          </button>
          <button
            type="button"
            className="btn-modern btn-primary"
            style={{ padding: '3px 8px', fontSize: 11, height: 26 }}
            disabled={busy !== ''}
            onClick={() => saveSchedule(row.is_enabled, when)}
          >
            Kaydet
          </button>
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: '#b91c1c', textAlign: 'right' }}>{error}</div>}
      {pickerOpen && (
        <ExamPublishNotifyModal
          examId={examId}
          examName={examName}
          kind={row.kind}
          kindLabel={kindLabel}
          onClose={() => setPickerOpen(false)}
          onSent={async () => {
            try { onChanged(await examApi.publishDispatch(examId)); }
            catch { /* banner yenilenir */ }
          }}
        />
      )}
    </div>
  );
}

export default function ExamPublishBanner({
  examId,
  examName,
  refreshKey,
  onExamDatesChanged,
}: {
  examId: number;
  examName?: string;
  refreshKey?: string | number;
  onExamDatesChanged?: () => void;
}) {
  const [data, setData] = useState<ExamPublishStatus | null>(null);

  const load = useCallback(async () => {
    try { setData(await examApi.publishDispatch(examId)); }
    catch { setData(null); }
  }, [examId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (!data) return null;
  const rows = [
    data.karne
      ? { label: 'Karne PDF', kindLabel: 'Karne PDF', row: data.karne } : null,
    data.answer_key
      ? { label: 'Cevap PDF', kindLabel: 'Cevap anahtarı PDF', row: data.answer_key } : null,
  ].filter(Boolean) as { label: string; kindLabel: string; row: ExamPublishDispatch }[];
  if (!rows.length) return null;

  return (
    <div style={{
      marginTop: 12,
      paddingTop: 10,
      borderTop: '1px solid #eef2f7',
      display: 'grid',
      gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <div style={{ fontSize: 11, fontWeight: 650, color: '#94a3b8', letterSpacing: 0.3 }}>
          WHATSAPP YAYIN
        </div>
        <Link
          href="/admin/iletisim/bildirim-sablonlari?event=sinav.karne"
          style={{ fontSize: 11, color: '#0262a7', textDecoration: 'none', fontWeight: 600 }}
        >
          Şablon: Bildirim şablonları → Sınav
        </Link>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
        Gönder alıcı listesini açar; veli/öğrenci seçilir, öğrenciler çıkarılabilir.
        Zamanlı gönderim isteğe bağlıdır — açılmazsa saat dolsa bile otomatik gitmez.
        Sonuçlar İletişim → Gönderim Geçmişi’nde görünür.
      </p>
      {rows.map(item => (
        <Row
          key={item.row.kind}
          examId={examId}
          examName={examName || ''}
          label={item.label}
          kindLabel={item.kindLabel}
          row={item.row}
          onChanged={next => {
            setData(next);
            onExamDatesChanged?.();
          }}
        />
      ))}
    </div>
  );
}
