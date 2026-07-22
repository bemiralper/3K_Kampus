'use client';

import '@/components/landing/yasal/yasal-page.css';
import { getYasalContentSpec } from '@/lib/yasal-content-registry';
import { isPlaceholderYasalHtml } from '@/lib/yasal-sections-to-html';
import type { YasalMetin } from '@/lib/website-api';

type Props = {
  tur: string;
  metin: YasalMetin | null;
};

export default function YasalTurPageClient({ tur, metin }: Props) {
  const fallback = getYasalContentSpec(tur);
  const html =
    metin && !isPlaceholderYasalHtml(metin.icerik)
      ? metin.icerik
      : fallback?.html ?? null;

  if (!html) {
    return (
      <div className="yasal-page">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-600">
          Yasal metin bulunamadı.
        </div>
      </div>
    );
  }

  return (
    <div className="yasal-page" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
