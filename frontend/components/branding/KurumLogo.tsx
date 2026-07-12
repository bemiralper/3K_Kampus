'use client';

import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  brandingFromContext,
  brandingFaviconKey,
  getAppLogo,
  getLoginLogo,
  applyFavicon,
  applyKurumTheme,
  resetFaviconCache,
} from '@/lib/kurum-branding';

type Props = {
  /** app = açık sidebar, login = koyu sidebar (coach/muhasebe) */
  variant?: 'app' | 'login';
  width?: number;
  height?: number;
  showText?: boolean;
  className?: string;
  textClassName?: string;
};

export default function KurumLogo({
  variant = 'app',
  width = 40,
  height = 40,
  showText = true,
  className = '',
  textClassName = 'logo-text',
}: Props) {
  const { activeKurum, activeSube } = useKurum();
  const branding = brandingFromContext(activeKurum, activeSube);
  const src = variant === 'login' ? getLoginLogo(branding) : getAppLogo(branding);
  const name = branding.gorunen_ad;

  return (
    <div className={`logo-container ${className}`.trim()}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name}
        width={width}
        height={height}
        className="sidebar-logo"
        style={{ objectFit: 'contain' }}
      />
      {showText && <span className={textClassName}>{name}</span>}
    </div>
  );
}

/** Aktif kurum/şube teması + favicon — AppShell / portal layout'larda */
export function ActiveKurumBranding() {
  const { activeKurum, activeSube } = useKurum();
  const pathname = usePathname();
  const branding = useMemo(
    () => (activeKurum ? brandingFromContext(activeKurum, activeSube) : null),
    [activeKurum, activeSube],
  );
  const faviconKey = branding
    ? `${brandingFaviconKey(branding)}|s:${activeSube?.id ?? ''}|f:${activeSube?.favicon_url ?? ''}`
    : '';

  useEffect(() => {
    if (!branding) return;
    applyKurumTheme(branding);
    document.title = `${branding.gorunen_ad} — 3K Kampüs`;
    resetFaviconCache();
    applyFavicon(branding, { force: true });
    // Next client navigasyonunda metadata varsayılan icon'u yeniden ekleyebilir
  }, [branding, faviconKey, pathname]);

  return null;
}
