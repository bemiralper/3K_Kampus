'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getHeaderLogo, mergeBranding, type KurumBranding } from '@/lib/kurum-branding';
import { LANDING_COLORS, SECTION_SCROLL_ORDER, scrollToSection } from '@/lib/landing-theme';
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
    if (pathname !== '/') return;

    let ticking = false;
    let lastScrolled = window.scrollY > 20;
    let lastActiveId = 'anasayfa';

    const update = () => {
      ticking = false;
      const newScrolled = window.scrollY > 20;
      if (newScrolled !== lastScrolled) {
        lastScrolled = newScrolled;
        setScrolled(newScrolled);
      }

      const offset = 100;
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

  useEffect(() => {
    setScrolled(window.scrollY > 20);
  }, [pathname]);

  const navClick = (href: string) => {
    handleLandingNav(href, pathname);
  };

  return (
    <>
      <header
        className={`landing-header sticky top-0 z-50 ${
          scrolled
            ? 'border-b border-slate-200/60 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.06)] lg:bg-white/95 lg:shadow-[0_8px_30px_rgba(15,23,42,0.06)] lg:backdrop-blur-md'
            : 'border-b border-transparent bg-white lg:bg-white/90 lg:backdrop-blur-sm'
        }`}
      >
        <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center gap-6 px-4 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={b.gorunen_ad} className="h-10 w-auto max-w-[140px] object-contain" />
            <span className="hidden font-bold tracking-tight sm:block" style={{ color: LANDING_COLORS.navy }}>
              {b.gorunen_ad}
            </span>
          </Link>

          <nav className="landing-nav hidden flex-1 justify-center lg:flex" aria-label="Ana menü">
            <ul className="flex items-center gap-1">
              {NAV_ITEMS.map(item => {
                const isActive = activeId === item.id;
                return (
                  <li key={item.href}>
                    <button
                      type="button"
                      onClick={() => navClick(item.href)}
                      className={`landing-nav-link ${isActive ? 'is-active' : ''}`}
                    >
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onLoginClick}
              className="landing-login-btn hidden sm:inline-flex"
            >
              Giriş Yap
            </button>
            <button
              type="button"
              className="landing-menu-btn lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Menüyü aç"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <style jsx global>{`
        .landing-nav-link {
          position: relative;
          display: inline-flex;
          align-items: center;
          padding: 0.5rem 1rem;
          border: none;
          background: transparent !important;
          font-size: 14px;
          font-weight: 500;
          color: #475569;
          cursor: pointer;
          transition: color 0.2s ease;
          letter-spacing: -0.01em;
        }
        .landing-nav-link:hover {
          color: ${LANDING_COLORS.navy};
          background: transparent !important;
        }
        .landing-nav-link.is-active {
          color: ${LANDING_COLORS.accent};
          font-weight: 600;
          background: transparent !important;
        }
        .landing-nav-link.is-active::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 50%;
          transform: translateX(-50%);
          width: 24px;
          height: 2px;
          border-radius: 999px;
          background: ${LANDING_COLORS.accent};
        }
        [id="anasayfa"], [id="duyurular"], [id="ders-formatlari"], [id="sinav-takvimi"],
        [id="iletisim"], [id="sss"] {
          scroll-margin-top: 5.5rem;
        }
        .landing-login-btn {
          align-items: center;
          justify-content: center;
          padding: 0.55rem 1.35rem;
          border: none;
          border-radius: 999px;
          background: ${LANDING_COLORS.accent} !important;
          color: #fff !important;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          box-shadow: 0 2px 8px rgba(2, 98, 167, 0.35);
        }
        .landing-login-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(2, 98, 167, 0.4);
        }
        .landing-menu-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem;
          border: none;
          background: transparent !important;
          color: ${LANDING_COLORS.navy};
          cursor: pointer;
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
