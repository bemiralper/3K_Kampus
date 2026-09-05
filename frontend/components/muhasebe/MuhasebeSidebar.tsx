"use client";

import Link from "next/link";
import KurumLogo from "@/components/branding/KurumLogo";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MUHASEBE_NAV_ITEMS,
  isMuhasebeNavActive,
  isMuhasebeNavChildActive,
  type MuhasebeNavItemDef,
  type MuhasebeNavChildDef,
} from "@/components/muhasebe/muhasebeNavItems";
import { useMuhasebeMenuOrder } from "@/hooks/useMuhasebeMenuOrder";
import { fetchNotificationSummary } from "@/lib/communication-api";

type MuhasebeSidebarProps = {
  isOpen: boolean;
  isDesktop: boolean;
  mobileDrawerOpen: boolean;
  onToggle: () => void;
  onCloseMobile: () => void;
  onLogout: () => void;
};

const PIN_STORAGE = "muhasebe-sidebar-pinned";

function usePinnedItems() {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PIN_STORAGE);
      if (saved) setPinnedIds(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      localStorage.setItem(PIN_STORAGE, JSON.stringify(next));
      return next;
    });
  };

  return { pinnedIds, togglePin };
}

function NavChevron({ expanded }: { expanded: boolean }) {
  return (
    <span className={`muhasebe-nav-chevron${expanded ? " is-expanded" : ""}`} aria-hidden>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}

const PinIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden>
    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
  </svg>
);

export default function MuhasebeSidebar({
  isOpen,
  isDesktop,
  mobileDrawerOpen,
  onToggle,
  onCloseMobile,
  onLogout,
}: MuhasebeSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { getOrderedItems, reorder, reorderSubmenu } = useMuhasebeMenuOrder();
  const { pinnedIds, togglePin } = usePinnedItems();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<"before" | "after">("after");
  const [subDrag, setSubDrag] = useState<{ parentId: string; id: string } | null>(null);
  const [subDragOver, setSubDragOver] = useState<{ parentId: string; id: string } | null>(null);
  const [subDragPosition, setSubDragPosition] = useState<"before" | "after">("after");
  const pendingExpandRef = useRef<string | null>(null);
  const [mesajlarBadge, setMesajlarBadge] = useState(0);

  const navItems = useMemo(() => getOrderedItems(), [getOrderedItems]);

  useEffect(() => {
    const refreshMesajlar = () => {
      fetchNotificationSummary()
        .then((data) => setMesajlarBadge(data.unread_count ?? 0))
        .catch(() => setMesajlarBadge(0));
    };
    refreshMesajlar();
    const id = setInterval(refreshMesajlar, 30_000);
    const onRefresh = () => refreshMesajlar();
    window.addEventListener("lms:notifications-refresh", onRefresh);
    window.addEventListener("lms:communication-inbox", onRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("lms:notifications-refresh", onRefresh);
      window.removeEventListener("lms:communication-inbox", onRefresh);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setExpandedMenus([]);
      return;
    }
    if (pendingExpandRef.current) {
      setExpandedMenus([pendingExpandRef.current]);
      pendingExpandRef.current = null;
      return;
    }
    const activeParent = MUHASEBE_NAV_ITEMS.find(
      (item) => item.children?.length && isMuhasebeNavActive(pathname, item),
    );
    setExpandedMenus(activeParent ? [activeParent.id] : []);
  }, [isOpen, pathname]);

  const withBadges = useCallback(
    (items: MuhasebeNavItemDef[]) =>
      items.map((item) =>
        item.id === "iletisim" && mesajlarBadge > 0
          ? { ...item, badge: mesajlarBadge }
          : item,
      ),
    [mesajlarBadge],
  );

  const filteredNavItems = useMemo(() => {
    const source = !searchQuery.trim()
      ? navItems
      : navItems.filter((item) => {
          const q = searchQuery.toLocaleLowerCase("tr-TR");
          if (item.label.toLocaleLowerCase("tr-TR").includes(q)) return true;
          return item.children?.some((c) => c.label.toLocaleLowerCase("tr-TR").includes(q));
        });
    return withBadges(source);
  }, [navItems, searchQuery, withBadges]);

  const pinnedItems = useMemo(
    () => withBadges(navItems.filter((item) => pinnedIds.includes(item.id))),
    [navItems, pinnedIds, withBadges],
  );

  const toggleSubmenu = (id: string) => {
    setExpandedMenus((prev) => (prev.includes(id) ? [] : [id]));
  };

  const closeMobileIfNeeded = useCallback(() => {
    if (!isDesktop && mobileDrawerOpen) onCloseMobile();
  }, [isDesktop, mobileDrawerOpen, onCloseMobile]);

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

  const handleDragStart = (e: React.DragEvent, id: string) => {
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

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id === dragId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragPosition(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
    setDragOverId(id);
  };

  const renderSubmenuLink = (child: MuhasebeNavChildDef, siblings: MuhasebeNavChildDef[], parentId: string) => {
    const childActive = isMuhasebeNavChildActive(pathname, child, siblings);
    const isSubOver =
      subDragOver?.parentId === parentId &&
      subDragOver.id === child.id &&
      subDrag?.id !== child.id;
    return (
      <li
        key={child.id}
        className={`muhasebe-nav-subitem${isSubOver ? ` drag-over-${subDragPosition}` : ""}${
          subDrag?.parentId === parentId && subDrag.id === child.id ? " is-dragging" : ""
        }`}
        draggable={isOpen && !searchQuery}
        onDragStart={(e) => {
          e.stopPropagation();
          setSubDrag({ parentId, id: child.id });
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          if (
            subDrag &&
            subDragOver &&
            subDrag.parentId === subDragOver.parentId &&
            subDrag.id !== subDragOver.id
          ) {
            reorderSubmenu(subDrag.parentId, subDrag.id, subDragOver.id, subDragPosition);
          }
          setSubDrag(null);
          setSubDragOver(null);
        }}
        onDragOver={(e) => {
          if (!isOpen || !subDrag || subDrag.parentId !== parentId || subDrag.id === child.id) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setSubDragPosition(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
          setSubDragOver({ parentId, id: child.id });
        }}
      >
        {child.hardNav ? (
          <a
            href={child.href}
            className={`muhasebe-nav-sublink${childActive ? " is-active" : ""}`}
            aria-current={childActive ? "page" : undefined}
            onClick={closeMobileIfNeeded}
          >
            {child.label}
          </a>
        ) : (
          <Link
            href={child.href}
            className={`muhasebe-nav-sublink${childActive ? " is-active" : ""}`}
            aria-current={childActive ? "page" : undefined}
            onClick={closeMobileIfNeeded}
          >
            {child.label}
          </Link>
        )}
      </li>
    );
  };

  const renderSubmenuItems = (item: MuhasebeNavItemDef) => {
    const children = item.children || [];
    const hasGroups = children.some((c) => c.group);
    if (!hasGroups) {
      return children.map((child) => renderSubmenuLink(child, children, item.id));
    }
    const groups: Record<string, MuhasebeNavChildDef[]> = {};
    children.forEach((child) => {
      const g = child.group || "Diğer";
      if (!groups[g]) groups[g] = [];
      groups[g].push(child);
    });
    return Object.entries(groups).map(([groupName, groupChildren]) => (
      <li key={groupName} className="muhasebe-nav-subgroup">
        <div className="muhasebe-nav-subgroup-title">{groupName}</div>
        <ul className="muhasebe-nav-subgroup-list">
          {groupChildren.map((child) => renderSubmenuLink(child, children, item.id))}
        </ul>
      </li>
    ));
  };

  const renderBadge = (count?: number) =>
    count != null && count > 0 ? (
      <span className="muhasebe-nav-badge">{count > 99 ? "99+" : count}</span>
    ) : null;

  const renderNavItem = (item: MuhasebeNavItemDef) => {
    const hasChildren = !!item.children?.length;
    const active = isMuhasebeNavActive(pathname, item);
    const badge = item.badge;
    const isExpanded = expandedMenus.includes(item.id);
    const isPinned = pinnedIds.includes(item.id);
    const isDragOver = dragOverId === item.id && dragId !== item.id;

    if (hasChildren) {
      return (
        <li
          key={item.id}
          className={`muhasebe-nav-item muhasebe-nav-group${isExpanded ? " is-open" : ""}${
            dragId === item.id ? " is-dragging" : ""
          }${isDragOver ? ` drag-over-${dragPosition === "before" ? "before" : "after"}` : ""}`}
          draggable={isOpen && !searchQuery}
          onDragStart={(e) => handleDragStart(e, item.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, item.id)}
        >
          <div className="muhasebe-nav-link-row">
            <button
              type="button"
              className={`muhasebe-nav-link muhasebe-nav-group-toggle${active ? " is-active" : ""}`}
              onClick={() => {
                if (!isDesktop && !isOpen) {
                  pendingExpandRef.current = item.id;
                  onToggle();
                  return;
                }
                if (!isOpen) {
                  pendingExpandRef.current = item.id;
                  onToggle();
                  return;
                }
                toggleSubmenu(item.id);
              }}
              aria-expanded={isExpanded}
              title={!isOpen ? item.label : undefined}
            >
              {active && <span className="muhasebe-nav-active-bar" aria-hidden />}
              <span className="muhasebe-nav-icon">{item.icon}</span>
              {isOpen && (
                <>
                  <span className="muhasebe-nav-label">{item.label}</span>
                  {renderBadge(badge)}
                  <NavChevron expanded={isExpanded} />
                </>
              )}
            </button>
            {isOpen && (
              <button
                type="button"
                className={`muhasebe-pin-btn${isPinned ? " is-pinned" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePin(item.id);
                }}
                title={isPinned ? "Sabitliği kaldır" : "Menüyü sabitle"}
              >
                <PinIcon />
              </button>
            )}
          </div>
          {isOpen && isExpanded && (
            <ul className="muhasebe-nav-submenu is-open">{renderSubmenuItems(item)}</ul>
          )}
          {!isOpen && (
            <>
              <span className="muhasebe-nav-tooltip">{item.label}</span>
              <div className="muhasebe-nav-submenu-tooltip">
                <div className="muhasebe-nav-submenu-tooltip-title">{item.label}</div>
                {item.children!.map((child) => {
                  const childActive = isMuhasebeNavChildActive(pathname, child, item.children);
                  const className = `muhasebe-nav-sublink${childActive ? " is-active" : ""}`;
                  if (child.hardNav) {
                    return (
                      <a
                        key={child.id}
                        href={child.href}
                        className={className}
                        onClick={closeMobileIfNeeded}
                      >
                        {child.label}
                      </a>
                    );
                  }
                  return (
                    <Link
                      key={child.id}
                      href={child.href}
                      className={className}
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
        className={`muhasebe-nav-item${dragId === item.id ? " is-dragging" : ""}${
          isDragOver ? ` drag-over-${dragPosition === "before" ? "before" : "after"}` : ""
        }`}
        draggable={isOpen && !searchQuery}
        onDragStart={(e) => handleDragStart(e, item.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, item.id)}
      >
        <div className="muhasebe-nav-link-row">
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
            {isOpen && renderBadge(badge)}
          </Link>
          {isOpen && (
            <button
              type="button"
              className={`muhasebe-pin-btn${isPinned ? " is-pinned" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                togglePin(item.id);
              }}
              title={isPinned ? "Sabitliği kaldır" : "Menüyü sabitle"}
            >
              <PinIcon />
            </button>
          )}
        </div>
        {!isOpen && <span className="muhasebe-nav-tooltip">{item.label}</span>}
      </li>
    );
  };

  return (
    <aside
      className={`muhasebe-sidebar${isOpen ? " is-open" : " is-collapsed"}`}
      id="muhasebe-sidebar"
      aria-hidden={!isDesktop && !mobileDrawerOpen}
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

      {isOpen && (
        <div className="muhasebe-sidebar-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Menüde ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="muhasebe-sidebar-search-input"
          />
          {searchQuery ? (
            <button
              type="button"
              className="muhasebe-sidebar-search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Aramayı temizle"
            >
              ✕
            </button>
          ) : null}
        </div>
      )}

      <nav className="muhasebe-nav-sidebar" aria-label="Muhasebe menüsü">
        {isOpen && pinnedItems.length > 0 && !searchQuery ? (
          <div className="muhasebe-pinned-section">
            <div className="muhasebe-pinned-header">📌 Sabitlenmiş</div>
            <ul className="muhasebe-nav-list muhasebe-pinned-list">
              {pinnedItems.map((item) => {
                const active = isMuhasebeNavActive(pathname, item);
                const href = item.href || item.children?.[0]?.href || "#";
                return (
                  <li key={`pin-${item.id}`} className="muhasebe-nav-item">
                    <Link
                      href={href}
                      className={`muhasebe-nav-link${active ? " is-active" : ""}`}
                      onClick={closeMobileIfNeeded}
                    >
                      {active && <span className="muhasebe-nav-active-bar" aria-hidden />}
                      <span className="muhasebe-nav-icon">{item.icon}</span>
                      <span className="muhasebe-nav-label">{item.label}</span>
                      {renderBadge(item.badge)}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="muhasebe-pinned-divider" />
          </div>
        ) : null}

        <ul className="muhasebe-nav-list">{filteredNavItems.map(renderNavItem)}</ul>
      </nav>

      <div className="muhasebe-sidebar-footer">
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
