import { LANDING_KURUM_KOD } from '@/lib/landing-theme';
import { absoluteSiteUrl } from '@/lib/site-url';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const FALLBACK = `User-agent: *
Allow: /
Allow: /duyurular
Allow: /3k-sistemi
Allow: /hakkimizda
Allow: /yasal/
Allow: /sayfa/
Disallow: /admin/
Disallow: /coach/
Disallow: /muhasebe/
Disallow: /kurum-yonetimi/
Disallow: /website-yonetimi/
Disallow: /api/
Disallow: /login
Sitemap: ${absoluteSiteUrl('/sitemap.xml')}
`;

/**
 * Public robots.txt — CMS Entegrasyonlar > robots_txt metnini kullanır.
 * Düzenleme: Web Sitesi → Entegrasyonlar → robots.txt
 */
export async function GET() {
  try {
    const res = await fetch(
      `${BACKEND}/website/api/public/${encodeURIComponent(LANDING_KURUM_KOD)}/v2/robots.txt`,
      { next: { revalidate: 60 } },
    );
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text) {
        return new Response(text.endsWith('\n') ? text : `${text}\n`, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          },
        });
      }
    }
  } catch {
    /* fallback */
  }

  return new Response(FALLBACK, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
