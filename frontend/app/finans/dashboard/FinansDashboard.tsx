"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import "@/components/finans/finans-list.css";
import { dashboardService, DashboardOverview } from "../services/dashboard-api";
import DashboardSummaryCards from "./components/DashboardSummaryCards";
import DashboardQuickActions from "./components/DashboardQuickActions";
import DashboardSectionLabel from "./components/DashboardSectionLabel";
import DashboardChartSkeleton from "./components/DashboardChartSkeleton";
import { IconLineChart, IconRefresh } from "./dashboard-icons";

/** Recharts SSR'de vendor-chunk sorunlarına yol açar — sadece istemcide yükle. */
const DashboardPieChart = dynamic(() => import("./components/DashboardPieChart"), {
  ssr: false,
  loading: () => <DashboardChartSkeleton />,
});
const DashboardMonthlyLine = dynamic(() => import("./components/DashboardMonthlyLine"), {
  ssr: false,
  loading: () => <DashboardChartSkeleton />,
});

export default function FinansDashboard() {
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const { isMuhasebeMode, portalHomeHref } = useFinansPath();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    if (!activeKurum) return;
    setRefreshing(true);
    setError(null);
    try {
      const result = await dashboardService.getOverview({
        kurum_id: activeKurum.id,
        sube_id: activeSube?.id,
        egitim_yili_id: activeEgitimYili?.id,
      });
      setData(result);
      setLastUpdated(new Date());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Dashboard verisi yüklenemedi";
      setError(msg);
    }
    setLoading(false);
    setRefreshing(false);
  }, [activeKurum, activeSube, activeEgitimYili]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!activeKurum) {
    return (
      <div className="card-modern flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#eaf3fb", color: "#0262a7" }}>
          <IconLineChart className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Kurum Seçiniz</h3>
        <p className="text-sm text-gray-500">
          Finans dashboard verilerini görüntülemek için üst menüden bir kurum seçin.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card-modern flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-9 h-9 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin" />
        <span className="text-sm text-gray-500">Dashboard yükleniyor...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-modern flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-red-50 text-red-600">
          <IconRefresh className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Bir şeyler ters gitti</h3>
        <p className="text-sm text-gray-500 mb-4">{error}</p>
        <button
          type="button"
          onClick={loadData}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700"
        >
          Tekrar Dene
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <div className="hero-header mb-6">
        <div className="hero-content">
          <div className="hero-icon">
            <IconLineChart className="w-8 h-8" />
          </div>
          <div className="hero-text">
            <h1>Finans Dashboard</h1>
            <div className="hero-breadcrumb">
              <a href={portalHomeHref}>Ana Sayfa</a>
              <span>/</span>
              <span>Finans</span>
            </div>
          </div>
        </div>
        <div className="hero-actions flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-white/70 whitespace-nowrap hidden sm:inline">
              Güncellendi: {lastUpdated.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button type="button" onClick={loadData} className="btn-hero" disabled={refreshing}>
            <span className="btn-hero-icon">
              <IconRefresh className={`w-[18px] h-[18px] ${refreshing ? "animate-spin" : ""}`} />
            </span>
            <span>Yenile</span>
          </button>
        </div>
      </div>

      <DashboardQuickActions />

      <DashboardSummaryCards cards={data.ozet_kartlar} hideGelirGider={isMuhasebeMode} referansTarih={data.tarih} />

      <DashboardSectionLabel text="Analiz" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <DashboardPieChart
          title="Tahsilat Dağılımı (Bu Ay)"
          data={data.tahsilat_dagilimi}
          nameKey="yontem"
          emptyText="Bu ay tahsilat yok"
        />
        <DashboardPieChart
          title="Gelir Kaynakları (Bu Ay)"
          data={data.gelir_kaynak_kirilimi}
          nameKey="kaynak_label"
          emptyText="Kaynak verisi yok"
        />
        <DashboardPieChart
          title="Gider Kategorileri (Bu Ay)"
          data={data.gider_kategori_dagilimi}
          nameKey="kategori_adi"
          emptyText="Bu ay gider yok"
        />
      </div>
      <div className="mb-6">
        <DashboardMonthlyLine data={data.gunluk_gelir_gider_net} />
      </div>
    </div>
  );
}
