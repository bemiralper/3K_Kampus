import { CEREZ_META, CEREZ_SECTIONS } from '@/lib/cerez-content';
import { GIZLILIK_META, GIZLILIK_SECTIONS } from '@/lib/gizlilik-content';
import { KULLANIM_META, KULLANIM_SECTIONS } from '@/lib/kullanim-content';
import { KVKK_META, KVKK_SECTIONS } from '@/lib/kvkk-content';
import { buildYasalPageHtml } from '@/lib/yasal-sections-to-html';
import { buildYasalNav, type YasalMetinMeta, type YasalSection } from '@/lib/yasal-metin-types';

export type YasalTur = 'kvkk' | 'gizlilik' | 'kullanim' | 'cerez';

export type YasalContentSpec = {
  tur: YasalTur;
  baslik: string;
  html: string;
  meta: YasalMetinMeta;
  sections: YasalSection[];
  nav: { id: string; label: string }[];
};

function spec(tur: YasalTur, meta: YasalMetinMeta, sections: YasalSection[]): YasalContentSpec {
  return {
    tur,
    baslik: meta.title,
    html: buildYasalPageHtml(meta, sections),
    meta,
    sections,
    nav: buildYasalNav(sections),
  };
}

export const YASAL_CONTENT_REGISTRY: Record<YasalTur, YasalContentSpec> = {
  kvkk: spec('kvkk', KVKK_META, KVKK_SECTIONS),
  gizlilik: spec('gizlilik', GIZLILIK_META, GIZLILIK_SECTIONS),
  kullanim: spec('kullanim', KULLANIM_META, KULLANIM_SECTIONS),
  cerez: spec('cerez', CEREZ_META, CEREZ_SECTIONS),
};

export const YASAL_TURLER = Object.keys(YASAL_CONTENT_REGISTRY) as YasalTur[];

export function getYasalContentSpec(tur: string): YasalContentSpec | null {
  return YASAL_CONTENT_REGISTRY[tur as YasalTur] ?? null;
}

export function buildYasalDefaultsPayload(): Record<
  YasalTur,
  { baslik: string; icerik: string; aktif: boolean }
> {
  const out = {} as Record<YasalTur, { baslik: string; icerik: string; aktif: boolean }>;
  for (const tur of YASAL_TURLER) {
    const item = YASAL_CONTENT_REGISTRY[tur];
    out[tur] = {
      baslik: item.baslik,
      icerik: item.html,
      aktif: true,
    };
  }
  return out;
}
