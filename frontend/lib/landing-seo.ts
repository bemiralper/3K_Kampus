import type { Metadata } from 'next';
import type { Duyuru, LandingData } from '@/lib/website-api';
import { resolveMediaUrl } from '@/lib/website-api';
import { mergeBranding, getFaviconUrl, getAppLogo } from '@/lib/kurum-branding';
import { absoluteSiteUrl } from '@/lib/site-url';
import { SITE_TAB_TITLE } from '@/lib/landing-theme';

/** Göreli /media/... yolunu WhatsApp OG için mutlak HTTPS URL yapar */
export function absoluteMediaUrl(url: string | null | undefined): string | undefined {
  const resolved = resolveMediaUrl(url);
  if (!resolved) return undefined;
  return absoluteSiteUrl(resolved);
}

/** Duyuru / haber detay — WhatsApp & sosyal önizleme */
export function buildDuyuruMetadata(duyuru: Duyuru, slug: string): Metadata {
  const title = duyuru.baslik || 'Duyuru';
  const pageTitle = `${title} · ${SITE_TAB_TITLE}`;
  const description = (duyuru.ozet || '').trim() || undefined;
  const canonical = absoluteSiteUrl(`/duyurular/${slug}`);
  const cover =
    absoluteMediaUrl(duyuru.kapak_gorseli_url) ||
    absoluteMediaUrl(duyuru.kapak_thumb_url);

  return {
    title: pageTitle,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      locale: 'tr_TR',
      url: canonical,
      siteName: SITE_TAB_TITLE,
      title,
      description,
      ...(cover
        ? {
            images: [
              {
                url: cover,
                width: 1200,
                height: 675,
                alt: title,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: cover ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

export function buildLandingMetadata(data: LandingData | null, path = '/'): Metadata {
  const branding = mergeBranding(data?.kurum);
  const settings = data?.settings;
  const title = settings?.seo_baslik || branding.gorunen_ad || '3K Kampüs';
  const description =
    settings?.seo_aciklama ||
    `${branding.gorunen_ad} — akademik takip, bireysel koçluk ve deneme analizleri.`;
  const canonical = settings?.seo_canonical_url || absoluteSiteUrl(path);
  const keywords = settings?.seo_anahtar_kelimeler
    ? settings.seo_anahtar_kelimeler.split(',').map((k) => k.trim()).filter(Boolean)
    : undefined;
  const indexable = settings?.seo_robots_index !== false;
  const ogImage = branding.app_logo_url || branding.login_logo_url;
  const ogImageUrl = ogImage ? absoluteSiteUrl(getAppLogo(branding)) : undefined;
  // Favicon: same-origin (göreli) yol — hem dev hem prod'da çalışır ve
  // Next.js head <link> düğümleriyle client tarafı DOM çakışması yaratmaz.
  const faviconUrl = getFaviconUrl(branding);

  const metadata: Metadata = {
    title,
    description,
    keywords,
    alternates: { canonical },
    robots: indexable
      ? { index: true, follow: true, googleBot: { index: true, follow: true } }
      : { index: false, follow: false },
    openGraph: {
      type: 'website',
      locale: 'tr_TR',
      url: canonical,
      siteName: branding.gorunen_ad,
      title,
      description,
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, alt: branding.gorunen_ad }] } : {}),
    },
    twitter: {
      card: ogImageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImageUrl ? { images: [ogImageUrl] } : {}),
    },
    icons: {
      icon: faviconUrl,
      apple: faviconUrl,
    },
  };

  if (settings?.google_site_verification?.trim()) {
    metadata.verification = {
      google: settings.google_site_verification.trim(),
    };
  }

  return metadata;
}
