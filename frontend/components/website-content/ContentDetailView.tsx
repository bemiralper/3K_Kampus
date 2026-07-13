'use client';

import { useState } from 'react';
import ContentAttachmentList from './ContentAttachmentList';
import ContentBadge from './ContentBadge';
import ContentCoverFrame from './ContentCoverFrame';
import ContentLightbox from './ContentLightbox';
import { CONTENT_KIND_LABEL, formatContentDate, shouldShowContentExcerpt } from '@/lib/content-labels';
import { resolveMediaUrl, type PublicContentItem } from '@/lib/website-api';

type Props = { item: PublicContentItem; variant?: 'standalone' | 'embedded' };

export default function ContentDetailView({ item, variant = 'standalone' }: Props) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const cover = item.kapak_gorseli_url || item.kapak_thumb_url;
  const galeri = item.galeri ?? [];
  const embedded = variant === 'embedded';
  const showLead = !embedded && shouldShowContentExcerpt(item.ozet, item.icerik);
  const bodyHtml = item.icerik || (!embedded && !showLead ? item.ozet : '') || '';

  return (
    <article className="wc-scope">
      {!embedded && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            {item.kind && <span className="wc-kind">{CONTENT_KIND_LABEL[item.kind] || item.kind}</span>}
            {item.oncelik && item.oncelik !== 'normal' && <ContentBadge priority={item.oncelik} />}
            {item.sabit && <span className="wc-badge wc-badge--onemli">Sabit</span>}
          </div>
          {item.yayin_tarihi && (
            <time className="text-sm text-slate-400">{formatContentDate(item.yayin_tarihi)}</time>
          )}
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{item.baslik}</h1>
        </>
      )}
      {embedded && (
        <div className="wc-detail-meta">
          {item.kind && <span className="wc-kind">{CONTENT_KIND_LABEL[item.kind] || item.kind}</span>}
          {item.oncelik && item.oncelik !== 'normal' && <ContentBadge priority={item.oncelik} />}
          {item.sabit && <span className="wc-badge wc-badge--onemli">Sabit</span>}
          {item.yayin_tarihi && (
            <time className="text-sm text-slate-400">{formatContentDate(item.yayin_tarihi)}</time>
          )}
        </div>
      )}
      {cover && (
        <ContentCoverFrame src={cover} alt={item.baslik} variant="detail" className="mt-6" />
      )}
      {showLead && <p className="mt-4 text-lg text-slate-600">{item.ozet}</p>}
      {bodyHtml ? (
        <div className="wc-prose mt-6" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      ) : null}
      {galeri.length > 0 && (
        <div className="wc-gallery">
          {galeri.map((g, idx) => (
            <button key={g.id} type="button" className="wc-gallery__item" onClick={() => setLightbox(idx)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveMediaUrl(g.thumb || g.url) || ''} alt={g.baslik || ''} />
            </button>
          ))}
        </div>
      )}
      <ContentAttachmentList items={item.ekler ?? []} />
      {lightbox != null && (
        <ContentLightbox
          images={galeri}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onChange={setLightbox}
        />
      )}
    </article>
  );
}
