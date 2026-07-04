'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { fetchKurumBrandingByKod } from '@/lib/kurum-branding-api';
import KurumBrandingHead from '@/components/branding/KurumBrandingHead';
import {
  DEFAULT_BRANDING,
  LOGIN_KURUM_KOD_KEY,
  mergeBranding,
  type KurumBranding,
} from '@/lib/kurum-branding';
import { fetchLandingData, type LandingData } from '@/lib/website-api';
import { LANDING_KURUM_KOD, SITE_TAB_TITLE, applyPendingLandingScroll } from '@/lib/landing-theme';
import TopBar, { TopBarMobile } from './TopBar';
import LandingHeader from './LandingHeader';
import HeroSection from './HeroSection';
import QuickAccessCards from './QuickAccessCards';
import DuyurularSection from './DuyurularSection';
import SinavTakvimiSection from './SinavTakvimiSection';
import NedenSection from './NedenSection';
import Sistem3kTeaser from './Sistem3kTeaser';
import DersFormatlariSection from './DersFormatlariSection';
import YorumlarSlider from './YorumlarSlider';
import SSSSection from './SSSSection';
import IletisimSection from './IletisimSection';
import LandingFooter from './LandingFooter';
import LandingRevealSection from './LandingRevealSection';
import LoginModal from '@/components/login/LoginModal';

function LandingPageInner({ initialData }: { initialData: LandingData | null }) {
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<LandingData | null>(initialData);
  const [branding, setBranding] = useState<KurumBranding>(() =>
    initialData?.kurum ? mergeBranding(initialData.kurum) : DEFAULT_BRANDING,
  );
  const [loginOpen, setLoginOpen] = useState(false);

  const girisParam = searchParams.get('giris') === '1';

  useEffect(() => {
    if (girisParam) setLoginOpen(true);
  }, [girisParam]);

  useEffect(() => {
    applyPendingLandingScroll();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!initialData?.kurum) {
        const brandRes = await fetchKurumBrandingByKod(LANDING_KURUM_KOD);
        if (cancelled) return;
        if (brandRes.success && brandRes.data) {
          setBranding(brandRes.data);
          sessionStorage.setItem(LOGIN_KURUM_KOD_KEY, LANDING_KURUM_KOD);
        }
      }

      if (initialData) return;

      const landing = await fetchLandingData(LANDING_KURUM_KOD);
      if (cancelled || !landing) return;
      setData(landing);
      setBranding(mergeBranding(landing.kurum));
      sessionStorage.setItem(LOGIN_KURUM_KOD_KEY, LANDING_KURUM_KOD);
    };
    void load();
    return () => { cancelled = true; };
  }, [initialData]);

  const b = mergeBranding(data?.kurum ? { ...branding, ...data.kurum } : branding);

  if (isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: `linear-gradient(135deg, ${b.login_arkaplan_rengi}, ${b.login_arkaplan_rengi_2})` }}>
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      </div>
    );
  }

  const settings = data?.settings ?? null;

  return (
    <>
      <KurumBrandingHead branding={b} documentTitle={SITE_TAB_TITLE} />
      <div className="min-h-screen bg-white">
        <TopBar settings={settings} socialLinks={data?.social_links ?? []} />
        <TopBarMobile settings={settings} />
        <LandingHeader branding={b} onLoginClick={() => setLoginOpen(true)} />
        <HeroSection
          settings={settings}
          heroSlides={data?.hero_slides ?? []}
          onLoginClick={() => setLoginOpen(true)}
        />
        <LandingRevealSection>
          <QuickAccessCards />
        </LandingRevealSection>
        <LandingRevealSection>
          <DersFormatlariSection />
        </LandingRevealSection>
        <LandingRevealSection>
          <DuyurularSection duyurular={data?.duyurular ?? []} />
        </LandingRevealSection>
        <LandingRevealSection>
          <SinavTakvimiSection sinavlar={data?.sinav_takvimi ?? []} />
        </LandingRevealSection>
        <LandingRevealSection>
          <NedenSection kartlar={data?.neden_kartlari ?? []} />
        </LandingRevealSection>
        <LandingRevealSection>
          <Sistem3kTeaser settings={settings} />
        </LandingRevealSection>
        <LandingRevealSection>
          <YorumlarSlider yorumlar={data?.ogrenci_yorumlari ?? []} />
        </LandingRevealSection>
        <LandingRevealSection>
          <SSSSection items={data?.sss ?? []} />
        </LandingRevealSection>
        <LandingRevealSection>
          <IletisimSection settings={settings} />
        </LandingRevealSection>
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

type LandingPageClientProps = {
  initialData?: LandingData | null;
};

export default function LandingPageClient({ initialData = null }: LandingPageClientProps) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#1e3a5f]" /></div>}>
      <LandingPageInner initialData={initialData} />
    </Suspense>
  );
}
