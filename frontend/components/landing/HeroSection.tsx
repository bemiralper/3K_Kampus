'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import type { SiteSettings, HeroSlide } from '@/lib/website-api';
import { resolveMediaUrl } from '@/lib/website-api';
import { LANDING_COLORS } from '@/lib/landing-theme';
import RotatingWords from './RotatingWords';
import HoverGallery, { type HoverGalleryImage } from './HoverGallery';

type HeroSectionProps = {
  settings: SiteSettings | null;
  heroSlides: HeroSlide[];
  onLoginClick: () => void;
};

const GALLERY_IMAGES: HoverGalleryImage[] = [
  {
    src: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&q=80&auto=format&fit=crop',
    alt: '3K Kampüs grup dersi',
    caption: 'Kurs',
  },
  {
    src: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=1200&q=80&auto=format&fit=crop',
    alt: '3K Kampüs kütüphane ve etüt',
    caption: 'Kütüphane',
  },
  {
    src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200&q=80&auto=format&fit=crop',
    alt: '3K Kampüs birebir koçluk',
    caption: 'Koçluk',
  },
  {
    src: 'https://images.unsplash.com/photo-1513258496099-48168024aec0?w=1200&q=80&auto=format&fit=crop',
    alt: '3K Kampüs öğrenci başarısı',
    caption: 'Başarı',
  },
];

export default function HeroSection({ settings, heroSlides, onLoginClick }: HeroSectionProps) {
  const mediaCache = settings?.settings_updated_at || null;
  const baslik = settings?.hero_baslik || '3K Kampüs';
  const altBaslik = settings?.hero_alt_baslik || 'LGS • YKS • Okul Destek Programları';
  const slogan = settings?.hero_slogan || 'Başarıya Giden Yolun Dijital Takip Sistemi';
  const maddeler = settings?.hero_maddeler?.length
    ? settings.hero_maddeler
    : ['5 Kişilik Grup Dersleri', 'Birebir Özel Ders', 'Deneme Analizleri', 'Bireysel Koçluk'];
  const heroImage = heroSlides.find(s => s.gorsel_url)?.gorsel_url;
  const heroImageSrc = heroImage ? resolveMediaUrl(heroImage, mediaCache) : null;

  const rotatingWords = settings?.hero_rotating_words?.length
    ? settings.hero_rotating_words
    : ['KURS', 'KÜTÜPHANE', 'KOÇLUK'];

  // Galeri: panelden gelen görseller > yüklenen hero görseli > varsayılan set
  const configuredGallery = (settings?.hero_gallery ?? [])
    .filter((g) => g && g.url && String(g.url).trim())
    .map((g) => ({
      src: resolveMediaUrl(g.url, mediaCache) || g.url,
      alt: g.caption || baslik,
      caption: g.caption,
    }));
  const galleryImages: HoverGalleryImage[] =
    configuredGallery.length > 0
      ? configuredGallery
      : heroImageSrc
        ? [{ src: heroImageSrc, alt: baslik, caption: baslik }, ...GALLERY_IMAGES]
        : GALLERY_IMAGES;
  const reduce = useReducedMotion();

  const container = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduce ? 0 : 0.09, delayChildren: 0.05 },
    },
  };
  const item = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 22 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  return (
    <section id="anasayfa" className="relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-95"
        style={{ background: `linear-gradient(135deg, ${LANDING_COLORS.navy} 0%, ${LANDING_COLORS.navyLight} 50%, ${LANDING_COLORS.accent} 100%)` }}
      />
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
      <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:gap-10 sm:py-14 lg:grid-cols-2 lg:items-center lg:gap-10 lg:px-8 lg:py-20">
        <motion.div className="text-white" variants={container} initial="hidden" animate="show">
          <motion.p variants={item} className="mb-2 text-xs font-medium uppercase tracking-widest text-white/70 sm:text-sm">Eğitim Merkezi</motion.p>
          <motion.div variants={item} className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-extrabold uppercase tracking-tight text-white sm:text-3xl md:text-4xl">3K</span>
            <span className="hidden h-7 w-px bg-white/30 sm:inline-block self-center" aria-hidden />
            <RotatingWords
              words={rotatingWords}
              className="text-2xl font-extrabold uppercase tracking-tight text-white sm:text-3xl md:text-4xl"
            />
          </motion.div>
          <motion.h1 variants={item} className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">{baslik}</motion.h1>
          <motion.p variants={item} className="mt-3 text-base font-medium text-white/90 sm:text-lg md:text-xl">{altBaslik}</motion.p>
          <motion.p variants={item} className="mt-3 max-w-lg text-sm leading-relaxed text-white/80 sm:mt-4 sm:text-base">{slogan}</motion.p>
          <motion.ul variants={item} className="mt-6 grid gap-2.5 sm:mt-8 sm:grid-cols-2 sm:gap-3">
            {maddeler.map(itemLabel => (
              <li key={itemLabel} className="flex items-center gap-2 text-xs text-white/90 sm:text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                </span>
                {itemLabel}
              </li>
            ))}
          </motion.ul>
          <motion.div variants={item} className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap">
            <motion.button
              type="button"
              onClick={onLoginClick}
              className="w-full rounded-xl bg-white px-6 py-3 text-sm font-semibold shadow-lg transition sm:w-auto"
              style={{ color: LANDING_COLORS.navy }}
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Giriş Yap
            </motion.button>
            <Link
              href="/3k-sistemi"
              className="w-full rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-center text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 sm:w-auto"
            >
              3K Sistemini Tanıyın
            </Link>
          </motion.div>
        </motion.div>
        <motion.div
          className="relative w-full min-w-0"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        >
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/20 bg-black/25 shadow-2xl sm:rounded-2xl">
            <HoverGallery images={galleryImages} />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
