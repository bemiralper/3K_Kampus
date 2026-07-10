"use client";

import Link from "next/link";
import KurumLogo from "@/components/branding/KurumLogo";
import { usePathname } from "next/navigation";
import { useEffect, useState, type DragEvent } from "react";
import {
  COACH_NAV_ITEMS,
  isCoachNavActive,
  isCoachNavChildActive,
  type CoachNavItemDef,
  type CoachNavChildDef,
} from "@/components/coach/coachNavItems";
import { useCoachMenuOrder } from "@/hooks/useCoachMenuOrder";
import { fetchKontrolBadge } from "@/lib/resources-api";
import { fetchNotificationSummary } from "@/lib/communication-api";

type CoachSidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
  onLogout: () => void;
};

function NavChevron({ expanded }: { expanded: boolean }) {
  return (
    <span className={`coach-nav-chevron${expanded ? " is-expanded" : ""}`} aria-hidden>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}

export default function CoachSidebar({ isOpen, onToggle, onLogout }: CoachSidebarProps) {
  const pathname = usePathname();
  const { reorder, getOrderedItems } = useCoachMenuOrder();
  const [kontrolBadge, setKontrolBadge] = useState(0);
  const [mesajlarBadge, setMesajlarBadge] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<"before" | "after">("after");
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  useEffect(() => {
    fetchKontrolBadge().then((res) => {
      if (res.success && res.data) setKontrolBadge(res.data.count ?? 0);
    });
    fetchNotificationSummary()
      .then((data) => setMesajlarBadge(data.unread_count ?? 0))
      .catch(() => setMesajlarBadge(0));

    const id = setInterval(() => {
      fetchKontrolBadge().then((res) => {
        if (res.success && res.data) setKontrolBadge(res.data.count ?? 0);
      });
      fetchNotificationSummary()
        .then((data) => setMesajlarBadge(data.unread_count ?? 0))
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setExpandedMenus([]);
      return;
    }
    const activeParent = COACH_NAV_ITEMS.find(
      (item) => item.children?.length && isCoachNavActive(pathname, item),
    );
    setExpandedMenus(activeParent ? [activeParent.id] : []);
  }, [isOpen, pathname]);

  const toggleSubmenu = (id: string) => {
    setExpandedMenus((prev) => (prev.includes(id) ? [] : [id]));
  };

  const items = getOrderedItems().map((item) => {
    if (item.id === "odev-kontrol" && kontrolBadge > 0) {
      return { ...item, badge: kontrolBadge };
    }
    if (item.id === "mesajlar" && mesajlarBadge > 0) {
      return { ...item, badge: mesajlarBadge };
    }
    return item;
  });

  const handleDragStart = (e: DragEvent, id: string) => {
    if (!isOpen) return;
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    if (dragId && dragOverId && dragId !== dragOverId) {
      reorder(dragId, dragOverId, dragPosition);
    }
    setDragId(null);
    setDragOverId(null);
  };

  const handleDragOver = (e: DragEvent, id: string) => {
    if (!isOpen || !dragId || dragId === id) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragPosition(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
    setDragOverId(id);
  };

  const closeMobileIfNeeded = () => {
    if (window.matchMedia("(max-width: 991px)").matches) onToggle();
  };

  const renderSubmenuLink = (child: CoachNavChildDef) => {
    const childActive = isCoachNavChildActive(pathname, child);
    return (
      <li key={child.id} className="coach-nav-subitem">
        <Link
          href={child.href}
          className={`coach-nav-sublink${childActive ? " is-active" : ""}`}
          aria-current={childActive ? "page" : undefined}
          onClick={closeMobileIfNeeded}
        >
          {child.label}
        </Link>
      </li>
    );
  };

  const renderNavItem = (item: CoachNavItemDef & { badge?: number }) => {
    const hasChildren = !!item.children?.length;
    const active = isCoachNavActive(pathname, item);
    const badge = item.badge;
    const isExpanded = expandedMenus.includes(item.id);
    const isDragOver = dragOverId === item.id;

    if (hasChildren) {
      return (
        <li
          key={item.id}
          className={`coach-nav-item coach-nav-group${isExpanded ? " is-open" : ""}${isDragOver ? ` drag-over-${dragPosition}` : ""}${dragId === item.id ? " is-dragging" : ""}`}
          draggable={isOpen}
          onDragStart={(e) => handleDragStart(e, item.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, item.id)}
        >
          <button
            type="button"
            className={`coach-nav-link coach-nav-group-toggle${active ? " is-active" : ""}`}
            onClick={() => toggleSubmenu(item.id)}
            aria-expanded={isExpanded}
            title={!isOpen ? item.label : undefined}
          >
            {active && <span className="coach-nav-active-bar" aria-hidden />}
            <span className="coach-nav-icon">{item.icon}</span>
            {isOpen && (
              <>
                <span className="coach-nav-label">{item.label}</span>
                <NavChevron expanded={isExpanded} />
              </>
            )}
          </button>
          {isOpen && isExpanded && (
            <ul className="coach-nav-submenu is-open">
              {item.children!.map(renderSubmenuLink)}
            </ul>
          )}
          {!isOpen && (
            <>
              <span className="coach-nav-tooltip">{item.label}</span>
              <div className="coach-nav-submenu-tooltip">
                <div className="coach-nav-submenu-tooltip-title">{item.label}</div>
                {item.children!.map((child) => {
                  const childActive = isCoachNavChildActive(pathname, child);
                  return (
                    <Link
                      key={child.id}
                      href={child.href}
                      className={`coach-nav-sublink${childActive ? " is-active" : ""}`}
                      onClick={closeMobileIfNeeded}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </li>
      );
    }

    return (
      <li
        key={item.id}
        className={`coach-nav-item${isDragOver ? ` drag-over-${dragPosition}` : ""}${dragId === item.id ? " is-dragging" : ""}`}
        draggable={isOpen}
        onDragStart={(e) => handleDragStart(e, item.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, item.id)}
      >
        <Link
          href={item.href}
          className={`coach-nav-link${active ? " is-active" : ""}`}
          aria-current={active ? "page" : undefined}
          title={!isOpen ? item.label : undefined}
          onClick={closeMobileIfNeeded}
        >
          {active && <span className="coach-nav-active-bar" aria-hidden />}
          <span className="coach-nav-icon">{item.icon}</span>
          {isOpen && <span className="coach-nav-label">{item.label}</span>}
          {isOpen && badge != null && badge > 0 && (
            <span className="coach-nav-badge">{badge > 99 ? "99+" : badge}</span>
          )}
        </Link>
        {!isOpen && <span className="coach-nav-tooltip">{item.label}</span>}
      </li>
    );
  };

  return (
    <aside
      className={`coach-sidebar${isOpen ? " is-open" : " is-collapsed"}`}
      id="coach-sidebar"
      aria-hidden={!isOpen}
    >
      <div className="coach-sidebar-header">
        <div className="coach-logo-container">
          <KurumLogo variant="login" width={120} height={36} showText={false} className="coach-logo-container" />
        </div>
        <button
          type="button"
          className="coach-sidebar-toggle"
          onClick={onToggle}
          aria-label={isOpen ? "Menüyü daralt" : "Menüyü genişlet"}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {isOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            )}
          </svg>
        </button>
      </div>

      <nav className="coach-nav-sidebar" aria-label="Koç menüsü">
        <ul className="coach-nav-list">{items.map(renderNavItem)}</ul>
      </nav>

      <div className="coach-sidebar-footer">
        {isOpen && (
          <p className="coach-sidebar-hint">Menü sırasını sürükleyerek değiştirebilirsiniz.</p>
        )}
        <button type="button" className="coach-logout-btn" onClick={onLogout} title="Çıkış Yap">
          {isOpen ? "Çıkış Yap" : "⎋"}
        </button>
      </div>
    </aside>
  );
}

const MOBILE_BOTTOM_IDS = ["dashboard", "ogrenciler", "odev-kontrol", "gorusmeler"] as const;

type CoachBottomNavProps = {
  onMenuClick: () => void;
  menuOpen: boolean;
};

export function CoachBottomNav({ onMenuClick, menuOpen }: CoachBottomNavProps) {
  const pathname = usePathname();
  const mobileItems = COACH_NAV_ITEMS.filter((item) =>
    MOBILE_BOTTOM_IDS.includes(item.id as (typeof MOBILE_BOTTOM_IDS)[number]),
  );

  return (
    <nav className="coach-nav-bottom" aria-label="Koç menüsü mobil">
      <ul className="coach-nav-list">
        {mobileItems.map((item) => {
          const active = isCoachNavActive(pathname, item);
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className={`coach-nav-link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="coach-nav-icon">{item.icon}</span>
                <span className="coach-nav-label">{item.label.split(" ")[0]}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className={`coach-nav-link coach-nav-menu-btn${menuOpen ? " is-active" : ""}`}
            onClick={onMenuClick}
            aria-label="Tüm menü"
            aria-expanded={menuOpen}
          >
            <span className="coach-nav-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </span>
            <span className="coach-nav-label">Menü</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
