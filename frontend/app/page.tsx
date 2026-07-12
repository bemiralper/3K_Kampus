import type { Metadata } from 'next';
import { cache } from 'react';
import LandingPageClient from '@/components/landing/LandingPageClient';
import { fetchLandingData as fetchLandingDataRaw } from '@/lib/website-api';
import { buildLandingMetadata } from '@/lib/landing-seo';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';
import { landingPageDynamic } from '@/lib/landing-page-data';

export const dynamic = landingPageDynamic;
export const revalidate = 0;

const getLandingData = cache(() => fetchLandingDataRaw(LANDING_KURUM_KOD));

export async function generateMetadata(): Promise<Metadata> {
  const data = await getLandingData();
  return buildLandingMetadata(data);
}

export default async function HomePage() {
  const initialData = await getLandingData();
  return <LandingPageClient initialData={initialData} />;
}
