'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import WhatsAppPhonePreview from '@/components/communication/WhatsAppPhonePreview';
import '@/components/communication/communication.css';
import { fetchCampaign, isCampaignActive, type CampaignItem } from '@/lib/communication-api';
import { examApi } from './api';
import type { ExamPublishPreview, ExamRecipientOptions } from './types';
import './roster/sinav-roster-notify.css';

type Props = {
  examId: number;
  examName: string;
  kind: 'karne' | 'answer_key';
  kindLabel: string;
  initialSelection?: ExamRecipientOptions;
  onSelectionSave?: (options: ExamRecipientOptions) => void;
  onClose: () => void;
  onSent: (sent: number, campaignId?: string | null) => void;
};

export default function ExamPublishNotifyModal({
  examId,
  examName,
  kind,
  kindLabel,
  initialSelection,
  onSelectionSave,
  onClose,
  onSent,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ExamPublishPreview | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [excludedStudents, setExcludedStudents] = useState<Set<number>>(new Set(initialSelection?.excluded_student_ids || []));
  const [excludedVelis, setExcludedVelis] = useState<Set<number>>(new Set(initialSelection?.excluded_veli_ids || []));
  const [search, setSearch] = useState('');
  const [includeVeli, setIncludeVeli] = useState(initialSelection?.include_veli ?? true);
  const [includeStudent, setIncludeStudent] = useState(initialSelection?.include_student ?? true);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [live, setLive] = useState<CampaignItem | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await examApi.publishPreview(examId, kind);
        if (!cancelled) {
          setPreview(data);
          setExcluded(new Set());
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Alıcı listesi yüklenemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [examId, kind]);

  useEffect(() => {
    if (!campaignId) return;
    let stop = false;
    const tick = async () => {
      try {
        const row = await fetchCampaign(campaignId);
        if (!stop) setLive(row);
        return isCampaignActive(row.status);
      } catch {
        return true;
      }
    };
    let timer = 0;
    tick().then((again) => {
      if (stop || !again) return;
      timer = window.setInterval(async () => {
        const again = await tick();
        if (!again) window.clearInterval(timer);
      }, 2000);
    });
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [campaignId]);

  const selectedStudents = useMemo(() => {
    if (!preview) return [];
    return preview.students.filter(st => !excluded.has(rowKey(st.answer_id, st.student_id)));
  }, [preview, excluded]);

  const selectedVeliIds = useMemo(() => {
    if (!includeVeli) return [];

    const ids: number[] = [];
    for (const st of selectedStudents) {
      for (const rec of st.recipients) {
        if (rec.recipient_type === 'veli' && rec.veli_id && !rec.skip_reason && !excludedVelis.has(rec.veli_id)) {
          ids.push(rec.veli_id);
        }
      }
    }
    return ids;
  }, [selectedStudents, includeVeli, excludedVelis]);

  const sendable = selectedVeliIds.length + (
    includeStudent
      ? selectedStudents.filter(st =>
          !excludedStudents.has(st.student_id || 0) && st.recipients.some(r => r.recipient_type === 'ogrenci' && !r.skip_reason),
        ).length
      : 0
  );

  const toggleStudent = (key: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selection = (): ExamRecipientOptions => {
    const students = new Set(excludedStudents);
    const velis = new Set(excludedVelis);
    for (const st of preview?.students || []) {
      if (!excluded.has(rowKey(st.answer_id, st.student_id))) continue;
      if (st.student_id) students.add(st.student_id);
      for (const rec of st.recipients) if (rec.veli_id) velis.add(rec.veli_id);
    }
    return { include_veli: includeVeli, include_student: includeStudent,
      excluded_student_ids: [...students], excluded_veli_ids: [...velis] };
  };

  const toggleRecipient = (id: number, type: string) => {
    const setter = type === 'veli' ? setExcludedVelis : setExcludedStudents;
    setter(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const send = async () => {
    if (!preview || (!includeVeli && !includeStudent) || sendable === 0) return;
    setSending(true);
    setError('');
    try {
      const res = await examApi.publishSendNow(examId, kind, {
        ...selection(),
        veli_ids: includeVeli ? selectedVeliIds : [],
        student_ids: selectedStudents
          .map(st => st.student_id)
          .filter((id): id is number => typeof id === 'number'),
        answer_ids: selectedStudents
          .map(st => st.answer_id)
          .filter((id): id is number => typeof id === 'number'),
      });
      if (!res.ok && res.error) {
        setError(res.error);
        return;
      }
      if (!res.sent) {
        setError(res.errors?.[0] || 'Gönderilemedi. WhatsApp hattı veya şablon bağını kontrol edin.');
        return;
      }
      setSentCount(res.sent);
      setCampaignId(res.campaign_id || null);
      onSent(res.sent, res.campaign_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  if (!mounted) return null;

  const copy = kind === 'karne'
    ? 'Okunan öğrencilerin karne PDF’i seçilen veli ve öğrenciye gider. Listeden çıkarabilirsiniz.'
    : 'Sınava giren öğrencilerin cevap anahtarı PDF’i seçilen veli ve öğrenciye gider. Listeden çıkarabilirsiniz.';

  return createPortal(
    <div className="srn-overlay" onClick={e => { if (e.target === e.currentTarget && !sending) onClose(); }}>
      <div className="srn-modal" role="dialog" aria-modal="true" aria-labelledby="epn-title">
        <div className="srn-header">
          <div>
            <h3 id="epn-title">{kindLabel} — {onSelectionSave ? 'Alıcı seçimi' : 'WhatsApp gönder'}</h3>
            <p>{onSelectionSave ? 'Zamanı geldiğinde uygun alıcılara gönderilir. İşareti kaldırılan kişiler bu gönderimden hariç tutulur.' : copy}</p>
          </div>
          <button type="button" className="btn-modern btn-secondary" onClick={onClose} disabled={sending}>
            Kapat
          </button>
        </div>

        {error && <div className="srn-error">{error}</div>}

        {campaignId ? (
          <div className="srn-result">
            <SendProgress
              queued={sentCount}
              total={live?.total_recipients ?? sentCount}
              sent={live?.sent_count ?? 0}
              delivered={live?.delivered_count ?? 0}
              failed={live?.failed_count ?? 0}
              active={!live || isCampaignActive(live.status)}
            />
            <p>
              Çubuk dolunca gönderim bitti sayılır. Gitmeyenler İletişim → Gönderim Geçmişi’nde tek düğmeyle yeniden gönderilir.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link
                href={`/admin/iletisim/kampanyalar?campaign=${campaignId}`}
                className="btn-modern btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Gönderim detayı
              </Link>
              <button type="button" className="btn-modern btn-secondary" onClick={onClose}>
                Kapat
              </button>
            </div>
          </div>
        ) : loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Alıcılar yükleniyor…</div>
        ) : (
          <>
            <div className="epn-controls">
              <div className="epn-modes" role="group" aria-label="Alıcı türü">
                {[
                  { label: 'Öğrenci', student: true, veli: false },
                  { label: 'Veli', student: false, veli: true },
                  { label: 'Her ikisi', student: true, veli: true },
                ].map(mode => <button key={mode.label} type="button"
                  aria-pressed={includeStudent === mode.student && includeVeli === mode.veli}
                  disabled={sending}
                  onClick={() => { setIncludeStudent(mode.student); setIncludeVeli(mode.veli); }}>
                  {mode.label}
                </button>)}
              </div>
              <input type="search" placeholder="Öğrenci veya veli ara…" aria-label="Alıcılarda ara"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className={onSelectionSave ? 'srn-body epn-selection-body' : 'srn-body'}>
              <div className="srn-list">
                {preview?.students.length === 0 && (
                  <div style={{ padding: 24, color: '#64748b', fontSize: 13 }}>
                    {onSelectionSave
                      ? 'Şu anda listelenecek alıcı yok. Gönderim saatinde uygun olan alıcılar, seçtiğiniz türe göre belirlenir.'
                      : 'Gönderilecek öğrenci yok.'}
                  </div>
                )}
                {preview?.students.filter(st => !search || `${st.full_name} ${st.recipients.map(r => r.display_name).join(' ')}`.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))).map(st => {
                  const key = rowKey(st.answer_id, st.student_id);
                  const blocked = st.recipients.every(r => r.skip_reason);
                  const checked = !blocked && !excluded.has(key);
                  return (
                    <div key={key} className="srn-row">
                      <label className="srn-rec" style={{ padding: 0 }}>
                        <input
                          type="checkbox"
                          disabled={blocked || sending}
                          checked={checked}
                          onChange={() => toggleStudent(key)}
                        />
                        <strong>{st.full_name}</strong><small className="epn-family-hint">Grubu dahil et</small>
                      </label>
                      {st.recipients.map((rec, index) => {
                        const isVeli = rec.recipient_type === 'veli';
                        const id = isVeli ? rec.veli_id : st.student_id;
                        const included = isVeli ? includeVeli : includeStudent;
                        const removed = isVeli ? excludedVelis : excludedStudents;
                        return <label key={`${key}-${rec.recipient_type}-${id}-${index}`} className="srn-rec">
                          <input type="checkbox"
                            disabled={!id || !!rec.skip_reason || sending || !checked || !included}
                            checked={!!id && included && checked && !rec.skip_reason && !removed.has(id)}
                            onChange={() => { if (id) toggleRecipient(id, rec.recipient_type); }} />
                          <span><b>{isVeli ? 'Veli' : 'Öğrenci'}</b> · {rec.display_name || st.full_name}
                            {rec.telefon && ` (${rec.telefon})`}
                            {rec.skip_reason && <em> — {rec.skip_reason}</em>}
                          </span>
                        </label>;
                      })}
                    </div>
                  );
                })}
              </div>
              {!onSelectionSave && <div className="srn-preview">
                <WhatsAppPhonePreview
                  text={preview?.preview_body || ''}
                  resolveVariables={false}
                  kurumName={examName}
                />
              </div>}
            </div>
            <div className="srn-footer">
              <div className="srn-footer-status">
                <span className="srn-meta">{sendable} alıcı seçili{onSelectionSave && ' · güncel liste'}</span>
                {sending && <SendProgress queued={sendable} total={sendable} sent={0} delivered={0} failed={0} active />}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-modern btn-secondary" onClick={onClose} disabled={sending}>
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="btn-modern btn-primary"
                  onClick={onSelectionSave ? () => { onSelectionSave(selection()); onClose(); } : send}
                  disabled={sending || (!onSelectionSave && sendable === 0) || (!includeVeli && !includeStudent)}
                >
                  {onSelectionSave ? 'Seçimi uygula' : sending ? 'Gönderiliyor…' : `${sendable} alıcıya gönder`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function SendProgress({
  queued, total, sent, delivered, failed, active,
}: {
  queued: number;
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  active: boolean;
}) {
  const done = Math.min(total || queued || 1, sent + failed);
  const base = Math.max(total || queued || 1, 1);
  const pct = active && done === 0 ? 8 : Math.round((done / base) * 100);
  return (
    <div className="srn-progress" aria-live="polite">
      <div className="srn-progress-top">
        <strong>{active ? 'Gönderiliyor' : (failed ? 'Kısmen gitti' : 'Gönderim bitti')}</strong>
        <span>{done}/{base}</span>
      </div>
      <div className="srn-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="srn-progress-meta">
        <span>Kuyruk {queued}</span>
        <span>İletildi {delivered}</span>
        <span>Gitmedi {failed}</span>
      </div>
    </div>
  );
}

function rowKey(answerId: number | null, studentId: number | null) {
  return `${answerId ?? 'a'}:${studentId ?? 's'}`;
}
