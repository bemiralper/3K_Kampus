import type { Metadata } from 'next';
import { buildLandingMetadata } from '@/lib/landing-seo';
import { SITE_TAB_TITLE } from '@/lib/landing-theme';
import { HAKKIMIZDA_META } from '@/lib/hakkimizda-content';
import YasalShellClient from '@/components/landing/yasal/YasalShellClient';
import HakkimizdaContent from '@/components/landing/hakkimizda/HakkimizdaContent';
import {
  getLandingPageData,
  landingPageDynamic,
} from '@/lib/landing-page-data';

export const dynamic = landingPageDynamic;

export async function generateMetadata(): Promise<Metadata> {
  const data = await getLandingPageData();
  const base = buildLandingMetadata(data, '/hakkimizda');
  return {
    ...base,
    title: SITE_TAB_TITLE,
    description: HAKKIMIZDA_META.intro[0],
  };
}

export default async function HakkimizdaPage() {
  const initialData = await getLandingPageData();
  return (
    <YasalShellClient initialData={initialData}>
      <HakkimizdaContent />
    </YasalShellClient>
  );
}
