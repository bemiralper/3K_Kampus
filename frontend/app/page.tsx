import type { Metadata } from 'next';
import { cache } from 'react';
import LandingPageClient from '@/components/landing/LandingPageClient';
import { fetchLandingData as fetchLandingDataRaw } from '@/lib/website-api';

import { SITE_TAB_TITLE } from '@/lib/landing-theme';

export const revalidate = 60;

const getLandingData = cache(() => fetchLandingDataRaw('3K'));

export async function generateMetadata(): Promise<Metadata> {
  const data = await getLandingData();
  return {
    title: SITE_TAB_TITLE,
    description: data?.settings?.seo_aciklama || '3K Kampüs ile akademik takip, bireysel koçluk ve deneme analizleri.',
  };
}

export default async function HomePage() {
  const initialData = await getLandingData();
  return <LandingPageClient initialData={initialData} />;
}
