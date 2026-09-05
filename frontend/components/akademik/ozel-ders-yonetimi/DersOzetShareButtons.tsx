'use client';

import { useState } from 'react';
import {
  downloadDersOzetiPdf,
  previewDersOzetWhatsApp,
  sendDersOzetWhatsApp,
} from '@/lib/ozel-ders-api';
import { IconFileText, IconSend } from './icons';
import HaftalikProgramNotifyDrawer from './HaftalikProgramNotifyDrawer';

type Props = {
  ogrenciId: number;
  ogrenciAd?: string;
  startDate?: string;
  endDate?: string;
  onToast: (msg: string, tone?: 'success' | 'error') => void;
};

export default function DersOzetShareButtons({
  ogrenciId,
  ogrenciAd,
  startDate,
  endDate,
  onToast,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);

  async function onDownload() {
    setBusy(true);
    try {
      await downloadDersOzetiPdf(ogrenciId, startDate, endDate);
      onToast('Ders özeti PDF indirildi.', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'PDF indirilemedi', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="od-share-actions" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="od-btn od-btn-secondary od-btn-sm"
        onClick={() => void onDownload()}
        disabled={busy}
        title="Ders özetini PDF indir"
      >
        <IconFileText size={14} />
        {busy ? 'İndiriliyor…' : 'PDF indir'}
      </button>
      <button
        type="button"
        className="od-btn od-btn-primary od-btn-sm"
        onClick={() => setNotifyOpen(true)}
        disabled={busy}
        title="Ders özetini WhatsApp ile gönder"
      >
        <IconSend size={14} />
        WhatsApp
      </button>
      <HaftalikProgramNotifyDrawer
        open={notifyOpen}
        ogrenciId={ogrenciId}
        ogrenciAd={ogrenciAd}
        title="WhatsApp — Ders özeti"
        emptyMessage="Bu dönemde gönderilecek ders özeti yok."
        loadPreview={() => previewDersOzetWhatsApp(ogrenciId, startDate, endDate)}
        send={(opts) => sendDersOzetWhatsApp(ogrenciId, {
          ...opts,
          start_date: startDate,
          end_date: endDate,
        })}
        onClose={() => setNotifyOpen(false)}
        onToast={onToast}
      />
    </div>
  );
}
