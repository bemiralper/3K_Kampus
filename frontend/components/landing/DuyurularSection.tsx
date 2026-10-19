'use client';

import Link from 'next/link';
import type { Duyuru } from '@/lib/website-api';
import { formatDateTR } from '@/lib/format-date';
import ContentBadge from '@/components/website-content/ContentBadge';
import ContentCoverFrame from '@/components/website-content/ContentCoverFrame';
import ContentShareBar from '@/components/website-content/ContentShareBar';
import { CONTENT_KIND_LABEL } from '@/lib/content-labels';
import '@/app/duyurular/content.css';
import './public-home.css';

type DuyurularSectionProps = {
  duyurular: Duyuru[];
};

export default function DuyurularSection({ duyurular }: DuyurularSectionProps) {
  const items = duyurular;

  return (
    <section id="duyurular" className="duy-home wc-scope">
      <div className="duy-home__wrap">
        <div className="duy-home__head">
          <div>
            <h2>Duyurular</h2>
            <p className="duy-home__lead">3K Kampüs&apos;ten güncel haberler</p>
          </div>
          <Link href="/duyurular" className="duy-home__all">
            Tümünü gör
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="duy-home__empty">Henüz duyuru bulunmuyor.</p>
        ) : (
          <div className="duy-home__grid">
            {items.map((d) => (
              <article key={d.id} className="wc-card">
                <Link href={`/duyurular/${d.slug}`} className="wc-card__open">
                  <ContentCoverFrame
                    src={d.kapak_thumb_url || d.kapak_gorseli_url}
                    alt=""
                    variant="card"
                    className="wc-card__cover"
                  />
                  <div className="wc-card__body">
                    <div className="wc-card__meta">
                      {d.kind && <span className="wc-kind">{CONTENT_KIND_LABEL[d.kind] || 'Duyuru'}</span>}
                      {d.oncelik && d.oncelik !== 'normal' && <ContentBadge priority={d.oncelik} />}
                      {d.yayin_tarihi && (
                        <time className="text-xs text-slate-400">{formatDateTR(d.yayin_tarihi)}</time>
                      )}
                    </div>
                    <h3 className="wc-card__title">{d.baslik}</h3>
                    <p className="wc-card__excerpt">{d.ozet}</p>
                    <span className="wc-card__link">Devamını Oku →</span>
                  </div>
                </Link>
                <ContentShareBar
                  compact
                  title={d.baslik}
                  text={d.ozet}
                  path={`/duyurular/${d.slug}`}
                />
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
