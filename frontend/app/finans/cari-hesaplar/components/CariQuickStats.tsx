"use client";

import type { CariHesap, CariHesapTuru } from "../../types/cari-hesap-types";

function fmt(v: number | string | null | undefined) {
  return Number(v || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type StatCard = {
  key: string;
  icon: "orange" | "green" | "blue" | "purple";
  value: string;
  label: string;
  valueClass?: string;
};

function buildStats(hesap: CariHesap): StatCard[] {
  const tur: CariHesapTuru = hesap.hesap_turu;
  const toplamGelir = hesap.toplam_gelir ?? 0;
  const gelirAlacagi = hesap.gelir_alacagi ?? 0;
  const tahsilEdilen = hesap.tahsil_edilen_gelir ?? 0;
  const toplamGider = hesap.toplam_gider ?? 0;
  const giderBorcu = hesap.gider_borcu ?? 0;
  const serbestBakiye = hesap.serbest_bakiye ?? 0;
  const toplamOdenen = toplamGider - giderBorcu;
  const gelirSayisi = hesap.gelir_kayit_sayisi ?? 0;
  const giderSayisi = hesap.gider_kayit_sayisi ?? 0;

  if (tur === "musteri") {
    return [
      {
        key: "toplam-gelir",
        icon: "green",
        value: `₺${fmt(toplamGelir)}`,
        label: "Toplam Gelir",
      },
      {
        key: "gelir-alacagi",
        icon: gelirAlacagi > 0 ? "orange" : "green",
        value: `₺${fmt(gelirAlacagi)}`,
        label: gelirAlacagi > 0 ? "Tahsil Edilecek" : "Alacak Yok",
        valueClass: gelirAlacagi > 0 ? "text-rose-600" : "text-emerald-600",
      },
      {
        key: "tahsil-edilen",
        icon: tahsilEdilen > 0 ? "green" : "blue",
        value: `₺${fmt(tahsilEdilen)}`,
        label: "Tahsil Edilen",
        valueClass: tahsilEdilen > 0 ? "text-emerald-600" : undefined,
      },
      {
        key: "bakiye",
        icon: "blue",
        value: `₺${fmt(Math.abs(hesap.bakiye))}`,
        label:
          hesap.bakiye_durumu === "alacakli"
            ? "Cari Alacak"
            : hesap.bakiye_durumu === "borclu"
              ? "Cari Borç"
              : "Dengede",
      },
      {
        key: "gelir-sayisi",
        icon: "purple",
        value: String(gelirSayisi),
        label: "Gelir Kaydı",
      },
    ];
  }

  if (tur === "tedarikci") {
    return [
      {
        key: "toplam-gider",
        icon: "orange",
        value: `₺${fmt(toplamGider)}`,
        label: "Toplam Gider",
      },
      {
        key: "gider-borcu",
        icon: giderBorcu > 0 ? "orange" : "green",
        value: `₺${fmt(giderBorcu)}`,
        label: giderBorcu > 0 ? "Kalan Gider Borcu" : "Gider Borcu Yok",
        valueClass: giderBorcu > 0 ? "text-rose-600" : "text-emerald-600",
      },
      {
        key: "serbest",
        icon: serbestBakiye > 0 ? "green" : "blue",
        value: `₺${fmt(serbestBakiye)}`,
        label: "Serbest Bakiye",
        valueClass: serbestBakiye > 0 ? "text-emerald-600" : undefined,
      },
      {
        key: "odenen",
        icon: toplamOdenen > 0 ? "green" : "blue",
        value: `₺${fmt(toplamOdenen)}`,
        label: "Toplam Ödenen",
        valueClass: toplamOdenen > 0 ? "text-emerald-600" : undefined,
      },
      {
        key: "gider-sayisi",
        icon: "purple",
        value: String(giderSayisi),
        label: "Gider Kaydı",
      },
    ];
  }

  /* karma */
  return [
    {
      key: "toplam-gelir",
      icon: "green",
      value: `₺${fmt(toplamGelir)}`,
      label: "Toplam Gelir (Satış)",
    },
    {
      key: "toplam-gider",
      icon: "orange",
      value: `₺${fmt(toplamGider)}`,
      label: "Toplam Gider (Alış)",
    },
    {
      key: "gelir-alacagi",
      icon: gelirAlacagi > 0 ? "orange" : "green",
      value: `₺${fmt(gelirAlacagi)}`,
      label: "Tahsil Edilecek",
      valueClass: gelirAlacagi > 0 ? "text-rose-600" : "text-emerald-600",
    },
    {
      key: "gider-borcu",
      icon: giderBorcu > 0 ? "orange" : "green",
      value: `₺${fmt(giderBorcu)}`,
      label: "Ödenecek Gider",
      valueClass: giderBorcu > 0 ? "text-rose-600" : "text-emerald-600",
    },
    {
      key: "kayitlar",
      icon: "purple",
      value: `${gelirSayisi} / ${giderSayisi}`,
      label: "Gelir / Gider Kaydı",
    },
  ];
}

const ICONS: Record<StatCard["icon"], React.ReactNode> = {
  orange: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  green: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  blue: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  purple: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  ),
};

export default function CariQuickStats({ hesap }: { hesap: CariHesap }) {
  const stats = buildStats(hesap);

  return (
    <div className="quick-stats">
      {stats.map((s) => (
        <div key={s.key} className="quick-stat">
          <div className={`quick-stat-icon ${s.icon}`}>{ICONS[s.icon]}</div>
          <div className="quick-stat-info">
            <h4 className={s.valueClass}>{s.value}</h4>
            <span>{s.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
