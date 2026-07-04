'use client';

import type { NedenKart } from '@/lib/website-api';
import { LANDING_COLORS } from '@/lib/landing-theme';

const ICON_MAP: Record<string, React.ReactNode> = {
  chart: <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>,
  user: <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>,
  target: <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/>,
  bell: <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>,
  star: <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>,
};

type NedenSectionProps = {
  kartlar: NedenKart[];
};

export default function NedenSection({ kartlar }: NedenSectionProps) {
  return (
    <section className="bg-slate-50 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: LANDING_COLORS.navy }}>Neden 3K Kampüs?</h2>
          <p className="mt-2 text-slate-500">Başarıya giden yolda fark yaratan hizmetlerimiz</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {kartlar.map(k => (
            <div key={k.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl text-white" style={{ backgroundColor: LANDING_COLORS.accent }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">{ICON_MAP[k.ikon] || ICON_MAP.star}</svg>
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{k.baslik}</h3>
              <p className="mt-2 text-sm text-slate-500">{k.aciklama}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
