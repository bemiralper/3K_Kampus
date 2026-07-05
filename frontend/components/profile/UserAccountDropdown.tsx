"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@/lib/contexts/AuthContext";
import CoachAvatar from "@/components/coach/CoachAvatar";
import AdminPortalReturn from "@/components/profile/AdminPortalReturn";
import "./user-account-dropdown.css";

export type AccountMenuLink = {
  href: string;
  label: string;
  description?: string;
  icon?: ReactNode;
};

type UserAccountDropdownProps = {
  user: User | null;
  profileHref: string;
  onLogout: () => void | Promise<void>;
  roleLabel?: string;
  avatarSrc?: string | null;
  extraLinks?: AccountMenuLink[];
};

function getInitials(user: User | null): string {
  if (user?.first_name && user?.last_name) {
    return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
  }
  if (user?.username) return user.username.slice(0, 2).toUpperCase();
  return "U";
}

function getDisplayName(user: User | null): string {
  if (user?.first_name && user?.last_name) {
    return `${user.first_name} ${user.last_name}`;
  }
  return user?.username || "Kullanıcı";
}

function defaultRoleLabel(user: User | null): string {
  if (!user) return "Kullanıcı";
  if (user.is_superuser) return "Süper Admin";
  if (user.is_staff) return "Yönetici";
  if (user.role_code === "muhasebe") return "Muhasebe";
  if (user.role_code === "koc") return "Koç";
  return user.role_code || "Kullanıcı";
}

const ProfileIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export default function UserAccountDropdown({
  user,
  profileHref,
  onLogout,
  roleLabel,
  avatarSrc,
  extraLinks = [],
}: UserAccountDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const displayName = getDisplayName(user);
  const badge = roleLabel || defaultRoleLabel(user);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const close = () => setOpen(false);

  return (
    <div className="uad-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`uad-trigger${open ? " is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {avatarSrc !== undefined ? (
          <CoachAvatar src={avatarSrc} name={displayName} size="md" />
        ) : (
          <span className="uad-avatar-fallback">{getInitials(user)}</span>
        )}
        <span className="uad-trigger-text">
          <span className="uad-trigger-name">{displayName}</span>
          <span className="uad-trigger-role">{badge}</span>
        </span>
        <svg className="uad-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="uad-panel" role="menu">
          <div className="uad-panel-head">
            <div className="uad-panel-avatar">
              {avatarSrc !== undefined ? (
                <CoachAvatar src={avatarSrc} name={displayName} size="lg" />
              ) : (
                <span className="uad-avatar-fallback uad-avatar-fallback-lg">{getInitials(user)}</span>
              )}
            </div>
            <div className="uad-panel-meta">
              <strong>{displayName}</strong>
              <span className="uad-panel-email">{user?.email || "—"}</span>
              <span className="uad-panel-badge">{badge}</span>
            </div>
          </div>

          <div className="uad-panel-body">
            <Link href={profileHref} className="uad-menu-item uad-menu-item-primary" role="menuitem" onClick={close}>
              <span className="uad-menu-icon"><ProfileIcon /></span>
              <span className="uad-menu-copy">
                <span className="uad-menu-label">Profil & Hesap Ayarları</span>
                <span className="uad-menu-desc">Kişisel bilgiler, şifre ve tercihler</span>
              </span>
            </Link>

            {extraLinks.map((link) => (
              <Link key={link.href} href={link.href} className="uad-menu-item" role="menuitem" onClick={close}>
                <span className="uad-menu-icon">{link.icon || <ProfileIcon />}</span>
                <span className="uad-menu-copy">
                  <span className="uad-menu-label">{link.label}</span>
                  {link.description && <span className="uad-menu-desc">{link.description}</span>}
                </span>
              </Link>
            ))}

            <AdminPortalReturn
              variant="dropdown-item"
              dropdownItemClassName="uad-menu-item uad-menu-item-portal"
              onNavigate={close}
            />
          </div>

          <div className="uad-panel-foot">
            <button
              type="button"
              className="uad-menu-item uad-menu-item-danger"
              role="menuitem"
              onClick={() => {
                close();
                void onLogout();
              }}
            >
              <span className="uad-menu-icon"><LogoutIcon /></span>
              <span className="uad-menu-copy">
                <span className="uad-menu-label">Çıkış Yap</span>
                <span className="uad-menu-desc">Oturumu güvenle kapat</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
