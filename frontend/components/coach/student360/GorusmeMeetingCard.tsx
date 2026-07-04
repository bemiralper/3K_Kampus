'use client';

import type { KeyboardEvent } from 'react';
import type { GorusmeKaydiListItem } from '@/app/admin/coaching/meetings/types';
import {
  fmtGorusmeDate,
  fmtGorusmeTime,
  gorusmeDurumBadgeClass,
  gorusmeDurumLabel,
  gorusmeYontemMeta,
} from './gorusme-meeting-utils';

interface GorusmeMeetingCardProps {
  meeting: GorusmeKaydiListItem;
  variant: 'veli' | 'full';
  clickable?: boolean;
  showHint?: boolean;
  onClick?: () => void;
}

export default function GorusmeMeetingCard({
  meeting,
  variant,
  clickable = false,
  showHint = false,
  onClick,
}: GorusmeMeetingCardProps) {
  const yontem = gorusmeYontemMeta(meeting.yontem);
  const timeStr = fmtGorusmeTime(meeting.gorusme_saati);

  const classNames = [
    'coach-gorusme-card',
    yontem.stripeClass,
    clickable ? 'coach-list-card-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!clickable || !onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <article
      className={classNames}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? handleKeyDown : undefined}
    >
      <div className="coach-gorusme-card-header">
        <span className={`coach-gorusme-yontem-chip ${yontem.chipClass}`}>
          <span className="coach-gorusme-yontem-icon">{yontem.icon}</span>
          {meeting.yontem_display}
        </span>
        <span className={`coach-badge ${gorusmeDurumBadgeClass(meeting.durum)}`}>
          {gorusmeDurumLabel(meeting.durum, meeting.durum_display)}
        </span>
      </div>

      <h3 className="coach-gorusme-card-title">{meeting.konu}</h3>

      <div className="coach-gorusme-card-meta">
        <span>{fmtGorusmeDate(meeting.gorusme_tarihi)}</span>
        {timeStr && <span> · {timeStr}</span>}
        {variant === 'full' && (
          <>
            <span> · {meeting.gorusme_turu_display}</span>
          </>
        )}
      </div>

      {variant === 'full' && (
        <>
          <div className="coach-gorusme-card-sub">
            {meeting.yontem_display} · {meeting.koc_adi}
          </div>
          {meeting.aksiyon_sayisi > 0 && (
            <div className="coach-gorusme-card-sub">
              {meeting.tamamlanan_aksiyon}/{meeting.aksiyon_sayisi} aksiyon tamamlandı
            </div>
          )}
        </>
      )}

      {showHint && (
        <div className="coach-list-card-hint">
          {variant === 'veli' ? 'Detay için dokunun →' : 'Detay ve durum için dokunun →'}
        </div>
      )}
    </article>
  );
}
