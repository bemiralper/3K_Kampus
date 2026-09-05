'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  previewHaftalikProgramWhatsApp,
  sendHaftalikProgramWhatsApp,
  type HaftalikProgramPreview,
  type HaftalikProgramRecipient,
  type HaftalikProgramSendResult,
} from '@/lib/ozel-ders-api';
import { Drawer } from './ozelDersUi';

function recipientKey(r: HaftalikProgramRecipient): string {
  if (r.recipient_type === 'ogrenci') return `ogrenci:${r.ogrenci_id}`;
  return `veli:${r.ogrenci_id}:${r.veli_id ?? 'none'}`;
}

function metaStatusLabel(status: string): string {
  const map: Record<string, string> = {
    APPROVED: 'Onaylı',
    DRAFT: 'Taslak',
    PENDING: 'Onay bekliyor',
    REJECTED: 'Reddedildi',
  };
  return map[status] || status || 'Yok';
}

type Props = {
  open: boolean;
  ogrenciId: number;
  ogrenciAd?: string;
  title?: string;
  emptyMessage?: string;
  loadPreview?: () => Promise<HaftalikProgramPreview>;
  send?: (opts: {
    veli_ids: number[];
    include_student: boolean;
  }) => Promise<HaftalikProgramSendResult>;
  onClose: () => void;
  onToast: (msg: string, tone?: 'success' | 'error') => void;
};

export default function HaftalikProgramNotifyDrawer({
  open,
  ogrenciId,
  ogrenciAd,
  title = 'WhatsApp — Haftalık program',
  emptyMessage = 'Aktif haftalık şablon yok — önce ders ekleyin.',
  loadPreview,
  send,
  onClose,
  onToast,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<HaftalikProgramPreview | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [activeBodyKey, setActiveBodyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setPreview(null);
    (loadPreview || (() => previewHaftalikProgramWhatsApp(ogrenciId)))()
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        const initial = new Set<string>();
        for (const r of data.recipients || []) {
          if (r.skip_reason) initial.add(recipientKey(r));
        }
        setExcluded(initial);
        const first = (data.recipients || []).find((r) => r.body);
        setActiveBodyKey(first ? recipientKey(first) : null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Önizleme yüklenemedi');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, ogrenciId]);

  const recipients = preview?.recipients || [];
  const sendable = useMemo(
    () => recipients.filter((r) => !r.skip_reason && !excluded.has(recipientKey(r))),
    [recipients, excluded],
  );

  const toggle = useCallback((r: HaftalikProgramRecipient) => {
    if (r.skip_reason) return;
    const key = recipientKey(r);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  async function handleSend() {
    if (sendable.length === 0) return;
    setSending(true);
    setError('');
    try {
      const veliIds = sendable
        .filter((r) => r.recipient_type === 'veli' && r.veli_id)
        .map((r) => r.veli_id as number);
      const includeStudent = sendable.some((r) => r.recipient_type === 'ogrenci');
      const sender = send || ((opts) => sendHaftalikProgramWhatsApp(ogrenciId, opts));
      const res = await sender({
        veli_ids: veliIds,
        include_student: includeStudent,
      });
      const parts = [];
      if (res.veli_sent) parts.push(`${res.veli_sent} veli`);
      if (res.ogrenci_sent) parts.push(`${res.ogrenci_sent} öğrenci`);
      onToast(`WhatsApp kuyruğa alındı (${parts.join(', ') || 'gönderildi'}).`, 'success');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setSending(false);
    }
  }

  const active = recipients.find((r) => recipientKey(r) === activeBodyKey) || sendable[0] || recipients[0];
  const tplVeli = preview?.templates.veli;
  const tplOgrenci = preview?.templates.ogrenci;
  const metaReady = Boolean(tplVeli?.meta_usable || tplOgrenci?.meta_usable);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      wide
      title={title}
      description={
        preview
          ? `${preview.ogrenci_ad || ogrenciAd || 'Öğrenci'} · ${sendable.length} alıcı seçili`
          : ogrenciAd || 'Öğrenci'
      }
      footer={
        <div className="od-notify-footer">
          <button type="button" className="od-btn od-btn-secondary" onClick={onClose} disabled={sending}>
            İptal
          </button>
          <button
            type="button"
            className="od-btn od-btn-primary"
            onClick={() => void handleSend()}
            disabled={sending || loading || sendable.length === 0}
          >
            {sending ? 'Gönderiliyor…' : `${sendable.length} kişiye gönder`}
          </button>
        </div>
      }
    >
      {loading ? (
        <p className="od-cell-muted">Alıcılar yükleniyor…</p>
      ) : error && !preview ? (
        <div className="od-banner-error">{error}</div>
      ) : preview ? (
        <>
          {error && <div className="od-banner-error">{error}</div>}
          {preview.slot_count === 0 && (
            <div className="od-banner-error">{emptyMessage}</div>
          )}

          <div className={`od-notify-template${metaReady ? ' is-ready' : ''}`}>
            <strong>{preview.event_label}</strong>
            {metaReady ? (
              <p>
                Onaylı Meta DOCUMENT şablonu bağlı. WhatsApp’ta metin ve PDF aynı mesajda gider.
                {tplVeli?.meta_name ? ` Veli: ${tplVeli.meta_name} (${metaStatusLabel(tplVeli.meta_status)}).` : ''}
                {tplOgrenci?.meta_name
                  ? ` Öğrenci: ${tplOgrenci.meta_name} (${metaStatusLabel(tplOgrenci.meta_status)}).`
                  : ''}
              </p>
            ) : (
              <p>
                Uygulama şablon metni hazır. Meta DOCUMENT şablonu henüz onaylı değilse mesaj 24 saatlik
                sohbet penceresinde serbest metin + PDF olarak gider.
                {tplVeli?.meta_name
                  ? ` Veli Meta: ${tplVeli.meta_name} (${metaStatusLabel(tplVeli.meta_status)}).`
                  : ' Veli Meta şablonu yok.'}
                {tplOgrenci?.meta_name
                  ? ` Öğrenci Meta: ${tplOgrenci.meta_name} (${metaStatusLabel(tplOgrenci.meta_status)}).`
                  : ' Öğrenci Meta şablonu yok.'}
              </p>
            )}
          </div>

          <div className="od-notify-split">
            <div>
              <h4 className="od-notify-h">Alıcılar</h4>
              <p className="od-cell-muted" style={{ margin: '0 0 8px' }}>
                Göndermek istemediğiniz kişiyi işaretini kaldırın.
              </p>
              {recipients.map((r) => {
                const key = recipientKey(r);
                const blocked = Boolean(r.skip_reason);
                const checked = !blocked && !excluded.has(key);
                const typeLabel = r.recipient_type === 'ogrenci' ? 'Öğrenci' : 'Veli';
                return (
                  <label
                    key={key}
                    className={`od-notify-row${blocked ? ' is-blocked' : ''}${checked ? ' is-checked' : ''}${
                      activeBodyKey === key ? ' is-active' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={blocked || sending}
                      onChange={() => toggle(r)}
                    />
                    <button
                      type="button"
                      className="od-notify-row-main"
                      onClick={() => setActiveBodyKey(key)}
                    >
                      <span className="od-notify-name">
                        {r.display_name || typeLabel}
                        <span className="od-notify-type">{typeLabel}</span>
                      </span>
                      <span className="od-notify-phone">{r.telefon || '—'}</span>
                      {r.skip_reason && <span className="od-notify-skip">{r.skip_reason}</span>}
                    </button>
                  </label>
                );
              })}
            </div>
            <div>
              <h4 className="od-notify-h">Mesaj önizlemesi</h4>
              {active?.body ? (
                <pre className="od-notify-body">{active.body}</pre>
              ) : (
                <p className="od-cell-muted">Seçili alıcı için mesaj yok.</p>
              )}
              <p className="od-cell-muted" style={{ marginTop: 8 }}>
                PDF eki: {preview.pdf_baslik}
              </p>
            </div>
          </div>
        </>
      ) : null}
    </Drawer>
  );
}
