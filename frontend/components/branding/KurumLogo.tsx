'use client';

import { useEffect } from 'react';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  brandingFromKurum,
  getAppLogo,
  getLoginLogo,
  applyFavicon,
  DEFAULT_BRANDING,
  applyKurumTheme,
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
  const { activeKurum } = useKurum();
  const branding = activeKurum
    ? brandingFromKurum(activeKurum)
    : DEFAULT_BRANDING;
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

/** Aktif kurum teması + favicon — AppShell / portal layout'larda */
export function ActiveKurumBranding() {
  const { activeKurum } = useKurum();

  useEffect(() => {
    if (!activeKurum) return;
    const b = brandingFromKurum(activeKurum);
    applyKurumTheme(b);
    applyFavicon(b);
  }, [activeKurum?.id, activeKurum?.favicon_url, activeKurum?.tema_rengi]);

  return null;
}
