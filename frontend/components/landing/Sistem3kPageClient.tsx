'use client';

import { Suspense, useEffect, useState } from 'react';
import { fetchKurumBrandingByKod } from '@/lib/kurum-branding-api';
import KurumBrandingHead from '@/components/branding/KurumBrandingHead';
import {
  DEFAULT_BRANDING,
  mergeBranding,
  type KurumBranding,
} from '@/lib/kurum-branding';
import { fetchLandingData, type LandingData } from '@/lib/website-api';
import { LANDING_KURUM_KOD, SITE_TAB_TITLE } from '@/lib/landing-theme';
import TopBar, { TopBarMobile } from '@/components/landing/TopBar';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import Sistem3kContent from '@/components/landing/3k-sistemi/Sistem3kContent';
import LoginModal from '@/components/login/LoginModal';

function Sistem3kPageInner({ initialData }: { initialData: LandingData | null }) {
  const [data, setData] = useState<LandingData | null>(initialData);
  const [branding, setBranding] = useState<KurumBranding>(DEFAULT_BRANDING);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const brandRes = await fetchKurumBrandingByKod(LANDING_KURUM_KOD);
      if (cancelled) return;
      const landing = initialData ?? (await fetchLandingData(LANDING_KURUM_KOD));
      if (cancelled) return;
      if (landing) setData(landing);
      if (brandRes.success && brandRes.data) setBranding(brandRes.data);
      else if (landing?.kurum) setBranding(mergeBranding(landing.kurum));
    };
    load();
    return () => { cancelled = true; };
  }, [initialData]);

  const b = mergeBranding(data?.kurum ? { ...branding, ...data.kurum } : branding);

  const settings = data?.settings ?? null;

  return (
    <>
      <KurumBrandingHead branding={b} documentTitle={SITE_TAB_TITLE} />
      <div className="min-h-screen bg-white">
        <TopBar settings={settings} socialLinks={data?.social_links ?? []} />
        <TopBarMobile settings={settings} />
        <LandingHeader branding={b} onLoginClick={() => setLoginOpen(true)} />
        <Sistem3kContent />
        <LandingFooter
          settings={settings}
          footerLinks={data?.footer_links ?? []}
          socialLinks={data?.social_links ?? []}
          brandName={b.gorunen_ad}
        />
      </div>
      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        branding={b}
        kurumKod={LANDING_KURUM_KOD}
      />
    </>
  );
}

type Sistem3kPageClientProps = {
  initialData?: LandingData | null;
};

export default function Sistem3kPageClient({ initialData = null }: Sistem3kPageClientProps) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#1e3a5f]" /></div>}>
      <Sistem3kPageInner initialData={initialData} />
    </Suspense>
  );
}
