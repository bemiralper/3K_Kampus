"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  getAdminPortalView,
  portalHomePath,
  setAdminPortalView,
  type PortalView,
} from "@/lib/profile-api";

type AdminPortalReturnProps = {
  variant?: "banner" | "dropdown-item" | "compact";
  dropdownItemClassName?: string;
  onNavigate?: () => void;
};

export function useAdminPortalSwitch() {
  const router = useRouter();
  const { user } = useAuth();

  const canSwitch =
    !!user && (user.is_staff || user.is_superuser) && getAdminPortalView() !== "admin";

  const returnToAdmin = () => {
    setAdminPortalView("admin");
    router.push(portalHomePath("admin"));
  };

  const switchPortal = (view: PortalView) => {
    setAdminPortalView(view);
    router.push(portalHomePath(view));
  };

  return { canSwitch, returnToAdmin, switchPortal, currentView: getAdminPortalView() };
}

export default function AdminPortalReturn({
  variant = "banner",
  dropdownItemClassName = "user-dropdown-item",
  onNavigate,
}: AdminPortalReturnProps) {
  const { user } = useAuth();
  const { canSwitch, returnToAdmin } = useAdminPortalSwitch();

  if (!user?.is_staff && !user?.is_superuser) return null;

  if (variant === "dropdown-item") {
    if (!canSwitch) return null;
    const isModern = dropdownItemClassName.includes("uad-menu-item");
    if (isModern) {
      return (
        <button
          type="button"
          className={dropdownItemClassName}
          onClick={() => {
            onNavigate?.();
            returnToAdmin();
          }}
        >
          <span className="uad-menu-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </span>
          <span className="uad-menu-copy">
            <span className="uad-menu-label">Yönetici Paneline Dön</span>
            <span className="uad-menu-desc">Ana yönetici portalına geç</span>
          </span>
        </button>
      );
    }
    return (
      <button
        type="button"
        className={dropdownItemClassName}
        style={{ color: "#1d4ed8", fontWeight: 600 }}
        onClick={() => {
          onNavigate?.();
          returnToAdmin();
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        <span>Yönetici Paneline Dön</span>
      </button>
    );
  }

  if (variant === "compact") {
    if (!canSwitch) return null;
    return (
      <button
        type="button"
        className="admin-portal-return-compact"
        onClick={() => {
          onNavigate?.();
          returnToAdmin();
        }}
      >
        ← Yönetici
      </button>
    );
  }

  if (!canSwitch) return null;

  return (
    <div className="admin-portal-return-banner">
      <span>Yönetici olarak farklı bir portalda geziniyorsunuz.</span>
      <button type="button" className="admin-portal-return-btn" onClick={returnToAdmin}>
        Yönetici Paneline Dön
      </button>
    </div>
  );
}
