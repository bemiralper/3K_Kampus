'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { getHeaderLogo, mergeBranding, type KurumBranding } from '@/lib/kurum-branding';
import { LANDING_COLORS, SECTION_SCROLL_ORDER } from '@/lib/landing-theme';
import { NAV_ITEMS, handleLandingNav, navItemActiveId } from '@/lib/landing-nav';
import MobileMenu from './MobileMenu';

type LandingHeaderProps = {
  branding: KurumBranding;
  onLoginClick: () => void;
};

export default function LandingHeader({ branding, onLoginClick }: LandingHeaderProps) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [scrollActiveId, setScrollActiveId] = useState('anasayfa');
  const [mobileOpen, setMobileOpen] = useState(false);
  const b = mergeBranding(branding);
  const logo = getHeaderLogo(b);

  const activeId = navItemActiveId(pathname, scrollActiveId);

  useEffect(() => {
    if (pathname !== '/') {
      setScrolled(true);
      return;
    }

    let ticking = false;
    let lastScrolled = window.scrollY > 16;
    let lastActiveId = 'anasayfa';

    const update = () => {
      ticking = false;
      const newScrolled = window.scrollY > 16;
      if (newScrolled !== lastScrolled) {
        lastScrolled = newScrolled;
        setScrolled(newScrolled);
      }

      const offset = 120;
      let current = 'anasayfa';
      for (const id of SECTION_SCROLL_ORDER) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) {
          current = id;
        }
      }
      if (current !== lastActiveId) {
        lastActiveId = current;
        setScrollActiveId(current);
      }
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  const navClick = (href: string) => handleLandingNav(href, pathname);

  return (
    <>
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={`landing-header ${scrolled ? 'is-scrolled' : ''}`}
      >
        <div className="landing-header__inner">
          <Link href="/" className="landing-header__brand" aria-label={b.gorunen_ad}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={b.gorunen_ad} className="landing-header__logo" />
            <span className="landing-header__brand-text">{b.gorunen_ad}</span>
          </Link>

          <nav className="landing-header__nav" aria-label="Ana menü">
            {NAV_ITEMS.map((item) => {
              const isActive = activeId === item.id;
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => navClick(item.href)}
                  className={`landing-navlink ${isActive ? 'is-active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {isActive && (
                    <motion.span
                      layoutId="landing-nav-pill"
                      className="landing-navlink__pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="landing-navlink__label">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="landing-header__actions">
            <motion.button
              type="button"
              onClick={onLoginClick}
              className="landing-header__login"
              whileHover={{ y: -1, scale: 1.015 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 24 }}
            >
              Giriş Yap
            </motion.button>
            <button
              type="button"
              className="landing-header__burger"
              onClick={() => setMobileOpen(true)}
              aria-label="Menüyü aç"
              aria-expanded={mobileOpen}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
          </div>
        </div>
      </motion.header>

      <style jsx global>{`
        .landing-header {
          position: sticky;
          top: 0;
          z-index: 50;
          border-bottom: 1px solid transparent;
          background: rgba(255, 255, 255, 0.72);
          transition: background 0.35s ease, box-shadow 0.35s ease,
            border-color 0.35s ease, backdrop-filter 0.35s ease;
        }
        .landing-header.is-scrolled {
          background: rgba(255, 255, 255, 0.9);
          border-bottom-color: rgba(226, 232, 240, 0.8);
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
          backdrop-filter: saturate(180%) blur(14px);
          -webkit-backdrop-filter: saturate(180%) blur(14px);
        }
        .landing-header__inner {
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 1.5rem;
          max-width: 80rem;
          height: 4.5rem;
          padding: 0 1rem;
          transition: height 0.35s ease;
        }
        .landing-header.is-scrolled .landing-header__inner {
          height: 3.85rem;
        }
        @media (min-width: 1024px) {
          .landing-header__inner {
            padding: 0 2rem;
          }
        }
        .landing-header__brand {
          display: inline-flex;
          align-items: center;
          gap: 0.625rem;
          flex-shrink: 0;
          text-decoration: none;
        }
        .landing-header__logo {
          height: 2.4rem;
          width: auto;
          max-width: 8.75rem;
          object-fit: contain;
          transition: height 0.35s ease;
        }
        .landing-header.is-scrolled .landing-header__logo {
          height: 2.1rem;
        }
        .landing-header__brand-text {
          display: none;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: ${LANDING_COLORS.navy};
        }
        @media (min-width: 640px) {
          .landing-header__brand-text {
            display: block;
          }
        }
        .landing-header__nav {
          display: none;
          flex: 1;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
        }
        @media (min-width: 1024px) {
          .landing-header__nav {
            display: flex;
          }
        }
        .landing-navlink {
          position: relative;
          display: inline-flex;
          align-items: center;
          padding: 0.5rem 1rem;
          border: none;
          background: transparent;
          font-size: 0.9375rem;
          font-weight: 500;
          color: ${LANDING_COLORS.gray700};
          letter-spacing: -0.01em;
          cursor: pointer;
          border-radius: 999px;
          transition: color 0.2s ease;
        }
        .landing-navlink__label {
          position: relative;
          z-index: 1;
        }
        .landing-navlink__pill {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: ${LANDING_COLORS.accent}14;
          z-index: 0;
        }
        .landing-navlink:hover {
          color: ${LANDING_COLORS.accent};
        }
        .landing-navlink.is-active {
          color: ${LANDING_COLORS.accent};
          font-weight: 600;
        }
        .landing-header__actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-left: auto;
        }
        .landing-header__login {
          display: none;
          align-items: center;
          justify-content: center;
          padding: 0.6rem 1.4rem;
          border: none;
          border-radius: 999px;
          background: linear-gradient(135deg, ${LANDING_COLORS.accent} 0%, ${LANDING_COLORS.navyLight} 100%);
          color: #fff;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(2, 98, 167, 0.32);
        }
        @media (min-width: 640px) {
          .landing-header__login {
            display: inline-flex;
          }
        }
        .landing-header__burger {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.6rem;
          height: 2.6rem;
          border: 1px solid ${LANDING_COLORS.gray200};
          border-radius: 0.75rem;
          background: #fff;
          color: ${LANDING_COLORS.navy};
          cursor: pointer;
          flex-shrink: 0;
        }
        @media (min-width: 1024px) {
          .landing-header__burger {
            display: none;
          }
        }
        [id="anasayfa"], [id="duyurular"], [id="ders-formatlari"],
        [id="sinav-takvimi"], [id="iletisim"], [id="sss"] {
          scroll-margin-top: 5.5rem;
        }
      `}</style>

      <MobileMenu
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onLoginClick={() => { setMobileOpen(false); onLoginClick(); }}
        activeId={activeId}
        onNavClick={navClick}
      />
    </>
  );
}
