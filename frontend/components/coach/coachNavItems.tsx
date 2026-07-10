import type { ReactNode } from "react";
import {
  COACH_KUTUPHANE_BASE,
  KUTUPHANE_NAV_ITEMS,
  kutuphaneHref,
} from "@/lib/kutuphane-routes";

export type CoachNavChildDef = {
  id: string;
  href: string;
  label: string;
  matchPrefix?: string;
};

export type CoachNavItemDef = {
  id: string;
  href: string;
  label: string;
  icon: ReactNode;
  matchPrefix?: string;
  children?: CoachNavChildDef[];
};

export const COACH_KUTUPHANE_CHILDREN: CoachNavChildDef[] = KUTUPHANE_NAV_ITEMS.map((item) => {
  const href = kutuphaneHref(COACH_KUTUPHANE_BASE, item.segment);
  return {
    id: `kutuphane-${item.segment || "dashboard"}`,
    href,
    label: item.label,
    matchPrefix: href,
  };
});

export const COACH_NAV_ITEMS: CoachNavItemDef[] = [
  {
    id: "dashboard",
    href: "/coach/dashboard",
    label: "Dashboard",
    matchPrefix: "/coach/dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    id: "ogrenciler",
    href: "/coach/ogrenciler",
    label: "Öğrencilerim",
    matchPrefix: "/coach/ogrenciler",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: "odev-kontrol",
    href: "/coach/odev/kontrol",
    label: "Ödev Kontrol",
    matchPrefix: "/coach/odev/kontrol",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: "kaynaklar",
    href: "/coach/odev/kaynaklar",
    label: "Kaynak Kütüphanesi",
    matchPrefix: "/coach/odev/kaynaklar",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    id: "kaynak-havuzu",
    href: "/coach/odev/kaynak-havuzu",
    label: "Kaynak Havuzu",
    matchPrefix: "/coach/odev/kaynak-havuzu",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    id: "kutuphane",
    href: COACH_KUTUPHANE_BASE,
    label: "Kütüphane",
    matchPrefix: COACH_KUTUPHANE_BASE,
    children: COACH_KUTUPHANE_CHILDREN,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    id: "gorusmeler",
    href: "/coach/gorusmeler",
    label: "Görüşmeler",
    matchPrefix: "/coach/gorusmeler",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    id: "gorevler",
    href: "/coach/gorevler",
    label: "Görevler",
    matchPrefix: "/coach/gorevler",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: "takvim",
    href: "/coach/takvim",
    label: "Takvim",
    matchPrefix: "/coach/takvim",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: "mesajlar",
    href: "/coach/mesajlar",
    label: "Mesajlar",
    matchPrefix: "/coach/mesajlar",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    id: "toplu-gonder",
    href: "/coach/toplu-gonder",
    label: "Toplu Gönder",
    matchPrefix: "/coach/toplu-gonder",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
  {
    id: "raporlar",
    href: "/coach/raporlar",
    label: "Raporlar",
    matchPrefix: "/coach/raporlar",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
];

export function isCoachNavChildActive(pathname: string, child: CoachNavChildDef): boolean {
  const prefix = child.matchPrefix || child.href;
  if (prefix === COACH_KUTUPHANE_BASE) {
    return pathname === COACH_KUTUPHANE_BASE || pathname === `${COACH_KUTUPHANE_BASE}/`;
  }
  return pathname.startsWith(prefix);
}

export function isCoachNavActive(pathname: string, item: CoachNavItemDef): boolean {
  if (item.children?.length) {
    return item.children.some((child) => isCoachNavChildActive(pathname, child));
  }

  const prefix = item.matchPrefix || item.href;
  if (prefix === "/coach/dashboard") {
    return pathname === "/coach" || pathname === "/coach/dashboard";
  }
  return pathname.startsWith(prefix);
}
