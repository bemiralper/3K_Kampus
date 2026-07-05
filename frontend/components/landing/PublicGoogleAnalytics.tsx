'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { fetchLandingData } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';

const PUBLIC_PREFIXES = ['/login', '/yasal', '/duyurular', '/3k-sistemi', '/hakkimizda'];

function isPublicMarketingPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Kamu site sayfalarında Google Analytics (gtag.js) — admin/coach/muhasebe hariç */
export default function PublicGoogleAnalytics() {
  const pathname = usePathname();
  const [measurementId, setMeasurementId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPublicMarketingPath(pathname)) return;
    let cancelled = false;
    fetchLandingData(LANDING_KURUM_KOD).then((data) => {
      if (cancelled) return;
      const id = data?.settings?.google_analytics_id?.trim();
      if (id) setMeasurementId(id);
    });
    return () => { cancelled = true; };
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
