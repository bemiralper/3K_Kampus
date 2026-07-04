"use client";

import Link from "next/link";
import KurumLogo from "@/components/branding/KurumLogo";
import { usePathname } from "next/navigation";
import { useEffect, useState, type DragEvent } from "react";
import { COACH_NAV_ITEMS, isCoachNavActive } from "@/components/coach/coachNavItems";
import { useCoachMenuOrder } from "@/hooks/useCoachMenuOrder";
import { fetchKontrolBadge } from "@/lib/resources-api";
import { fetchNotificationSummary } from "@/lib/communication-api";

type CoachSidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
  onLogout: () => void;
};

export default function CoachSidebar({ isOpen, onToggle, onLogout }: CoachSidebarProps) {
  const pathname = usePathname();
  const { reorder, getOrderedItems } = useCoachMenuOrder();
  const [kontrolBadge, setKontrolBadge] = useState(0);
  const [mesajlarBadge, setMesajlarBadge] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<"before" | "after">("after");

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
        <ul className="coach-nav-list">
          {items.map((item) => {
            const active = isCoachNavActive(pathname, item);
            const badge = "badge" in item ? (item as { badge?: number }).badge : undefined;
            const isDragOver = dragOverId === item.id;

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
                  onClick={() => {
                    if (window.matchMedia("(max-width: 991px)").matches) onToggle();
                  }}
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
          })}
        </ul>
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
