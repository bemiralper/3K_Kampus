import type { ReactNode } from "react";
import { isTahsilatRaporlarFinansPath, MUHASEBE_KURUM_BASE } from "@/lib/muhasebe-routes";
import {
  KUTUPHANE_NAV_ITEMS,
  MUHASEBE_KUTUPHANE_BASE,
  kutuphaneHref,
} from "@/lib/kutuphane-routes";

export const MUHASEBE_FINANS_BASE = "/muhasebe/finans";
export { MUHASEBE_KURUM_BASE };

export type MuhasebeNavChildDef = {
  id: string;
  href: string;
  label: string;
  matchPrefix?: string;
};

export type MuhasebeNavItemDef = {
  id: string;
  href: string;
  label: string;
  icon: ReactNode;
  matchPrefix?: string;
  children?: MuhasebeNavChildDef[];
};

const FINANS_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

export const MUHASEBE_FINANS_CHILDREN: MuhasebeNavChildDef[] = [
  {
    id: "finans-dashboard",
    href: MUHASEBE_FINANS_BASE,
    label: "Dashboard",
    matchPrefix: MUHASEBE_FINANS_BASE,
  },
  {
    id: "tahsilat-raporlar",
    href: `${MUHASEBE_FINANS_BASE}/tahsilat-raporlar`,
    label: "Raporlar",
    matchPrefix: `${MUHASEBE_FINANS_BASE}/tahsilat-raporlar`,
  },
  {
    id: "gelir-gider-islemleri",
    href: `${MUHASEBE_FINANS_BASE}/gelir-gider-islemleri`,
    label: "Gelir & Gider",
    matchPrefix: `${MUHASEBE_FINANS_BASE}/gelir-gider-islemleri`,
  },
  {
    id: "cari-hesaplar",
    href: `${MUHASEBE_FINANS_BASE}/cari-hesaplar`,
    label: "Cari Hesaplar",
    matchPrefix: `${MUHASEBE_FINANS_BASE}/cari-hesaplar`,
  },
  {
    id: "cek-senet",
    href: `${MUHASEBE_FINANS_BASE}/cek-senet`,
    label: "Çek / Senet",
    matchPrefix: `${MUHASEBE_FINANS_BASE}/cek-senet`,
  },
  {
    id: "tanimlar",
    href: `${MUHASEBE_FINANS_BASE}/tanimlar`,
    label: "Finans Tanımları",
    matchPrefix: `${MUHASEBE_FINANS_BASE}/tanimlar`,
  },
];

const KURUM_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const KUTUPHANE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

export const MUHASEBE_KURUM_CHILDREN: MuhasebeNavChildDef[] = [
  {
    id: "egitim-tanimlari",
    href: `${MUHASEBE_KURUM_BASE}/egitim-tanimlari`,
    label: "Eğitim Tanımları",
    matchPrefix: `${MUHASEBE_KURUM_BASE}/egitim-tanimlari`,
  },
  {
    id: "egitim-paketleri",
    href: `${MUHASEBE_KURUM_BASE}/egitim-paketleri`,
    label: "Eğitim Paketleri",
    matchPrefix: `${MUHASEBE_KURUM_BASE}/egitim-paketleri`,
  },
];

export const MUHASEBE_KUTUPHANE_CHILDREN: MuhasebeNavChildDef[] = KUTUPHANE_NAV_ITEMS.map((item) => {
  const href = kutuphaneHref(MUHASEBE_KUTUPHANE_BASE, item.segment);
  return {
    id: `kutuphane-${item.segment || "dashboard"}`,
    href,
    label: item.label,
    matchPrefix: href,
  };
});

export const MUHASEBE_NAV_ITEMS: MuhasebeNavItemDef[] = [
  {
    id: "dashboard",
    href: "/muhasebe/dashboard",
    label: "Dashboard",
    matchPrefix: "/muhasebe/dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    id: "ogrenci-liste",
    href: "/muhasebe/ogrenci/liste",
    label: "Öğrenci Listesi",
    matchPrefix: "/muhasebe/ogrenci/liste",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: "yeni-kayit",
    href: "/muhasebe/ogrenci/yeni-kayit",
    label: "Yeni Kayıt",
    matchPrefix: "/muhasebe/ogrenci/yeni-kayit",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
  },
  {
    id: "odeme-takip",
    href: "/muhasebe/odeme-takip",
    label: "Sözleşme/Tahsilat",
    matchPrefix: "/muhasebe/odeme-takip",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: "gorevler",
    href: "/muhasebe/gorevler",
    label: "Görevler",
    matchPrefix: "/muhasebe/gorevler",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: "takvim",
    href: "/muhasebe/takvim",
    label: "Takvim",
    matchPrefix: "/muhasebe/takvim",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: "finans",
    href: MUHASEBE_FINANS_BASE,
    label: "Finans",
    matchPrefix: MUHASEBE_FINANS_BASE,
    icon: FINANS_ICON,
    children: MUHASEBE_FINANS_CHILDREN,
  },
  {
    id: "kurum",
    href: `${MUHASEBE_KURUM_BASE}/egitim-tanimlari`,
    label: "Kurum",
    matchPrefix: MUHASEBE_KURUM_BASE,
    icon: KURUM_ICON,
    children: MUHASEBE_KURUM_CHILDREN,
  },
  {
    id: "kutuphane",
    href: MUHASEBE_KUTUPHANE_BASE,
    label: "Kütüphane",
    matchPrefix: MUHASEBE_KUTUPHANE_BASE,
    icon: KUTUPHANE_ICON,
    children: MUHASEBE_KUTUPHANE_CHILDREN,
  },
  {
    id: "personel",
    href: "/muhasebe/personel",
    label: "Personel",
    matchPrefix: "/muhasebe/personel",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    id: "gorevlendirmeler",
    href: "/muhasebe/personel/gorevlendirmeler",
    label: "Görevlendirmeler",
    matchPrefix: "/muhasebe/personel/gorevlendirmeler",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
];

export function isMuhasebeNavChildActive(pathname: string, child: MuhasebeNavChildDef): boolean {
  const prefix = child.matchPrefix || child.href;
  if (prefix === MUHASEBE_FINANS_BASE) {
    return pathname === MUHASEBE_FINANS_BASE || pathname === `${MUHASEBE_FINANS_BASE}/`;
  }
  if (prefix === MUHASEBE_KUTUPHANE_BASE) {
    return pathname === MUHASEBE_KUTUPHANE_BASE || pathname === `${MUHASEBE_KUTUPHANE_BASE}/`;
  }
  if (child.id === "tahsilat-raporlar") {
    return isTahsilatRaporlarFinansPath(pathname, MUHASEBE_FINANS_BASE);
  }
  return pathname.startsWith(prefix);
}

export function isMuhasebeNavActive(pathname: string, item: MuhasebeNavItemDef): boolean {
  if (item.children?.length) {
    return item.children.some((child) => isMuhasebeNavChildActive(pathname, child));
  }

  const prefix = item.matchPrefix || item.href;
  if (prefix === "/muhasebe/dashboard") {
    return pathname === "/muhasebe" || pathname === "/muhasebe/dashboard";
  }
  if (prefix === "/muhasebe/personel") {
    return pathname === "/muhasebe/personel" || /^\/muhasebe\/personel\/\d+/.test(pathname);
  }
  if (prefix === "/muhasebe/personel/gorevlendirmeler") {
    return pathname.startsWith("/muhasebe/personel/gorevlendirmeler");
  }
  if (prefix === MUHASEBE_KURUM_BASE) {
    return pathname.startsWith(MUHASEBE_KURUM_BASE);
  }
  if (prefix === MUHASEBE_KUTUPHANE_BASE) {
    return pathname.startsWith(MUHASEBE_KUTUPHANE_BASE);
  }
  return pathname.startsWith(prefix);
}
