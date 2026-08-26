import { cache } from 'react';
import { fetchLandingData } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';

/** Kurumsal landing sayfaları — build zamanında değil, istek anında SSR */
export const landingPageDynamic = 'force-dynamic' as const;

/** `next build` worker’ı Django’ya bağlanmasın (4GB canlıda static timeout). */
export function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

export const getLandingPageData = cache(() => {
  if (isNextProductionBuild()) return Promise.resolve(null);
  return fetchLandingData(LANDING_KURUM_KOD);
});
