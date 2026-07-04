"use client";

import { GelirKaydiListItem } from "../../types/gelir-types";
import FinansDataTable from "@/components/finans/FinansDataTable";
import FinansAciklamaCell from "@/components/finans/FinansAciklamaCell";
import FinansOdemeTipCell from "@/components/finans/FinansOdemeTipBadge";
import {
  CARI_GELIR_COLUMN_STORAGE_KEY,
  CARI_GELIR_TABLE_COLUMNS,
  CariGelirTableColumnId,
  DEFAULT_CARI_GELIR_COLUMN_ORDER,
} from "./cari-gelir-table-columns";

function fmt(v: number | string | null | undefined) {
  return Number(v || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTarih(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function CariGelirTable({
  items,
  onTahsilat,
  onColumnsReady,
  emptyMessage,
}: {
  items: GelirKaydiListItem[];
  onTahsilat: (id: number, kalan: number) => void;
  onColumnsReady?: Parameters<typeof FinansDataTable<CariGelirTableColumnId, GelirKaydiListItem>>[0]["onColumnsReady"];
  emptyMessage?: string;
}) {
  const renderCell = (colId: CariGelirTableColumnId, g: GelirKaydiListItem) => {
    switch (colId) {
      case "tarih":
        return <span className="cell-secondary">{fmtTarih(g.fatura_tarihi)}</span>;
      case "kategori":
        return <span className="cell-secondary">{g.kategori_adi || "—"}</span>;
      case "odeme_yontemi":
        return <FinansOdemeTipCell tip={g.odeme_yontemi_tip} ad={g.odeme_yontemi_adi} />;
      case "net_tutar":
        return <span className="cell-money">{fmt(g.net_tutar)} ₺</span>;
      case "tahsil_edilen":
        return <span className="cell-money cell-money--green">{fmt(g.tahsil_edilen)} ₺</span>;
      case "kalan":
        return <span className="cell-money cell-money--rose">{fmt(g.kalan_tutar)} ₺</span>;
      case "durum":
        return <span className="cell-secondary">{g.durum_display}</span>;
      case "aciklama":
        return <FinansAciklamaCell text={g.aciklama} />;
      case "islem":
        return (g.durum === "onaylandi" || g.durum === "kismi_tahsil") && g.kalan_tutar > 0 ? (
          <button type="button" onClick={() => onTahsilat(g.id, g.kalan_tutar)} className="row-action-btn" title="Tahsilat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </button>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <FinansDataTable
      storageKey={CARI_GELIR_COLUMN_STORAGE_KEY}
      defaultOrder={DEFAULT_CARI_GELIR_COLUMN_ORDER}
      columns={CARI_GELIR_TABLE_COLUMNS}
      items={items}
      rowKey={(g) => g.id}
      renderCell={renderCell}
      emptyMessage={emptyMessage}
      onColumnsReady={onColumnsReady}
    />
  );
}

export function buildGelirExportRows(items: GelirKaydiListItem[]) {
  return items.map((g) => ({
    tarih: fmtTarih(g.fatura_tarihi),
    kategori: g.kategori_adi || "",
    odeme_yontemi: g.odeme_yontemi_adi || "",
    net_tutar: fmt(g.net_tutar),
    tahsil_edilen: fmt(g.tahsil_edilen),
    kalan: fmt(g.kalan_tutar),
    durum: g.durum_display || g.durum,
    aciklama: g.aciklama || "",
  }));
}
