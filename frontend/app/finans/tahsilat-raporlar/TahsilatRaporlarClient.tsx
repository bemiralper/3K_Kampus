"use client";

import React, { Suspense, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import Link from "next/link";
import {
  FINANS_REPORT_ITEMS,
  resolveFinansReportTab,
  type FinansReportTab,
} from "@/lib/finans/finansReportNav";
import VirmanClient from "../virman/VirmanClient";
import GunSonuClient from "../gun-sonu/GunSonuClient";
import VadesiGelenlerClient from "../vadesi-gelenler/VadesiGelenlerClient";
import GecikmisOdemelerClient from "../gecikmis-odemeler/GecikmisOdemelerClient";
import DonemTahsilatClient from "../donem-tahsilat/DonemTahsilatClient";
import RaporlamaClient from "../raporlama/RaporlamaClient";

function TahsilatRaporlarInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { homeHref, isMuhasebeMode, portalHomeHref, tahsilatTabHref } = useFinansPath();
  const { href: odemeHref } = useOdemePath();

  const rawTab = searchParams.get("tab");
  const reportItems = isMuhasebeMode
    ? FINANS_REPORT_ITEMS.filter((t) => t.tab !== "mali-analiz")
    : FINANS_REPORT_ITEMS;
  const tab = resolveFinansReportTab(rawTab);
  const activeTab =
    isMuhasebeMode && tab === "mali-analiz" ? ("virman" as FinansReportTab) : tab;

  useEffect(() => {
    if (rawTab === "raporlar") {
      router.replace(tahsilatTabHref(isMuhasebeMode ? "virman" : "mali-analiz"));
      return;
    }
    if (isMuhasebeMode && rawTab === "mali-analiz") {
      router.replace(tahsilatTabHref("virman"));
    }
  }, [rawTab, router, tahsilatTabHref, isMuhasebeMode]);

  const setTab = useCallback(
    (next: FinansReportTab) => {
      router.replace(tahsilatTabHref(next));
    },
    [router, tahsilatTabHref],
  );

  return (
    <div>
      <div className="hero-header">
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Raporlar</h1>
            <div className="hero-breadcrumb">
              <a href={portalHomeHref}>Ana Sayfa</a>
              <span>/</span>
              <a href={homeHref}>Finans</a>
              <span>/</span>
              <span>Raporlar</span>
            </div>
          </div>
        </div>
        <div className="hero-actions">
          {!isMuhasebeMode && (
            <Link
              href={odemeHref("")}
              className="px-4 py-2.5 text-sm font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition"
            >
              Sözleşme/Tahsilat →
            </Link>
          )}
        </div>
      </div>

      <div className="tabs-modern mb-5">
        {reportItems.map((t) => (
          <a
            key={t.tab}
            href="#"
            className={`tab-modern ${activeTab === t.tab ? "active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              setTab(t.tab);
            }}
          >
            {t.label}
          </a>
        ))}
      </div>

      <div>
        {activeTab === "virman" && <VirmanClient embedded />}
        {activeTab === "gun-sonu" && <GunSonuClient embedded />}
        {activeTab === "gecikmis" && <GecikmisOdemelerClient embedded />}
        {activeTab === "vadesi-gelenler" && <VadesiGelenlerClient embedded />}
        {activeTab === "donem" && <DonemTahsilatClient embedded />}
        {!isMuhasebeMode && activeTab === "mali-analiz" && <RaporlamaClient embedded />}
      </div>
    </div>
  );
}

export default function TahsilatRaporlarClient() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      }
    >
      <TahsilatRaporlarInner />
    </Suspense>
  );
}
