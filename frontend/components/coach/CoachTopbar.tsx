"use client";

import type { User } from "@/lib/contexts/AuthContext";
import NotificationBell from "@/components/notification/NotificationBell";
import ContextSelector from "@/components/layout/ContextSelector";
import AdminPortalReturn from "@/components/profile/AdminPortalReturn";
import UserAccountDropdown from "@/components/profile/UserAccountDropdown";
import "@/components/profile/profile-portal.css";

type CoachTopbarProps = {
  title: string;
  user: User;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onLogout: () => void;
};

const StatsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

export default function CoachTopbar({
  title,
  user,
  sidebarOpen,
  onToggleSidebar,
  onLogout,
}: CoachTopbarProps) {
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
        <AdminPortalReturn variant="compact" />
        <ContextSelector />
        <NotificationBell />
        <UserAccountDropdown
          user={user}
          profileHref="/coach/profil"
          onLogout={onLogout}
          roleLabel={user.role_code === "koc" ? "Koç" : user.role_code || "Personel"}
          avatarSrc={user.personel_fotograf}
          extraLinks={[
            {
              href: "/coach/profil/istatistikler",
              label: "İstatistiklerim",
              description: "Performans ve görüşme özeti",
              icon: <StatsIcon />,
            },
          ]}
        />
      </div>
    </header>
  );
}
