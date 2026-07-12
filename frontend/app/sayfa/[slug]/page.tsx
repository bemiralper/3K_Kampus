import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import CmsPublicPage from '@/components/cms/CmsPublicPage';
import { websiteCmsV2Api } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';

export const revalidate = 60;

/** Polished dedicated routes — CMS slug’larını oraya yönlendir */
const SLUG_REDIRECTS: Record<string, string> = {
  '3k-sistemi': '/3k-sistemi',
  hakkimizda: '/hakkimizda',
};

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (SLUG_REDIRECTS[params.slug]) {
    return { title: params.slug };
  }
  const v2 = await websiteCmsV2Api.fetchPublicPage(LANDING_KURUM_KOD, params.slug);
  if (!v2?.page) return { title: 'Sayfa' };
  const p = v2.page;
  const favicon = v2.theme?.favicon_url?.trim();
  const verification = v2.integrations?.search_console_verification?.trim();
  return {
    title: p.meta_title || p.title,
    description: p.meta_description || undefined,
    robots: {
      index: p.robots_index !== false,
      follow: p.robots_follow !== false,
    },
    ...(favicon ? { icons: { icon: favicon } } : {}),
    ...(verification ? { verification: { google: verification } } : {}),
    openGraph: {
      title: p.og_title || p.meta_title || p.title || undefined,
      description: p.og_description || p.meta_description || undefined,
      images: p.og_image ? [{ url: p.og_image }] : undefined,
      url: p.canonical_url || undefined,
    },
    alternates: p.canonical_url ? { canonical: p.canonical_url } : undefined,
  };
}

export default async function CmsSlugPage({ params }: Props) {
  const dest = SLUG_REDIRECTS[params.slug];
  if (dest) redirect(dest);

  const v2 = await websiteCmsV2Api.fetchPublicPage(LANDING_KURUM_KOD, params.slug);
  if (!v2?.page?.blocks) notFound();
  return <CmsPublicPage payload={v2} />;
}
