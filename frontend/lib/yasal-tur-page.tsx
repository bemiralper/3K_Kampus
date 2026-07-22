import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import YasalShellClient from '@/components/landing/yasal/YasalShellClient';
import YasalTurPageClient from '@/components/landing/yasal/YasalTurPageClient';
import { getYasalContentSpec, YASAL_TURLER } from '@/lib/yasal-content-registry';
import { buildLandingMetadata } from '@/lib/landing-seo';
import { LANDING_KURUM_KOD, SITE_TAB_TITLE } from '@/lib/landing-theme';
import {
  getLandingPageData,
  landingPageDynamic,
} from '@/lib/landing-page-data';
import { fetchYasalDetail } from '@/lib/website-api';

export const dynamic = landingPageDynamic;

export function yasalStaticParams() {
  return YASAL_TURLER.map((tur) => ({ tur }));
}

export async function buildYasalTurMetadata(tur: string): Promise<Metadata> {
  const data = await getLandingPageData();
  const base = buildLandingMetadata(data, `/yasal/${tur}`);
  const metin = await fetchYasalDetail(LANDING_KURUM_KOD, tur);
  const fallback = getYasalContentSpec(tur);
  const description = metin?.baslik ?? fallback?.baslik ?? fallback?.meta.intro;
  if (!description) return { ...base, title: SITE_TAB_TITLE };
  return { ...base, title: SITE_TAB_TITLE, description };
}

export async function renderYasalTurPage(tur: string) {
  if (!getYasalContentSpec(tur)) notFound();

  const [initialData, metin] = await Promise.all([
    getLandingPageData(),
    fetchYasalDetail(LANDING_KURUM_KOD, tur),
  ]);

  return (
    <YasalShellClient initialData={initialData}>
      <YasalTurPageClient tur={tur} metin={metin} />
    </YasalShellClient>
  );
}
