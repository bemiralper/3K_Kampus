"use client";

import React, { Component, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import {
  FINANS_REPORT_ITEMS,
  resolveFinansReportTab,
  type FinansReportTab,
} from "@/lib/finans/finansReportNav";

const tabFallback = (
  <div className="flex justify-center py-16">
    <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin" />
  </div>
);

const GunSonuClient = dynamic(() => import("../gun-sonu/GunSonuClient"), { ssr: false, loading: () => tabFallback });
const VadesiGelenlerClient = dynamic(() => import("../vadesi-gelenler/VadesiGelenlerClient"), { ssr: false, loading: () => tabFallback });
const GecikmisOdemelerClient = dynamic(() => import("../gecikmis-odemeler/GecikmisOdemelerClient"), { ssr: false, loading: () => tabFallback });
const DonemTahsilatClient = dynamic(() => import("../donem-tahsilat/DonemTahsilatClient"), { ssr: false, loading: () => tabFallback });
const RaporlamaClient = dynamic(() => import("../raporlama/RaporlamaClient"), { ssr: false, loading: () => tabFallback });
const GelirGiderRaporClient = dynamic(() => import("../gelir-gider-v2/RaporClient"), { ssr: false, loading: () => tabFallback });
const GGProvider = dynamic(() => import("../gelir-gider-v2/GGProvider"), { ssr: false });

class ReportTabErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || "Rapor yüklenemedi." };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-red-700">{this.state.error}</p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
            onClick={() => this.setState({ error: null })}
          >
            Tekrar dene
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function TahsilatRaporlarInner() {
  const searchParams = useSearchParams();
  const { homeHref, isMuhasebeMode, portalHomeHref, tahsilatTabHref } = useFinansPath();
  const { href: odemeHref } = useOdemePath();

  const rawTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<FinansReportTab>(() => resolveFinansReportTab(rawTab));

  useEffect(() => {
    setActiveTab(resolveFinansReportTab(rawTab));
  }, [rawTab]);

  const setTab = useCallback(
    (next: FinansReportTab) => {
      setActiveTab(next);
      if (typeof window === "undefined") return;
      // router.replace Next.js 14'te parallelRoutes hatasıyla portal dışına atıyor.
      window.history.replaceState(window.history.state, "", tahsilatTabHref(next));
    },
    [tahsilatTabHref],
  );

  const tabPanel = useMemo(() => {
    if (activeTab === "gun-sonu") return <GunSonuClient embedded />;
    if (activeTab === "gecikmis") return <GecikmisOdemelerClient embedded />;
    if (activeTab === "vadesi-gelenler") return <VadesiGelenlerClient embedded />;
    if (activeTab === "donem") return <DonemTahsilatClient embedded />;
    if (activeTab === "gelir-gider") {
      return (
        <GGProvider>
          <GelirGiderRaporClient embedded />
        </GGProvider>
      );
    }
    if (activeTab === "mali-analiz") return <RaporlamaClient embedded />;
    return <GunSonuClient embedded />;
  }, [activeTab]);

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
            <a
              href={odemeHref("")}
              className="px-4 py-2.5 text-sm font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition"
            >
              Sözleşme/Tahsilat →
            </a>
          )}
        </div>
      </div>

      <div className="tabs-modern mb-5">
        {FINANS_REPORT_ITEMS.map((t) => (
          <a
            key={t.tab}
            href={tahsilatTabHref(t.tab)}
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

      <ReportTabErrorBoundary>
        <div>{tabPanel}</div>
      </ReportTabErrorBoundary>
    </div>
  );
}

export default function TahsilatRaporlarClient() {
  return (
    <Suspense fallback={tabFallback}>
      <TahsilatRaporlarInner />
    </Suspense>
  );
}
