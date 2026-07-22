import type { MetadataRoute } from 'next';
import { fetchLandingData } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';
import { absoluteSiteUrl } from '@/lib/site-url';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type CmsSitemapPage = {
  slug: string;
  is_homepage?: boolean;
  priority?: number;
  updated_at?: string | null;
  path?: string;
};

async function fetchCmsSitemapPages(): Promise<CmsSitemapPage[]> {
  try {
    const res = await fetch(
      `${BACKEND}/website/api/public/${encodeURIComponent(LANDING_KURUM_KOD)}/v2/sitemap-pages/`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.data ?? []) as CmsSitemapPage[];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [data, cmsPages] = await Promise.all([
    fetchLandingData(LANDING_KURUM_KOD),
    fetchCmsSitemapPages(),
  ]);
  const duyurular = data?.duyurular ?? [];
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteSiteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: absoluteSiteUrl('/duyurular'), lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteSiteUrl('/3k-sistemi'), lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteSiteUrl('/hakkimizda'), lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteSiteUrl('/yasal/kvkk'), lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: absoluteSiteUrl('/yasal/gizlilik'), lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: absoluteSiteUrl('/yasal/kullanim'), lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: absoluteSiteUrl('/yasal/cerez'), lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
  ];

  const cmsEntries: MetadataRoute.Sitemap = cmsPages
    .filter((p) => p.path && p.path !== '/') // anasayfa staticPages'te
    .map((p) => ({
      url: absoluteSiteUrl(p.path!.startsWith('/') ? p.path! : `/${p.path}`),
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: 'weekly' as const,
      priority: typeof p.priority === 'number' ? p.priority : 0.7,
    }));

  const duyuruPages: MetadataRoute.Sitemap = duyurular.map((d) => ({
    url: absoluteSiteUrl(`/duyurular/${d.slug}`),
    lastModified: d.yayin_tarihi ? new Date(d.yayin_tarihi) : now,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  // Deduplicate by URL
  const seen = new Set<string>();
  const all = [...staticPages, ...cmsEntries, ...duyuruPages];
  return all.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}
