'use client';

import type { LandingData } from '@/lib/website-api';
import { mergeBranding } from '@/lib/kurum-branding';
import { absoluteSiteUrl } from '@/lib/site-url';
import { resolveCompanyInfo } from '@/lib/company-info';

type Props = {
  data: LandingData | null;
};

/** Google Rich Results — Organization + WebSite JSON-LD */
export default function LandingJsonLd({ data }: Props) {
  const branding = mergeBranding(data?.kurum);
  const settings = data?.settings;
  const company = resolveCompanyInfo(settings);
  const siteUrl = settings?.seo_canonical_url || absoluteSiteUrl('/');

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: branding.gorunen_ad,
    url: siteUrl,
    description: settings?.seo_aciklama || branding.slogan,
    telephone: company.telefonler.length === 1 ? company.telefonler[0] : company.telefonler,
    email: company.eposta,
    address: {
      '@type': 'PostalAddress',
      streetAddress: company.adres,
      addressCountry: 'TR',
    },
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: branding.gorunen_ad,
    url: siteUrl,
    description: settings?.seo_aciklama || branding.slogan,
    inLanguage: 'tr-TR',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </>
  );
}
