'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  BookOpen,
  Calendar,
  ChevronDown,
  GraduationCap,
  Home,
  Info,
  LayoutGrid,
  LogIn,
  Mail,
  Menu,
  Megaphone,
  Phone,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { CmsNavItem } from '@/lib/website-api';
import { resolveMediaUrl } from '@/lib/website-api';
import { DEFAULT_APP_LOGO } from '@/lib/kurum-branding';
import { LANDING_COLORS } from '@/lib/landing-theme';
import './floating-dock.css';

export type FloatingDockItem = {
  id: string | number;
  label: string;
  href: string;
  description?: string;
  icon?: string;
  is_mega?: boolean;
  open_in_new_tab?: boolean;
  children?: FloatingDockItem[];
};

type Props = {
  items: FloatingDockItem[];
  logoUrl?: string | null;
  brandName?: string;
  loginHref?: string;
  loginLabel?: string;
  /** Hero altından sticky eşiği (px) */
  stickyOffset?: number;
  /** Scroll-spy / route active id (landing) */
  activeId?: string | null;
  /** Custom navigation (landing hash + hardNavigate) */
  onNavigate?: (href: string) => void;
  /** Login modal yerine link */
  onLoginClick?: () => void;
  /** Hero altına bindirme (negatif margin). Alt sayfalarda false. */
  overlapHero?: boolean;
  /** Üstte TopBar varken mobil barı kaydır */
  hasTopBar?: boolean;
};

const ICON_BY_KEY: Record<string, LucideIcon> = {
  home: Home,
  anasayfa: Home,
  programlar: GraduationCap,
  hakkimizda: Info,
  '3k-sistemi': LayoutGrid,
  duyurular: Megaphone,
  iletisim: Mail,
  'sinav-takvimi': Calendar,
  sinav: Calendar,
  book: BookOpen,
  phone: Phone,
};

function iconFor(item: FloatingDockItem): LucideIcon {
  const key = (item.icon || item.label || '').toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
  if (ICON_BY_KEY[key]) return ICON_BY_KEY[key];
  if (key.includes('program')) return GraduationCap;
  if (key.includes('duyuru')) return Megaphone;
  if (key.includes('iletisim') || key.includes('contact')) return Mail;
  if (key.includes('sistem')) return LayoutGrid;
  if (key.includes('hakkim')) return Info;
  if (key.includes('anasayfa') || item.href === '/') return Home;
  return LayoutGrid;
}

function isActiveHref(href: string, path: string, hash: string): boolean {
  if (!href) return false;
  if (href === '/') return path === '/' && !hash;
  if (href.startsWith('/#')) {
    return path === '/' && hash === href.slice(1);
  }
  if (href.startsWith('#')) {
    return path === '/' && hash === href;
  }
  return path === href || (href !== '/' && path.startsWith(href));
}

function navigateTo(href: string) {
  if (!href) return;
  if (href.startsWith('#')) {
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (href.startsWith('/#')) {
    if (window.location.pathname === '/') {
      const el = document.querySelector(href.slice(1));
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }
  window.location.assign(href);
}

export function cmsItemsToDock(items: CmsNavItem[] | undefined | null): FloatingDockItem[] {
  if (!items?.length) return [];
  return items
    .filter((i) => i.aktif !== false)
    .map((i) => ({
      id: i.id,
      label: i.label,
      href: i.url || '#',
      description: i.description,
      icon: i.icon,
      is_mega: i.is_mega,
      open_in_new_tab: i.open_in_new_tab,
      children: cmsItemsToDock(i.children),
    }));
}

export default function FloatingDockNav({
  items,
  logoUrl,
  brandName = '3K Kampüs',
  loginHref = '/login',
  loginLabel = 'Giriş Yap',
  stickyOffset = 280,
  activeId = null,
  onNavigate,
  onLoginClick,
  overlapHero = true,
  hasTopBar = false,
}: Props) {
  const reduce = useReducedMotion();
  const megaId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState('/');
  const [hash, setHash] = useState('');
  const [stuck, setStuck] = useState(false);
  const [openMega, setOpenMega] = useState<string | number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [logoFailed, setLogoFailed] = useState(false);
  const resolvedLogo = resolveMediaUrl(logoUrl);
  const logo = logoFailed
    ? DEFAULT_APP_LOGO
    : (resolvedLogo || DEFAULT_APP_LOGO);

  const onLogoError = () => {
    if (!logoFailed && resolvedLogo && resolvedLogo !== DEFAULT_APP_LOGO) {
      setLogoFailed(true);
    }
  };

  useEffect(() => {
    setPath(window.location.pathname);
    setHash(window.location.hash || '');
    const onHash = () => setHash(window.location.hash || '');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const el = anchorRef.current;
      if (!el) {
        setStuck(window.scrollY > stickyOffset);
        return;
      }
      setStuck(el.getBoundingClientRect().top <= 20);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [stickyOffset]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  const clearClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearClose();
    closeTimer.current = setTimeout(() => setOpenMega(null), 160);
  }, [clearClose]);

  const roots = useMemo(() => items, [items]);

  const isItemActive = (item: FloatingDockItem) => {
    if (activeId != null && activeId !== '') {
      return String(item.id) === String(activeId);
    }
    return isActiveHref(item.href, path, hash);
  };

  const onItemClick = (item: FloatingDockItem) => {
    setOpenMega(null);
    setMobileOpen(false);
    if (item.open_in_new_tab) {
      window.open(item.href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (onNavigate) {
      onNavigate(item.href);
      return;
    }
    navigateTo(item.href);
  };

  const handleLogin = (e?: { preventDefault: () => void }) => {
    if (onLoginClick) {
      e?.preventDefault();
      setMobileOpen(false);
      onLoginClick();
    }
  };

  return (
    <>
      {/* Desktop / tablet floating dock */}
      <div
        ref={anchorRef}
        className={`fd-anchor${stuck ? ' is-stuck' : ''}${overlapHero ? ' fd-anchor--overlap' : ' fd-anchor--flush'}`}
      >
        <motion.nav
          className="fd-dock"
          aria-label="Ana menü"
          initial={false}
          animate={{
            scale: stuck ? 0.96 : 1,
            y: stuck ? 0 : 0,
          }}
          transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.7 }}
          style={{
            ['--fd-navy' as string]: LANDING_COLORS.navy,
            ['--fd-accent' as string]: LANDING_COLORS.accent,
          }}
        >
          <a href="/" className="fd-brand" aria-label={brandName}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={brandName}
                className="fd-logo"
                onError={onLogoError}
              />
            ) : (
              <span className="fd-brand-text">{brandName}</span>
            )}
          </a>

          <ul className="fd-list">
            {roots.map((item) => {
              const active = isItemActive(item);
              const hasMega = Boolean(item.is_mega || (item.children && item.children.length > 0));
              const Icon = iconFor(item);
              const megaOpen = openMega === item.id;

              return (
                <li
                  key={item.id}
                  className="fd-item"
                  onMouseEnter={() => {
                    clearClose();
                    if (hasMega) setOpenMega(item.id);
                  }}
                  onMouseLeave={scheduleClose}
                >
                  <button
                    type="button"
                    className={`fd-pill${active ? ' is-active' : ''}${megaOpen ? ' is-open' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    aria-expanded={hasMega ? megaOpen : undefined}
                    aria-controls={hasMega ? `${megaId}-${item.id}` : undefined}
                    onClick={() => {
                      if (hasMega && item.children && item.children.length > 0) {
                        setOpenMega((cur) => (cur === item.id ? null : item.id));
                        return;
                      }
                      onItemClick(item);
                    }}
                    onFocus={() => {
                      clearClose();
                      if (hasMega) setOpenMega(item.id);
                    }}
                  >
                    <Icon size={15} strokeWidth={2.2} aria-hidden />
                    <span>{item.label}</span>
                    {hasMega ? (
                      <ChevronDown
                        size={14}
                        className={`fd-chevron${megaOpen ? ' is-open' : ''}`}
                        aria-hidden
                      />
                    ) : null}
                  </button>

                  <AnimatePresence>
                    {hasMega && megaOpen && item.children?.length ? (
                      <motion.div
                        id={`${megaId}-${item.id}`}
                        className="fd-mega"
                        role="region"
                        aria-label={`${item.label} alt menü`}
                        initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={reduce ? undefined : { opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        onMouseEnter={clearClose}
                        onMouseLeave={scheduleClose}
                      >
                        <div className="fd-mega-grid">
                          {item.children.map((child, idx) => {
                            const ChildIcon = iconFor(child);
                            return (
                              <motion.button
                                key={child.id}
                                type="button"
                                className="fd-mega-card"
                                initial={reduce ? false : { opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.04, duration: 0.2 }}
                                onClick={() => onItemClick(child)}
                              >
                                <span className="fd-mega-icon">
                                  <ChildIcon size={18} strokeWidth={2} />
                                </span>
                                <span className="fd-mega-copy">
                                  <strong>{child.label}</strong>
                                  {child.description ? <em>{child.description}</em> : null}
                                </span>
                              </motion.button>
                            );
                          })}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>

          {onLoginClick ? (
            <button type="button" className="fd-login" onClick={() => handleLogin()}>
              <LogIn size={15} strokeWidth={2.2} aria-hidden />
              <span>{loginLabel}</span>
            </button>
          ) : (
            <a href={loginHref} className="fd-login">
              <LogIn size={15} strokeWidth={2.2} aria-hidden />
              <span>{loginLabel}</span>
            </a>
          )}
        </motion.nav>
      </div>

      {/* Mobile trigger */}
      <div className={`fd-mobile-bar${hasTopBar ? ' fd-mobile-bar--offset' : ''}`}>
        <a href="/" className="fd-mobile-brand" aria-label={brandName}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={brandName} className="fd-logo" onError={onLogoError} />
          ) : (
            <span>{brandName}</span>
          )}
        </a>
        <button
          type="button"
          className="fd-burger"
          aria-label={mobileOpen ? 'Menüyü kapat' : 'Menüyü aç'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            className="fd-mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Mobil menü"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <motion.div
              className="fd-mobile-panel"
              initial={reduce ? false : { y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduce ? undefined : { y: 16, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="fd-mobile-head">
                <strong>{brandName}</strong>
                <button type="button" className="fd-burger" aria-label="Kapat" onClick={() => setMobileOpen(false)}>
                  <X size={22} />
                </button>
              </div>
              <ul className="fd-mobile-list">
                {roots.map((item, idx) => {
                  const Icon = iconFor(item);
                  const active = isItemActive(item);
                  return (
                    <motion.li
                      key={item.id}
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.04 * idx }}
                    >
                      <button
                        type="button"
                        className={`fd-mobile-link${active ? ' is-active' : ''}`}
                        onClick={() => onItemClick(item)}
                      >
                        <Icon size={18} />
                        <span>{item.label}</span>
                      </button>
                      {item.children?.length ? (
                        <ul className="fd-mobile-sub">
                          {item.children.map((c) => (
                            <li key={c.id}>
                              <button type="button" onClick={() => onItemClick(c)}>
                                {c.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </motion.li>
                  );
                })}
              </ul>
              {onLoginClick ? (
                <button type="button" className="fd-mobile-login" onClick={() => handleLogin()}>
                  <LogIn size={16} />
                  {loginLabel}
                </button>
              ) : (
                <a href={loginHref} className="fd-mobile-login" onClick={() => setMobileOpen(false)}>
                  <LogIn size={16} />
                  {loginLabel}
                </a>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
