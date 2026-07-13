import type { Metadata } from 'next';
import { buildLandingMetadata } from '@/lib/landing-seo';
import { SITE_TAB_TITLE } from '@/lib/landing-theme';
import { getLandingPageData, landingPageDynamic } from '@/lib/landing-page-data';
import DuyurularPageClient from './DuyurularPageClient';

export const dynamic = landingPageDynamic;

export async function generateMetadata(): Promise<Metadata> {
  const data = await getLandingPageData();
  const base = buildLandingMetadata(data, '/duyurular');
  return {
    ...base,
    title: `Duyurular · ${SITE_TAB_TITLE}`,
    description: '3K Kampüs duyuru ve haberleri — güncel bilgilendirmeler, etkinlikler ve kurumsal duyurular.',
  };
}

export default async function DuyurularListPage() {
  const initialData = await getLandingPageData();
  const duyurular = initialData?.duyurular ?? [];
  return <DuyurularPageClient initialData={initialData} initialItems={duyurular} />;
}
