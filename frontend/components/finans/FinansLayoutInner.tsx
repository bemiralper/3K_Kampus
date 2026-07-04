"use client";

import React from "react";
import "@/components/finans/finans-drawer.css";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { isTahsilatRaporlarFinansPath } from "@/lib/muhasebe-routes";

const MODULE_SEGMENTS: Record<string, string> = {
  "": "Dashboard",
  dashboard: "Dashboard",
  tanimlar: "Finans Tanımları",
  "gelir-gider-islemleri": "Gelir & Gider",
  "gider-islemleri": "Gelir & Gider",
  "gelir-islemleri": "Gelir & Gider",
  "gider-yonetimi": "Gelir & Gider",
  "gelir-yonetimi": "Gelir & Gider",
  giderler: "Gider Kayıtları",
  "cari-hesaplar": "Cari Hesaplar",
  gelirler: "Gelir Kayıtları",
  "borc-odeme-plani": "Borç / Ödeme Planı",
  "kasa-banka": "Kasa / Banka",
  "para-hareketleri": "Para Hareketleri",
  "tahsilat-raporlar": "Raporlar",
  virman: "Virman",
  "gun-sonu": "Gün Sonu",
  "vadesi-gelenler": "Vadesi Gelenler",
  "gecikmis-odemeler": "Gecikmiş Ödemeler",
  "donem-tahsilat": "Dönem Tahsilat",
  "cek-senet": "Çek / Senet",
  raporlama: "Mali Analiz",
};

export function FinansLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { basePath, homeHref, portalHomeHref } = useFinansPath();

  const relativePath = pathname.startsWith(basePath)
    ? pathname.slice(basePath.length).replace(/^\//, "")
    : "";
  const firstSegment = relativePath.split("/")[0] || "";
  const currentLabel = isTahsilatRaporlarFinansPath(pathname, basePath)
    ? "Raporlar"
    : MODULE_SEGMENTS[firstSegment] || "Dashboard";
  const isDashboard = !firstSegment || firstSegment === "dashboard";
  const isCariDetay = firstSegment === "cari-hesaplar" && /^\d+/.test(relativePath.split("/")[1] || "");

  return (
    <div className="section">
      <nav className="flex items-center gap-1.5 text-[12px] text-gray-400 mb-1 -mt-1">
        <Link href={portalHomeHref} className="hover:text-gray-600 transition-colors">Ana Sayfa</Link>
        <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        {isDashboard ? (
          <span className="text-gray-600 font-semibold">Finans</span>
        ) : (
          <>
            <Link href={homeHref} className="hover:text-gray-600 transition-colors">Finans</Link>
            <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            {isCariDetay ? (
              <>
                <Link href={`${homeHref}/cari-hesaplar`} className="hover:text-gray-600 transition-colors">Cari Hesaplar</Link>
                <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                <span className="text-gray-600 font-semibold">Cari Detay</span>
              </>
            ) : (
              <span className="text-gray-600 font-semibold">{currentLabel}</span>
            )}
          </>
        )}
      </nav>
      {children}
    </div>
  );
}
