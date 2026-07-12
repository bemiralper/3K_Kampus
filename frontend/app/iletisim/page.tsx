import type { Metadata } from 'next';
import { buildLandingMetadata } from '@/lib/landing-seo';
import { SITE_TAB_TITLE } from '@/lib/landing-theme';
import IletisimPageClient from '@/components/landing/iletisim/IletisimPageClient';
import {
  getLandingPageData,
  landingPageDynamic,
} from '@/lib/landing-page-data';

export const dynamic = landingPageDynamic;

export async function generateMetadata(): Promise<Metadata> {
  const data = await getLandingPageData();
  const base = buildLandingMetadata(data, '/iletisim');
  return {
    ...base,
    title: `İletişim · ${SITE_TAB_TITLE}`,
    description:
      'Kayıt, bilgi ve iş birliği talepleriniz için 3K Kampüs ile telefon, WhatsApp, e-posta veya iletişim formu üzerinden iletişime geçin.',
  };
}

export default async function IletisimPage() {
  const initialData = await getLandingPageData();
  return <IletisimPageClient initialData={initialData} />;
}
