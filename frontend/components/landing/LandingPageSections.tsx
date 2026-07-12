'use client';

import type { LandingData, SiteSettings } from '@/lib/website-api';
import { resolveLandingSectionOrder, isBolumSectionKey, bolumIdFromKey, isLandingSectionVisible } from '@/lib/landing-section-order';
import { resolveLandingBolum } from '@/lib/landing-sections';
import DersFormatlariSection from './DersFormatlariSection';
import DuyurularSection from './DuyurularSection';
import SinavTakvimiSection from './SinavTakvimiSection';
import NedenSection from './NedenSection';
import Sistem3kTeaser from './Sistem3kTeaser';
import LandingFeatureSection from './LandingFeatureSection';
import YorumlarSlider from './YorumlarSlider';
import SSSSection from './SSSSection';
import LandingRevealSection from './LandingRevealSection';

type Props = {
  settings: SiteSettings | null;
  data: LandingData;
};

export default function LandingPageSections({ settings, data }: Props) {
  const bolumIds = (settings?.landing_bolumleri ?? []).map((b) => b.id);
  const order = resolveLandingSectionOrder(settings?.landing_section_order, bolumIds)
    .filter((key) => key !== 'quick-access');

  let customBolumIndex = 0;

  return (
    <>
      {order.map((key) => {
        if (!isLandingSectionVisible(key, settings)) return null;

        const wrap = (node: React.ReactNode) =>
          node ? <LandingRevealSection key={key}>{node}</LandingRevealSection> : null;

        switch (key) {
          case 'ders-formatlari':
            return wrap(<DersFormatlariSection settings={settings} />);
          case 'duyurular':
            return wrap(<DuyurularSection duyurular={data.duyurular ?? []} />);
          case 'sinav-takvimi':
            return wrap(<SinavTakvimiSection sinavlar={data.sinav_takvimi ?? []} />);
          case 'neden':
            return wrap(
              <NedenSection
                kartlar={data.neden_kartlari ?? []}
                baslik={settings?.neden_baslik}
                altBaslik={settings?.neden_alt_baslik}
              />,
            );
          case 'sistem3k':
            return wrap(<Sistem3kTeaser settings={settings} />);
          case 'yorumlar':
            return wrap(<YorumlarSlider yorumlar={data.ogrenci_yorumlari ?? []} />);
          case 'sss':
            return wrap(<SSSSection items={data.sss ?? []} />);
          default:
            if (isBolumSectionKey(key)) {
              const id = bolumIdFromKey(key);
              const raw = settings?.landing_bolumleri?.find((b) => b.id === id);
              if (!raw) return null;
              const b = resolveLandingBolum(raw);
              if (!b.cards?.length) return null;
              const bgClass = customBolumIndex % 2 === 0 ? 'bg-slate-50' : 'bg-white';
              customBolumIndex += 1;
              return wrap(
                <LandingFeatureSection
                  sectionId={b.section_id || b.id}
                  eyebrow={b.eyebrow}
                  title={b.title || 'Bölüm'}
                  subtitle={b.subtitle}
                  footerNote={b.footer_note}
                  cards={b.cards}
                  bgClass={bgClass}
                />,
              );
            }
            return null;
        }
      })}
    </>
  );
}
