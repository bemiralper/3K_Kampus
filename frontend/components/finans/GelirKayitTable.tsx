"use client";

import { GelirKaydiListItem } from "@/app/finans/types/gelir-types";
import {
  DEFAULT_GELIR_COLUMN_ORDER,
  GELIR_COLUMN_STORAGE_KEY,
  GELIR_TABLE_COLUMNS,
  GelirTableColumnId,
} from "./gelir-table-columns";
import { useReorderableColumns } from "./useReorderableColumns";
import FinansAciklamaCell from "./FinansAciklamaCell";
import FinansOdemeTipCell from "./FinansOdemeTipBadge";
import FinansCariHesapCell from "./FinansCariHesapCell";
import "./finans-list.css";

export default function GelirKayitTable({
  items,
  fmtTutar,
  fmtTarih,
  onCariHesapClick,
  onDetail,
  onTahsilat,
  onEdit,
  onDelete,
}: {
  items: GelirKaydiListItem[];
  fmtTutar: (v: number | string | undefined | null) => string;
  fmtTarih: (d: string | null | undefined) => string;
  onCariHesapClick?: (cariHesapId: number) => void;
  onDetail: (id: number) => void;
  onTahsilat: (id: number, kalan: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const { columnOrder, renderHeader } = useReorderableColumns(
    GELIR_COLUMN_STORAGE_KEY,
    DEFAULT_GELIR_COLUMN_ORDER,
    GELIR_TABLE_COLUMNS
  );

  const renderCell = (colId: GelirTableColumnId, g: GelirKaydiListItem) => {
    switch (colId) {
      case "cari_hesap":
        return (
          <FinansCariHesapCell
            name={g.cari_hesap_adi}
            onClick={
              onCariHesapClick && g.cari_hesap_id
                ? () => onCariHesapClick(g.cari_hesap_id)
                : undefined
            }
          />
        );
      case "odeme_yontemi":
        return <FinansOdemeTipCell tip={g.odeme_yontemi_tip} ad={g.odeme_yontemi_adi} />;
      case "aciklama":
        return <FinansAciklamaCell text={g.aciklama} />;
      case "vade_tarihi":
        return <span className="cell-secondary">{fmtTarih(g.vade_tarihi)}</span>;
      case "net_tutar":
        return <span className="cell-money">{fmtTutar(g.net_tutar)} ₺</span>;
      case "tahsil_edilen":
        return <span className="cell-money cell-money--green">{fmtTutar(g.tahsil_edilen)} ₺</span>;
      case "kalan":
        return <span className="cell-money cell-money--rose">{fmtTutar(g.kalan_tutar)} ₺</span>;
      case "durum":
        return <span className="cell-secondary">{g.durum_display}</span>;
      case "islemler":
        return (
          <div className="row-actions">
            <button onClick={() => onDetail(g.id)} className="row-action-btn" title="Detay">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
            {(g.durum === "onaylandi" || g.durum === "kismi_tahsil") && g.kalan_tutar > 0 && (
              <button
                onClick={() => onTahsilat(g.id, g.kalan_tutar)}
                className="row-action-btn text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600"
                title="Tahsilat Yap"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
              </button>
            )}
            <button onClick={() => onEdit(g.id)} className="row-action-btn" title="Düzenle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            </button>
            <button onClick={() => onDelete(g.id)} className="row-action-btn text-rose-500 hover:bg-rose-50 hover:text-rose-600" title="Sil">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="finans-table-wrap overflow-x-auto">
      <table className="table-modern">
          <thead>
            <tr>{columnOrder.map((colId) => renderHeader(colId))}</tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id} className="group">
                {columnOrder.map((colId) => {
                  const col = GELIR_TABLE_COLUMNS[colId];
                  return (
                    <td
                      key={colId}
                      data-col={colId}
                      className={col.align === "right" ? "text-right" : undefined}
                      style={{ textAlign: col.align }}
                    >
                      {renderCell(colId, g)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
    </div>
  );
}
