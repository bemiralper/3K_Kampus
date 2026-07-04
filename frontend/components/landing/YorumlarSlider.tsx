'use client';

import { useState } from 'react';
import type { OgrenciYorumu } from '@/lib/website-api';
import { LANDING_COLORS } from '@/lib/landing-theme';

type YorumlarSliderProps = {
  yorumlar: OgrenciYorumu[];
};

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill={i < count ? LANDING_COLORS.accent : '#e2e8f0'}>
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
        </svg>
      ))}
    </div>
  );
}

export default function YorumlarSlider({ yorumlar }: YorumlarSliderProps) {
  const [index, setIndex] = useState(0);
  if (yorumlar.length === 0) return null;

  const current = yorumlar[index];
  const prev = () => setIndex(i => (i - 1 + yorumlar.length) % yorumlar.length);
  const next = () => setIndex(i => (i + 1) % yorumlar.length);

  return (
    <section className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: LANDING_COLORS.navy }}>Öğrenci Yorumları</h2>
        </div>
        <div className="relative rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <svg className="absolute left-6 top-6 opacity-10" width="48" height="48" viewBox="0 0 24 24" fill={LANDING_COLORS.navy}>
            <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/>
          </svg>
          <Stars count={current.puan} />
          <blockquote className="mt-4 text-lg text-slate-700">&ldquo;{current.yorum}&rdquo;</blockquote>
          <div className="mt-6">
            <div className="font-semibold text-slate-900">{current.ad}</div>
            {current.rol && <div className="text-sm text-slate-500">{current.rol}</div>}
          </div>
          {yorumlar.length > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <button type="button" onClick={prev} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Önceki">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              </button>
              <div className="flex gap-1.5">
                {yorumlar.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    className={`h-2 w-2 rounded-full transition ${i === index ? 'w-4 bg-[#0262a7]' : 'bg-slate-300'}`}
                    aria-label={`Yorum ${i + 1}`}
                  />
                ))}
              </div>
              <button type="button" onClick={next} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Sonraki">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
