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
  '/iletisim',
  '/sayfa',
];

type IntegrationCodes = {
  ga4_id: string;
  gtm_id: string;
  head_code: string;
  body_start_code: string;
  body_end_code: string;
};

function isPublicMarketingPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function injectHtmlScripts(html: string, target: HTMLElement) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  tpl.content.querySelectorAll('script').forEach((oldScript) => {
    const script = document.createElement('script');
    for (const attr of oldScript.attributes) {
      script.setAttribute(attr.name, attr.value);
    }
    script.text = oldScript.textContent || '';
    target.appendChild(script);
  });
  tpl.content.querySelectorAll(':not(script)').forEach((node) => {
    target.appendChild(node.cloneNode(true));
  });
}

/**
 * Kamu site (anasayfa, iletişim vb.) entegrasyon kodları.
 * Düzenleme: Web Sitesi → Entegrasyonlar
 */
export default function PublicMarketingIntegrations() {
  const pathname = usePathname();
  const [codes, setCodes] = useState<IntegrationCodes | null>(null);

  useEffect(() => {
    if (!isPublicMarketingPath(pathname)) return;
    let cancelled = false;

    (async () => {
      const empty: IntegrationCodes = {
        ga4_id: '',
        gtm_id: '',
        head_code: '',
        body_start_code: '',
        body_end_code: '',
      };
      try {
        const cms = await websiteCmsV2Api.fetchPublicPage(LANDING_KURUM_KOD);
        const integ = cms?.integrations || {};
        empty.ga4_id = String(integ.ga4_id || '').trim();
        empty.gtm_id = String(integ.gtm_id || '').trim();
        empty.head_code = String(integ.head_code || '').trim();
        empty.body_start_code = String(integ.body_start_code || '').trim();
        empty.body_end_code = String(integ.body_end_code || '').trim();
      } catch {
        /* fallback */
      }
      if (!empty.ga4_id) {
        try {
          const data = await fetchLandingData(LANDING_KURUM_KOD);
          empty.ga4_id = (data?.settings?.google_analytics_id || '').trim();
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setCodes(empty);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!codes?.head_code || !isPublicMarketingPath(pathname)) return;
    injectHtmlScripts(codes.head_code, document.head);
  }, [codes?.head_code, pathname]);

  if (!codes || !isPublicMarketingPath(pathname)) return null;

  const gtmId = codes.gtm_id.startsWith('GTM-') ? codes.gtm_id : '';
  const ga4Id = !gtmId && codes.ga4_id.startsWith('G-') ? codes.ga4_id : '';

  return (
    <>
      {gtmId && (
        <>
          <Script id="google-tag-manager" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`}
          </Script>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
              title="Google Tag Manager"
            />
          </noscript>
        </>
      )}

      {ga4Id && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics-gtag" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${ga4Id}');
            `}
          </Script>
        </>
      )}

      {codes.body_start_code ? (
        <div
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: codes.body_start_code }}
        />
      ) : null}

      {codes.body_end_code ? (
        <div
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: codes.body_end_code }}
        />
      ) : null}
    </>
  );
}
