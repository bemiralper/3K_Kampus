"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import FinansDashboard from "@/app/finans/dashboard/FinansDashboard";
import {
  IconArrowDownCircle,
  IconAlertTriangle,
  IconCalendarClock,
  IconCheckCircle,
  IconClock,
  IconFileSignature,
  IconInbox,
  IconLayers,
  IconPhone,
  IconPlusCircle,
  IconReceipt,
  IconRefresh,
  IconScale,
  IconUsers,
} from "@/app/finans/dashboard/dashboard-icons";
import {
  MUHASEBE_OGRENCI_BASE,
  MUHASEBE_ODEME_TAKIP_BASE,
  MUHASEBE_FINANS_BASE,
} from "@/lib/muhasebe-routes";
import { FinansPathProvider } from "@/components/finans/FinansPathProvider";
import { OdemePathProvider } from "@/components/odeme-takip/OdemePathProvider";
import { OgrenciPathProvider } from "@/components/ogrenci/OgrenciPathProvider";
import { fetchGorevDashboardOzet, type GorevDashboardOzet } from "@/lib/gorev-api";

type OdemeDashboardOzet = {
  toplam_sozlesme?: number;
  toplam_tahsilat?: number;
  acik_alacak?: number;
  geciken_tutar?: number;
  geciken_taksit_sayisi?: number;
  bu_ay_tahsilat?: number;
};

type Tone = "blue" | "rose" | "slate" | "emerald" | "amber" | "violet";

const TONE_STYLES: Record<Tone, { bg: string; fg: string }> = {
  blue: { bg: "#eaf3fb", fg: "#0262a7" },
  rose: { bg: "#fdeceb", fg: "#dc2626" },
  slate: { bg: "#eef1f5", fg: "#475569" },
  emerald: { bg: "#e8f6ef", fg: "#059669" },
  amber: { bg: "#fef3e2", fg: "#b45309" },
  violet: { bg: "#f2ecfc", fg: "#7c3aed" },
};

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n ?? 0);

/** Görev tipi kodu → görsel meta. Bilinmeyen kodlar için "layers" ikonuyla nötr görünür. */
const GOREV_TIP_META: Record<string, { label: string; icon: (p: { className?: string }) => JSX.Element; tone: Tone }> = {
  GECIKEN_ODEME: { label: "Geciken Ödeme", icon: IconAlertTriangle, tone: "rose" },
  TAKSIT_GUNU: { label: "Taksit Günü", icon: IconArrowDownCircle, tone: "blue" },
  TELEFON: { label: "Telefon Görüşmesi", icon: IconPhone, tone: "violet" },
  SENET_TARIHI: { label: "Senet Tarihi", icon: IconFileSignature, tone: "slate" },
  FATURA: { label: "Fatura Kesilecek", icon: IconReceipt, tone: "amber" },
  MAKBUZ: { label: "Makbuz Teslimi", icon: IconReceipt, tone: "emerald" },
  BANKA_TAHSILAT: { label: "Banka Tahsilatı", icon: IconArrowDownCircle, tone: "blue" },
};

const GOREV_TIP_ORDER = ["GECIKEN_ODEME", "TAKSIT_GUNU", "TELEFON", "SENET_TARIHI", "FATURA", "MAKBUZ", "BANKA_TAHSILAT"];

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: (p: { className?: string }) => JSX.Element;
  tone: Tone;
  label: string;
  value: string;
  sub?: string;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: t.bg, color: t.fg }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500 mb-1 truncate">{label}</div>
        <div className="text-lg font-bold tabular-nums text-gray-900">{value}</div>
        {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3 animate-pulse">
      <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="h-2.5 w-16 bg-gray-100 rounded mb-2" />
        <div className="h-4 w-20 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

const QUICK_ACTIONS = [
  {
    href: `${MUHASEBE_OGRENCI_BASE}/yeni-kayit`,
    label: "Yeni Kayıt",
    desc: "Yeni öğrenci kaydı oluştur",
    icon: IconPlusCircle,
    tone: "emerald" as Tone,
  },
  {
    href: MUHASEBE_ODEME_TAKIP_BASE,
    label: "Sözleşme/Tahsilat",
    desc: "Sözleşme ve tahsilatları yönet",
    icon: IconArrowDownCircle,
    tone: "blue" as Tone,
  },
  {
    href: `${MUHASEBE_ODEME_TAKIP_BASE}/sozlesme-olustur`,
    label: "Sözleşme Oluştur",
    desc: "Yeni ödeme sözleşmesi hazırla",
    icon: IconFileSignature,
    tone: "violet" as Tone,
  },
];

export default function MuhasebeDashboardPage() {
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const [odemeOzet, setOdemeOzet] = useState<OdemeDashboardOzet | null>(null);
  const [gorevOzet, setGorevOzet] = useState<GorevDashboardOzet | null>(null);
  const [loadingOdeme, setLoadingOdeme] = useState(true);
  const [odemeError, setOdemeError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadOdemeOzet = useCallback(async () => {
    if (!activeKurum?.id) return;
    setLoadingOdeme(true);
    setOdemeError(false);
    try {
      const params = new URLSearchParams({
        kurum_id: String(activeKurum.id),
      });
      if (activeSube?.id) params.set("sube_id", String(activeSube.id));
      if (activeEgitimYili?.id) params.set("egitim_yili_id", String(activeEgitimYili.id));
      const res = await fetch(`/api/odeme-takip/api/dashboard/?${params.toString()}`, {
        credentials: "include",
      });
      if (res.ok) {
        setOdemeOzet(await res.json());
      } else {
        setOdemeOzet(null);
        setOdemeError(true);
      }
      const gorevRes = await fetchGorevDashboardOzet();
      if (gorevRes.success && gorevRes.data) {
        setGorevOzet(gorevRes.data);
      }
    } catch {
      setOdemeOzet(null);
      setOdemeError(true);
    } finally {
      setLoadingOdeme(false);
      setRefreshing(false);
    }
  }, [activeKurum?.id, activeSube?.id, activeEgitimYili?.id]);

  useEffect(() => {
    loadOdemeOzet();
  }, [loadOdemeOzet]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadOdemeOzet();
  };

  const gorevTipRows = gorevOzet
    ? GOREV_TIP_ORDER.filter((kod) => (gorevOzet.tip_sayaclari?.[kod] ?? 0) > 0).map((kod) => ({
        kod,
        count: gorevOzet.tip_sayaclari[kod],
        meta: GOREV_TIP_META[kod],
      }))
    : [];
  const gorevBugunToplam = gorevOzet?.bugun ?? 0;

  return (
    <div>
      <div className="hero-header mb-6">
        <div className="hero-content">
          <div className="hero-icon">
            <IconLayers className="w-8 h-8" />
          </div>
          <div className="hero-text">
            <h1>Genel Bakış</h1>
            <div className="hero-breadcrumb">
              <a href="/muhasebe/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Panel</span>
            </div>
          </div>
        </div>
        <div className="hero-actions flex items-center gap-3">
          <button type="button" onClick={handleRefresh} className="btn-hero" disabled={refreshing}>
            <span className="btn-hero-icon">
              <IconRefresh className={`w-[18px] h-[18px] ${refreshing ? "animate-spin" : ""}`} />
            </span>
            <span>Yenile</span>
          </button>
        </div>
      </div>

      {/* Hızlı İşlemler */}
      <div className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((a) => {
            const t = TONE_STYLES[a.tone];
            const Icon = a.icon;
            return (
              <Link
                key={a.label}
                href={a.href}
                className="group flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: t.bg, color: t.fg }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-gray-800 group-hover:text-blue-700 transition-colors">
                    {a.label}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5 leading-snug">{a.desc}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start mb-6">
        {/* Sözleşme/Tahsilat Özeti */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Sözleşme/Tahsilat Özeti</h3>
          {loadingOdeme ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </div>
          ) : odemeError || !odemeOzet ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col items-center text-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                <IconAlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-gray-800">Özet verisi alınamadı</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Ödeme takip verilerine ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.
                </div>
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              >
                <IconRefresh className="w-3.5 h-3.5" />
                Tekrar Dene
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard icon={IconUsers} tone="blue" label="Aktif Sözleşme" value={String(odemeOzet.toplam_sozlesme ?? 0)} />
              <StatCard
                icon={IconArrowDownCircle}
                tone="emerald"
                label="Toplam Tahsilat"
                value={fmtCurrency(Number(odemeOzet.toplam_tahsilat ?? 0))}
              />
              <StatCard
                icon={IconScale}
                tone="amber"
                label="Açık Alacak"
                value={fmtCurrency(Number(odemeOzet.acik_alacak ?? 0))}
              />
              <StatCard
                icon={IconAlertTriangle}
                tone="rose"
                label="Geciken Taksit"
                value={String(odemeOzet.geciken_taksit_sayisi ?? 0)}
                sub={fmtCurrency(Number(odemeOzet.geciken_tutar ?? 0))}
              />
              <StatCard
                icon={IconClock}
                tone="blue"
                label="Bu Ay Tahsilat"
                value={fmtCurrency(Number(odemeOzet.bu_ay_tahsilat ?? 0))}
              />
              <Link
                href={MUHASEBE_ODEME_TAKIP_BASE}
                className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:border-blue-200 transition-colors p-4"
              >
                Ödeme Takibe Git →
              </Link>
            </div>
          )}
        </div>

        {/* Bugünkü Görevler */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-full flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800">Bugünkü Görevler</h3>
            <Link href="/muhasebe/gorevler" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              Tümünü Gör →
            </Link>
          </div>

          {!gorevOzet ? (
            <div className="flex-1 flex flex-col gap-2 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-11 bg-gray-100 rounded-xl" />
              ))}
            </div>
          ) : gorevBugunToplam === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-6 gap-2">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <IconCheckCircle className="w-5 h-5" />
              </div>
              <div className="text-sm font-semibold text-gray-700">Bugün için görev yok</div>
              <div className="text-xs text-gray-400">Yeni görevler oluştuğunda burada listelenecek.</div>
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-3xl font-extrabold text-gray-900 tabular-nums">{gorevBugunToplam}</span>
                <span className="text-xs text-gray-500">bugün için görev</span>
              </div>
              <div className="flex flex-col gap-2 flex-1">
                {gorevTipRows.length > 0
                  ? gorevTipRows.map(({ kod, count, meta }) => {
                      const t = TONE_STYLES[meta?.tone ?? "slate"];
                      const Icon = meta?.icon ?? IconInbox;
                      return (
                        <Link
                          key={kod}
                          href="/muhasebe/gorevler"
                          className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
                        >
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: t.bg, color: t.fg }}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="text-sm text-gray-700 flex-1 truncate">{meta?.label ?? kod}</span>
                          <span className="text-sm font-bold text-gray-900 tabular-nums">{count}</span>
                        </Link>
                      );
                    })
                  : null}
              </div>
              {(gorevOzet.geciken > 0 || gorevOzet.bekleyen > 0) && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
                  {gorevOzet.geciken > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                      <IconCalendarClock className="w-3.5 h-3.5" />
                      {gorevOzet.geciken} geciken
                    </span>
                  )}
                  {gorevOzet.bekleyen > 0 && <span>{gorevOzet.bekleyen} bekleyen</span>}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <OgrenciPathProvider basePath={MUHASEBE_OGRENCI_BASE}>
        <OdemePathProvider basePath={MUHASEBE_ODEME_TAKIP_BASE}>
          <FinansPathProvider basePath={MUHASEBE_FINANS_BASE}>
            <FinansDashboard />
          </FinansPathProvider>
        </OdemePathProvider>
      </OgrenciPathProvider>
    </div>
  );
}
