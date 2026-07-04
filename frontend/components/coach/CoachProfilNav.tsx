"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/coach/profil", label: "Profilim", exact: true },
  { href: "/coach/profil/istatistikler", label: "İstatistiklerim", exact: false },
];

export default function CoachProfilNav() {
  const pathname = usePathname();

  return (
    <nav className="coach-profil-nav" aria-label="Profil menüsü">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`coach-profil-nav-link${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
