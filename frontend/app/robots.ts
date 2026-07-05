import type { MetadataRoute } from 'next';
import { absoluteSiteUrl } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/duyurular', '/3k-sistemi', '/hakkimizda', '/yasal/'],
        disallow: [
          '/admin/',
          '/coach/',
          '/muhasebe/',
          '/kurum-yonetimi/',
          '/website-yonetimi/',
          '/api/',
          '/login',
        ],
      },
    ],
    sitemap: absoluteSiteUrl('/sitemap.xml'),
    host: absoluteSiteUrl('/'),
  };
}
