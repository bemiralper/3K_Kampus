"use client";

import Link from "next/link";
import KurumLogo from "@/components/branding/KurumLogo";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, type DragEvent } from "react";
import {
  MUHASEBE_NAV_ITEMS,
  isMuhasebeNavActive,
  isMuhasebeNavChildActive,
  type MuhasebeNavItemDef,
  type MuhasebeNavChildDef,
} from "@/components/muhasebe/muhasebeNavItems";
import { useMuhasebeMenuOrder } from "@/hooks/useMuhasebeMenuOrder";

type MuhasebeSidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
  onLogout: () => void;
};

function NavChevron({ expanded }: { expanded: boolean }) {
  return (
    <span className={`muhasebe-nav-chevron${expanded ? " is-expanded" : ""}`} aria-hidden>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}

export default function MuhasebeSidebar({ isOpen, onToggle, onLogout }: MuhasebeSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { reorder, reorderSubmenu, getOrderedItems } = useMuhasebeMenuOrder();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<"before" | "after">("after");
  const [subDrag, setSubDrag] = useState<{ parentId: string; childId: string } | null>(null);
  const [subDragOver, setSubDragOver] = useState<{ parentId: string; childId: string } | null>(null);
  const [subDragPosition, setSubDragPosition] = useState<"before" | "after">("after");

  const navItems = getOrderedItems();

  useEffect(() => {
    if (isOpen) {
      const activeParent = navItems.find(
        (item) => item.children?.length && isMuhasebeNavActive(pathname, item),
      );
      setExpandedMenus(activeParent ? [activeParent.id] : []);
    }
  }, [isOpen, pathname, navItems]);

  const toggleSubmenu = (id: string) => {
    setExpandedMenus((prev) => (prev.includes(id) ? [] : [id]));
  };

  const closeMobileIfNeeded = () => {
    if (window.matchMedia("(max-width: 991px)").matches) onToggle();
  };

  const handleNavLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    item: MuhasebeNavItemDef,
  ) => {
    const prefix = item.matchPrefix || item.href;
    if (
      typeof window !== "undefined" &&
      window.location.search &&
      pathname.startsWith(prefix)
    ) {
      e.preventDefault();
      router.push(item.href);
    }
    closeMobileIfNeeded();
  };

  const handleMainDragStart = (e: DragEvent, id: string) => {
    if (!isOpen) return;
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleMainDragEnd = () => {
    if (dragId && dragOverId && dragId !== dragOverId) {
      reorder(dragId, dragOverId, dragPosition);
    }
    setDragId(null);
    setDragOverId(null);
  };

  const handleMainDragOver = (e: DragEvent, id: string) => {
    if (!isOpen || !dragId || dragId === id) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragPosition(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
    setDragOverId(id);
  };

  const handleSubDragStart = (e: DragEvent, parentId: string, childId: string) => {
    if (!isOpen) return;
    e.stopPropagation();
    setSubDrag({ parentId, childId });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleSubDragEnd = () => {
    if (
      subDrag &&
      subDragOver &&
      subDrag.parentId === subDragOver.parentId &&
      subDrag.childId !== subDragOver.childId
    ) {
      reorderSubmenu(subDrag.parentId, subDrag.childId, subDragOver.childId, subDragPosition);
    }
    setSubDrag(null);
    setSubDragOver(null);
  };

  const handleSubDragOver = (e: DragEvent, parentId: string, childId: string) => {
    if (!isOpen || !subDrag || subDrag.parentId !== parentId || subDrag.childId === childId) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSubDragPosition(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
    setSubDragOver({ parentId, childId });
  };

  const renderSubmenuLink = (parentId: string, child: MuhasebeNavChildDef) => {
    const childActive = isMuhasebeNavChildActive(pathname, child);
    const isSubOver =
      subDragOver?.parentId === parentId &&
      subDragOver.childId === child.id &&
      subDrag?.childId !== child.id;

    return (
      <li
        key={child.id}
        className={`muhasebe-nav-subitem${isSubOver ? ` drag-over-${subDragPosition}` : ""}${subDrag?.childId === child.id ? " is-dragging" : ""}`}
        draggable={isOpen}
        onDragStart={(e) => handleSubDragStart(e, parentId, child.id)}
        onDragEnd={handleSubDragEnd}
        onDragOver={(e) => handleSubDragOver(e, parentId, child.id)}
      >
        <Link
          href={child.href}
          className={`muhasebe-nav-sublink${childActive ? " is-active" : ""}`}
          aria-current={childActive ? "page" : undefined}
          onClick={closeMobileIfNeeded}
        >
          {child.label}
        </Link>
      </li>
    );
  };

  const renderNavItem = (item: MuhasebeNavItemDef) => {
    const hasChildren = !!item.children?.length;
    const active = isMuhasebeNavActive(pathname, item);
    const isExpanded = expandedMenus.includes(item.id);
    const isDragOver = dragOverId === item.id && dragId !== item.id;

    if (hasChildren) {
      return (
        <li
          key={item.id}
          className={`muhasebe-nav-item muhasebe-nav-group${isDragOver ? ` drag-over-${dragPosition}` : ""}${dragId === item.id ? " is-dragging" : ""}`}
          draggable={isOpen}
          onDragStart={(e) => handleMainDragStart(e, item.id)}
          onDragEnd={handleMainDragEnd}
          onDragOver={(e) => handleMainDragOver(e, item.id)}
        >
          <button
            type="button"
            className={`muhasebe-nav-link muhasebe-nav-group-toggle${active ? " is-active" : ""}`}
            onClick={() => isOpen && toggleSubmenu(item.id)}
            aria-expanded={isExpanded}
            title={!isOpen ? item.label : undefined}
          >
            {active && <span className="muhasebe-nav-active-bar" aria-hidden />}
            <span className="muhasebe-nav-icon">{item.icon}</span>
            {isOpen && (
              <>
                <span className="muhasebe-nav-label">{item.label}</span>
                <NavChevron expanded={isExpanded} />
              </>
            )}
          </button>
          {isOpen && (
            <ul className={`muhasebe-nav-submenu${isExpanded ? " is-open" : ""}`}>
              {item.children!.map((child) => renderSubmenuLink(item.id, child))}
            </ul>
          )}
          {!isOpen && (
            <>
              <span className="muhasebe-nav-tooltip">{item.label}</span>
              <div className="muhasebe-nav-submenu-tooltip">
                <div className="muhasebe-nav-submenu-tooltip-title">{item.label}</div>
                {item.children!.map((child) => {
                  const childActive = isMuhasebeNavChildActive(pathname, child);
                  return (
                    <Link
                      key={child.id}
                      href={child.href}
                      className={`muhasebe-nav-sublink${childActive ? " is-active" : ""}`}
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
        className={`muhasebe-nav-item${isDragOver ? ` drag-over-${dragPosition}` : ""}${dragId === item.id ? " is-dragging" : ""}`}
        draggable={isOpen}
        onDragStart={(e) => handleMainDragStart(e, item.id)}
        onDragEnd={handleMainDragEnd}
        onDragOver={(e) => handleMainDragOver(e, item.id)}
      >
        <Link
          href={item.href}
          className={`muhasebe-nav-link${active ? " is-active" : ""}`}
          aria-current={active ? "page" : undefined}
          title={!isOpen ? item.label : undefined}
          onClick={(e) => handleNavLinkClick(e, item)}
        >
          {active && <span className="muhasebe-nav-active-bar" aria-hidden />}
          <span className="muhasebe-nav-icon">{item.icon}</span>
          {isOpen && <span className="muhasebe-nav-label">{item.label}</span>}
        </Link>
        {!isOpen && <span className="muhasebe-nav-tooltip">{item.label}</span>}
      </li>
    );
  };

  return (
    <aside
      className={`muhasebe-sidebar${isOpen ? " is-open" : " is-collapsed"}`}
      id="muhasebe-sidebar"
      aria-hidden={!isOpen}
    >
      <div className="muhasebe-sidebar-header">
        <div className="muhasebe-logo-container">
          <KurumLogo variant="login" width={88} height={26} showText={false} />
        </div>
        <button
          type="button"
          className="muhasebe-sidebar-toggle"
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

      <nav className="muhasebe-nav-sidebar" aria-label="Muhasebe menüsü">
        <ul className="muhasebe-nav-list">{navItems.map(renderNavItem)}</ul>
      </nav>

      <div className="muhasebe-sidebar-footer">
        {isOpen && (
          <p className="muhasebe-sidebar-hint">Menü sırasını sürükleyerek değiştirebilirsiniz.</p>
        )}
        <button type="button" className="muhasebe-logout-btn" onClick={onLogout} title="Çıkış Yap">
          {isOpen ? "Çıkış Yap" : "⎋"}
        </button>
      </div>
    </aside>
  );
}

const MOBILE_BOTTOM_IDS = ["dashboard", "yeni-kayit", "odeme-takip"] as const;

type MuhasebeBottomNavProps = {
  onMenuClick: () => void;
  menuOpen: boolean;
};

export function MuhasebeBottomNav({ onMenuClick, menuOpen }: MuhasebeBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const mobileItems = MUHASEBE_NAV_ITEMS.filter((item) =>
    MOBILE_BOTTOM_IDS.includes(item.id as (typeof MOBILE_BOTTOM_IDS)[number]),
  );

  return (
    <nav className="muhasebe-nav-bottom" aria-label="Muhasebe menüsü mobil">
      <ul className="muhasebe-nav-list">
        {mobileItems.map((item) => {
          const active = isMuhasebeNavActive(pathname, item);
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className={`muhasebe-nav-link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  const prefix = item.matchPrefix || item.href;
                  if (
                    typeof window !== "undefined" &&
                    window.location.search &&
                    pathname.startsWith(prefix)
                  ) {
                    e.preventDefault();
                    router.push(item.href);
                  }
                }}
              >
                <span className="muhasebe-nav-icon">{item.icon}</span>
                <span className="muhasebe-nav-label">{item.label.split(" ")[0]}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className={`muhasebe-nav-link muhasebe-nav-menu-btn${menuOpen ? " is-active" : ""}`}
            onClick={onMenuClick}
            aria-label="Tüm menü"
            aria-expanded={menuOpen}
          >
            <span className="muhasebe-nav-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </span>
            <span className="muhasebe-nav-label">Menü</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
