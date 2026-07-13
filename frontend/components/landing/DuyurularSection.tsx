'use client';

import Link from 'next/link';
import type { Duyuru } from '@/lib/website-api';
import { formatDateTR } from '@/lib/format-date';
import { LANDING_COLORS } from '@/lib/landing-theme';
import ContentBadge from '@/components/website-content/ContentBadge';
import ContentCoverFrame from '@/components/website-content/ContentCoverFrame';
import { CONTENT_KIND_LABEL } from '@/lib/content-labels';
import '@/app/duyurular/content.css';

type DuyurularSectionProps = {
  duyurular: Duyuru[];
};

export default function DuyurularSection({ duyurular }: DuyurularSectionProps) {
  const items = duyurular;

  return (
    <section id="duyurular" className="bg-slate-50 py-16 lg:py-24 wc-scope">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-left">
            <h2 className="text-3xl font-bold tracking-tight" style={{ color: LANDING_COLORS.navy }}>Duyurular</h2>
            <p className="mt-2 text-slate-500">3K Kampüs&apos;ten güncel haberler</p>
          </div>
          <Link href="/duyurular" className="text-sm font-semibold" style={{ color: LANDING_COLORS.accent }}>
            Tümünü Gör →
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="text-center text-slate-500">Henüz duyuru bulunmuyor.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((d) => (
              <article key={d.id} className="wc-card">
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
                  <div className="wc-card__actions">
                    <Link href={`/duyurular/${d.slug}`} className="wc-card__link">
                      Detay →
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
