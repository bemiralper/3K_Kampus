'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
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
import LoginModal from '@/components/login/LoginModal';

type Props = {
  initialData?: LandingData | null;
  documentTitle: string;
  heroEyebrow?: string;
  heroTitle: string;
  heroSubtitle?: string;
  breadcrumb?: { label: string; href: string }[];
  children: ReactNode;
};

function PublicContentShellInner({
  initialData = null,
  documentTitle,
  heroEyebrow = 'Kurumsal',
  heroTitle,
  heroSubtitle,
  breadcrumb = [],
  children,
}: Props) {
  const [data, setData] = useState<LandingData | null>(initialData);
  const [branding, setBranding] = useState<KurumBranding>(() =>
    initialData?.kurum ? mergeBranding(initialData.kurum) : DEFAULT_BRANDING,
  );
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [landing, brandRes] = await Promise.all([
        initialData ? Promise.resolve(initialData) : fetchLandingData(LANDING_KURUM_KOD),
        fetchKurumBrandingByKod(LANDING_KURUM_KOD),
      ]);
      if (cancelled) return;
      if (landing) setData(landing);
      if (brandRes.success && brandRes.data) setBranding(brandRes.data);
      else if (landing?.kurum) setBranding(mergeBranding(landing.kurum));
    })();
    return () => { cancelled = true; };
  }, [initialData]);

  const b = mergeBranding(data?.kurum ? { ...branding, ...data.kurum } : branding);
  const settings = data?.settings ?? null;

  return (
    <>
      <KurumBrandingHead
        branding={b}
        documentTitle={`${documentTitle} · ${b.gorunen_ad || SITE_TAB_TITLE}`}
        manageFavicon={false}
      />
      <div className="min-h-screen bg-slate-50">
        <TopBar settings={settings} socialLinks={data?.social_links ?? []} />
        <TopBarMobile settings={settings} />
        <LandingHeader branding={b} onLoginClick={() => setLoginOpen(true)} />

        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${LANDING_COLORS.navy} 0%, ${LANDING_COLORS.navyLight} 55%, ${LANDING_COLORS.accent} 100%)`,
            }}
          />
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />
          <div className="relative mx-auto max-w-7xl px-4 py-12 text-white sm:py-14 lg:px-8 lg:py-16">
            {breadcrumb.length > 0 && (
              <nav className="mb-4 flex flex-wrap items-center gap-2 text-xs text-white/70" aria-label="Breadcrumb">
                <Link href="/" className="hover:text-white">Anasayfa</Link>
                {breadcrumb.map((cr) => (
                  <span key={cr.href} className="flex items-center gap-2">
                    <span aria-hidden>/</span>
                    <Link href={cr.href} className="hover:text-white">{cr.label}</Link>
                  </span>
                ))}
              </nav>
            )}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70"
            >
              {heroEyebrow}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-[2.75rem]"
            >
              {heroTitle}
            </motion.h1>
            {heroSubtitle && (
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mt-4 max-w-2xl text-sm leading-relaxed text-white/85 sm:text-base"
              >
                {heroSubtitle}
              </motion.p>
            )}
          </div>
        </section>

        <main className="relative z-[1] mx-auto max-w-7xl px-4 pb-16 pt-8 lg:px-8 lg:pb-20 lg:pt-10">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-8 lg:p-10">
            {children}
          </div>
        </main>

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

export default function PublicContentShell(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#1e3a5f]" />
        </div>
      }
    >
      <PublicContentShellInner {...props} />
    </Suspense>
  );
}
