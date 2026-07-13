import type { Metadata } from 'next';
import { fetchDuyuruDetail } from '@/lib/website-api';
import { LANDING_KURUM_KOD, SITE_TAB_TITLE } from '@/lib/landing-theme';
import { buildDuyuruMetadata } from '@/lib/landing-seo';
import { getLandingPageData, landingPageDynamic } from '@/lib/landing-page-data';
import { notFound } from 'next/navigation';
import DuyuruDetailPageClient from '../DuyuruDetailPageClient';
import '@/app/duyurular/content.css';

export const dynamic = landingPageDynamic;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const duyuru = await fetchDuyuruDetail(LANDING_KURUM_KOD, params.slug);
  if (!duyuru) return { title: `Duyuru · ${SITE_TAB_TITLE}` };
  return buildDuyuruMetadata(duyuru, params.slug);
}

export default async function DuyuruDetailPage({ params }: Props) {
  const [initialData, duyuru] = await Promise.all([
    getLandingPageData(),
    fetchDuyuruDetail(LANDING_KURUM_KOD, params.slug),
  ]);
  if (!duyuru) notFound();
  return <DuyuruDetailPageClient initialData={initialData} duyuru={duyuru} />;
}
