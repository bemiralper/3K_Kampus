"use client";

import Link from "next/link";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { useDashboardLinks } from "../useDashboardLinks";
import DashboardSectionLabel from "./DashboardSectionLabel";
import {
  IconArrowDownCircle,
  IconBank,
  IconReceipt,
  IconUsers,
  IconWallet,
} from "../dashboard-icons";

export default function DashboardQuickActions() {
  const { isMuhasebeMode } = useFinansPath();
  const links = useDashboardLinks();

  const actions = [
    {
      href: links.odemeTakip(),
      label: "Tahsilat Al",
      desc: "Sözleşmeden ödeme al",
      icon: IconArrowDownCircle,
      tone: "emerald" as const,
    },
    {
      href: links.giderIslemleri,
      label: "Gider Gir",
      desc: "Yeni gider ödemesi kaydet",
      icon: IconReceipt,
      tone: "rose" as const,
    },
    {
      href: links.cariHesaplar,
      label: "Cari Aç",
      desc: "Yeni cari hesap oluştur",
      icon: IconUsers,
      tone: "blue" as const,
    },
    {
      href: links.kasaBanka,
      label: "Kasa / Banka",
      desc: "Hesap bakiyelerini yönet",
      icon: IconBank,
      tone: "slate" as const,
    },
    {
      href: links.gelirIslemleri,
      label: "Gelir İşlemleri",
      desc: "Gelir kayıtlarını görüntüle",
      icon: IconWallet,
      tone: "emerald" as const,
      hidden: isMuhasebeMode,
    },
  ].filter((a) => !a.hidden);

  const TONE: Record<string, { bg: string; fg: string }> = {
    emerald: { bg: "#e8f6ef", fg: "#059669" },
    rose: { bg: "#fdeceb", fg: "#dc2626" },
    blue: { bg: "#eaf3fb", fg: "#0262a7" },
    slate: { bg: "#eef1f5", fg: "#475569" },
  };

  return (
    <div className="mb-6">
      <DashboardSectionLabel text="Hızlı İşlemler" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {actions.map((a) => {
          const tone = TONE[a.tone];
          const Icon = a.icon;
          return (
            <Link
              key={a.label}
              href={a.href}
              className="group flex items-start gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: tone.bg, color: tone.fg }}
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
  );
}
