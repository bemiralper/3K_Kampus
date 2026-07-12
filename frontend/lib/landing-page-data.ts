import { cache } from 'react';
import { fetchLandingData } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';

/** Kurumsal landing sayfaları — build zamanında değil, istek anında SSR */
export const landingPageDynamic = 'force-dynamic' as const;

export const getLandingPageData = cache(() => fetchLandingData(LANDING_KURUM_KOD));
