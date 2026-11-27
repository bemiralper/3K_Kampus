'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Command,
  Flame,
  Home,
  LogOut,
  MessageCircle,
  Moon,
  Sun,
  UserCircle2,
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { StudentPortalProvider, useStudentPortal } from '@/lib/student-portal-context';
import FirstPasswordGate from '@/components/student/FirstPasswordGate';
import FocusModeOverlay from '@/components/student/FocusModeOverlay';
import NoteSplitViewer from '@/components/student/NoteSplitViewer';
import CommandPaletteModal from '@/components/student/CommandPaletteModal';
import './ogrenci.css';

const RAIL_LINKS = [
  { href: '/ogrenci', label: 'Bugün', mobileLabel: 'Bugün', icon: Home, dock: true },
  {
    href: '/ogrenci/takvim',
    label: 'Takvim & Yoklama',
    mobileLabel: 'Takvim',
    icon: CalendarDays,
    dock: true,
  },
  {
    href: '/ogrenci/calisma',
    label: 'Plan & Odak',
    mobileLabel: 'Odak',
    icon: Flame,
    dock: true,
  },
  {
    href: '/ogrenci/sinavlar',
    label: 'Sınav Radarı',
    mobileLabel: 'Sınavlar',
    icon: BarChart3,
    dock: true,
  },
  {
    href: '/ogrenci/dersler',
    label: 'Dersler & Notlar',
    mobileLabel: 'Dersler',
    icon: BookOpen,
    dock: true,
  },
  {
    href: '/ogrenci/iletisim',
    label: 'Koçum & Duyurular',
    mobileLabel: 'Koçum',
    icon: MessageCircle,
    dock: false,
  },
  {
    href: '/ogrenci/profil',
    label: 'Profil & Ayarlar',
    mobileLabel: 'Profil',
    icon: UserCircle2,
    dock: false,
  },
];

function isActiveRoute(pathname: string, href: string): boolean {
  if (href === '/ogrenci') return pathname === '/ogrenci';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase() || '3K';
}

function resolvePortalLogoUrl(
  branding:
    | {
        app_logo_url: string | null;
        dark_logo_url: string | null;
      }
    | undefined,
  theme: 'light' | 'dark',
): string {
  if (theme === 'dark') {
    return branding?.dark_logo_url || branding?.app_logo_url || '/img/beyaz-logo.png';
  }
  return branding?.app_logo_url || branding?.dark_logo_url || '/img/3k-logo.png';
}

function AdaptiveStudentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const {
    identity,
    loading,
    error,
    resolvedTheme,
    setThemePref,
    refreshIdentity,
    splitNote,
    setPaletteOpen,
    unreadCoachCount,
    unreadAnnouncementCount,
  } = useStudentPortal();

  // Inject scoped PWA manifest link + branch/institution favicon cleanly on client
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let link = document.querySelector<HTMLLinkElement>('link[data-sp-manifest="1"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/student-manifest.webmanifest';
      link.setAttribute('data-sp-manifest', '1');
      document.head.appendChild(link);
    }
    const favUrl = identity?.institution?.branding?.favicon_url;
    if (favUrl) {
      let iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
      }
      iconLink.href = favUrl;
    }
    return () => {
      link?.remove();
    };
  }, [identity?.institution?.branding?.favicon_url]);

  if (loading) {
    return (
      <div className="sp-root" data-sp-theme={resolvedTheme}>
        <div className="sp-page" style={{ maxWidth: 960, paddingTop: 48 }}>
          <div className="sp-skeleton" style={{ height: 140 }} />
          <div className="sp-skeleton" style={{ height: 220 }} />
        </div>
      </div>
    );
  }

  if (error || !identity) {
    return (
      <div className="sp-root" data-sp-theme={resolvedTheme}>
        <div className="sp-gate-backdrop">
          <div className="sp-gate-card">
            <h1>Öğrenci Portalı Açılamadı</h1>
            <p className="sp-gate-desc">
              {error || 'Hesabınız aktif bir öğrenci kaydıyla eşleşmiyor olabilir.'}
            </p>
            <div className="sp-gate-actions">
              <button
                type="button"
                className="sp-btn sp-btn-primary"
                onClick={() => refreshIdentity()}
              >
                Tekrar Dene
              </button>
              <button
                type="button"
                className="sp-btn sp-btn-ghost"
                onClick={() => logout()}
              >
                <LogOut size={16} /> Çıkış Yap
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (identity.must_change_password) {
    return (
      <div className="sp-root" data-sp-theme={resolvedTheme}>
        <FirstPasswordGate />
      </div>
    );
  }

  const totalCommUnread = unreadCoachCount + unreadAnnouncementCount;
  const branding = identity.institution.branding;
  const activeLogoSrc = resolvePortalLogoUrl(branding, resolvedTheme);
  const brandTitle =
    branding?.display_name || identity.institution.sube_name || identity.institution.kurum_name || '3K Kampüs';

  return (
    <div className="sp-root" data-sp-theme={resolvedTheme}>
      <div className="sp-frame">
        {/* Tablet Compact Rail & PC Full Cockpit Rail */}
        <aside className="sp-rail" aria-label="Öğrenci Portalı Navigasyon">
          <div>
            <Link href="/ogrenci" className="sp-rail-brand">
              <div className="sp-brand-logo-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeLogoSrc}
                  alt={brandTitle}
                  className="sp-brand-logo-img"
                />
              </div>
              <div className="sp-rail-brand-copy">
                <strong>{brandTitle}</strong>
                <span>
                  {identity.institution.sube_name} · {identity.institution.egitim_yili_name}
                </span>
              </div>
            </Link>

            <nav className="sp-rail-nav">
              {RAIL_LINKS.map((item) => {
                const Icon = item.icon;
                const active = isActiveRoute(pathname, item.href);
                const badge =
                  item.href === '/ogrenci/iletisim' && totalCommUnread > 0
                    ? totalCommUnread
                    : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="sp-rail-link"
                    data-active={active ? '1' : '0'}
                    title={item.label}
                  >
                    <Icon size={19} />
                    <span className="sp-rail-label">{item.label}</span>
                    {badge > 0 ? <span className="sp-chip sp-chip-warm">{badge}</span> : null}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="sp-rail-footer">
            <Link
              href="/ogrenci/calisma?tab=rozetler"
              className="sp-rail-student"
              title="Seviye, Rozetlerim & Odak Ligi"
            >
              <div
                className="sp-avatar"
                style={{
                  boxShadow: '0 0 0 2px var(--sp-warm)',
                  position: 'relative',
                }}
              >
                {identity.student.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={identity.student.photo_url} alt={identity.student.full_name} />
                ) : (
                  initialsOf(identity.student.full_name)
                )}
              </div>
              <div className="sp-rail-student-copy">
                <strong>
                  {identity.gamification?.pinned_badge
                    ? `${identity.gamification.pinned_badge.icon} `
                    : ''}
                  {identity.student.full_name}
                </strong>
                <span>
                  {identity.gamification
                    ? `Lv.${identity.gamification.level.level} · ${identity.gamification.level.rank_title}`
                    : identity.student.sinif?.name ||
                      identity.student.sinif_seviyesi?.name ||
                      `No: ${identity.student.okul_no || identity.student.id}`}
                </span>
              </div>
            </Link>
          </div>
        </aside>

        {/* Main Workspace + Optional Tablet/PC Split-View Note Pane */}
        <div className="sp-workspace" data-split={splitNote ? '1' : '0'}>
          <div className="sp-main-column">
            <header className="sp-topbar">
              <div className="sp-topbar-brand">
                <div className="sp-brand-logo-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeLogoSrc}
                    alt={brandTitle}
                    className="sp-brand-logo-img"
                  />
                </div>
                <div className="sp-topbar-meta">
                  <strong>
                    {identity.gamification?.pinned_badge
                      ? `${identity.gamification.pinned_badge.icon} `
                      : ''}
                    {identity.student.full_name}
                  </strong>
                  <span>
                    {identity.gamification
                      ? `Lv.${identity.gamification.level.level} ${identity.gamification.level.rank_title} · `
                      : ''}
                    {identity.student.sinif?.name
                      ? `${identity.student.sinif.name} · `
                      : ''}
                    {identity.active_term?.name || identity.institution.egitim_yili_name}
                  </span>
                </div>
              </div>

              <div className="sp-topbar-actions">
                <button
                  type="button"
                  className="sp-cmd-trigger"
                  onClick={() => setPaletteOpen(true)}
                >
                  <Command size={14} />
                  <span>Hızlı Ara…</span>
                  <kbd>⌘K</kbd>
                </button>

                <Link
                  href="/ogrenci/iletisim"
                  className="sp-icon-btn"
                  title="Koçum & Duyurular"
                  style={{ position: 'relative' }}
                >
                  <MessageCircle size={17} />
                  {totalCommUnread > 0 ? (
                    <span
                      className="sp-badge-dot"
                      style={{ top: -5, right: -5 }}
                    >
                      {totalCommUnread}
                    </span>
                  ) : null}
                </Link>

                <button
                  type="button"
                  className="sp-icon-btn"
                  onClick={() =>
                    setThemePref(resolvedTheme === 'dark' ? 'light' : 'dark')
                  }
                  title={resolvedTheme === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
                >
                  {resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                </button>

                <Link href="/ogrenci/profil" className="sp-icon-btn" title="Profil & Ayarlar">
                  <UserCircle2 size={18} />
                </Link>
              </div>
            </header>

            <main className="sp-page">{children}</main>
          </div>

          <NoteSplitViewer />
        </div>
      </div>

      {/* Phone Floating Bottom Dock (< 768px) */}
      <nav className="sp-mobile-dock" aria-label="Mobil Alt Menü">
        {RAIL_LINKS.filter((l) => l.dock).map((item) => {
          const Icon = item.icon;
          const active = isActiveRoute(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="sp-dock-link"
              data-active={active ? '1' : '0'}
            >
              <Icon size={19} />
              <span>{item.mobileLabel}</span>
            </Link>
          );
        })}
      </nav>

      <FocusModeOverlay />
      <CommandPaletteModal />
    </div>
  );
}

export default function StudentPortalLayout({ children }: { children: ReactNode }) {
  return (
    <StudentPortalProvider>
      <AdaptiveStudentShell>{children}</AdaptiveStudentShell>
    </StudentPortalProvider>
  );
}
