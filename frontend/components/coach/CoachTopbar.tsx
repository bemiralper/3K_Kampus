"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { User } from "@/lib/contexts/AuthContext";
import CoachAvatar from "@/components/coach/CoachAvatar";
import NotificationBell from "@/components/notification/NotificationBell";
import ContextSelector from "@/components/layout/ContextSelector";

type CoachTopbarProps = {
  title: string;
  user: User;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onLogout: () => void;
};

export default function CoachTopbar({
  title,
  user,
  sidebarOpen,
  onToggleSidebar,
  onLogout,
}: CoachTopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName =
    `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <header className="coach-topbar">
      <div className="coach-topbar-leading">
        <button
          type="button"
          className="coach-topbar-menu-btn"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Menüyü kapat" : "Menüyü aç"}
          aria-expanded={sidebarOpen}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="coach-topbar-title">{title}</h1>
      </div>

      <div className="coach-topbar-trailing" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ContextSelector />
        <NotificationBell />
      <div className="coach-topbar-user-wrap" ref={menuRef}>
        <button
          type="button"
          className="coach-topbar-profile-btn"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <span className="coach-topbar-user-name">{displayName}</span>
          <CoachAvatar src={user.personel_fotograf} name={displayName} size="md" />
        </button>

        {menuOpen && (
          <div className="coach-topbar-dropdown" role="menu">
            <div className="coach-topbar-dropdown-head">
              <CoachAvatar src={user.personel_fotograf} name={displayName} size="lg" />
              <div>
                <strong>{displayName}</strong>
                <span>{user.role_code === "koc" ? "Koç" : user.role_code || "Personel"}</span>
              </div>
            </div>
            <Link
              href="/coach/profil"
              className="coach-topbar-dropdown-item"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              Profilim
            </Link>
            <Link
              href="/coach/profil/istatistikler"
              className="coach-topbar-dropdown-item"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              İstatistiklerim
            </Link>
            <button
              type="button"
              className="coach-topbar-dropdown-item is-danger"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
            >
              Çıkış Yap
            </button>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
