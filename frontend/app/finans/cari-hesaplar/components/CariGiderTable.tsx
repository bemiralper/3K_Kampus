"use client";

import { GiderKaydiListItem } from "../../types/gider-types";
import FinansDataTable from "@/components/finans/FinansDataTable";
import FinansAciklamaCell from "@/components/finans/FinansAciklamaCell";
import FinansOdemeTipCell from "@/components/finans/FinansOdemeTipBadge";
import {
  CARI_GIDER_COLUMN_STORAGE_KEY,
  CARI_GIDER_TABLE_COLUMNS,
  CariGiderTableColumnId,
  DEFAULT_CARI_GIDER_COLUMN_ORDER,
} from "./cari-gider-table-columns";

function fmt(v: number | string | null | undefined) {
  return Number(v || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTarih(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function CariGiderTable({
  items,
  onOdeme,
  onIptal,
  onDetay,
  onColumnsReady,
  emptyMessage,
}: {
  items: GiderKaydiListItem[];
  onOdeme: (id: number) => void;
  onIptal: (id: number) => void;
  onDetay: (id: number) => void;
  onColumnsReady?: Parameters<typeof FinansDataTable<CariGiderTableColumnId, GiderKaydiListItem>>[0]["onColumnsReady"];
  emptyMessage?: string;
}) {
  const renderCell = (colId: CariGiderTableColumnId, g: GiderKaydiListItem) => {
    const pct = Number(g.odeme_yuzdesi) || 0;
    const fillClass =
      pct >= 100 ? "finans-progress__fill--full" :
      pct > 0 ? "finans-progress__fill--partial" : "";

    switch (colId) {
      case "kategori":
        return <span className="cell-secondary">{g.kategori_adi || "—"}</span>;
      case "odeme_yontemi":
        return <FinansOdemeTipCell tip={g.odeme_yontemi_tip} ad={g.odeme_yontemi_adi} />;
      case "tarih":
        return <span className="cell-secondary">{fmtTarih(g.fatura_tarihi)}</span>;
      case "net_tutar":
        return <span className="cell-money">{fmt(g.net_tutar)} ₺</span>;
      case "taksit":
        return (
          <span className="cell-secondary">
            {g.taksit_sayisi > 1 ? `${g.taksit_sayisi} taksit` : "Tek"}
          </span>
        );
      case "odeme_durumu":
        return (
          <div className="finans-progress">
            <div className="finans-progress__track">
              <div className={`finans-progress__fill ${fillClass}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="finans-progress__label">
              {pct >= 100 ? "Tamam" : `%${Math.round(pct)}`}
            </span>
          </div>
        );
      case "durum":
        return <span className="cell-secondary">{g.durum_display}</span>;
      case "olusturan":
        return <span className="cell-secondary">{g.olusturan_adi || "—"}</span>;
      case "aciklama":
        return <FinansAciklamaCell text={g.aciklama} />;
      case "islemler":
        return (
          <div className="row-actions">
            {["onaylandi", "kismi_odendi"].includes(g.durum) && Number(g.kalan_tutar) > 0 && (
              <button type="button" onClick={() => onOdeme(g.id)} className="row-action-btn" title="Ödeme Yap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </button>
            )}
            {!["odendi", "iptal"].includes(g.durum) && (
              <button type="button" onClick={() => onIptal(g.id)} className="row-action-btn danger" title="İptal">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
            <button type="button" onClick={() => onDetay(g.id)} className="row-action-btn" title="Detay">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <FinansDataTable
      storageKey={CARI_GIDER_COLUMN_STORAGE_KEY}
      defaultOrder={DEFAULT_CARI_GIDER_COLUMN_ORDER}
      columns={CARI_GIDER_TABLE_COLUMNS}
      items={items}
      rowKey={(g) => g.id}
      renderCell={renderCell}
      emptyMessage={emptyMessage}
      onColumnsReady={onColumnsReady}
    />
  );
}

export function buildGiderExportRows(items: GiderKaydiListItem[]) {
  return items.map((g) => ({
    kategori: g.kategori_adi || "",
    odeme_yontemi: g.odeme_yontemi_adi || "",
    tarih: fmtTarih(g.fatura_tarihi),
    net_tutar: fmt(g.net_tutar),
    taksit: g.taksit_sayisi > 1 ? `${g.taksit_sayisi} taksit` : "Tek",
    odeme_durumu: `%${Math.round(Number(g.odeme_yuzdesi) || 0)}`,
    durum: g.durum_display || g.durum,
    olusturan: g.olusturan_adi || "",
    aciklama: g.aciklama || "",
  }));
}
