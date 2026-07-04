"use client";

import Link from "next/link";
import FinansDataTable from "@/components/finans/FinansDataTable";
import type { CariHesapRaporItem } from "../../types/cari-hesap-types";
import { HESAP_TURLERI } from "../../types/cari-hesap-types";
import { CariBakiyeCell } from "./CariBalanceCells";
import {
  CARI_RAPOR_COLUMN_STORAGE_KEY,
  CARI_RAPOR_TABLE_COLUMNS,
  CariRaporColumnId,
  DEFAULT_CARI_RAPOR_COLUMN_ORDER,
} from "./cari-rapor-table-columns";
import { fmtExportDate, fmtExportMoney } from "./cari-tab-export";

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

function moneyCell(value: number, tone?: "warn" | "danger" | "muted") {
  const cls =
    tone === "danger"
      ? "cell-money--rose"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "muted" || value <= 0
          ? "cell-money--muted"
          : "";
  return (
    <span className={`cell-money ${cls}`}>
      {value > 0 ? `${fmt(value)} ₺` : "—"}
    </span>
  );
}

export default function CariBakiyeRaporTable({
  items,
  href,
  onColumnsReady,
}: {
  items: CariHesapRaporItem[];
  href: (path: string) => string;
  onColumnsReady?: Parameters<
    typeof FinansDataTable<CariRaporColumnId, CariHesapRaporItem>
  >[0]["onColumnsReady"];
}) {
  const renderCell = (colId: CariRaporColumnId, row: CariHesapRaporItem) => {
    const turMeta = HESAP_TURLERI.find((t) => t.value === row.hesap_turu);

    switch (colId) {
      case "hesap_kodu":
        return (
          <span className="cell-secondary font-mono text-[12px]">
            {row.hesap_kodu || "—"}
          </span>
        );
      case "cari_adi":
        return (
          <Link href={href(`cari-hesaplar/${row.id}`)} className="cell-primary cell-link">
            {row.gorunen_ad || row.unvan}
          </Link>
        );
      case "tur":
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${turMeta?.color || "bg-gray-100 text-gray-600"}`}>
            {turMeta?.icon} {row.hesap_turu_display}
          </span>
        );
      case "borc":
        return moneyCell(Number(row.toplam_borc));
      case "alacak":
        return moneyCell(Number(row.toplam_alacak));
      case "bakiye":
        return <CariBakiyeCell bakiye={Number(row.bakiye)} bakiyeDurumu={row.bakiye_durumu} />;
      case "vadesi_gelen":
        return moneyCell(Number(row.vadesi_gelen), row.vadesi_gelen > 0 ? "warn" : "muted");
      case "vadesi_gecmis":
        return moneyCell(Number(row.vadesi_gecmis), row.vadesi_gecmis > 0 ? "danger" : "muted");
      case "gelecek_vadeli":
        return moneyCell(Number(row.gelecek_vadeli));
      case "son_islem_tarihi":
        return <span className="cell-secondary">{fmtTarih(row.son_islem_tarihi)}</span>;
      case "son_islem_turu":
        return <span className="cell-secondary">{row.son_islem_turu || "—"}</span>;
      case "son_islem_yapan":
        return <span className="cell-secondary">{row.son_islem_yapan || "—"}</span>;
      default:
        return null;
    }
  };

  return (
    <FinansDataTable
      storageKey={CARI_RAPOR_COLUMN_STORAGE_KEY}
      defaultOrder={DEFAULT_CARI_RAPOR_COLUMN_ORDER}
      columns={CARI_RAPOR_TABLE_COLUMNS}
      items={items}
      rowKey={(r) => r.id}
      renderCell={renderCell}
      onColumnsReady={onColumnsReady}
    />
  );
}

export function buildCariRaporExportRows(items: CariHesapRaporItem[]) {
  return items.map((r) => ({
    hesap_kodu: r.hesap_kodu || "",
    cari_adi: r.gorunen_ad || r.unvan,
    tur: r.hesap_turu_display,
    borc: fmtExportMoney(r.toplam_borc),
    alacak: fmtExportMoney(r.toplam_alacak),
    bakiye: fmtExportMoney(r.bakiye),
    vadesi_gelen: fmtExportMoney(r.vadesi_gelen),
    vadesi_gecmis: fmtExportMoney(r.vadesi_gecmis),
    gelecek_vadeli: fmtExportMoney(r.gelecek_vadeli),
    son_islem_tarihi: fmtExportDate(r.son_islem_tarihi),
    son_islem_turu: r.son_islem_turu || "",
    son_islem_yapan: r.son_islem_yapan || "",
  }));
}
