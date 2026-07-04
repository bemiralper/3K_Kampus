"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { COACH_NAV_ITEMS, isCoachNavActive } from "@/components/coach/coachNavItems";
import { fetchKontrolBadge } from "@/lib/resources-api";

export type CoachNavItem = {
  id: string;
  href: string;
  label: string;
  icon: ReactNode;
  matchPrefix?: string;
  badge?: number;
};

type CoachNavProps = {
  variant: "sidebar" | "bottom";
};

/** @deprecated Desktop sidebar uses CoachSidebar; bottom nav only here */
export default function CoachNav({ variant }: CoachNavProps) {
  const pathname = usePathname();
  const navClass = variant === "sidebar" ? "coach-nav-sidebar" : "coach-nav-bottom";
  const [kontrolBadge, setKontrolBadge] = useState(0);

  const loadBadge = useCallback(async () => {
    const response = await fetchKontrolBadge();
    if (response.success && response.data) {
      setKontrolBadge(response.data.count ?? 0);
    }
  }, []);

  useEffect(() => {
    loadBadge();
    const interval = setInterval(loadBadge, 60_000);
    return () => clearInterval(interval);
  }, [loadBadge]);

  const navItems: CoachNavItem[] = COACH_NAV_ITEMS.map((item) =>
    item.id === "odev-kontrol" && kontrolBadge > 0
      ? { ...item, badge: kontrolBadge }
      : item,
  );

  const items = variant === "bottom" ? navItems.slice(0, 5) : navItems;

  return (
    <nav className={navClass} aria-label="Koç menüsü">
      <ul className="coach-nav-list">
        {items.map((item) => {
          const active = isCoachNavActive(pathname, item);
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className={`coach-nav-link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {active && <span className="coach-nav-active-bar" aria-hidden />}
                <span className="coach-nav-icon">{item.icon}</span>
                <span className="coach-nav-label">
                  {variant === "bottom" ? item.label.split(" ")[0] : item.label}
                </span>
                {item.badge != null && item.badge > 0 && (
                  <span className="coach-nav-badge">{item.badge > 99 ? "99+" : item.badge}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { COACH_NAV_ITEMS as NAV_ITEMS };
