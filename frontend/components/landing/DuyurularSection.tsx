'use client';

import Link from 'next/link';
import type { Duyuru } from '@/lib/website-api';
import { formatDateTR } from '@/lib/format-date';
import { LANDING_COLORS } from '@/lib/landing-theme';

type DuyurularSectionProps = {
  duyurular: Duyuru[];
};

export default function DuyurularSection({ duyurular }: DuyurularSectionProps) {
  const items = duyurular.slice(0, 6);

  return (
    <section id="duyurular" className="bg-slate-50 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: LANDING_COLORS.navy }}>Duyurular</h2>
          <p className="mt-2 text-slate-500">3K Kampüs&apos;ten güncel haberler</p>
        </div>
        {items.length === 0 ? (
          <p className="text-center text-slate-500">Henüz duyuru bulunmuyor.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(d => (
              <article key={d.id} className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#0262a7]/20 hover:shadow-md">
                {d.yayin_tarihi && (
                  <time className="text-xs font-medium text-slate-400">{formatDateTR(d.yayin_tarihi)}</time>
                )}
                <h3 className="mt-2 font-semibold text-slate-900 group-hover:text-[#0262a7]">{d.baslik}</h3>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-500">{d.ozet}</p>
                <Link href={`/duyurular/${d.slug}`} className="mt-4 inline-flex items-center gap-1 text-sm font-medium" style={{ color: LANDING_COLORS.accent }}>
                  Devamını Oku
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
