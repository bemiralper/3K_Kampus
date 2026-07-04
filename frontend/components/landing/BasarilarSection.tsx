'use client';

import type { BasariIstatistik } from '@/lib/website-api';
import { LANDING_COLORS } from '@/lib/landing-theme';

type BasarilarSectionProps = {
  basariIstatistikleri: BasariIstatistik[];
};

export default function BasarilarSection({ basariIstatistikleri }: BasarilarSectionProps) {
  if (basariIstatistikleri.length === 0) return null;

  return (
    <section id="basarilarimiz" className="scroll-mt-24 border-y border-slate-200 bg-white py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <h2 className="mb-8 text-center text-2xl font-bold tracking-tight" style={{ color: LANDING_COLORS.navy }}>
          Başarılarımız
        </h2>
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {basariIstatistikleri.map(s => (
            <div key={s.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 text-center">
              <div className="text-3xl font-bold lg:text-4xl" style={{ color: LANDING_COLORS.accent }}>{s.deger}</div>
              <div className="mt-2 text-sm font-medium text-slate-500">{s.etiket}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
