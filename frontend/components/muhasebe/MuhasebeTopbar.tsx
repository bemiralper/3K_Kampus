"use client";

import type { User } from "@/lib/contexts/AuthContext";
import NotificationBell from "@/components/notification/NotificationBell";
import ContextSelector from "@/components/layout/ContextSelector";
import AdminPortalReturn from "@/components/profile/AdminPortalReturn";
import UserAccountDropdown from "@/components/profile/UserAccountDropdown";
import "@/components/profile/profile-portal.css";

type MuhasebeTopbarProps = {
  title: string;
  user: User;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onLogout: () => void;
};

export default function MuhasebeTopbar({
  title,
  user,
  sidebarOpen,
  onToggleSidebar,
  onLogout,
}: MuhasebeTopbarProps) {
  return (
    <header className="muhasebe-topbar">
      <div className="muhasebe-topbar-leading">
        <button
          type="button"
          className="muhasebe-topbar-menu-btn"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Menüyü kapat" : "Menüyü aç"}
          aria-expanded={sidebarOpen}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="muhasebe-topbar-title">{title}</h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <AdminPortalReturn variant="compact" />
        <ContextSelector />
        <NotificationBell />
        <UserAccountDropdown
          user={user}
          profileHref="/muhasebe/profil"
          onLogout={onLogout}
          roleLabel={user.role_code === "muhasebe" ? "Muhasebe" : user.role_code || "Personel"}
          avatarSrc={user.personel_fotograf}
        />
      </div>
    </header>
  );
}
