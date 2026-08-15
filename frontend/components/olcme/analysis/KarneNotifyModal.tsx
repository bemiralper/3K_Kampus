'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  analysisApi,
  type KarneNotifyRecipient,
} from '../api';

interface KarneNotifyModalProps {
  examId: number;
  answerId: number;
  studentName?: string;
  rankingYear?: number;
  onClose: () => void;
  onSent?: (sent: number) => void;
}

function recipientKey(r: KarneNotifyRecipient): string {
  if (r.recipient_type === 'ogrenci') return `ogrenci:${r.ogrenci_id}`;
  return `veli:${r.ogrenci_id}:${r.veli_id}`;
}

export default function KarneNotifyModal({
  examId,
  answerId,
  studentName,
  rankingYear,
  onClose,
  onSent,
}: KarneNotifyModalProps) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [examName, setExamName] = useState('');
  const [sendMode, setSendMode] = useState<'document' | 'meta_template'>('document');
  const [metaTplVeli, setMetaTplVeli] = useState('');
  const [metaTplOgrenci, setMetaTplOgrenci] = useState('');
  const [recipients, setRecipients] = useState<KarneNotifyRecipient[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await analysisApi.karneNotifyPreview(examId, answerId, rankingYear);
        if (!res.success || !res.data) {
          throw new Error(res.error || 'Önizleme yüklenemedi');
        }
        if (!cancelled) {
          setExamName(res.data.exam_name || '');
          setSendMode(res.data.send_mode === 'meta_template' ? 'meta_template' : 'document');
          setMetaTplVeli(res.data.meta_template_veli || '');
          setMetaTplOgrenci(res.data.meta_template_ogrenci || '');
          setRecipients(res.data.recipients || []);
          const initialExcluded = new Set<string>();
          for (const r of res.data.recipients || []) {
            if (r.skip_reason) initialExcluded.add(recipientKey(r));
          }
          setExcluded(initialExcluded);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Hata');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [examId, answerId, rankingYear]);

  const sendable = useMemo(
    () => recipients.filter((r) => {
      if (r.skip_reason) return false;
      return !excluded.has(recipientKey(r));
    }),
    [recipients, excluded],
  );

  const toggle = useCallback((r: KarneNotifyRecipient) => {
    const key = recipientKey(r);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSend = async () => {
    if (sendable.length === 0) return;
    setSending(true);
    setError('');
    setSuccessMsg('');
    try {
      const veliIds = sendable
        .filter((r) => r.recipient_type === 'veli' && r.veli_id)
        .map((r) => r.veli_id as number);
      const includeStudent = sendable.some((r) => r.recipient_type === 'ogrenci');
      const res = await analysisApi.karneNotifySend(
        examId,
        answerId,
        { veli_ids: veliIds, include_student: includeStudent },
        rankingYear,
      );
      if (!res.success) {
        throw new Error(res.error || 'Gönderim başarısız');
      }
      const sentCount = res.data?.sent ?? 0;
      const extraErrors = res.data?.errors ?? [];
      if (sentCount === 0) {
        throw new Error(extraErrors[0] || 'Hiçbir alıcıya gönderilemedi.');
      }
      onSent?.(sentCount);
      const targets = (res.data?.sent_details || [])
        .map((d) => `${d.display_name} (${d.telefon})`)
        .join(' · ');
      setSuccessMsg(
        targets
          ? `${sentCount} kişiye WhatsApp ile gönderildi: ${targets}.`
          : `${sentCount} kişiye WhatsApp ile gönderildi.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gönderim hatası');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 3100,
        background: 'rgba(15,23,42,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640,
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              WhatsApp — Sınav karnesi
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
              {studentName || 'Öğrenci'}
              {examName ? ` · ${examName}` : ''}
              {' · '}
              {sendable.length} alıcı seçili
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            style={{
              border: 'none', background: 'transparent', fontSize: 20,
              cursor: 'pointer', color: '#64748b',
            }}
          >
            ×
          </button>
        </div>

        {!loading && sendMode === 'meta_template' && (
          <div style={{
            margin: '12px 20px 0', padding: '10px 12px', borderRadius: 10,
            background: '#ecfdf5', border: '1px solid #a7f3d0',
            fontSize: 12, color: '#065f46', lineHeight: 1.45,
          }}>
            Meta Document şablonu ile gönderilecek — veli/öğrenci WhatsApp’ta metin ve PDF’yi aynı mesajda görür.
            {(metaTplVeli || metaTplOgrenci) && (
              <div style={{ marginTop: 4, opacity: 0.9 }}>
                {metaTplVeli ? `Veli: ${metaTplVeli}` : null}
                {metaTplVeli && metaTplOgrenci ? ' · ' : null}
                {metaTplOgrenci ? `Öğrenci: ${metaTplOgrenci}` : null}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            Alıcılar yükleniyor…
          </div>
        ) : successMsg ? (
          <div style={{ padding: 24 }}>
            <div style={{ color: '#059669', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              {successMsg}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: '#059669', color: '#fff', cursor: 'pointer',
              }}
            >
              Kapat
            </button>
          </div>
        ) : error ? (
          <div style={{ padding: 24 }}>
            <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>
            <button
              type="button"
              onClick={() => setError('')}
              style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                background: '#fff', cursor: 'pointer',
              }}
            >
              Geri dön
            </button>
          </div>
        ) : (
          <>
            <div style={{ overflowY: 'auto', padding: '12px 16px', flex: 1 }}>
              {recipients.map((r) => {
                const key = recipientKey(r);
                const blocked = Boolean(r.skip_reason);
                const checked = !blocked && !excluded.has(key);
                const typeLabel = r.recipient_type === 'ogrenci' ? 'Öğrenci' : 'Veli';
                return (
                  <label
                    key={key}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '10px 12px', borderRadius: 10, marginBottom: 8,
                      border: '1px solid #e2e8f0',
                      background: blocked ? '#f8fafc' : checked ? '#f0f9ff' : '#fff',
                      opacity: blocked ? 0.7 : 1,
                      cursor: blocked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={blocked || sending}
                      onChange={() => toggle(r)}
                      style={{ marginTop: 3 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                        {r.display_name || typeLabel}
                        <span style={{
                          marginLeft: 8, fontSize: 11, fontWeight: 500, color: '#64748b',
                        }}>
                          {typeLabel}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {r.telefon || '—'}
                      </div>
                      {r.skip_reason && (
                        <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
                          {r.skip_reason}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            <div style={{
              padding: '12px 16px', borderTop: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                  background: '#fff', cursor: 'pointer',
                }}
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || sendable.length === 0}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  background: sending || sendable.length === 0 ? '#93c5fd' : '#0061a6',
                  color: '#fff', fontWeight: 600,
                  cursor: sending || sendable.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {sending ? 'Gönderiliyor…' : `${sendable.length} kişiye gönder`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
