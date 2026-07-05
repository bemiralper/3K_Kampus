'use client';

import { useEffect, type ReactNode } from 'react';
import { LANDING_COLORS } from '@/lib/landing-theme';
import { NAV_ITEMS } from '@/lib/landing-nav';

type MobileMenuProps = {
  open: boolean;
  onClose: () => void;
  onLoginClick: () => void;
  activeId?: string;
  onNavClick?: (href: string) => void;
};

const NAV_ICONS: Record<string, ReactNode> = {
  anasayfa: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  duyurular: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  'sinav-takvimi': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  '3k-sistemi': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
    </svg>
  ),
  iletisim: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
};

export default function MobileMenu({ open, onClose, onLoginClick, activeId, onNavClick }: MobileMenuProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="landing-mobile-menu" role="dialog" aria-modal="true" aria-label="Site menüsü">
      <button type="button" className="landing-mobile-menu__backdrop" onClick={onClose} aria-label="Menüyü kapat" />

      <aside className="landing-mobile-menu__panel">
        <header className="landing-mobile-menu__header">
          <span className="landing-mobile-menu__title">Menü</span>
          <button type="button" className="landing-mobile-menu__close" onClick={onClose} aria-label="Kapat">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <nav className="landing-mobile-menu__nav" aria-label="Ana menü">
          {NAV_ITEMS.map(item => {
            const isActive = activeId === item.id;
            return (
              <button
                key={item.href}
                type="button"
                className={`landing-mobile-menu__item${isActive ? ' is-active' : ''}`}
                onClick={() => {
                  onNavClick?.(item.href);
                  onClose();
                }}
              >
                <span className="landing-mobile-menu__icon" aria-hidden>
                  {NAV_ICONS[item.id] ?? NAV_ICONS.anasayfa}
                </span>
                <span className="landing-mobile-menu__label">{item.label}</span>
                <svg className="landing-mobile-menu__chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            );
          })}
        </nav>

        <footer className="landing-mobile-menu__footer">
          <button type="button" className="landing-mobile-menu__login" onClick={onLoginClick}>
            Giriş Yap
          </button>
        </footer>
      </aside>

      <style jsx global>{`
        .landing-mobile-menu {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          justify-content: flex-end;
        }
        .landing-mobile-menu__backdrop {
          position: absolute;
          inset: 0;
          border: none;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          cursor: pointer;
        }
        .landing-mobile-menu__panel {
          position: relative;
          display: flex;
          flex-direction: column;
          width: min(100vw - 2.5rem, 320px);
          max-width: 100%;
          height: 100%;
          background: #fff;
          box-shadow: -8px 0 32px rgba(15, 23, 42, 0.12);
          animation: landing-mobile-slide-in 0.28s ease-out;
        }
        @keyframes landing-mobile-slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .landing-mobile-menu__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #e2e8f0;
          flex-shrink: 0;
        }
        .landing-mobile-menu__title {
          font-size: 1.0625rem;
          font-weight: 600;
          color: ${LANDING_COLORS.navy};
          letter-spacing: -0.02em;
        }
        .landing-mobile-menu__close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.5rem;
          height: 2.5rem;
          padding: 0;
          border: none;
          border-radius: 0.625rem;
          background: #f1f5f9;
          color: ${LANDING_COLORS.navy};
          cursor: pointer;
          flex-shrink: 0;
        }
        .landing-mobile-menu__nav {
          flex: 1;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
          -webkit-overflow-scrolling: touch;
        }
        .landing-mobile-menu__item {
          display: grid;
          grid-template-columns: 2.5rem 1fr auto;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          min-height: 3.25rem;
          padding: 0.625rem 0.875rem;
          border: none;
          border-radius: 0.875rem;
          background: transparent;
          text-align: left;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
          list-style: none;
        }
        .landing-mobile-menu__item:active {
          transform: scale(0.99);
        }
        .landing-mobile-menu__item.is-active {
          background: ${LANDING_COLORS.accent}12;
        }
        .landing-mobile-menu__item.is-active .landing-mobile-menu__label {
          color: ${LANDING_COLORS.accent};
          font-weight: 600;
        }
        .landing-mobile-menu__item.is-active .landing-mobile-menu__icon {
          background: ${LANDING_COLORS.accent};
          color: #fff;
        }
        .landing-mobile-menu__icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.5rem;
          height: 2.5rem;
          border-radius: 0.625rem;
          background: #f1f5f9;
          color: ${LANDING_COLORS.navy};
          flex-shrink: 0;
        }
        .landing-mobile-menu__label {
          font-size: 0.9375rem;
          font-weight: 500;
          color: #334155;
          line-height: 1.3;
        }
        .landing-mobile-menu__chevron {
          color: #94a3b8;
          flex-shrink: 0;
        }
        .landing-mobile-menu__item.is-active .landing-mobile-menu__chevron {
          color: ${LANDING_COLORS.accent};
        }
        .landing-mobile-menu__footer {
          flex-shrink: 0;
          padding: 1rem 1.25rem calc(1rem + env(safe-area-inset-bottom, 0px));
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .landing-mobile-menu__login {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 3rem;
          padding: 0 1.25rem;
          border: none;
          border-radius: 999px;
          background: ${LANDING_COLORS.accent};
          color: #fff;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(2, 98, 167, 0.35);
        }
        @media (min-width: 1024px) {
          .landing-mobile-menu { display: none; }
        }
      `}</style>
    </div>
  );
}
