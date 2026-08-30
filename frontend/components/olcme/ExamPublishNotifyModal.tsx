'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import WhatsAppPhonePreview from '@/components/communication/WhatsAppPhonePreview';
import '@/components/communication/communication.css';
import { examApi } from './api';
import type { ExamPublishPreview } from './types';
import './roster/sinav-roster-notify.css';

type Props = {
  examId: number;
  examName: string;
  kind: 'karne' | 'answer_key';
  kindLabel: string;
  onClose: () => void;
  onSent: (sent: number, campaignId?: string | null) => void;
};

export default function ExamPublishNotifyModal({
  examId,
  examName,
  kind,
  kindLabel,
  onClose,
  onSent,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ExamPublishPreview | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [waVeli, setWaVeli] = useState<number[]>([]);
  const [includeVeli, setIncludeVeli] = useState(true);
  const [includeStudent, setIncludeStudent] = useState(true);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);

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
          const next = new Set<string>();
          const velis: number[] = [];
          for (const st of data.students) {
            const key = rowKey(st.answer_id, st.student_id);
            if (st.recipients.every(r => r.skip_reason)) next.add(key);
            for (const rec of st.recipients) {
              if (rec.recipient_type === 'veli' && rec.veli_id && !rec.skip_reason) {
                velis.push(rec.veli_id);
              }
            }
          }
          setExcluded(next);
          setWaVeli(velis);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Alıcı listesi yüklenemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [examId, kind]);

  const selectedStudents = useMemo(() => {
    if (!preview) return [];
    return preview.students.filter(st => !excluded.has(rowKey(st.answer_id, st.student_id)));
  }, [preview, excluded]);

  const selectedVeliIds = useMemo(() => {
    if (!includeVeli) return [];
    const allowed = new Set(waVeli);
    const ids: number[] = [];
    for (const st of selectedStudents) {
      for (const rec of st.recipients) {
        if (rec.recipient_type === 'veli' && rec.veli_id && !rec.skip_reason && allowed.has(rec.veli_id)) {
          ids.push(rec.veli_id);
        }
      }
    }
    return ids;
  }, [selectedStudents, includeVeli, waVeli]);

  const sendable = selectedVeliIds.length + (
    includeStudent
      ? selectedStudents.filter(st =>
          st.recipients.some(r => r.recipient_type === 'ogrenci' && !r.skip_reason),
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

  const send = async () => {
    if (!preview || (!includeVeli && !includeStudent) || sendable === 0) return;
    setSending(true);
    setError('');
    try {
      const res = await examApi.publishSendNow(examId, kind, {
        include_veli: includeVeli,
        include_student: includeStudent,
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
            <h3 id="epn-title">{kindLabel} — WhatsApp gönder</h3>
            <p>{copy}</p>
          </div>
          <button type="button" className="btn-modern btn-secondary" onClick={onClose} disabled={sending}>
            Kapat
          </button>
        </div>

        {error && <div className="srn-error">{error}</div>}

        {campaignId ? (
          <div style={{ padding: 24 }}>
            <div style={{ color: '#15803d', fontSize: 14, fontWeight: 650, marginBottom: 8 }}>
              {sentCount} mesaj kuyruğa alındı.
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
              Kime gittiğini / gitmediğini İletişim → Gönderim Geçmişi sayfasından görebilirsiniz.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link
                href={`/admin/iletisim/kampanyalar/${campaignId}`}
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
            <div className="srn-body">
              <div className="srn-list">
                {preview?.students.length === 0 && (
                  <div style={{ padding: 24, color: '#64748b', fontSize: 13 }}>
                    Gönderilecek öğrenci yok.
                  </div>
                )}
                {preview?.students.map(st => {
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
                        <strong>{st.full_name}</strong>
                      </label>
                      {st.recipients.filter(rec => rec.recipient_type === 'veli').map(rec => (
                        <label key={`${key}-${rec.veli_id || 'none'}`} className="srn-rec">
                          <input
                            type="checkbox"
                            disabled={!rec.veli_id || !!rec.skip_reason || sending || !checked || !includeVeli}
                            checked={!!rec.veli_id && includeVeli && waVeli.includes(rec.veli_id)}
                            onChange={() => {
                              if (!rec.veli_id) return;
                              setWaVeli(p => (
                                p.includes(rec.veli_id!)
                                  ? p.filter(x => x !== rec.veli_id)
                                  : [...p, rec.veli_id!]
                              ));
                            }}
                          />
                          <span>
                            {rec.display_name || 'Veli'} {rec.telefon && `(${rec.telefon})`}
                            {rec.skip_reason && <em> — {rec.skip_reason}</em>}
                          </span>
                        </label>
                      ))}
                    </div>
                  );
                })}
                <label className="srn-rec" style={{ padding: '8px 22px 4px' }}>
                  <input
                    type="checkbox"
                    checked={includeVeli}
                    onChange={e => setIncludeVeli(e.target.checked)}
                    disabled={sending}
                  />
                  Velilere gönder
                </label>
                <label className="srn-rec" style={{ padding: '4px 22px 16px' }}>
                  <input
                    type="checkbox"
                    checked={includeStudent}
                    onChange={e => setIncludeStudent(e.target.checked)}
                    disabled={sending}
                  />
                  Öğrencilere gönder
                </label>
              </div>
              <div className="srn-preview">
                <WhatsAppPhonePreview
                  text={preview?.preview_body || ''}
                  resolveVariables={false}
                  kurumName={examName}
                />
              </div>
            </div>
            <div className="srn-footer">
              <span className="srn-meta">{sendable} alıcı seçili</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-modern btn-secondary" onClick={onClose} disabled={sending}>
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="btn-modern btn-primary"
                  onClick={send}
                  disabled={sending || sendable === 0 || (!includeVeli && !includeStudent)}
                >
                  {sending ? 'Gönderiliyor…' : `${sendable} alıcıya gönder`}
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

function rowKey(answerId: number | null, studentId: number | null) {
  return `${answerId ?? 'a'}:${studentId ?? 's'}`;
}
