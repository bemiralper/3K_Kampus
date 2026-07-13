'use client';

import { useState } from 'react';
import ContentAttachmentList from './ContentAttachmentList';
import ContentBadge from './ContentBadge';
import ContentLightbox from './ContentLightbox';
import { CONTENT_KIND_LABEL, formatContentDate } from '@/lib/content-labels';
import { resolveMediaUrl, type PublicContentItem } from '@/lib/website-api';

type Props = { item: PublicContentItem };

export default function ContentDetailView({ item }: Props) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const cover = resolveMediaUrl(item.kapak_gorseli_url || item.kapak_thumb_url);
  const galeri = item.galeri ?? [];

  return (
    <article className="wc-scope">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        {item.kind && <span className="wc-kind">{CONTENT_KIND_LABEL[item.kind] || item.kind}</span>}
        {item.oncelik && item.oncelik !== 'normal' && <ContentBadge priority={item.oncelik} />}
        {item.sabit && <span className="wc-badge wc-badge--onemli">Sabit</span>}
      </div>
      {item.yayin_tarihi && (
        <time className="text-sm text-slate-400">{formatContentDate(item.yayin_tarihi)}</time>
      )}
      <h1 className="mt-2 text-3xl font-bold text-slate-900">{item.baslik}</h1>
      {cover && (
        <div className="wc-detail-cover mt-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt={item.baslik} />
        </div>
      )}
      {item.ozet && !item.icerik && <p className="mt-4 text-lg text-slate-600">{item.ozet}</p>}
      <div
        className="prose prose-slate mt-6 max-w-none"
        dangerouslySetInnerHTML={{ __html: item.icerik || item.ozet || '' }}
      />
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
