import type { Metadata } from 'next';
import { fetchLandingData } from '@/lib/website-api';
import { LANDING_KURUM_KOD, SITE_TAB_TITLE } from '@/lib/landing-theme';
import { HAKKIMIZDA_META } from '@/lib/hakkimizda-content';
import YasalShellClient from '@/components/landing/yasal/YasalShellClient';
import HakkimizdaContent from '@/components/landing/hakkimizda/HakkimizdaContent';

export const metadata: Metadata = {
  title: SITE_TAB_TITLE,
  description: HAKKIMIZDA_META.intro[0],
};

export default async function HakkimizdaPage() {
  const initialData = await fetchLandingData(LANDING_KURUM_KOD);
  return (
    <YasalShellClient initialData={initialData}>
      <HakkimizdaContent />
    </YasalShellClient>
  );
}
