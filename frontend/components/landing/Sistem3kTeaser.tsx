'use client';

import Link from 'next/link';
import type { SiteSettings } from '@/lib/website-api';
import { LANDING_COLORS } from '@/lib/landing-theme';
import { DERS_FORMATLARI } from '@/lib/ders-formatlari-content';

type Sistem3kTeaserProps = {
  settings: SiteSettings | null;
};

export default function Sistem3kTeaser({ settings }: Sistem3kTeaserProps) {
  const baslik = settings?.tanitim_baslik || 'Geleceği Planlayan Bir Eğitim Yaklaşımı';
  const icerik =
    settings?.tanitim_icerik ||
    '5 kişilik grup dersleri ve birebir özel derslerle her öğrenciye uygun eğitim modeli. Kurs, kütüphane, koçluk ve dijital platformumuzla tanışın.';

  return (
    <section className="py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div
          className="relative overflow-hidden rounded-3xl px-6 py-10 lg:px-12 lg:py-14"
          style={{ background: `linear-gradient(135deg, ${LANDING_COLORS.navy} 0%, ${LANDING_COLORS.accent} 100%)` }}
        >
          <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-widest text-white/70">3K Sistemi</p>
              <h2 className="mt-2 text-2xl font-bold text-white lg:text-3xl">{baslik}</h2>
              <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-white/85">{icerik}</p>
              <Link
                href="/3k-sistemi"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:shadow-lg"
              >
                3K Sistemini Keşfedin
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </Link>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:min-w-[220px]">
              {DERS_FORMATLARI.map(f => (
                <div
                  key={f.id}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur"
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">{f.badge}</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">{f.title}</p>
                </div>
              ))}
            </div>
          </div>
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }}
            aria-hidden
          />
        </div>
      </div>
    </section>
  );
}
