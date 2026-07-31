import type { Metadata } from 'next';
import { buildLandingMetadata } from '@/lib/landing-seo';
import { SITE_TAB_TITLE } from '@/lib/landing-theme';
import YasalShellClient from '@/components/landing/yasal/YasalShellClient';
import VeriSilmeContent from '@/components/landing/veri-silme/VeriSilmeContent';
import { VERI_SILME_META } from '@/lib/veri-silme-content';
import {
  getLandingPageData,
  landingPageDynamic,
} from '@/lib/landing-page-data';

export const dynamic = landingPageDynamic;

export async function generateMetadata(): Promise<Metadata> {
  const data = await getLandingPageData();
  const base = buildLandingMetadata(data, '/veri-silme');
  return {
    ...base,
    title: `${VERI_SILME_META.title} · ${SITE_TAB_TITLE}`,
    description: VERI_SILME_META.intro,
    alternates: {
      ...(base.alternates || {}),
      canonical: 'https://www.3kkampus.com/veri-silme',
    },
  };
}

export default async function VeriSilmePage() {
  const initialData = await getLandingPageData();
  return (
    <YasalShellClient initialData={initialData}>
      <VeriSilmeContent />
    </YasalShellClient>
  );
}
