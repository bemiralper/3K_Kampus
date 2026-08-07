"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { subscribeResourcesChanged } from "@/lib/resources-events";
import AnalizPanel from "./components/AnalizPanel";
import YayinevleriPanel from "./components/YayinevleriPanel";
import EslestirmePanel from "./components/EslestirmePanel";
import "../kaynaklar/kaynaklar.css";

type MainTab = "analiz" | "yayinevleri" | "eslestirme";

const TABS: Array<{ id: MainTab; label: string }> = [
  { id: "analiz", label: "Analizler" },
  { id: "yayinevleri", label: "Yayınevleri" },
  { id: "eslestirme", label: "Yayınevi Eşleştirme" },
];

function normalizeTab(raw: string | null): MainTab {
  if (raw === "yayinevleri" || raw === "eslestirme" || raw === "analiz") return raw;
  return "analiz";
}

function HubInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<MainTab>(() => normalizeTab(searchParams.get("tab")));
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setTab(normalizeTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    const bump = () => setRefreshKey((k) => k + 1);
    const unsub = subscribeResourcesChanged(bump);
    const onFocus = () => bump();
    window.addEventListener("focus", onFocus);
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      unsub();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const switchTab = (next: MainTab) => {
    setTab(next);
    const qs = next === "analiz" ? "" : `?tab=${next}`;
    router.replace(`/admin/odev/analizler${qs}`, { scroll: false });
  };

  return (
    <div className="kk-page">
      <div className="kk-hero">
        <div className="kk-hero-inner">
          <div>
            <h1>Kaynak Yönetimi</h1>
            <p style={{ margin: "6px 0 0", opacity: 0.9 }}>
              Analizler, yayınevleri ve toplu eşleştirme
            </p>
          </div>
        </div>
      </div>

      <div className="kk-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`kk-tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "analiz" && <AnalizPanel refreshKey={refreshKey} />}
      {tab === "yayinevleri" && <YayinevleriPanel refreshKey={refreshKey} />}
      {tab === "eslestirme" && <EslestirmePanel refreshKey={refreshKey} />}
    </div>
  );
}

export default function KaynakYonetimHubPage() {
  return (
    <Suspense fallback={<div className="kk-page">Yükleniyor…</div>}>
      <HubInner />
    </Suspense>
  );
}
