'use client';

import { useEffect } from 'react';
import type { KurumBranding } from '@/lib/kurum-branding';
import { applyFavicon, brandingFaviconKey } from '@/lib/kurum-branding';

type Props = {
  branding: KurumBranding;
  /** Sabit sekme başlığı — verilirse suffix/gorunen_ad kullanılmaz */
  documentTitle?: string;
  titleSuffix?: string;
};

export default function KurumBrandingHead({ branding, documentTitle, titleSuffix = 'Giriş' }: Props) {
  const faviconKey = brandingFaviconKey(branding);

  useEffect(() => {
    document.title = documentTitle ?? `${branding.gorunen_ad} — ${titleSuffix}`;
    applyFavicon(branding);
  }, [faviconKey, branding.gorunen_ad, documentTitle, titleSuffix]);

  return null;
}
