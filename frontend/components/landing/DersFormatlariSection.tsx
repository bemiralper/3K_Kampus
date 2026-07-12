'use client';

import type { SiteSettings } from '@/lib/website-api';
import { resolveDersFormatlariConfig } from '@/lib/landing-sections';
import LandingFeatureSection from './LandingFeatureSection';

type Props = {
  settings: SiteSettings | null;
};

export default function DersFormatlariSection({ settings }: Props) {
  const cfg = resolveDersFormatlariConfig(settings?.ders_formatlari_config);
  return (
    <LandingFeatureSection
      sectionId="ders-formatlari"
      eyebrow={cfg.eyebrow}
      title={cfg.title}
      subtitle={cfg.subtitle}
      footerNote={cfg.footer_note}
      cards={cfg.cards}
    />
  );
}
