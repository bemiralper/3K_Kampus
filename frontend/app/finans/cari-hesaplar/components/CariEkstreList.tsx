"use client";

import React, { useMemo } from "react";
import type { CariHareket, CariHesapTuru } from "../../types/cari-hesap-types";
import FinansDataTable from "@/components/finans/FinansDataTable";
import FinansAciklamaCell from "@/components/finans/FinansAciklamaCell";
import FinansOdemeTipCell from "@/components/finans/FinansOdemeTipBadge";
import {
  buildEkstreColumns,
  CARI_EKSTRE_COLUMN_STORAGE_KEY,
  CariEkstreColumnId,
  DEFAULT_CARI_EKSTRE_COLUMN_ORDER,
} from "./cari-ekstre-table-columns";
import {
  fmtEkstreMoney,
  formatEkstreBakiye,
  getHareketBakiyeSonrasi,
} from "./cari-ekstre-balance";

export { buildEkstreExportRows } from "./cari-ekstre-balance";

function fmtTarih(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function CariEkstreList({
  hareketler,
  hesapTuru,
  onColumnsReady,
  emptyMessage,
}: {
  hareketler: CariHareket[];
  hesapTuru: CariHesapTuru;
  onColumnsReady?: Parameters<typeof FinansDataTable<CariEkstreColumnId, CariHareket>>[0]["onColumnsReady"];
  emptyMessage?: string;
}) {
  const columns = useMemo(() => buildEkstreColumns(hesapTuru), [hesapTuru]);

  const renderCell = (colId: CariEkstreColumnId, h: CariHareket) => {
    const isAlacak = h.yon === "alacak";
    const bakiyeSonrasi = getHareketBakiyeSonrasi(h);

    switch (colId) {
      case "tarih":
        return <span className="cell-secondary">{fmtTarih(h.islem_tarihi)}</span>;
      case "islem":
        return (
          <span className={`cari-badge ${isAlacak ? "cari-badge--alacak" : "cari-badge--borc"}`}>
            {h.islem_turu_display || h.islem_turu}
          </span>
        );
      case "aciklama":
        return <FinansAciklamaCell text={h.aciklama || h.belge_no || "—"} />;
      case "kategori":
        return <span className="cell-secondary">{h.kategori_adi || "—"}</span>;
      case "odeme_yontemi":
        return <FinansOdemeTipCell tip={h.odeme_yontemi_tip} ad={h.odeme_yontemi_adi} />;
      case "islem_yapan":
        return <span className="cell-secondary">{h.islem_yapan_adi || "—"}</span>;
      case "alacak":
        return (
          <span className={`cell-money ${isAlacak ? "cell-money--green" : "cell-money--muted"}`}>
            {isAlacak ? `${fmtEkstreMoney(h.tutar)} ₺` : "—"}
          </span>
        );
      case "borc":
        return (
          <span className={`cell-money ${!isAlacak ? "cell-money--rose" : "cell-money--muted"}`}>
            {!isAlacak ? `${fmtEkstreMoney(h.tutar)} ₺` : "—"}
          </span>
        );
      case "bakiye":
        return (
          <span
            className={`cell-money ${
              bakiyeSonrasi > 0.01
                ? "cell-money--rose"
                : bakiyeSonrasi < -0.01
                  ? "cell-money--green"
                  : ""
            }`}
          >
            {formatEkstreBakiye(bakiyeSonrasi)}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <FinansDataTable
      storageKey={CARI_EKSTRE_COLUMN_STORAGE_KEY}
      defaultOrder={DEFAULT_CARI_EKSTRE_COLUMN_ORDER}
      columns={columns}
      items={hareketler}
      rowKey={(h) => h.id}
      renderCell={renderCell}
      emptyMessage={emptyMessage}
      onColumnsReady={onColumnsReady}
    />
  );
}
