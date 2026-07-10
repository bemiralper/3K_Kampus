"use client";
import React, { useState, useCallback, useEffect, Suspense, lazy } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { giderKaydiService } from "../services/gider-kaydi-api";
import { gelirKaydiService, gelirKategoriService } from "../services/gelir-api";
import { giderKategoriService } from "../services/gider-api";
import { cariHesapService } from "../services/cari-hesap-api";
import { CariHesap, HESAP_TURLERI } from "../types/cari-hesap-types";
import { GiderOzet } from "../types/gider-types";
import { GelirOzet } from "../types/gelir-types";
import TabPanelLoading from "@/components/TabPanelLoading";
import FinansCekVadeBanner from "@/components/finans/FinansCekVadeBanner";
import "@/components/finans/finans-list.css";

const GelirlerClient = lazy(() => import("../gelir-islemleri/GelirlerClient"));
const GiderlerClient = lazy(() => import("../giderler/GiderlerClient"));
const GelirYonetimiClient = lazy(() => import("../gelir-yonetimi/GelirYonetimiClient"));
const GiderYonetimiClient = lazy(() => import("../gider-yonetimi/GiderYonetimiClient"));
const BorcOdemeClient = lazy(() => import("../borc-odeme-plani/BorcOdemeClient"));

type TabKey = "gelirler" | "giderler" | "gelir-kategorileri" | "gider-kategorileri" | "borc-odeme";

const VALID_TABS: TabKey[] = ["gelirler", "giderler", "gelir-kategorileri", "gider-kategorileri", "borc-odeme"];

const LEGACY_TAB_MAP: Record<string, TabKey> = {
  kategoriler: "gider-kategorileri",
  "gelir-kategorileri": "gelir-kategorileri",
  "gider-kategorileri": "gider-kategorileri",
};

function normalizeTab(raw: string | null): TabKey {
  if (!raw) return "gelirler";
  if (VALID_TABS.includes(raw as TabKey)) return raw as TabKey;
  return LEGACY_TAB_MAP[raw] || "gelirler";
}

function GelirGiderIslemleriInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { homeHref, portalHomeHref } = useFinansPath();
  const { activeKurum, activeSube } = useKurum();
  const kurumId = activeKurum?.id;

  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<TabKey>(() => normalizeTab(tabFromUrl));

  useEffect(() => {
    if (tabFromUrl === "cari-hesaplar") {
      router.replace(`${homeHref}/cari-hesaplar`);
      return;
    }
    const normalized = normalizeTab(tabFromUrl);
    setActiveTab(normalized);
  }, [tabFromUrl, router, homeHref]);

  const [giderOzet, setGiderOzet] = useState<GiderOzet | null>(null);
  const [gelirOzet, setGelirOzet] = useState<GelirOzet | null>(null);
  const [gelirKatStats, setGelirKatStats] = useState<{ ana: number; alt: number } | null>(null);
  const [giderKatStats, setGiderKatStats] = useState<{ ana: number; alt: number } | null>(null);

  const [cariHesapDetail, setCariHesapDetail] = useState<CariHesap | null>(null);
  const [cariHesapLoading, setCariHesapLoading] = useState(false);

  const fetchGiderOzet = useCallback(async () => {
    if (!kurumId) return;
    try {
      const data = await giderKaydiService.ozet({ kurum_id: String(kurumId) });
      setGiderOzet(data);
    } catch {}
  }, [kurumId]);

  const fetchGelirOzet = useCallback(async () => {
    if (!kurumId) return;
    try {
      const data = await gelirKaydiService.ozet({ kurum_id: String(kurumId) });
      setGelirOzet(data);
    } catch {}
  }, [kurumId]);

  const fetchGelirKatStats = useCallback(async () => {
    if (!kurumId || !activeSube?.id) return;
    try {
      const data = await gelirKategoriService.tree(kurumId, activeSube.id);
      setGelirKatStats({ ana: data.toplam_ana, alt: data.toplam_alt });
    } catch {}
  }, [kurumId, activeSube?.id]);

  const fetchGiderKatStats = useCallback(async () => {
    if (!kurumId || !activeSube?.id) return;
    try {
      const data = await giderKategoriService.tree(kurumId, activeSube.id);
      setGiderKatStats({ ana: data.toplam_ana, alt: data.toplam_alt });
    } catch {}
  }, [kurumId, activeSube?.id]);

  useEffect(() => {
    fetchGiderOzet();
    fetchGelirOzet();
  }, [fetchGiderOzet, fetchGelirOzet]);

  useEffect(() => {
    if (activeTab === "gelir-kategorileri") fetchGelirKatStats();
    if (activeTab === "gider-kategorileri") fetchGiderKatStats();
  }, [activeTab, fetchGelirKatStats, fetchGiderKatStats]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    const url = tab === "gelirler" ? `${homeHref}/gelir-gider-islemleri` : `${homeHref}/gelir-gider-islemleri?tab=${tab}`;
    router.replace(url);
  };

  const handleOpenCariHesap = useCallback(async (cariHesapId: number) => {
    setCariHesapLoading(true);
    try {
      const data = await cariHesapService.get(cariHesapId);
      setCariHesapDetail(data);
    } catch {}
    finally { setCariHesapLoading(false); }
  }, []);

  const refreshStats = useCallback(() => {
    fetchGiderOzet();
    fetchGelirOzet();
    if (activeTab === "gelir-kategorileri") fetchGelirKatStats();
    if (activeTab === "gider-kategorileri") fetchGiderKatStats();
  }, [fetchGiderOzet, fetchGelirOzet, fetchGelirKatStats, fetchGiderKatStats, activeTab]);

  if (!kurumId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Kurum Seçiniz</h3>
        <p className="text-sm text-gray-500">Gelir & gider işlemleri için üst menüden bir kurum seçin.</p>
      </div>
    );
  }

  return (
    <>
      <div className="hero-header">
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Gelir & Gider</h1>
            <div className="hero-breadcrumb">
              <a href={portalHomeHref}>Ana Sayfa</a>
              <span>/</span>
              <a href={homeHref}>Finans</a>
              <span>/</span>
              <span>Gelir & Gider</span>
            </div>
          </div>
        </div>
      </div>

      {(activeTab === "giderler" || activeTab === "borc-odeme") && (
        <FinansCekVadeBanner kurumId={kurumId} onViewVadeler={() => handleTabChange("borc-odeme")} />
      )}

      <div className="tabs-modern">
        <a className={`tab-modern ${activeTab === "gelirler" ? "active" : ""}`} onClick={(e) => { e.preventDefault(); handleTabChange("gelirler"); }} href="#">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Gelirler
        </a>
        <a className={`tab-modern ${activeTab === "giderler" ? "active" : ""}`} onClick={(e) => { e.preventDefault(); handleTabChange("giderler"); }} href="#">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          </svg>
          Giderler
        </a>
        <a className={`tab-modern ${activeTab === "gelir-kategorileri" ? "active" : ""}`} onClick={(e) => { e.preventDefault(); handleTabChange("gelir-kategorileri"); }} href="#">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Gelir Kategorileri
        </a>
        <a className={`tab-modern ${activeTab === "gider-kategorileri" ? "active" : ""}`} onClick={(e) => { e.preventDefault(); handleTabChange("gider-kategorileri"); }} href="#">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Gider Kategorileri
        </a>
        <a className={`tab-modern ${activeTab === "borc-odeme" ? "active" : ""}`} onClick={(e) => { e.preventDefault(); handleTabChange("borc-odeme"); }} href="#">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Borç / Ödeme Takip
        </a>
      </div>

      {activeTab === "gelirler" && gelirOzet && (
        <div className="quick-stats quick-stats--compact">
          <div className="quick-stat">
            <div className="quick-stat-icon blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="quick-stat-info">
              <h4>{Number(gelirOzet.toplam_gelir).toLocaleString("tr-TR", { minimumFractionDigits: 0 })} ₺</h4>
              <span>Toplam Gelir</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="quick-stat-info">
              <h4>{Number(gelirOzet.toplam_tahsil).toLocaleString("tr-TR", { minimumFractionDigits: 0 })} ₺</h4>
              <span>Toplam Tahsil</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon orange">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="quick-stat-info">
              <h4>{gelirOzet.bekleyen_sayi}</h4>
              <span>Bekleyen</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon red">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="quick-stat-info">
              <h4>{gelirOzet.tahsil_edilmemis_sayi}</h4>
              <span>Tahsil Edilmemiş</span>
            </div>
          </div>
        </div>
      )}

      {(activeTab === "giderler" || activeTab === "borc-odeme") && giderOzet && (
        <div className="quick-stats quick-stats--compact">
          <div className="quick-stat">
            <div className="quick-stat-icon blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
              </svg>
            </div>
            <div className="quick-stat-info">
              <h4>{Number(giderOzet.toplam_gider).toLocaleString("tr-TR", { minimumFractionDigits: 0 })} ₺</h4>
              <span>Toplam Gider</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="quick-stat-info">
              <h4>{Number(giderOzet.toplam_odenen).toLocaleString("tr-TR", { minimumFractionDigits: 0 })} ₺</h4>
              <span>Toplam Ödenen</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon orange">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="quick-stat-info">
              <h4>{giderOzet.bekleyen_sayi}</h4>
              <span>Bekleyen</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon purple">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
              </svg>
            </div>
            <div className="quick-stat-info">
              <h4>{giderOzet.geciken_taksit_sayi}</h4>
              <span>Geciken Taksit</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === "gelir-kategorileri" && gelirKatStats && (
        <div className="quick-stats quick-stats--compact quick-stats--duo">
          <div className="quick-stat">
            <div className="quick-stat-icon blue"><FolderIcon /></div>
            <div className="quick-stat-info">
              <h4>{gelirKatStats.ana}</h4>
              <span>Ana Kategori</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon green"><FolderIcon /></div>
            <div className="quick-stat-info">
              <h4>{gelirKatStats.alt}</h4>
              <span>Alt Kategori</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === "gider-kategorileri" && giderKatStats && (
        <div className="quick-stats quick-stats--compact quick-stats--duo">
          <div className="quick-stat">
            <div className="quick-stat-icon blue"><FolderIcon /></div>
            <div className="quick-stat-info">
              <h4>{giderKatStats.ana}</h4>
              <span>Ana Kategori</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon green"><FolderIcon /></div>
            <div className="quick-stat-info">
              <h4>{giderKatStats.alt}</h4>
              <span>Alt Kategori</span>
            </div>
          </div>
        </div>
      )}

      <div className="card-modern">
        <div className="card-modern-body" style={{ padding: 0 }}>
          {activeTab === "gelirler" && (
            <Suspense fallback={<TabPanelLoading label="Gelir kayıtları yükleniyor..." />}>
              <GelirlerClient embedded onCariHesapClick={handleOpenCariHesap} onDataChange={refreshStats} />
            </Suspense>
          )}
          {activeTab === "giderler" && (
            <Suspense fallback={<TabPanelLoading label="Gider kayıtları yükleniyor..." />}>
              <GiderlerClient embedded onCariHesapClick={handleOpenCariHesap} onDataChange={refreshStats} />
            </Suspense>
          )}
          {activeTab === "gelir-kategorileri" && (
            <Suspense fallback={<TabPanelLoading label="Gelir kategorileri yükleniyor..." />}>
              <GelirYonetimiClient embedded />
            </Suspense>
          )}
          {activeTab === "gider-kategorileri" && (
            <Suspense fallback={<TabPanelLoading label="Gider kategorileri yükleniyor..." />}>
              <GiderYonetimiClient embedded />
            </Suspense>
          )}
          {activeTab === "borc-odeme" && (
            <Suspense fallback={<TabPanelLoading label="Borç / ödeme planı yükleniyor..." />}>
              <BorcOdemeClient embedded />
            </Suspense>
          )}
        </div>
      </div>

      {(cariHesapDetail || cariHesapLoading) && (
        <>
          <div className="fixed inset-0 bg-gray-950/40 backdrop-blur-sm z-[150]" onClick={() => { setCariHesapDetail(null); setCariHesapLoading(false); }} />
          <div className="fixed inset-y-0 right-0 z-[200] w-full max-w-[540px] flex flex-col bg-white shadow-2xl shadow-gray-900/20">
            {cariHesapLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">Cari hesap bilgileri yükleniyor...</span>
              </div>
            ) : cariHesapDetail && (
              <CariHesapQuickView data={cariHesapDetail} onClose={() => setCariHesapDetail(null)} />
            )}
          </div>
        </>
      )}
    </>
  );
}

function FolderIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

export default function GelirGiderIslemleriClient() {
  return (
    <Suspense fallback={<TabPanelLoading label="Gelir & gider yükleniyor..." />}>
      <GelirGiderIslemleriInner />
    </Suspense>
  );
}

function CariHesapQuickView({ data, onClose }: { data: CariHesap; onClose: () => void }) {
  const bakiye = Number(data.bakiye);
  const hesapTuruMeta = HESAP_TURLERI.find((h) => h.value === data.hesap_turu);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-blue-600/25">
                <span className="text-white font-bold text-[16px] tracking-tight">
                  {(data.kisa_ad || data.unvan).slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{data.gorunen_ad}</h2>
                <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${hesapTuruMeta?.color || "bg-gray-100 text-gray-600"}`}>
                    {hesapTuruMeta?.icon} {data.hesap_turu_display}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    data.aktif_mi ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-500 border border-gray-200"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${data.aktif_mi ? "bg-emerald-500" : "bg-gray-400"}`} />
                    {data.aktif_mi ? "Aktif" : "Pasif"}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div className="px-6 pb-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-2xl p-4 text-center border border-gray-100">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Toplam Borç</div>
              <div className="text-[16px] font-bold text-gray-800 tabular-nums">
                {Number(data.toplam_borc).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
              </div>
            </div>
            <div className="bg-emerald-50 rounded-2xl p-4 text-center border border-emerald-100">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-1.5">Toplam Alacak</div>
              <div className="text-[16px] font-bold text-emerald-700 tabular-nums">
                {Number(data.toplam_alacak).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
              </div>
            </div>
            <div className={`rounded-2xl p-4 text-center border ${bakiye > 0 ? "bg-rose-50 border-rose-100" : bakiye < 0 ? "bg-emerald-50 border-emerald-100" : "bg-gray-50 border-gray-100"}`}>
              <div className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${bakiye > 0 ? "text-rose-500" : bakiye < 0 ? "text-emerald-500" : "text-gray-400"}`}>Bakiye</div>
              <div className={`text-[16px] font-bold tabular-nums ${bakiye > 0 ? "text-rose-700" : bakiye < 0 ? "text-emerald-700" : "text-gray-700"}`}>
                {bakiye.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-5">
            <QRow label="Ünvan" value={data.unvan} />
            <QRow label="Kısa Ad" value={data.kisa_ad} />
            <QRow label="Hesap Türü" value={data.hesap_turu_display} />
            <QRow label="Hesap Kodu" value={data.hesap_kodu} mono />
            <QRow label="Vergi No" value={data.vergi_no} mono />
            <QRow label="Vergi Dairesi" value={data.vergi_dairesi} />
            <QRow label="Telefon" value={data.telefon} />
            <QRow label="E-posta" value={data.email} />
            <QRow label="Yetkili Kişi" value={data.yetkili_kisi} />
            <QRow label="Yetkili Telefon" value={data.yetkili_telefon} />
          </div>
          {data.iban && (
            <div className="p-5">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">IBAN</div>
              <div className="text-[14px] font-bold text-gray-800 font-mono tracking-wider bg-violet-50 border border-violet-200 rounded-xl p-4">{data.iban}</div>
            </div>
          )}
          {data.banka_adi && (
            <div className="p-5">
              <div className="grid grid-cols-2 gap-5">
                <QRow label="Banka" value={data.banka_adi} />
                <QRow label="Hesap Sahibi" value={data.hesap_sahibi} />
              </div>
            </div>
          )}
          {data.adres && (
            <div className="p-5">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Adres</div>
              <div className="text-[13px] text-gray-700 bg-gray-50 rounded-xl p-4 leading-relaxed border border-gray-100">{data.adres}</div>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end px-6 py-4 bg-white border-t border-gray-200">
        <button onClick={onClose} className="px-5 py-2.5 bg-transparent border-2 border-gray-200 rounded-xl text-[14px] font-medium text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all">
          Kapat
        </button>
      </div>
    </div>
  );
}

function QRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-[13px] text-gray-800 font-medium ${mono ? "font-mono" : ""}`}>{value || "—"}</div>
    </div>
  );
}
