'use client';

import { LANDING_COLORS, scrollToSection } from '@/lib/landing-theme';
import { NAV_ITEMS } from '@/lib/landing-nav';

type MobileMenuProps = {
  open: boolean;
  onClose: () => void;
  onLoginClick: () => void;
  activeId?: string;
  onNavClick?: (href: string) => void;
};

export default function MobileMenu({ open, onClose, onLoginClick, activeId, onNavClick }: MobileMenuProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] lg:hidden">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="absolute right-0 top-0 flex h-full w-[min(100%,300px)] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <span className="font-semibold text-slate-900">Menü</span>
          <button
            type="button"
            onClick={onClose}
            className="landing-menu-btn"
            aria-label="Kapat"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map(item => {
              const isActive = activeId === item.id;
              return (
                <li key={item.href}>
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavClick) onNavClick(item.href);
                      else scrollToSection(item.href);
                      onClose();
                    }}
                    className="w-full rounded-xl px-4 py-3.5 text-left text-[15px] font-medium transition"
                    style={{
                      background: isActive ? `${LANDING_COLORS.accent}14` : 'transparent',
                      color: isActive ? LANDING_COLORS.accent : '#334155',
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-slate-100 p-4">
          <button type="button" onClick={onLoginClick} className="landing-login-btn w-full">
            Giriş Yap
          </button>
        </div>
      </div>
    </div>
  );
}
