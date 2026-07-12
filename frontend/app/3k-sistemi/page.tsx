import type { Metadata } from 'next';
import { fetchLandingData } from '@/lib/website-api';
import { buildLandingMetadata } from '@/lib/landing-seo';
import { LANDING_KURUM_KOD, SITE_TAB_TITLE } from '@/lib/landing-theme';
import Sistem3kPageClient from '@/components/landing/Sistem3kPageClient';

export async function generateMetadata(): Promise<Metadata> {
  const data = await fetchLandingData(LANDING_KURUM_KOD);
  const base = buildLandingMetadata(data, '/3k-sistemi');
  return {
    ...base,
    title: SITE_TAB_TITLE,
    description:
      '3K Kampüs eğitim anlayışı, kurs programları, koçluk sistemi ve dijital eğitim platformu hakkında bilgi edinin.',
  };
}

export default async function Sistem3kPage() {
  const data = await fetchLandingData(LANDING_KURUM_KOD);
  return <Sistem3kPageClient initialData={data} />;
}
