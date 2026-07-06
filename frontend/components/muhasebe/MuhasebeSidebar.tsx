"use client";

import Link from "next/link";
import KurumLogo from "@/components/branding/KurumLogo";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
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
  isDesktop: boolean;
  mobileDrawerOpen: boolean;
  onToggle: () => void;
  onCloseMobile: () => void;
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
  const { getOrderedItems } = useMuhasebeMenuOrder();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  const navItems = useMemo(() => getOrderedItems(), [getOrderedItems]);

  // Yalnızca rota veya sidebar genişliği değişince senkronize et.
  // navItems her render'da yeni dizi olduğu için dependency'ye eklenmez —
  // aksi halde geniş menüde sonsuz re-render döngüsü oluşur ve tıklamalar kilitlenir.
  useEffect(() => {
    if (!isOpen) {
      setExpandedMenus([]);
      return;
    }
    const activeParent = MUHASEBE_NAV_ITEMS.find(
      (item) => item.children?.length && isMuhasebeNavActive(pathname, item),
    );
    setExpandedMenus(activeParent ? [activeParent.id] : []);
  }, [isOpen, pathname]);

  const toggleSubmenu = (id: string) => {
    setExpandedMenus((prev) => (prev.includes(id) ? [] : [id]));
  };

  const closeMobileIfNeeded = () => {
    if (!isDesktop && mobileDrawerOpen) onCloseMobile();
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

  const renderSubmenuLink = (child: MuhasebeNavChildDef) => {
    const childActive = isMuhasebeNavChildActive(pathname, child);
    return (
      <li key={child.id} className="muhasebe-nav-subitem">
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

    if (hasChildren) {
      return (
        <li
          key={item.id}
          className={`muhasebe-nav-item muhasebe-nav-group${isExpanded ? " is-open" : ""}`}
        >
          <button
            type="button"
            className={`muhasebe-nav-link muhasebe-nav-group-toggle${active ? " is-active" : ""}`}
            onClick={() => toggleSubmenu(item.id)}
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
          {isOpen && isExpanded && (
            <ul className="muhasebe-nav-submenu is-open">
              {item.children!.map(renderSubmenuLink)}
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
      <li key={item.id} className="muhasebe-nav-item">
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

      <nav className="muhasebe-nav-sidebar" aria-label="Muhasebe menüsü">
        <ul className="muhasebe-nav-list">{navItems.map(renderNavItem)}</ul>
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
