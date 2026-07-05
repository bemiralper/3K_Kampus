'use client';

import { useEffect } from 'react';
import type { KurumBranding } from '@/lib/kurum-branding';
import { applyFavicon, brandingFaviconKey } from '@/lib/kurum-branding';

type Props = {
  branding: KurumBranding;
  /** Sabit sekme başlığı — verilirse suffix/gorunen_ad kullanılmaz */
  documentTitle?: string;
  titleSuffix?: string;
  /** false: favicon Next.js metadata ile yönetilir (anasayfa) */
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
    if (manageFavicon) applyFavicon(branding);
  }, [faviconKey, branding.gorunen_ad, documentTitle, titleSuffix, manageFavicon]);

  return null;
}
