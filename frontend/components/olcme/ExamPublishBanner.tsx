'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { examApi } from './api';
import s from '../../app/admin/olcme-degerlendirme/olcme.module.css';
import type { ExamPublishDispatch, ExamPublishStatus } from './types';
import ExamPublishNotifyModal from './ExamPublishNotifyModal';

function fmtWhen(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusLine(row: ExamPublishDispatch) {
  if (row.status === 'sent') {
    const when = fmtWhen(row.sent_at);
    return when ? `Gönderildi · ${row.sent_count} kişi · ${when}` : `Gönderildi · ${row.sent_count} kişi`;
  }
  if (row.status === 'overdue_unread') {
    return row.ready ? 'Saat geçti, henüz gitmedi' : 'Saat geçti, belge hazır değil';
  }
  if (row.is_enabled && row.scheduled_at) {
    return row.ready ? 'Saat gelince otomatik gidecek' : 'Planlı, belge henüz hazır değil';
  }
  if (row.scheduled_at) return 'Saat kayıtlı, otomatik gönderim kapalı';
  return 'Zamanlama yok. Gönder ile şimdi yollanır.';
}

function statusColor(row: ExamPublishDispatch) {
  if (row.status === 'sent') return '#15803d';
  if (row.status === 'overdue_unread') return '#b45309';
  if (row.is_enabled && row.scheduled_at) return '#0369a1';
  return '#64748b';
}

function Row({
  examId,
  examName,
  label,
  kindLabel,
  dateLabel,
  row,
  onChanged,
}: {
  examId: number;
  examName: string;
  label: string;
  kindLabel: string;
  dateLabel: string;
  row: ExamPublishDispatch;
  onChanged: (next: ExamPublishStatus) => void;
}) {
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [when, setWhen] = useState(toLocalInput(row.scheduled_at));
  const [auto, setAuto] = useState(row.is_enabled);
  const [error, setError] = useState('');

  useEffect(() => {
    setWhen(toLocalInput(row.scheduled_at));
    setAuto(row.is_enabled);
  }, [row.scheduled_at, row.is_enabled]);

  const saveSchedule = async (enabled: boolean, at: string) => {
    if (enabled && !at) {
      setError('Otomatik gönderim için tarih ve saat seçin.');
      return;
    }
    setBusy('schedule');
    setError('');
    try {
      onChanged(await examApi.publishReschedule(examId, row.kind, at || null, enabled));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally { setBusy(''); }
  };

  const clearSchedule = async () => {
    if (!confirm(`${label} zamanlaması silinsin mi? ${dateLabel} de boşalır. Gönderilmiş mesajlar silinmez.`)) return;
    await saveSchedule(false, '');
  };

  const sent = row.status === 'sent';

  return (
    <div className={s.publishCard}>
      <div className={s.publishCardTop}>
        <div style={{ minWidth: 0 }}>
          <div className={s.publishName}>{label}</div>
          <div className={s.publishWhen}>{fmtWhen(row.scheduled_at) || 'Saat yok'}</div>
          <div className={s.publishHint} style={{ color: statusColor(row) }}>{statusLine(row)}</div>
          {row.last_error && <div className={s.publishError}>{row.last_error}</div>}
          {row.campaign_id && (
            <div style={{ marginTop: 4 }}>
              <Link href={`/admin/iletisim/kampanyalar?campaign=${row.campaign_id}`} className={s.publishLink}>
                Gönderim geçmişi
              </Link>
            </div>
          )}
        </div>
        <div className={s.publishActions}>
          <button
            type="button"
            className={s.publishBtn}
            disabled={busy !== ''}
            onClick={() => { setEditing(v => !v); setError(''); }}
          >
            {editing ? 'Vazgeç' : 'Düzenle'}
          </button>
          {row.scheduled_at && (
            <button
              type="button"
              className={s.publishBtnDanger}
              disabled={busy !== ''}
              onClick={clearSchedule}
            >
              Sil
            </button>
          )}
          <button
            type="button"
            className="btn-modern btn-primary"
            style={{ padding: '5px 12px', fontSize: 12 }}
            disabled={busy !== ''}
            onClick={() => { setPickerOpen(true); setError(''); }}
          >
            Gönder
          </button>
        </div>
      </div>
      {editing && (
        <div className={s.publishEdit}>
          <input
            type="datetime-local"
            value={when}
            aria-label={`${label} tarih ve saat`}
            onChange={e => setWhen(e.target.value)}
          />
          <label className={s.checkRow} style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={auto && !sent}
              disabled={sent || busy !== ''}
              onChange={e => setAuto(e.target.checked)}
            />
            Saat gelince otomatik gönder
          </label>
          {sent && (
            <span className={s.publishHint} style={{ marginTop: 0 }}>
              Bu gönderim bitti. Yeni saat otomatik açılmaz.
            </span>
          )}
          <button
            type="button"
            className="btn-modern btn-primary"
            style={{ padding: '5px 12px', fontSize: 12 }}
            disabled={busy !== ''}
            onClick={() => saveSchedule(sent ? false : auto, when)}
          >
            {busy === 'schedule' ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      )}
      {error && <div className={s.publishError}>{error}</div>}
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
      ? { label: 'Karne PDF', kindLabel: 'Karne PDF', dateLabel: 'Sonuç yayın tarihi', row: data.karne } : null,
    data.answer_key
      ? { label: 'Cevap PDF', kindLabel: 'Cevap anahtarı PDF', dateLabel: 'Cevap anahtarı yayın tarihi', row: data.answer_key } : null,
  ].filter(Boolean) as { label: string; kindLabel: string; dateLabel: string; row: ExamPublishDispatch }[];
  if (!rows.length) return null;

  return (
    <div className={s.publishBlock}>
      <div className={s.publishHead}>
        <div className={s.publishTitle}>WhatsApp yayın</div>
        <Link href="/admin/iletisim/bildirim-sablonlari?event=sinav.karne" className={s.publishLink}>
          Şablon
        </Link>
      </div>
      <div className={s.publishList}>
        {rows.map(item => (
          <Row
            key={item.row.kind}
            examId={examId}
            examName={examName || ''}
            label={item.label}
            kindLabel={item.kindLabel}
            dateLabel={item.dateLabel}
            row={item.row}
            onChanged={next => {
              setData(next);
              onExamDatesChanged?.();
            }}
          />
        ))}
      </div>
    </div>
  );
}
