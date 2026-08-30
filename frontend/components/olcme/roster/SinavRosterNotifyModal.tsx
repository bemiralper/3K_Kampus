'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import WhatsAppPhonePreview from '@/components/communication/WhatsAppPhonePreview';
import '@/components/communication/communication.css';
import { examApi } from '../api';
import './sinav-roster-notify.css';

type Preview = Awaited<ReturnType<typeof examApi.hatirlatmaPreview>>;

type Props = {
  examId: number;
  examName: string;
  eventKey: 'sinav.hatirlatma' | 'sinav.yoklama';
  preview: Preview;
  onClose: () => void;
  onSent: (sent: number, errors: string[]) => void;
};

export default function SinavRosterNotifyModal({
  examId,
  examName,
  eventKey,
  preview,
  onClose,
  onSent,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [waVeli, setWaVeli] = useState<number[]>(() =>
    preview.students.flatMap(st =>
      st.recipients
        .filter(rec => rec.recipient_type === 'veli' && rec.veli_id && !rec.skip_reason)
        .map(rec => rec.veli_id as number),
    ),
  );
  const [waStudent, setWaStudent] = useState(true);
  const [previewRole, setPreviewRole] = useState<'veli' | 'ogrenci'>('veli');

  useEffect(() => { setMounted(true); }, []);

  const sendableVeli = waVeli.length;
  const sendable = sendableVeli + (waStudent ? preview.students.filter(st =>
    st.recipients.some(r => r.recipient_type === 'ogrenci' && !r.skip_reason),
  ).length : 0);

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const res = await examApi.hatirlatmaSend(examId, {
        participant_ids: preview.students.map(st => st.participant_id),
        veli_ids: waVeli,
        include_student: waStudent,
        event_key: eventKey,
      });
      if (!res.sent) {
        setError(res.errors[0] || 'Gönderilemedi. WhatsApp hattı veya şablon bağını kontrol edin.');
        return;
      }
      onSent(res.sent, res.errors || []);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gönderilemedi.');
    } finally {
      setSending(false);
    }
  };

  if (!mounted) return null;

  const title = preview.event_label
    || (eventKey === 'sinav.yoklama' ? 'Sınav yoklama bildirimi' : 'Sınav bilgilendirmesi');
  const copy = eventKey === 'sinav.yoklama'
    ? 'Yalnızca gelmedi işaretlenen öğrenci ve velisine katılmama mesajı gider.'
    : 'Salon, sıra, tarih ve saat öğrenci ile veliye yazılır. Metin Bildirim şablonlarından gelir.';

  return createPortal(
    <div className="srn-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="srn-modal" role="dialog" aria-modal="true" aria-labelledby="srn-title">
        <div className="srn-header">
          <div>
            <h3 id="srn-title">{title}</h3>
            <p>{copy}</p>
            {preview.binding_hint && <span className="srn-hint">{preview.binding_hint}</span>}
          </div>
          <button type="button" className="btn-modern btn-secondary" onClick={onClose}>Kapat</button>
        </div>

        {error && <div className="srn-error">{error}</div>}

        <div className="srn-body">
          <div className="srn-list">
            {preview.students.length === 0 && (
              <div style={{ padding: 24, color: '#64748b', fontSize: 13 }}>
                Gönderilecek katılımcı yok.
              </div>
            )}
            {preview.students.map(st => (
              <div key={st.participant_id} className="srn-row">
                <strong>{st.full_name}</strong>
                <span className="srn-meta">{st.salon_ad} · sıra {st.sira}</span>
                {st.recipients.filter(rec => rec.recipient_type === 'veli').map(rec => (
                  <label key={`${st.participant_id}-${rec.veli_id || 'none'}`} className="srn-rec">
                    <input
                      type="checkbox"
                      disabled={!rec.veli_id || !!rec.skip_reason}
                      checked={!!rec.veli_id && waVeli.includes(rec.veli_id)}
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
            ))}
            <label className="srn-rec" style={{ padding: '8px 22px 16px' }}>
              <input type="checkbox" checked={waStudent} onChange={e => setWaStudent(e.target.checked)} />
              Öğrenciye de gönder
            </label>
          </div>
          <div className="srn-preview">
            {preview.supports_ogrenci !== false && (
              <div className="srn-preview-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  className={previewRole === 'veli' ? 'srn-preview-tab is-active' : 'srn-preview-tab'}
                  aria-selected={previewRole === 'veli'}
                  onClick={() => setPreviewRole('veli')}
                >
                  Veli
                </button>
                <button
                  type="button"
                  role="tab"
                  className={previewRole === 'ogrenci' ? 'srn-preview-tab is-active' : 'srn-preview-tab'}
                  aria-selected={previewRole === 'ogrenci'}
                  onClick={() => setPreviewRole('ogrenci')}
                >
                  Öğrenci
                </button>
              </div>
            )}
            <WhatsAppPhonePreview
              text={
                previewRole === 'ogrenci'
                  ? (preview.preview_body_ogrenci || '')
                  : (preview.preview_body_veli || preview.preview_body || '')
              }
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
              disabled={sending || sendable === 0}
            >
              {sending ? 'Gönderiliyor…' : 'Gönder'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
