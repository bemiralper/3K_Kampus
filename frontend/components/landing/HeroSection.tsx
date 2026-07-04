'use client';

import Link from 'next/link';
import type { SiteSettings, HeroSlide } from '@/lib/website-api';
import { resolveMediaUrl } from '@/lib/website-api';
import { LANDING_COLORS } from '@/lib/landing-theme';

type HeroSectionProps = {
  settings: SiteSettings | null;
  heroSlides: HeroSlide[];
  onLoginClick: () => void;
};

export default function HeroSection({ settings, heroSlides, onLoginClick }: HeroSectionProps) {
  const baslik = settings?.hero_baslik || '3K Kampüs';
  const altBaslik = settings?.hero_alt_baslik || 'LGS • YKS • Okul Destek Programları';
  const slogan = settings?.hero_slogan || 'Başarıya Giden Yolun Dijital Takip Sistemi';
  const maddeler = settings?.hero_maddeler?.length
    ? settings.hero_maddeler
    : ['5 Kişilik Grup Dersleri', 'Birebir Özel Ders', 'Deneme Analizleri', 'Bireysel Koçluk'];
  const heroImage = heroSlides.find(s => s.gorsel_url)?.gorsel_url;
  const heroImageSrc = heroImage ? resolveMediaUrl(heroImage) : null;

  return (
    <section id="anasayfa" className="relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-95"
        style={{ background: `linear-gradient(135deg, ${LANDING_COLORS.navy} 0%, ${LANDING_COLORS.navyLight} 50%, ${LANDING_COLORS.accent} 100%)` }}
      />
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
      <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:gap-10 sm:py-14 lg:grid-cols-2 lg:items-center lg:gap-10 lg:px-8 lg:py-20">
        <div className="text-white">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-white/70 sm:text-sm">Eğitim Merkezi</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">{baslik}</h1>
          <p className="mt-3 text-base font-medium text-white/90 sm:text-lg md:text-xl">{altBaslik}</p>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/80 sm:mt-4 sm:text-base">{slogan}</p>
          <ul className="mt-6 grid gap-2.5 sm:mt-8 sm:grid-cols-2 sm:gap-3">
            {maddeler.map(item => (
              <li key={item} className="flex items-center gap-2 text-xs text-white/90 sm:text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={onLoginClick}
              className="w-full rounded-xl bg-white px-6 py-3 text-sm font-semibold shadow-lg transition hover:bg-white/95 sm:w-auto"
              style={{ color: LANDING_COLORS.navy }}
            >
              Giriş Yap
            </button>
            <Link
              href="/3k-sistemi"
              className="w-full rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-center text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 sm:w-auto"
            >
              3K Sistemini Tanıyın
            </Link>
          </div>
        </div>
        <div className="relative w-full min-w-0">
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/20 bg-black/25 shadow-2xl sm:rounded-2xl">
            {heroImageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroImageSrc}
                alt={baslik}
                className="h-full w-full object-contain"
                width={1920}
                height={1080}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/10 backdrop-blur">
                <svg width="80" height="80" className="sm:h-[120px] sm:w-[120px]" viewBox="0 0 24 24" fill="white" opacity="0.3">
                  <path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/>
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
