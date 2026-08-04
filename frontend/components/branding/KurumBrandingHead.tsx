'use client';

import { useEffect } from 'react';
import type { KurumBranding } from '@/lib/kurum-branding';
import {
  applyFavicon,
  brandingFaviconKey,
  rememberPreferredFavicon,
} from '@/lib/kurum-branding';

type Props = {
  branding: KurumBranding;
  /** Sabit sekme başlığı — verilirse suffix/gorunen_ad kullanılmaz */
  documentTitle?: string;
  titleSuffix?: string;
  /**
   * true: client applyFavicon. Landing’de false — SSR/metadata ikonu kalsın;
   * tercih edilen kurum favicon’u yine session’a yazılır (login sonrası için).
   */
  manageFavicon?: boolean;
};

export default function KurumBrandingHead({
  branding,
  documentTitle,
  titleSuffix = 'Giriş',
  manageFavicon = true,
}: Props) {
  const faviconKey = brandingFaviconKey(branding);

  useEffect(() => {
    document.title = documentTitle ?? `${branding.gorunen_ad} — ${titleSuffix}`;
    rememberPreferredFavicon(branding);
    if (manageFavicon) applyFavicon(branding);
  }, [faviconKey, branding.gorunen_ad, branding.favicon_url, documentTitle, titleSuffix, manageFavicon, branding]);

  return null;
}
