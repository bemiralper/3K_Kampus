"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import "@/components/finans/finans-list.css";
import { dashboardService, DashboardOverview } from "../services/dashboard-api";
import DashboardShortcuts from "./components/DashboardShortcuts";
import DashboardKpiCards from "./components/DashboardKpiCards";
import DashboardChartSkeleton from "./components/DashboardChartSkeleton";
import { IconRefresh } from "./dashboard-icons";
import "./finans-dashboard.css";

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
  const { isMuhasebeMode } = useFinansPath();
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
      <div className="fdash-page">
        <div className="fdash-state">
          <h3>Kurum Seçiniz</h3>
          <p>Finans dashboard verilerini görüntülemek için üst menüden bir kurum seçin.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fdash-page">
        <div className="fdash-state" style={{ minHeight: 360 }}>
          <div className="fdash-spinner" />
          <p>Dashboard yükleniyor…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fdash-page">
        <div className="fdash-state">
          <h3>Bir şeyler ters gitti</h3>
          <p>{error}</p>
          <button type="button" onClick={loadData} className="fdash-btn">
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="fdash-page">
      <header className="fdash-head">
        <div>
          <h1 className="fdash-title">Finans Dashboard</h1>
          <p className="fdash-subtitle">
            Sol: bugünün giren/çıkan/farkı · Orta: bu ayın toplamı · Sağ: kasa ve banka bakiyeleri
            {activeSube ? ` · ${activeSube.ad}` : ""} — {activeKurum.ad}
          </p>
        </div>
        <div className="fdash-head-actions">
          {lastUpdated && (
            <span className="fdash-head-meta">
              {lastUpdated.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button type="button" onClick={loadData} className="fdash-btn" disabled={refreshing}>
            <IconRefresh className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Yenile
          </button>
        </div>
      </header>

      <DashboardShortcuts />

      <DashboardKpiCards
        cards={data.ozet_kartlar}
        hideGelirGider={isMuhasebeMode}
        referansTarih={data.tarih}
        kasaHesaplari={data.kasa_hesaplari}
        bankaHesaplari={data.banka_hesaplari}
      />

      <section className="fdash-block">
        <h2 className="fdash-block-label">Analiz</h2>
        <div className="fdash-charts">
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
        <DashboardMonthlyLine data={data.gunluk_gelir_gider_net} />
      </section>
    </div>
  );
}
