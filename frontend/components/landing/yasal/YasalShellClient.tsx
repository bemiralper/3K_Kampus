'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
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
import LoginModal from '@/components/login/LoginModal';

type YasalShellClientProps = {
  children: ReactNode;
  pageTitle?: string;
  initialData?: LandingData | null;
};

function YasalShellInner({ children, initialData = null }: YasalShellClientProps) {
  const [data, setData] = useState<LandingData | null>(initialData);
  const [branding, setBranding] = useState<KurumBranding>(() =>
    initialData?.kurum ? mergeBranding(initialData.kurum) : DEFAULT_BRANDING,
  );
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [landing, brandRes] = await Promise.all([
        initialData ? Promise.resolve(initialData) : fetchLandingData(LANDING_KURUM_KOD),
        fetchKurumBrandingByKod(LANDING_KURUM_KOD),
      ]);
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
      <KurumBrandingHead branding={b} documentTitle={SITE_TAB_TITLE} manageFavicon={false} />
      <div className="min-h-screen bg-white">
        <TopBar settings={settings} socialLinks={data?.social_links ?? []} />
        <TopBarMobile settings={settings} />
        <LandingHeader branding={b} onLoginClick={() => setLoginOpen(true)} />
        {children}
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

export default function YasalShellClient(props: YasalShellClientProps) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#1e3a5f]" /></div>}>
      <YasalShellInner {...props} />
    </Suspense>
  );
}
