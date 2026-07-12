'use client';

import { Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { fetchKurumBrandingByKod } from '@/lib/kurum-branding-api';
import KurumBrandingHead from '@/components/branding/KurumBrandingHead';
import {
  DEFAULT_BRANDING,
  mergeBranding,
  type KurumBranding,
} from '@/lib/kurum-branding';
import { fetchLandingData, type LandingData } from '@/lib/website-api';
import { LANDING_COLORS, LANDING_KURUM_KOD, SITE_TAB_TITLE } from '@/lib/landing-theme';
import TopBar, { TopBarMobile } from '@/components/landing/TopBar';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import IletisimSection from '@/components/landing/IletisimSection';
import LoginModal from '@/components/login/LoginModal';

type Props = {
  initialData?: LandingData | null;
};

function IletisimPageInner({ initialData = null }: Props) {
  const [data, setData] = useState<LandingData | null>(initialData);
  const [branding, setBranding] = useState<KurumBranding>(DEFAULT_BRANDING);
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
    void load();
    return () => { cancelled = true; };
  }, [initialData]);

  const b = mergeBranding(data?.kurum ? { ...branding, ...data.kurum } : branding);
  const settings = data?.settings ?? null;

  return (
    <>
      <KurumBrandingHead branding={b} documentTitle={`İletişim · ${b.gorunen_ad || SITE_TAB_TITLE}`} manageFavicon={false} />
      <div className="min-h-screen bg-white">
        <TopBar settings={settings} socialLinks={data?.social_links ?? []} />
        <TopBarMobile settings={settings} />
        <LandingHeader branding={b} onLoginClick={() => setLoginOpen(true)} />

        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${LANDING_COLORS.navy} 0%, ${LANDING_COLORS.navyLight} 55%, ${LANDING_COLORS.accent} 100%)` }}
          />
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          <div className="relative mx-auto max-w-7xl px-4 py-14 text-white sm:py-16 lg:px-8 lg:py-20">
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70"
            >
              Bize Ulaşın
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl"
            >
              İletişim
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="mt-4 max-w-2xl text-sm leading-relaxed text-white/85 sm:text-base"
            >
              Kayıt, bilgi ve iş birliği talepleriniz için bize ulaşın. Formu doldurun ya da
              telefon, WhatsApp ve e-posta kanallarından bize yazın; en kısa sürede dönüş yapalım.
            </motion.p>
          </div>
        </section>

        <IletisimSection settings={settings} hideHeader />

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

export default function IletisimPageClient(props: Props) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#1e3a5f]" /></div>}>
      <IletisimPageInner {...props} />
    </Suspense>
  );
}
