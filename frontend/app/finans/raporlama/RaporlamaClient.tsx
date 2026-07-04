"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { raporService } from "../services/rapor-api";
import type {
  RaporTab,
  GelirGiderRapor,
  TahsilatAnaliz,
  BorcYaslandirma,
  DonemRapor,
  YaslandirmaDetay,
} from "../types/rapor-types";

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function formatTL(val: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function formatPct(val: number | null | undefined): string {
  if (val == null) return "—";
  return `%${val.toFixed(1)}`;
}

const DURUM_LABELS: Record<string, string> = {
  beklemede: "Beklemede",
  odendi: "Ödendi",
  gecikti: "Gecikti",
  kismi_odendi: "Kısmi Ödendi",
  iptal: "İptal",
  taslak: "Taslak",
  aktif: "Aktif",
  dondurulmus: "Dondurulmuş",
  tamamlandi: "Tamamlandı",
  feshedilmis: "Feshedilmiş",
};

const TABS: { key: RaporTab; label: string; icon: React.ReactNode }[] = [
  {
    key: "gelir-gider",
    label: "Gelir-Gider",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    key: "tahsilat",
    label: "Tahsilat Analizi",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  {
    key: "yaslandirma",
    label: "Alacak Vade Analizi",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "donem",
    label: "Dönem Raporu",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
];

/* ═══════════════════════════════════════════════════════════════
   REUSABLE PIECES
   ═══════════════════════════════════════════════════════════════ */

/* ── Stat Card ─────────────────────────────────────────────── */
interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  accent: string;
  iconBg: string;
  icon: React.ReactNode;
}
function StatCard({ label, value, sub, trend, accent, iconBg, icon }: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
          <p className={`text-2xl font-extrabold tracking-tight ${accent}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
        <div className={`flex-shrink-0 w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      {trend && trend !== "neutral" && (
        <div
          className={`absolute top-0 right-0 w-16 h-16 -mr-4 -mt-4 rounded-full opacity-10 ${
            trend === "up" ? "bg-emerald-500" : "bg-red-500"
          }`}
        />
      )}
    </div>
  );
}

/* ── Section Card ──────────────────────────────────────────── */
function SectionCard({
  title,
  icon,
  children,
  actions,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
        <h3 className="flex items-center gap-2.5 text-sm font-bold text-gray-800">
          {icon && (
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-gray-500">
              {icon}
            </span>
          )}
          {title}
        </h3>
        {actions}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

/* ── Data Table ────────────────────────────────────────────── */
function DataTable({
  headers,
  children,
}: {
  headers: { label: string; align?: "left" | "right" | "center" }[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className={`py-2.5 px-4 text-[11px] font-semibold text-gray-400 uppercase tracking-widest border-b border-gray-100 ${
                  h.align === "right" ? "text-right" : h.align === "center" ? "text-center" : "text-left"
                }`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">{children}</tbody>
      </table>
    </div>
  );
}

/* ── Badge ─────────────────────────────────────────────────── */
function Badge({
  children,
  color = "gray",
}: {
  children: React.ReactNode;
  color?: "emerald" | "red" | "amber" | "blue" | "gray" | "orange" | "indigo";
}) {
  const map: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
    red: "bg-red-50 text-red-700 ring-red-600/10",
    amber: "bg-amber-50 text-amber-700 ring-amber-600/10",
    blue: "bg-blue-50 text-blue-700 ring-blue-600/10",
    gray: "bg-gray-50 text-gray-600 ring-gray-500/10",
    orange: "bg-orange-50 text-orange-700 ring-orange-600/10",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/10",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ring-1 ring-inset ${map[color]}`}>
      {children}
    </span>
  );
}

/* ── Mini Bar Chart ────────────────────────────────────────── */
function BarChart({
  items,
  max,
  color = "bg-blue-500",
}: {
  items: { label: string; value: number }[];
  max: number;
  color?: string;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0;
        return (
          <div key={i} className="flex items-center gap-3 group">
            <span className="text-xs text-gray-500 w-24 text-right truncate font-medium">{item.label}</span>
            <div className="flex-1 h-7 bg-gray-50 rounded-lg overflow-hidden relative">
              <div
                className={`h-full ${color} rounded-lg transition-all duration-700 ease-out`}
                style={{ width: `${Math.max(pct, 3)}%` }}
              />
              <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-bold text-gray-600">
                {formatTL(item.value)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Progress Ring ─────────────────────────────────────────── */
function ProgressRing({
  value,
  size = 100,
  strokeWidth = 10,
  color = "#3b82f6",
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(value, 100) / 100) * circ;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  );
}

/* ── Dot Legend ─────────────────────────────────────────────── */
function DotLegend({
  items,
}: {
  items: { label: string; value: string; sub?: string; dotColor: string }[];
}) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${it.dotColor}`} />
            <span className="text-sm text-gray-600">{it.label}</span>
          </div>
          <div className="text-right">
            <span className="text-sm font-bold text-gray-800">{it.value}</span>
            {it.sub && <span className="text-xs text-gray-400 ml-1.5">{it.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function RaporlamaClient({ embedded = false }: { embedded?: boolean }) {
  const { homeHref, portalHomeHref } = useFinansPath();
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const [tab, setTab] = useState<RaporTab>("gelir-gider");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gelirGider, setGelirGider] = useState<GelirGiderRapor | null>(null);
  const [tahsilat, setTahsilat] = useState<TahsilatAnaliz | null>(null);
  const [yaslandirma, setYaslandirma] = useState<BorcYaslandirma | null>(null);
  const [donem, setDonem] = useState<DonemRapor | null>(null);

  const raporRef = useRef<HTMLDivElement>(null);

  /* ── Fetch data ────────────────────────────────────────────── */
  const load = useCallback(async () => {
    if (!activeKurum) return;
    setLoading(true);
    setError(null);
    try {
      const p = {
        kurum_id: activeKurum.id,
        sube_id: activeSube?.id,
        egitim_yili_id: activeEgitimYili?.id,
      };
      if (tab === "gelir-gider") setGelirGider(await raporService.gelirGider(p));
      else if (tab === "tahsilat") setTahsilat(await raporService.tahsilatAnaliz(p));
      else if (tab === "yaslandirma") setYaslandirma(await raporService.borcYaslandirma(p));
      else if (tab === "donem") setDonem(await raporService.donemRapor(p));
    } catch (e: any) {
      setError(e.message || "Rapor yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  }, [activeKurum, activeSube, activeEgitimYili, tab]);

  useEffect(() => {
    load();
  }, [load]);

  /* ── PDF ────────────────────────────────────────────────────── */
  const exportPdf = async () => {
    if (!raporRef.current) return;
    const { default: jsPDF } = await import("jspdf");
    const { default: html2canvas } = await import("html2canvas");
    const btns = raporRef.current.querySelectorAll("[data-no-print]");
    btns.forEach((b) => ((b as HTMLElement).style.display = "none"));
    const canvas = await html2canvas(raporRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    btns.forEach((b) => ((b as HTMLElement).style.display = ""));
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? "landscape" : "portrait",
      unit: "px",
      format: [canvas.width, canvas.height],
    });
    pdf.addImage(img, "PNG", 0, 0, canvas.width, canvas.height);
    const label = TABS.find((t) => t.key === tab)?.label || "Rapor";
    pdf.save(`Finans_${label.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  /* ── No kurum ──────────────────────────────────────────────── */
  if (!activeKurum) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-3xl mb-4">🏢</div>
        <p className="text-base font-semibold text-gray-700">Kurum Seçilmedi</p>
        <p className="text-sm text-gray-400 mt-1">Rapor görüntülemek için lütfen bir kurum seçin.</p>
      </div>
    );
  }

  return (
    <div ref={raporRef} style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}>
      {!embedded && (
      <div className="hero-header">
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 20V10" />
              <path d="M12 20V4" />
              <path d="M6 20v-6" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Finans Raporları</h1>
            <div className="hero-breadcrumb">
              <a href={portalHomeHref}>Ana Sayfa</a>
              <span>/</span>
              <a href={homeHref}>Finans</a>
              <span>/</span>
              <span>Raporlama</span>
            </div>
          </div>
        </div>
        <div className="hero-actions">
          <button data-no-print onClick={exportPdf} disabled={loading} className="btn-hero">
            <span className="btn-hero-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </span>
            <span>PDF İndir</span>
          </button>
        </div>
      </div>
      )}

      {embedded && (
        <div className="flex justify-end mb-3">
          <button data-no-print onClick={exportPdf} disabled={loading} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-60">
            PDF İndir
          </button>
        </div>
      )}

      {/* ═══ Toolbar ═══════════════════════════════════════════ */}
      {/* Tabs — tabs-modern */}
      <div className="tabs-modern">
        {TABS.map((t) => (
          <a
            key={t.key}
            className={`tab-modern ${tab === t.key ? "active" : ""}`}
            href="#"
            onClick={(e) => { e.preventDefault(); setTab(t.key); }}
          >
            {t.icon}
            {t.label}
          </a>
        ))}
      </div>

      {/* Active Filters */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-lg ring-1 ring-inset ring-blue-700/10">
          🏢 {activeKurum.ad}
        </span>
        {activeSube && (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-medium px-2.5 py-1 rounded-lg ring-1 ring-inset ring-emerald-700/10">
            🏫 {activeSube.ad}
          </span>
        )}
        {activeEgitimYili && (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-medium px-2.5 py-1 rounded-lg ring-1 ring-inset ring-amber-700/10">
            📆 {activeEgitimYili.baslangic_yil}-{activeEgitimYili.bitis_yil}
          </span>
        )}
      </div>

      {/* ═══ Content ═══════════════════════════════════════════ */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-400 font-medium">Rapor yükleniyor…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center text-2xl mb-3">⚠️</div>
          <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>
          <button
            data-no-print
            onClick={load}
            className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition cursor-pointer"
          >
            Tekrar Dene
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {tab === "gelir-gider" && gelirGider && <GelirGiderPanel data={gelirGider} />}
          {tab === "tahsilat" && tahsilat && <TahsilatPanel data={tahsilat} />}
          {tab === "yaslandirma" && yaslandirma && <YaslandirmaPanel data={yaslandirma} />}
          {tab === "donem" && donem && <DonemPanel data={donem} />}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   1 — GELİR-GİDER
   ═══════════════════════════════════════════════════════════════ */
function GelirGiderPanel({ data }: { data: GelirGiderRapor }) {
  const maxGelir = Math.max(...data.aylik.map((a) => a.gelir), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Toplam Gelir"
          value={formatTL(data.toplam_gelir)}
          accent="text-emerald-600"
          iconBg="bg-emerald-50"
          trend="up"
          icon={
            <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
          }
        />
        <StatCard
          label="Toplam İade"
          value={formatTL(data.toplam_iade)}
          accent="text-amber-600"
          iconBg="bg-amber-50"
          trend="neutral"
          icon={
            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
          }
        />
        <StatCard
          label="Toplam Gider"
          value={formatTL(data.toplam_gider)}
          accent="text-red-600"
          iconBg="bg-red-50"
          trend="down"
          icon={
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.18" />
            </svg>
          }
        />
        <StatCard
          label="Net Gelir"
          value={formatTL(data.net_gelir)}
          accent={data.net_gelir >= 0 ? "text-blue-600" : "text-red-600"}
          iconBg={data.net_gelir >= 0 ? "bg-blue-50" : "bg-red-50"}
          trend={data.net_gelir >= 0 ? "up" : "down"}
          icon={
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      <SectionCard
        title="Aylık Gelir Dağılımı"
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
          </svg>
        }
      >
        <BarChart items={data.aylik.map((a) => ({ label: a.ay_label, value: a.gelir }))} max={maxGelir} color="bg-emerald-500" />
      </SectionCard>

      {data.yontem_dagilimi.length > 0 && (
        <SectionCard
          title="Ödeme Yöntemi Dağılımı"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
          }
        >
          <DataTable headers={[{ label: "Yöntem" }, { label: "İşlem", align: "right" }, { label: "Toplam", align: "right" }, { label: "Oran", align: "right" }]}>
            {data.yontem_dagilimi.map((y, i) => (
              <tr key={i} className="hover:bg-gray-50 transition">
                <td className="py-3 px-4 font-medium text-gray-800">{y.yontem}</td>
                <td className="py-3 px-4 text-right text-gray-500">{y.adet}</td>
                <td className="py-3 px-4 text-right font-bold text-gray-800">{formatTL(y.toplam)}</td>
                <td className="py-3 px-4 text-right">
                  <Badge color="blue">{data.toplam_gelir > 0 ? formatPct((y.toplam / data.toplam_gelir) * 100) : "—"}</Badge>
                </td>
              </tr>
            ))}
          </DataTable>
        </SectionCard>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   2 — TAHSİLAT ANALİZİ
   ═══════════════════════════════════════════════════════════════ */
function TahsilatPanel({ data }: { data: TahsilatAnaliz }) {
  const taksitDotColors: Record<string, string> = {
    odendi: "bg-emerald-500",
    beklemede: "bg-blue-500",
    gecikti: "bg-red-500",
    kismi_odendi: "bg-amber-500",
    iptal: "bg-gray-400",
  };
  const sozlesmeDotColors: Record<string, string> = {
    aktif: "bg-emerald-500",
    taslak: "bg-gray-400",
    dondurulmus: "bg-amber-500",
    tamamlandi: "bg-blue-500",
    feshedilmis: "bg-red-500",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Tahsilat Oranı"
          value={formatPct(data.genel_oran)}
          sub={`${formatTL(data.toplam_tahsil)} / ${formatTL(data.toplam_alacak)}`}
          accent="text-blue-600"
          iconBg="bg-blue-50"
          icon={
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Toplam Tahsil"
          value={formatTL(data.toplam_tahsil)}
          accent="text-emerald-600"
          iconBg="bg-emerald-50"
          trend="up"
          icon={
            <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Toplam Alacak"
          value={formatTL(data.toplam_alacak)}
          accent="text-indigo-600"
          iconBg="bg-indigo-50"
          icon={
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          }
        />
        <StatCard
          label="Kalan Borç"
          value={formatTL(data.kalan_borc)}
          accent="text-red-600"
          iconBg="bg-red-50"
          trend="down"
          icon={
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          }
        />
      </div>

      {/* Progress Ring + Bar */}
      <SectionCard
        title="Genel Tahsilat İlerlemesi"
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
          </svg>
        }
      >
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <div className="relative flex-shrink-0">
            <ProgressRing value={data.genel_oran} size={120} strokeWidth={12} color="#3b82f6" />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold text-gray-800">{formatPct(data.genel_oran)}</span>
              <span className="text-[10px] text-gray-400 font-medium">Tahsilat</span>
            </div>
          </div>
          <div className="flex-1 w-full space-y-2">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Tahsil Edilen</span>
              <span>{formatTL(data.toplam_tahsil)}</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(data.genel_oran, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Kalan</span>
              <span>{formatTL(data.kalan_borc)}</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(100 - data.genel_oran, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Monthly Performance */}
      <SectionCard
        title="Aylık Tahsilat Performansı"
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
          </svg>
        }
      >
        <DataTable
          headers={[
            { label: "Ay" },
            { label: "Beklenen", align: "right" },
            { label: "Tahsil", align: "right" },
            { label: "Adet", align: "right" },
            { label: "Oran", align: "right" },
          ]}
        >
          {data.aylik_performans.map((a, i) => (
            <tr key={i} className="hover:bg-gray-50 transition">
              <td className="py-3 px-4 font-medium text-gray-800">{a.ay_label}</td>
              <td className="py-3 px-4 text-right text-gray-500">{formatTL(a.beklenen)}</td>
              <td className="py-3 px-4 text-right font-bold text-gray-800">{formatTL(a.tahsil_edilen)}</td>
              <td className="py-3 px-4 text-right text-gray-500">{a.adet}</td>
              <td className="py-3 px-4 text-right">
                <Badge color={a.oran >= 80 ? "emerald" : a.oran >= 50 ? "amber" : "red"}>{formatPct(a.oran)}</Badge>
              </td>
            </tr>
          ))}
        </DataTable>
      </SectionCard>

      {/* Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionCard title="Taksit Durum Dağılımı">
          <DotLegend
            items={data.taksit_durum_dagilimi.map((d) => ({
              label: DURUM_LABELS[d.durum] || d.durum,
              value: String(d.adet),
              sub: `(${formatTL(d.toplam)})`,
              dotColor: taksitDotColors[d.durum] || "bg-gray-300",
            }))}
          />
        </SectionCard>
        <SectionCard title="Sözleşme Durum Dağılımı">
          <DotLegend
            items={data.sozlesme_dagilimi.map((s) => ({
              label: DURUM_LABELS[s.durum] || s.durum,
              value: String(s.adet),
              sub: `(${formatTL(s.toplam)})`,
              dotColor: sozlesmeDotColors[s.durum] || "bg-gray-300",
            }))}
          />
        </SectionCard>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   3 — BORÇ YAŞLANDIRMA
   ═══════════════════════════════════════════════════════════════ */
function YaslandirmaPanel({ data }: { data: BorcYaslandirma }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const cfg = [
    { key: "0_30", label: "0-30 Gün", accent: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-200", iconColor: "text-amber-500" },
    { key: "31_60", label: "31-60 Gün", accent: "text-orange-600", bg: "bg-orange-50", ring: "ring-orange-200", iconColor: "text-orange-500" },
    { key: "61_90", label: "61-90 Gün", accent: "text-red-500", bg: "bg-red-50", ring: "ring-red-200", iconColor: "text-red-400" },
    { key: "90_plus", label: "90+ Gün", accent: "text-red-700", bg: "bg-red-50", ring: "ring-red-300", iconColor: "text-red-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="Geciken Toplam"
          value={formatTL(data.toplam_geciken_tutar)}
          accent="text-red-600"
          iconBg="bg-red-50"
          trend="down"
          icon={
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          }
        />
        <StatCard
          label="Geciken Taksit"
          value={String(data.toplam_geciken_adet)}
          sub={`Rapor: ${data.tarih}`}
          accent="text-amber-600"
          iconBg="bg-amber-50"
          icon={
            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cfg.map(({ key, label, accent, bg, ring, iconColor }) => {
          const g = data.gruplar[key as keyof typeof data.gruplar];
          const isOpen = expanded === key;
          return (
            <div
              key={key}
              className={`rounded-2xl ${bg} ring-1 ${ring} p-5 cursor-pointer transition-all hover:shadow-md ${
                isOpen ? "shadow-md" : ""
              }`}
              onClick={() => setExpanded(isOpen ? null : key)}
            >
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className={`text-xs font-semibold ${accent} mb-0.5`}>{label}</p>
              <p className={`text-2xl font-extrabold ${accent}`}>{formatTL(g.toplam)}</p>
              <p className="text-xs text-gray-500 mt-1">{g.adet} taksit</p>
              {g.adet > 0 && <p className="text-[10px] text-gray-400 mt-2">{isOpen ? "▲ Gizle" : "▼ Detay"}</p>}
            </div>
          );
        })}
      </div>

      {expanded &&
        (() => {
          const g = data.gruplar[expanded as keyof typeof data.gruplar];
          if (!g.detay.length) return null;
          return (
            <SectionCard title={`${g.label} — Detay`}>
              <DataTable
                headers={[
                  { label: "Öğrenci" },
                  { label: "Sözleşme" },
                  { label: "Taksit", align: "center" },
                  { label: "Vade", align: "right" },
                  { label: "Kalan", align: "right" },
                  { label: "Gecikme", align: "right" },
                ]}
              >
                {g.detay.map((d: YaslandirmaDetay, i: number) => (
                  <tr key={i} className="hover:bg-gray-50 transition">
                    <td className="py-3 px-4 font-medium text-gray-800">{d.ogrenci_adi}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs font-mono">{d.sozlesme_no}</td>
                    <td className="py-3 px-4 text-center text-gray-500">{d.taksit_no}</td>
                    <td className="py-3 px-4 text-right text-gray-500">{d.vade_tarihi}</td>
                    <td className="py-3 px-4 text-right font-bold text-red-600">{formatTL(d.kalan)}</td>
                    <td className="py-3 px-4 text-right">
                      <Badge color={d.gecikme_gun > 90 ? "red" : d.gecikme_gun > 60 ? "orange" : "amber"}>
                        {d.gecikme_gun} gün
                      </Badge>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </SectionCard>
          );
        })()}

      {data.toplam_geciken_adet === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center text-3xl mb-4">🎉</div>
          <p className="text-base font-semibold text-gray-700">Geciken ödeme yok!</p>
          <p className="text-sm text-gray-400 mt-1">Tüm taksitler zamanında ödenmiş.</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   4 — DÖNEM RAPORU
   ═══════════════════════════════════════════════════════════════ */
function DonemPanel({ data }: { data: DonemRapor }) {
  return (
    <div className="space-y-6">
      {data.donem_ozet && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label="Dönem Başı"
              value={formatTL(data.donem_ozet.toplam_donem_basi ?? 0)}
              accent="text-indigo-600"
              iconBg="bg-indigo-50"
              icon={
                <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                </svg>
              }
            />
            <StatCard
              label="Toplam Gelir"
              value={formatTL(data.donem_ozet.toplam_gelir)}
              accent="text-emerald-600"
              iconBg="bg-emerald-50"
              trend="up"
              icon={
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                </svg>
              }
            />
            <StatCard
              label="Toplam Gider"
              value={formatTL(data.donem_ozet.toplam_gider)}
              accent="text-red-600"
              iconBg="bg-red-50"
              trend="down"
              icon={
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.18" />
                </svg>
              }
            />
            <StatCard
              label="Güncel Bakiye"
              value={formatTL(data.donem_ozet.toplam_bakiye)}
              sub={`Net Kâr: ${formatTL(data.donem_ozet.net_kar)}`}
              accent={data.donem_ozet.net_kar >= 0 ? "text-blue-600" : "text-red-600"}
              iconBg={data.donem_ozet.net_kar >= 0 ? "bg-blue-50" : "bg-red-50"}
              icon={
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>

          {data.donem_ozet.hesaplar && data.donem_ozet.hesaplar.length > 0 && (
            <SectionCard
              title="Mali Hesap Bazlı Dönem Bakiyeleri"
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                </svg>
              }
            >
              <DataTable
                headers={[
                  { label: "Hesap" },
                  { label: "Tip" },
                  { label: "D.Başı", align: "right" },
                  { label: "Gelir", align: "right" },
                  { label: "Gider", align: "right" },
                  { label: "Bakiye", align: "right" },
                  { label: "Durum", align: "center" },
                ]}
              >
                {data.donem_ozet.hesaplar.map((h) => (
                  <tr key={h.id} className="hover:bg-gray-50 transition">
                    <td className="py-3 px-4 font-medium text-gray-800">{h.mali_hesap_ad}</td>
                    <td className="py-3 px-4">
                      <Badge>{h.mali_hesap_tip}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-500">{formatTL(h.donem_basi_bakiye)}</td>
                    <td className="py-3 px-4 text-right text-emerald-600 font-medium">{formatTL(h.toplam_gelir)}</td>
                    <td className="py-3 px-4 text-right text-red-600 font-medium">{formatTL(h.toplam_gider)}</td>
                    <td className="py-3 px-4 text-right font-bold text-gray-800">{formatTL(h.donem_sonu_bakiye)}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge color={h.durum === "ACIK" ? "emerald" : h.durum === "KAPANDI" ? "gray" : "blue"}>
                        {h.durum_label}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </SectionCard>
          )}

          {data.donem_ozet.subeler && data.donem_ozet.subeler.length > 0 && (
            <SectionCard
              title="Şube Bazlı Dönem Bakiyeleri"
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
              }
            >
              <DataTable
                headers={[
                  { label: "Şube" },
                  { label: "D.Başı", align: "right" },
                  { label: "Gelir", align: "right" },
                  { label: "Gider", align: "right" },
                  { label: "Bakiye", align: "right" },
                ]}
              >
                {data.donem_ozet.subeler.map((s, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition">
                    <td className="py-3 px-4 font-medium text-gray-800">{s.sube_ad || `Şube #${s.sube_id}`}</td>
                    <td className="py-3 px-4 text-right text-gray-500">{formatTL(s.donem_basi_bakiye)}</td>
                    <td className="py-3 px-4 text-right text-emerald-600 font-medium">{formatTL(s.toplam_gelir)}</td>
                    <td className="py-3 px-4 text-right text-red-600 font-medium">{formatTL(s.toplam_gider)}</td>
                    <td className="py-3 px-4 text-right font-bold text-gray-800">{formatTL(s.donem_sonu_bakiye)}</td>
                  </tr>
                ))}
              </DataTable>
            </SectionCard>
          )}
        </>
      )}

      {data.yillar_arasi.length > 0 && (
        <SectionCard
          title="Yıllar Arası Karşılaştırma"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          }
        >
          <DataTable
            headers={[
              { label: "Yıl" },
              { label: "D.Başı", align: "right" },
              { label: "Gelir", align: "right" },
              { label: "Gider", align: "right" },
              { label: "Net Kâr", align: "right" },
              { label: "Bakiye", align: "right" },
              { label: "Değişim", align: "center" },
            ]}
          >
            {data.yillar_arasi.map((y, i) => (
              <tr key={i} className="hover:bg-gray-50 transition">
                <td className="py-3 px-4 font-bold text-gray-800">{y.yil}</td>
                <td className="py-3 px-4 text-right text-gray-500">{formatTL(y.donem_basi)}</td>
                <td className="py-3 px-4 text-right text-emerald-600 font-medium">{formatTL(y.toplam_gelir)}</td>
                <td className="py-3 px-4 text-right text-red-600 font-medium">{formatTL(y.toplam_gider)}</td>
                <td className={`py-3 px-4 text-right font-bold ${y.net_kar >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {formatTL(y.net_kar)}
                </td>
                <td className="py-3 px-4 text-right font-semibold text-gray-800">{formatTL(y.donem_sonu_bakiye)}</td>
                <td className="py-3 px-4 text-center">
                  {y.degisim_yuzde != null ? (
                    <Badge color={y.degisim_yuzde >= 0 ? "emerald" : "red"}>
                      {y.degisim_yuzde >= 0 ? "↑" : "↓"} {formatPct(Math.abs(y.degisim_yuzde))}
                    </Badge>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </SectionCard>
      )}

      {!data.donem_ozet && data.yillar_arasi.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-3xl mb-4">📅</div>
          <p className="text-base font-semibold text-gray-700">Dönem verisi bulunamadı</p>
          <p className="text-sm text-gray-400 mt-1">Finans Tanımları → Dönem Aç ile başlayabilirsiniz.</p>
        </div>
      )}
    </div>
  );
}
