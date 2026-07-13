'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Duyuru } from '@/lib/website-api';
import { resolveMediaUrl } from '@/lib/website-api';
import { formatDateTR } from '@/lib/format-date';
import { LANDING_COLORS } from '@/lib/landing-theme';
import ContentBadge from '@/components/website-content/ContentBadge';
import ContentModal from '@/components/website-content/ContentModal';
import { CONTENT_KIND_LABEL } from '@/lib/content-labels';
import '@/app/duyurular/content.css';

type DuyurularSectionProps = {
  duyurular: Duyuru[];
};

export default function DuyurularSection({ duyurular }: DuyurularSectionProps) {
  const items = useMemo(() => duyurular.slice(0, 6), [duyurular]);
  const [modalItem, setModalItem] = useState<Duyuru | null>(null);

  return (
    <section id="duyurular" className="bg-slate-50 py-16 lg:py-24 wc-scope">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-left">
            <h2 className="text-3xl font-bold tracking-tight" style={{ color: LANDING_COLORS.navy }}>Duyurular</h2>
            <p className="mt-2 text-slate-500">3K Kampüs&apos;ten güncel haberler</p>
          </div>
          <Link
            href="/duyurular"
            className="text-sm font-semibold"
            style={{ color: LANDING_COLORS.accent }}
          >
            Tümünü Gör →
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="text-center text-slate-500">Henüz duyuru bulunmuyor.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((d) => {
              const cover = resolveMediaUrl(d.kapak_thumb_url || d.kapak_gorseli_url);
              return (
                <article key={d.id} className="wc-card">
                  {cover && (
                    <div className="wc-card__cover">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cover} alt="" loading="lazy" />
                    </div>
                  )}
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
                    <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                      <button
                        type="button"
                        className="wc-card__link"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        onClick={() => setModalItem(d)}
                      >
                        Hızlı Oku
                      </button>
                      <Link href={`/duyurular/${d.slug}`} className="wc-card__link">
                        Detay →
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      {modalItem && (
        <ContentModal
          item={{ ...modalItem, icerik: modalItem.icerik || modalItem.ozet }}
          onClose={() => setModalItem(null)}
        />
      )}
    </section>
  );
}
