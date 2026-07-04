"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import { periodService } from "../services/period-api";
import { paymentMethodService } from "../services/finans-api";
import type { PeriodDetailItem, PeriodMode, PeriodSummary, PeriodKaynak, PeriodQueryParams } from "../types/period-types";
import { fmtDate, fmtTL } from "@/components/finans/FinansFilterBar";
import ExportDropdown from "@/components/finans/ExportDropdown";
import FloatingMenu from "@/components/finans/FloatingMenu";
import "./donem-tahsilat.css";

/* ═══════════════════════ constants & helpers ═══════════════════════ */

const DATE_PRESETS = [
  { key: "bugun", label: "Bugün" },
  { key: "bu_hafta", label: "Bu Hafta" },
  { key: "bu_ay", label: "Bu Ay" },
  { key: "gecen_ay", label: "Geçen Ay" },
  { key: "bu_yil", label: "Bu Yıl" },
] as const;

const KAYNAK_OPTIONS: { key: PeriodKaynak; label: string; icon: string; color: string }[] = [
  { key: "hepsi", label: "Tümü", icon: "◎", color: "#64748b" },
  { key: "sozlesme", label: "Sözleşme", icon: "📄", color: "#2563eb" },
  { key: "gelir", label: "Gelir Kaydı", icon: "💰", color: "#7c3aed" },
  { key: "cari", label: "Cari Hesap", icon: "🏢", color: "#ea580c" },
];

const YONTEM_TIP_LABELS: Record<string, string> = {
  nakit: "Nakit",
  pos: "POS Cihazı",
  havale_eft: "Havale / EFT",
  online: "Online Ödeme",
  cek: "Çek",
  senet: "Senet",
};

const CHART_COLORS = ["#2563eb", "#059669", "#7c3aed", "#ea580c", "#db2777", "#0891b2", "#ca8a04", "#dc2626"];
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

/** Yerel takvim gününü YYYY-MM-DD olarak döner (UTC'ye çevirmez — gün kaymasını önler). */
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" metnini yerel takvim gününe (saat dilimi kaymasız) çevirir. */
function parseLocalDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, day || 1);
}

function fmtRange(baslangic: string, bitis: string): string {
  const f = (d: string) => {
    const dt = parseLocalDate(d);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
  };
  if (baslangic === bitis) return f(baslangic);
  return `${f(baslangic)} — ${f(bitis)}`;
}

function getPresetRange(key: string): { baslangic: string; bitis: string } {
  const today = new Date();
  const fmt = toLocalISODate;
  if (key === "bugun") return { baslangic: fmt(today), bitis: fmt(today) };
  if (key === "bu_hafta") {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() + 1);
    return { baslangic: fmt(start), bitis: fmt(today) };
  }
  if (key === "gecen_ay") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { baslangic: fmt(start), bitis: fmt(end) };
  }
  if (key === "bu_yil") {
    const start = new Date(today.getFullYear(), 0, 1);
    return { baslangic: fmt(start), bitis: fmt(today) };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { baslangic: fmt(start), bitis: fmt(today) };
}

function getPreviousRange(baslangic: string, bitis: string): { baslangic: string; bitis: string } {
  const start = parseLocalDate(baslangic);
  const end = parseLocalDate(bitis);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { baslangic, bitis };
  }
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - spanDays + 1);
  return { baslangic: toLocalISODate(prevStart), bitis: toLocalISODate(prevEnd) };
}

function kaynakMeta(kaynak: string | PeriodKaynak) {
  return KAYNAK_OPTIONS.find((k) => k.key === kaynak) || KAYNAK_OPTIONS[0];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#059669", "#ea580c", "#db2777", "#0891b2"];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function buildConicGradient(segments: { color: string; pct: number }[]): string {
  if (segments.length === 0) return "#e5e7eb";
  let acc = 0;
  const stops = segments.map((seg) => {
    const start = acc;
    acc = Math.min(100, acc + seg.pct);
    return `${seg.color} ${start}% ${acc}%`;
  });
  if (acc < 100) stops.push(`#e5e7eb ${acc}% 100%`);
  return `conic-gradient(${stops.join(", ")})`;
}

function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push("…");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

/* ═══════════════════════ main component ═══════════════════════ */

export default function DonemTahsilatClient({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const { homeHref, portalHomeHref } = useFinansPath();
  const { href: odemeHref } = useOdemePath();

  const mode = (searchParams.get("mode") as PeriodMode) || "alinan";
  const baslangic = searchParams.get("baslangic") || getPresetRange("bu_ay").baslangic;
  const bitis = searchParams.get("bitis") || getPresetRange("bu_ay").bitis;
  const kaynak = (searchParams.get("kaynak") as PeriodKaynak) || "hepsi";
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Number(searchParams.get("page_size") || "20");

  const [ozet, setOzet] = useState<PeriodSummary | null>(null);
  const [prevOzet, setPrevOzet] = useState<PeriodSummary | null>(null);
  const [items, setItems] = useState<PeriodDetailItem[]>([]);
  const [count, setCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [odemeYontemleri, setOdemeYontemleri] = useState<{ id: number; ad: string; tip: string }[]>([]);
  const [selectedYontemTipleri, setSelectedYontemTipleri] = useState<string[]>([]);
  const [yontemExpanded, setYontemExpanded] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const dateBtnRef = useRef<HTMLButtonElement>(null);
  const [draftBaslangic, setDraftBaslangic] = useState(baslangic);
  const [draftBitis, setDraftBitis] = useState(bitis);

  useEffect(() => {
    if (!activeKurum) return;
    paymentMethodService.list({
      kurum_id: String(activeKurum.id),
      ...(activeSube?.id ? { sube_id: String(activeSube.id) } : {}),
    })
      .then((res) => setOdemeYontemleri((res.odeme_yontemleri || []).filter((o) => o.aktif_mi)))
      .catch(() => setOdemeYontemleri([]));
  }, [activeKurum, activeSube?.id]);

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    });
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const queryParams: PeriodQueryParams | null = useMemo(() => {
    if (!activeKurum) return null;
    return {
      kurum_id: activeKurum.id,
      sube_id: activeSube?.id,
      egitim_yili_id: activeEgitimYili?.id,
      baslangic,
      bitis,
      mode,
      kaynak,
      odeme_yontemi_tipi: selectedYontemTipleri.length ? selectedYontemTipleri : undefined,
      page,
      page_size: pageSize,
    };
  }, [activeKurum, activeSube, activeEgitimYili, baslangic, bitis, mode, kaynak, selectedYontemTipleri, page, pageSize]);

  const prevRange = useMemo(() => getPreviousRange(baslangic, bitis), [baslangic, bitis]);
  const prevQueryParams: PeriodQueryParams | null = useMemo(() => {
    if (!queryParams) return null;
    return { ...queryParams, baslangic: prevRange.baslangic, bitis: prevRange.bitis };
  }, [queryParams, prevRange]);

  const load = useCallback(async () => {
    if (!queryParams) return;
    const isFirstLoad = ozet === null && items.length === 0;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [summaryRes, detailsRes] = await Promise.all([
        periodService.summary(queryParams),
        periodService.details(queryParams),
      ]);
      setOzet(summaryRes.ozet);
      setItems(detailsRes.results || []);
      setCount(detailsRes.count);
      setTotalPages(detailsRes.total_pages || 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri yüklenemedi");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!prevQueryParams) return;
    let cancelled = false;
    periodService.summary(prevQueryParams)
      .then((res) => { if (!cancelled) setPrevOzet(res.ozet); })
      .catch(() => { if (!cancelled) setPrevOzet(null); });
    return () => { cancelled = true; };
  }, [prevQueryParams]);

  useEffect(() => { setDraftBaslangic(baslangic); setDraftBitis(bitis); }, [baslangic, bitis]);

  const toggleYontem = (tip: string) => {
    setSelectedYontemTipleri((prev) =>
      prev.includes(tip) ? prev.filter((x) => x !== tip) : [...prev, tip]
    );
    updateParams({ page: "1" });
  };

  const yontemTipleri = useMemo(() => {
    const seen = new Map<string, string>(Object.entries(YONTEM_TIP_LABELS));
    for (const o of odemeYontemleri) {
      if (o.tip && !seen.has(o.tip)) {
        seen.set(o.tip, YONTEM_TIP_LABELS[o.tip] || o.ad);
      }
    }
    return Array.from(seen.entries()).map(([tip, label]) => ({ tip, label }));
  }, [odemeYontemleri]);

  const activePreset = DATE_PRESETS.find((p) => {
    const r = getPresetRange(p.key);
    return r.baslangic === baslangic && r.bitis === bitis;
  });

  const hasNonDefaultFilters =
    !activePreset || activePreset.key !== "bu_ay" || kaynak !== "hepsi" || selectedYontemTipleri.length > 0;

  const clearFilters = () => {
    const def = getPresetRange("bu_ay");
    setSelectedYontemTipleri([]);
    updateParams({ baslangic: def.baslangic, bitis: def.bitis, kaynak: null, page: "1" });
  };

  const getRowLink = (item: PeriodDetailItem): string | null => {
    if (item.sozlesme_id) return `${odemeHref()}?sozlesme=${item.sozlesme_id}`;
    if (item.gelir_id) return `${homeHref}/gelir-gider-islemleri?tab=gelirler`;
    if (item.cari_hesap_id) return `${homeHref}/cari-hesaplar/${item.cari_hesap_id}`;
    return null;
  };

  if (!activeKurum) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4 text-3xl">🏢</div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Kurum Seçiniz</h3>
        <p className="text-sm text-gray-500">Dönem tahsilat verilerini görüntülemek için kurum seçin.</p>
      </div>
    );
  }

  const maxGrafik = Math.max(...(ozet?.grafik?.map((g) => g.tutar) || [1]), 1);
  const ortalama = ozet && ozet.toplam_adet > 0 ? ozet.toplam_tutar / ozet.toplam_adet : 0;

  let delta: number | null = null;
  if (ozet && prevOzet && prevOzet.toplam_tutar > 0) {
    delta = ((ozet.toplam_tutar - prevOzet.toplam_tutar) / prevOzet.toplam_tutar) * 100;
  } else if (ozet && prevOzet && prevOzet.toplam_tutar === 0 && ozet.toplam_tutar > 0) {
    delta = 100;
  }

  const donutSegments = (ozet?.yontem_dagilimi || []).map((y, i) => ({
    ...y,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  const kaynakTotal = (ozet?.kaynak_kirilimi || []).reduce((s, k) => s + k.toplam, 0) || 1;

  const modeIsAlinan = mode === "alinan";
  const heroGradient = modeIsAlinan
    ? "linear-gradient(135deg, #047857 0%, #059669 45%, #10b981 100%)"
    : "linear-gradient(135deg, #b45309 0%, #d97706 45%, #f59e0b 100%)";

  const visibleYontemler = yontemExpanded ? yontemTipleri : yontemTipleri.slice(0, 8);

  return (
    <div className="donem-tahsilat">
      {!embedded && (
        <div className="hero-header">
          <div className="hero-content">
            <div className="hero-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <div className="hero-text">
              <h1>Dönem Tahsilat</h1>
              <div className="hero-breadcrumb">
                <a href={portalHomeHref}>Ana Sayfa</a>
                <span>/</span>
                <a href={homeHref}>Finans</a>
                <span>/</span>
                <span>Dönem Tahsilat</span>
              </div>
            </div>
          </div>
          <div className="hero-actions">
            {queryParams && (
              <ExportDropdown
                buildPath={(format, orientation) => periodService.reportExportUrl(queryParams, format, orientation)}
                filenamePrefix={`donem-tahsilat-${mode}`}
                disabled={loading}
              />
            )}
          </div>
        </div>
      )}

      {embedded && queryParams && (
        <div className="flex justify-end mb-4">
          <ExportDropdown
            buildPath={(format, orientation) => periodService.reportExportUrl(queryParams, format, orientation)}
            filenamePrefix={`donem-tahsilat-${mode}`}
            disabled={loading}
          />
        </div>
      )}

      {/* ═══ Control bar: mode switch + date + kaynak + clear ═══ */}
      <div className="dt-controlbar">
        <div className="dt-mode-switch">
          <button
            type="button"
            className={`dt-mode-btn ${modeIsAlinan ? "active alinan" : ""}`}
            onClick={() => updateParams({ mode: "alinan", page: "1" })}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Alınan
          </button>
          <button
            type="button"
            className={`dt-mode-btn ${!modeIsAlinan ? "active beklenen" : ""}`}
            onClick={() => updateParams({ mode: "beklenen", page: "1" })}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 7v5l3 3" />
            </svg>
            Beklenen
          </button>
        </div>

        <div className="dt-controlbar-sep" />

        <button ref={dateBtnRef} type="button" className="dt-date-btn" onClick={() => setDateOpen((v) => !v)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
            <path strokeLinecap="round" d="M3 9.5h18M8 3v3M16 3v3" />
          </svg>
          {activePreset ? activePreset.label : fmtRange(baslangic, bitis)}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="dt-chevron">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <FloatingMenu open={dateOpen} anchorRef={dateBtnRef} onClose={() => setDateOpen(false)} className="dt-date-panel" align="start" minWidth={280}>
          <div className="dt-date-panel-presets">
            {DATE_PRESETS.map((p) => {
              const range = getPresetRange(p.key);
              const active = baslangic === range.baslangic && bitis === range.bitis;
              return (
                <button
                  key={p.key}
                  type="button"
                  className={`dt-preset-chip ${active ? "active" : ""}`}
                  onClick={() => { updateParams({ baslangic: range.baslangic, bitis: range.bitis, page: "1" }); setDateOpen(false); }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="dt-date-panel-custom">
            <label>
              <span>Başlangıç</span>
              <input type="date" value={draftBaslangic} onChange={(e) => setDraftBaslangic(e.target.value)} />
            </label>
            <label>
              <span>Bitiş</span>
              <input type="date" value={draftBitis} onChange={(e) => setDraftBitis(e.target.value)} />
            </label>
            <button
              type="button"
              className="dt-date-apply"
              onClick={() => { updateParams({ baslangic: draftBaslangic, bitis: draftBitis, page: "1" }); setDateOpen(false); }}
            >
              Uygula
            </button>
          </div>
        </FloatingMenu>

        <div className="dt-controlbar-sep" />

        <div className="dt-kaynak-chips">
          {KAYNAK_OPTIONS.map((k) => {
            const active = kaynak === k.key;
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => updateParams({ kaynak: k.key === "hepsi" ? null : k.key, page: "1" })}
                className="dt-kaynak-chip"
                style={
                  active
                    ? { background: k.color, borderColor: k.color, color: "#fff" }
                    : { background: "#fff", borderColor: "#e5e7eb", color: "#4b5563" }
                }
              >
                <span>{k.icon}</span>
                {k.label}
              </button>
            );
          })}
        </div>

        {hasNonDefaultFilters && (
          <button type="button" onClick={clearFilters} className="dt-clear-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Temizle
          </button>
        )}
      </div>

      {yontemTipleri.length > 0 && (
        <div className="dt-yontem-row">
          <span className="dt-yontem-label">Ödeme Yöntemi:</span>
          {visibleYontemler.map((o) => (
            <button
              key={o.tip}
              type="button"
              onClick={() => toggleYontem(o.tip)}
              className={`dt-yontem-chip ${selectedYontemTipleri.includes(o.tip) ? "active" : ""}`}
            >
              {o.label}
            </button>
          ))}
          {yontemTipleri.length > 8 && (
            <button type="button" className="dt-yontem-more" onClick={() => setYontemExpanded((v) => !v)}>
              {yontemExpanded ? "Daha az göster" : `+${yontemTipleri.length - 8} daha`}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="dt-skeleton">
          <div className="dt-skeleton-hero" />
          <div className="dt-skeleton-row">
            <div className="dt-skeleton-card" />
            <div className="dt-skeleton-card" />
          </div>
          <div className="dt-skeleton-table" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>
          <button onClick={load} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold">Tekrar Dene</button>
        </div>
      ) : (
        <div className={`dt-content ${refreshing ? "dt-content--refreshing" : ""}`}>
          {ozet && (
            <div className="dt-hero-row">
              {/* Hero stat */}
              <div className="dt-hero-card" style={{ background: heroGradient }}>
                <div className="dt-hero-top">
                  <span className="dt-hero-label">{modeIsAlinan ? "Toplam Tahsilat" : "Toplam Beklenen"}</span>
                  {delta !== null && (
                    <span className={`dt-hero-delta ${delta >= 0 ? "up" : "down"}`}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        {delta >= 0 ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
                      </svg>
                      %{Math.abs(delta).toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="dt-hero-value">{fmtTL(ozet.toplam_tutar)}</div>
                <div className="dt-hero-sub">
                  Önceki dönem: {prevOzet ? fmtTL(prevOzet.toplam_tutar) : "—"} · {fmtRange(prevRange.baslangic, prevRange.bitis)}
                </div>
                {ozet.grafik.length > 0 && (
                  <div className="dt-sparkline">
                    {ozet.grafik.map((g, i) => (
                      <div key={i} className="dt-spark-bar-wrap" title={`${g.label}: ${fmtTL(g.tutar)}`}>
                        <div className="dt-spark-bar" style={{ height: `${Math.max((g.tutar / maxGrafik) * 100, 4)}%` }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Secondary stats */}
              <div className="dt-mini-stats">
                <div className="dt-mini-stat">
                  <div className="dt-mini-stat-icon blue">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /></svg>
                  </div>
                  <div>
                    <div className="dt-mini-stat-value">{ozet.toplam_adet}</div>
                    <div className="dt-mini-stat-label">Kayıt Adedi</div>
                  </div>
                </div>
                <div className="dt-mini-stat">
                  <div className="dt-mini-stat-icon purple">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
                  </div>
                  <div>
                    <div className="dt-mini-stat-value">
                      {modeIsAlinan ? fmtTL(ortalama) : fmtTL(ozet.toplam_alinan ?? 0)}
                    </div>
                    <div className="dt-mini-stat-label">{modeIsAlinan ? "Ortalama Tahsilat" : "Toplam Alınan"}</div>
                  </div>
                </div>
                {!modeIsAlinan && ozet.toplam_kalan != null && (
                  <div className="dt-mini-stat">
                    <div className="dt-mini-stat-icon orange">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                    </div>
                    <div>
                      <div className="dt-mini-stat-value">{fmtTL(ozet.toplam_kalan)}</div>
                      <div className="dt-mini-stat-label">Toplam Kalan</div>
                    </div>
                  </div>
                )}
                {ozet.tahsil_orani != null && (
                  <div className="dt-mini-stat">
                    <div className="dt-mini-stat-icon emerald">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" /></svg>
                    </div>
                    <div>
                      <div className="dt-mini-stat-value">%{ozet.tahsil_orani.toFixed(1)}</div>
                      <div className="dt-mini-stat-label">Tahsil Oranı</div>
                    </div>
                  </div>
                )}
                {modeIsAlinan && ozet.beklenen_tutar != null && ozet.tahsil_orani == null && (
                  <div className="dt-mini-stat">
                    <div className="dt-mini-stat-icon orange">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                    </div>
                    <div>
                      <div className="dt-mini-stat-value">{fmtTL(ozet.beklenen_tutar)}</div>
                      <div className="dt-mini-stat-label">Beklenen</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Distribution */}
          {ozet && (
            <div className="dt-dist-row">
              <div className="dt-panel">
                <h3 className="dt-panel-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 019 9h-9V3z" /></svg>
                  Yöntem Dağılımı
                </h3>
                {donutSegments.length === 0 ? (
                  <p className="dt-empty-mini">Bu aralıkta veri yok</p>
                ) : (
                  <div className="dt-donut-row">
                    <div className="dt-donut" style={{ background: buildConicGradient(donutSegments.map((s) => ({ color: s.color, pct: s.oran }))) }}>
                      <div className="dt-donut-hole">
                        <span className="dt-donut-total">
                          {fmtTL(modeIsAlinan ? ozet.toplam_tutar : (ozet.toplam_alinan ?? ozet.toplam_tutar))}
                        </span>
                        <span className="dt-donut-total-label">{modeIsAlinan ? "Toplam" : "Alınan"}</span>
                      </div>
                    </div>
                    <div className="dt-donut-legend">
                      {donutSegments.map((y, i) => (
                        <div key={i} className="dt-legend-item">
                          <span className="dt-legend-dot" style={{ background: y.color }} />
                          <span className="dt-legend-label">{y.yontem}</span>
                          <span className="dt-legend-value">{fmtTL(y.toplam)}</span>
                          <span className="dt-legend-pct">%{y.oran?.toFixed?.(1) ?? "0"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="dt-panel">
                <h3 className="dt-panel-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h7" /></svg>
                  Kaynak Kırılımı
                </h3>
                {ozet.kaynak_kirilimi.length === 0 ? (
                  <p className="dt-empty-mini">Kaynak verisi yok</p>
                ) : (
                  <>
                    <div className="dt-stackbar">
                      {ozet.kaynak_kirilimi.map((k, i) => {
                        const meta = kaynakMeta(k.kaynak);
                        return (
                          <div
                            key={i}
                            className="dt-stackbar-seg"
                            style={{ width: `${Math.max((k.toplam / kaynakTotal) * 100, 1.5)}%`, background: meta.color }}
                            title={`${k.kaynak_label}: ${fmtTL(k.toplam)}`}
                          />
                        );
                      })}
                    </div>
                    <div className="dt-kaynak-legend">
                      {ozet.kaynak_kirilimi.map((k, i) => {
                        const meta = kaynakMeta(k.kaynak);
                        return (
                          <div key={i} className="dt-legend-item">
                            <span className="dt-legend-dot" style={{ background: meta.color }} />
                            <span className="dt-legend-label">{k.kaynak_label}</span>
                            <span className="dt-legend-value">{fmtTL(k.toplam)}</span>
                            <span className="dt-legend-pct">{k.adet} kayıt</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Table */}
          {items.length === 0 ? (
            <div className="empty-state bg-white rounded-2xl border border-gray-100">
              <div className="empty-state-icon">📭</div>
              <h4>Bu aralıkta {mode === "alinan" ? "tahsilat" : "beklenen ödeme"} yok</h4>
              <p>Farklı bir tarih aralığı veya filtre deneyin.</p>
              {hasNonDefaultFilters && (
                <button type="button" onClick={clearFilters} className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100">
                  Filtreleri Temizle
                </button>
              )}
            </div>
          ) : (
            <div className="dt-table-card">
              <div className="dt-table-head">
                <h3>İşlem Detayları</h3>
                <span>{count} kayıt</span>
              </div>

              {/* Desktop table */}
              <div className="dt-table-scroll">
                <table className="dt-table">
                  <thead>
                    <tr>
                      <th>Kişi</th>
                      {mode === "alinan" ? (
                        <>
                          <th className="num">Tutar</th>
                          <th>Yöntem</th>
                          <th>Durum</th>
                          <th>Tarih</th>
                        </>
                      ) : (
                        <>
                          <th className="num">Toplam</th>
                          <th className="num">Alınan</th>
                          <th className="num">Kalan</th>
                          <th>Yöntem</th>
                          <th>Durum</th>
                          <th>Vade</th>
                        </>
                      )}
                      <th>Kaynak</th>
                      <th className="center">Detay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const link = getRowLink(item);
                      const meta = kaynakMeta(item.kaynak);
                      const color = avatarColor(item.kisi_adi || "?");
                      const durumClass =
                        item.tahsil_durumu === "odendi"
                          ? "positive"
                          : item.tahsil_durumu === "kismi"
                            ? "pending"
                            : "pending";
                      return (
                        <tr key={`${item.kaynak}-${item.id}`}>
                          <td>
                            <div className="dt-person">
                              <span className="dt-avatar" style={{ background: color }}>{initials(item.kisi_adi || "?")}</span>
                              <span className="dt-person-name">{item.kisi_adi}</span>
                            </div>
                          </td>
                          {mode === "alinan" ? (
                            <>
                              <td className="num dt-amount positive">{fmtTL(item.tutar)}</td>
                              <td className="dt-muted">{item.odeme_yontemi || "—"}</td>
                              <td>
                                <span className="dt-kaynak-badge" style={{ background: "#ecfdf5", color: "#059669" }}>
                                  {item.tahsil_durumu_label || "Alındı"}
                                </span>
                              </td>
                              <td className="dt-muted">{fmtDate(item.tarih)}</td>
                            </>
                          ) : (
                            <>
                              <td className="num dt-amount">{fmtTL(item.toplam_tutar ?? item.tutar)}</td>
                              <td className="num dt-amount positive">{fmtTL(item.odenen_tutar ?? 0)}</td>
                              <td className="num dt-amount pending">{fmtTL(item.kalan_tutar ?? item.tutar)}</td>
                              <td className="dt-muted">{item.odeme_yontemi || "—"}</td>
                              <td>
                                <span className={`dt-kaynak-badge ${durumClass}`} style={{
                                  background: item.tahsil_durumu === "odendi" ? "#ecfdf5" : item.tahsil_durumu === "kismi" ? "#fffbeb" : "#fef2f2",
                                  color: item.tahsil_durumu === "odendi" ? "#059669" : item.tahsil_durumu === "kismi" ? "#d97706" : "#dc2626",
                                }}>
                                  {item.tahsil_durumu_label || "—"}
                                </span>
                              </td>
                              <td className="dt-muted">{fmtDate(item.vade_tarihi || item.tarih)}</td>
                            </>
                          )}
                          <td>
                            <span className="dt-kaynak-badge" style={{ background: `${meta.color}1a`, color: meta.color }}>
                              {item.kaynak_label}
                            </span>
                          </td>
                          <td className="center">
                            {link ? <Link href={link} className="dt-detail-link">Git →</Link> : <span className="dt-muted">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="dt-table-footer">
                <div className="dt-pagesize">
                  <span>Sayfa başına:</span>
                  <select value={pageSize} onChange={(e) => updateParams({ page_size: e.target.value, page: "1" })}>
                    {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="dt-pagination">
                  <button type="button" disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })}>‹</button>
                  {getPageNumbers(page, totalPages).map((p, i) =>
                    p === "…" ? (
                      <span key={`e${i}`} className="dt-page-ellipsis">…</span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        className={p === page ? "active" : ""}
                        onClick={() => updateParams({ page: String(p) })}
                      >
                        {p}
                      </button>
                    )
                  )}
                  <button type="button" disabled={page >= totalPages} onClick={() => updateParams({ page: String(page + 1) })}>›</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
