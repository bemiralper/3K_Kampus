'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { fetchLandingData, websiteCmsV2Api } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';

const PUBLIC_PREFIXES = [
  '/login',
  '/yasal',
  '/duyurular',
  '/3k-sistemi',
  '/hakkimizda',
  '/sayfa',
];

function isPublicMarketingPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Kamu site sayfalarında Google Analytics (gtag.js).
 * Önce CMS Entegrasyonlar.ga4_id, yoksa SiteSettings.google_analytics_id.
 * Düzenleme: Web Sitesi → Entegrasyonlar → GA4
 */
export default function PublicGoogleAnalytics() {
  const pathname = usePathname();
  const [measurementId, setMeasurementId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPublicMarketingPath(pathname)) return;
    let cancelled = false;

    (async () => {
      let id = '';
      try {
        const cms = await websiteCmsV2Api.fetchPublicPage(LANDING_KURUM_KOD);
        id = (cms?.integrations?.ga4_id || '').trim();
      } catch {
        /* fallback below */
      }
      if (!id) {
        const data = await fetchLandingData(LANDING_KURUM_KOD);
        id = (data?.settings?.google_analytics_id || '').trim();
      }
      if (!cancelled && id) setMeasurementId(id);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!measurementId || !isPublicMarketingPath(pathname)) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics-gtag" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>
    </>
  );
}
