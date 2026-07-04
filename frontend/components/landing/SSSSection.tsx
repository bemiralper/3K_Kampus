'use client';

import { useState } from 'react';
import type { SSSItem } from '@/lib/website-api';
import { LANDING_COLORS } from '@/lib/landing-theme';

type SSSSectionProps = {
  items: SSSItem[];
};

export default function SSSSection({ items }: SSSSectionProps) {
  const [openId, setOpenId] = useState<number | null>(items[0]?.id ?? null);

  return (
    <section id="sss" className="bg-slate-50 py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: LANDING_COLORS.navy }}>Sıkça Sorulan Sorular</h2>
        </div>
        <div className="space-y-3">
          {items.map(item => {
            const open = openId === item.id;
            return (
              <div key={item.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : item.id)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left font-medium text-slate-900 hover:bg-slate-50"
                >
                  {item.soru}
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className={`shrink-0 transition ${open ? 'rotate-180' : ''}`}
                    style={{ color: LANDING_COLORS.accent }}
                  >
                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                  </svg>
                </button>
                {open && (
                  <div className="border-t border-slate-100 px-5 py-4 text-sm text-slate-600">{item.cevap}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
