import type { Metadata } from 'next';
import { buildLandingMetadata } from '@/lib/landing-seo';
import { SITE_TAB_TITLE } from '@/lib/landing-theme';
import Sistem3kPageClient from '@/components/landing/Sistem3kPageClient';
import {
  getLandingPageData,
  landingPageDynamic,
} from '@/lib/landing-page-data';

export const dynamic = landingPageDynamic;

export async function generateMetadata(): Promise<Metadata> {
  const data = await getLandingPageData();
  const base = buildLandingMetadata(data, '/3k-sistemi');
  return {
    ...base,
    title: SITE_TAB_TITLE,
    description:
      '3K Kampüs eğitim anlayışı, kurs programları, koçluk sistemi ve dijital eğitim platformu hakkında bilgi edinin.',
  };
}

export default async function Sistem3kPage() {
  const data = await getLandingPageData();
  return <Sistem3kPageClient initialData={data} />;
}
