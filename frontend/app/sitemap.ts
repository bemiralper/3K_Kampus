import type { MetadataRoute } from 'next';
import { fetchLandingData } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';
import { absoluteSiteUrl } from '@/lib/site-url';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await fetchLandingData(LANDING_KURUM_KOD);
  const duyurular = data?.duyurular ?? [];
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteSiteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: absoluteSiteUrl('/duyurular'), lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteSiteUrl('/3k-sistemi'), lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteSiteUrl('/hakkimizda'), lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ];

  const duyuruPages: MetadataRoute.Sitemap = duyurular.map((d) => ({
    url: absoluteSiteUrl(`/duyurular/${d.slug}`),
    lastModified: d.yayin_tarihi ? new Date(d.yayin_tarihi) : now,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...duyuruPages];
}
