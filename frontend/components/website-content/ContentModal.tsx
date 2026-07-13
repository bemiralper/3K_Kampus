'use client';

import Link from 'next/link';
import ContentBadge from './ContentBadge';
import { CONTENT_KIND_LABEL, formatContentDate } from '@/lib/content-labels';
import type { PublicContentItem } from '@/lib/website-api';

type Props = {
  item: PublicContentItem;
  onClose: () => void;
};

export default function ContentModal({ item, onClose }: Props) {
  return (
    <div className="wc-modal-overlay wc-scope" onClick={onClose}>
      <div className="wc-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="wc-modal__head">
          <div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {item.kind && <span className="wc-kind">{CONTENT_KIND_LABEL[item.kind] || item.kind}</span>}
              {item.oncelik && item.oncelik !== 'normal' && <ContentBadge priority={item.oncelik} />}
            </div>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>{item.baslik}</h2>
            {item.yayin_tarihi && (
              <time style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{formatContentDate(item.yayin_tarihi)}</time>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        <div className="wc-modal__body">
          {item.ozet && <p style={{ marginTop: 0 }}>{item.ozet}</p>}
          {item.icerik ? (
            <div dangerouslySetInnerHTML={{ __html: item.icerik }} />
          ) : null}
        </div>
        <div className="wc-modal__foot">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Kapat</button>
          <Link href={`/duyurular/${item.slug}`} className="btn btn-primary btn-sm" onClick={onClose}>
            Devamını Oku
          </Link>
        </div>
      </div>
    </div>
  );
}
