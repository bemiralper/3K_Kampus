'use client';

import { useState } from 'react';
import { downloadHaftalikProgramPdf } from '@/lib/ozel-ders-api';
import { IconFileText, IconSend } from './icons';
import HaftalikProgramNotifyDrawer from './HaftalikProgramNotifyDrawer';

type Props = {
  ogrenciId: number;
  ogrenciAd?: string;
  compact?: boolean;
  onToast: (msg: string, tone?: 'success' | 'error') => void;
  onClick?: (e: React.MouseEvent) => void;
};

export default function HaftalikProgramShareButtons({
  ogrenciId,
  ogrenciAd,
  compact,
  onToast,
  onClick,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);

  async function onDownload(e: React.MouseEvent) {
    onClick?.(e);
    e.stopPropagation();
    setBusy(true);
    try {
      await downloadHaftalikProgramPdf(ogrenciId);
      onToast('Haftalık program PDF indirildi.', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'PDF indirilemedi', 'error');
    } finally {
      setBusy(false);
    }
  }

  function onSend(e: React.MouseEvent) {
    onClick?.(e);
    e.stopPropagation();
    setNotifyOpen(true);
  }

  return (
    <div className="od-share-actions" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`od-btn od-btn-secondary ${compact ? 'od-btn-icon' : 'od-btn-sm'}`}
        onClick={onDownload}
        disabled={busy}
        title="Haftalık programı PDF indir"
      >
        <IconFileText size={14} />
        {!compact && (busy ? 'İndiriliyor…' : 'PDF indir')}
      </button>
      <button
        type="button"
        className={`od-btn od-btn-primary ${compact ? 'od-btn-icon' : 'od-btn-sm'}`}
        onClick={onSend}
        disabled={busy}
        title="Haftalık programı WhatsApp ile gönder"
      >
        <IconSend size={14} />
        {!compact && 'WhatsApp'}
      </button>
      <HaftalikProgramNotifyDrawer
        open={notifyOpen}
        ogrenciId={ogrenciId}
        ogrenciAd={ogrenciAd}
        onClose={() => setNotifyOpen(false)}
        onToast={onToast}
      />
    </div>
  );
}
