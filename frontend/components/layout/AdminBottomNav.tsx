"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  onMenuClick: () => void;
  menuOpen: boolean;
  onSearchClick: () => void;
};

const ITEMS = [
  { href: "/dashboard", label: "Panel", match: (p: string) => p === "/dashboard" || p.startsWith("/dashboard/") },
  { href: "/ogrenciler", label: "Öğrenci", match: (p: string) => p.startsWith("/ogrenciler") },
  { href: "/odeme-takip", label: "Tahsilat", match: (p: string) => p.startsWith("/odeme-takip") },
] as const;

export default function AdminBottomNav({ onMenuClick, menuOpen, onSearchClick }: Props) {
  const pathname = usePathname() || "";

  return (
    <nav className="admin-bottom-nav" aria-label="Admin hızlı menü">
      <ul className="admin-bottom-nav-list">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`admin-bottom-nav-link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="admin-bottom-nav-label">{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className="admin-bottom-nav-link"
            onClick={onSearchClick}
            aria-label="Ara"
          >
            <span className="admin-bottom-nav-label">Ara</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={`admin-bottom-nav-link admin-bottom-nav-menu${menuOpen ? " is-active" : ""}`}
            onClick={onMenuClick}
            aria-label="Menü"
            aria-expanded={menuOpen}
          >
            <span className="admin-bottom-nav-label">Menü</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
