"use client";

import type { CariHesapCariOzet, CariHesapTuru } from "../../types/cari-hesap-types";
import { formatReportDateRange } from "./cari-report-export-meta";

function fmt(v: number | null | undefined) {
  return Number(v || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtTarih(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function borcAlacakLabels(tur: CariHesapTuru) {
  switch (tur) {
    case "musteri":
      return { borc: "Satış (Borç)", alacak: "Tahsilat (Alacak)" };
    case "tedarikci":
      return { borc: "Ödeme (Borç)", alacak: "Alış (Alacak)" };
    default:
      return { borc: "Borç", alacak: "Alacak" };
  }
}

type OzetField = {
  key: string;
  label: string;
  value: string;
  tone?: "default" | "warn" | "danger" | "muted";
};

export function buildCariEkstreOzetFields(ozet: CariHesapCariOzet): OzetField[] {
  const labels = borcAlacakLabels(ozet.hesap_turu);
  return [
    { key: "hesap_kodu", label: "Cari Kodu", value: ozet.hesap_kodu || "—" },
    { key: "cari_adi", label: "Cari Adı", value: ozet.gorunen_ad || ozet.unvan },
    { key: "borc", label: labels.borc, value: `${fmt(ozet.toplam_borc)} ₺` },
    { key: "alacak", label: labels.alacak, value: `${fmt(ozet.toplam_alacak)} ₺` },
    { key: "bakiye", label: "Bakiye", value: `${fmt(Math.abs(ozet.bakiye))} ₺` },
    {
      key: "vadesi_gelen",
      label: "Vadesi Gelen",
      value: `${fmt(ozet.vadesi_gelen)} ₺`,
      tone: ozet.vadesi_gelen > 0 ? "warn" : "muted",
    },
    {
      key: "vadesi_gecmis",
      label: "Vadesi Geçmiş",
      value: `${fmt(ozet.vadesi_gecmis)} ₺`,
      tone: ozet.vadesi_gecmis > 0 ? "danger" : "muted",
    },
    {
      key: "gelecek_vadeli",
      label: "Gelecek Vadeli",
      value: `${fmt(ozet.gelecek_vadeli)} ₺`,
    },
    {
      key: "son_islem_tarihi",
      label: "Son İşlem Tarihi",
      value: fmtTarih(ozet.son_islem_tarihi),
    },
    {
      key: "son_islem_turu",
      label: "Son İşlem Türü",
      value: ozet.son_islem_turu || "—",
    },
    {
      key: "son_islem_yapan",
      label: "Son İşlemi Yapan",
      value: ozet.son_islem_yapan || "—",
    },
  ];
}

export function cariEkstreOzetExportMeta(ozet: CariHesapCariOzet): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const f of buildCariEkstreOzetFields(ozet)) {
    meta[f.label] = f.value;
  }
  return meta;
}

export default function CariEkstreOzet({
  ozet,
  loading,
  tarihBaslangic,
  tarihBitis,
}: {
  ozet: CariHesapCariOzet | null;
  loading?: boolean;
  tarihBaslangic?: string;
  tarihBitis?: string;
}) {
  if (loading) {
    return (
      <div className="cari-ekstre-ozet cari-ekstre-ozet--loading">
        <div className="loading-spinner" />
        <span>Cari özet yükleniyor…</span>
      </div>
    );
  }

  if (!ozet) return null;

  const fields = buildCariEkstreOzetFields(ozet);
  const tarihAraligi =
    tarihBaslangic || tarihBitis
      ? formatReportDateRange(tarihBaslangic, tarihBitis)
      : null;

  return (
    <div className="cari-ekstre-ozet">
      <div className="cari-ekstre-ozet__header">
        <div>
          <h4>Cari Özet Raporu</h4>
          {tarihAraligi && (
            <span className="cari-ekstre-ozet__range">Tarih Aralığı: {tarihAraligi}</span>
          )}
        </div>
        <span className="cari-ekstre-ozet__hint">
          Ekstre hareketlerinin üstünde cari bakiye ve vade durumu
        </span>
      </div>
      <div className="cari-ekstre-ozet__grid">
        {fields.map((f) => (
          <div
            key={f.key}
            className={`cari-ekstre-ozet__item${f.tone ? ` cari-ekstre-ozet__item--${f.tone}` : ""}`}
          >
            <span className="cari-ekstre-ozet__label">{f.label}</span>
            <span className="cari-ekstre-ozet__value">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
