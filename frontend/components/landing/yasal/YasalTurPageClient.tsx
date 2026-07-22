'use client';

import YasalMetinContent from '@/components/landing/yasal/YasalMetinContent';
import '@/components/landing/yasal/yasal-page.css';
import { getYasalContentSpec } from '@/lib/yasal-content-registry';
import { parseYasalStructured } from '@/lib/yasal-sections-to-json';
import { buildYasalNav } from '@/lib/yasal-metin-types';
import type { YasalMetin } from '@/lib/website-api';

type Props = {
  tur: string;
  metin: YasalMetin | null;
};

export default function YasalTurPageClient({ tur, metin }: Props) {
  const structured = metin ? parseYasalStructured(metin.icerik) : null;
  const fallback = getYasalContentSpec(tur);

  if (structured) {
    return (
      <YasalMetinContent
        meta={structured.meta}
        nav={buildYasalNav(structured.sections)}
        sections={structured.sections}
      />
    );
  }

  if (fallback) {
    return (
      <YasalMetinContent
        meta={fallback.structured.meta}
        nav={fallback.nav}
        sections={fallback.structured.sections}
      />
    );
  }

  if (!metin) {
    return (
      <div className="yasal-page">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-600">
          Yasal metin bulunamadı.
        </div>
      </div>
    );
  }

  return (
    <div className="yasal-page">
      <section className="yasal-hero">
        <div className="mx-auto max-w-4xl px-4 py-12 lg:px-8 lg:py-16">
          <p className="yasal-brand">3K KAMPÜS</p>
          <h1 className="yasal-title">{metin.baslik}</h1>
          {metin.updated_at && (
            <p className="yasal-date">
              <span>Son Güncelleme:</span>{' '}
              {new Date(metin.updated_at).toLocaleDateString('tr-TR')}
            </p>
          )}
        </div>
      </section>
      <div className="mx-auto max-w-4xl px-4 py-12 lg:px-8">
        <article
          className="yasal-html-body prose prose-slate max-w-none"
          dangerouslySetInnerHTML={{ __html: metin.icerik }}
        />
      </div>
    </div>
  );
}
