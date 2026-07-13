'use client';

import { formatFileSize } from '@/lib/content-labels';
import type { PublicContentEk } from '@/lib/website-api';

const ICONS: Record<string, string> = {
  pdf: '📄',
  word: '📝',
  excel: '📊',
  powerpoint: '📽',
  zip: '🗜',
  diger: '📎',
};

type Props = { items: PublicContentEk[] };

export default function ContentAttachmentList({ items }: Props) {
  if (!items.length) return null;
  return (
    <div className="wc-attachments wc-scope">
      <div className="wc-attachments__title">Ek Dosyalar</div>
      {items.map((ek) => (
        <a
          key={ek.id}
          href={ek.url || '#'}
          className="wc-attachment"
          target="_blank"
          rel="noopener noreferrer"
          download
        >
          <span className="wc-attachment__icon">{ICONS[ek.dosya_turu] || ICONS.diger}</span>
          <span>
            <div className="wc-attachment__name">{ek.dosya_adi}</div>
            <div className="wc-attachment__size">{formatFileSize(ek.boyut)}</div>
          </span>
        </a>
      ))}
    </div>
  );
}
