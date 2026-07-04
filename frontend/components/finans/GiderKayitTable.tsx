"use client";

import { GiderKaydiListItem, GIDER_DURUMLARI } from "@/app/finans/types/gider-types";
import {
  DEFAULT_GIDER_COLUMN_ORDER,
  GIDER_COLUMN_STORAGE_KEY,
  GIDER_TABLE_COLUMNS,
  GiderTableColumnId,
} from "./gider-table-columns";
import { useReorderableColumns } from "./useReorderableColumns";
import FinansAciklamaCell from "./FinansAciklamaCell";
import FinansOdemeTipCell from "./FinansOdemeTipBadge";
import FinansCariHesapCell from "./FinansCariHesapCell";
import "./finans-list.css";

function fmtTarih(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getDurumBadge(durum: string) {
  return GIDER_DURUMLARI.find((d) => d.value === durum) || { label: durum, color: "" };
}

export default function GiderKayitTable({
  items,
  onCariHesapClick,
  onDetail,
  onIptal,
  onSil,
}: {
  items: GiderKaydiListItem[];
  onCariHesapClick?: (cariHesapId: number) => void;
  onDetail: (id: number) => void;
  onIptal: (id: number) => void;
  onSil: (id: number) => void;
}) {
  const { columnOrder, renderHeader } = useReorderableColumns(
    GIDER_COLUMN_STORAGE_KEY,
    DEFAULT_GIDER_COLUMN_ORDER,
    GIDER_TABLE_COLUMNS
  );

  const renderCell = (colId: GiderTableColumnId, g: GiderKaydiListItem) => {
    const badge = getDurumBadge(g.durum);
    const kalan = Number(g.kalan_tutar);

    switch (colId) {
      case "aciklama":
        return <FinansAciklamaCell text={g.aciklama} onClick={() => onDetail(g.id)} />;
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
      case "kategori":
        return <span className="cell-secondary">{g.kategori_adi}</span>;
      case "net_tutar":
        return (
          <span className="cell-money">
            {Number(g.net_tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
          </span>
        );
      case "odenen":
        return (
          <span className="cell-money cell-money--green">
            {Number(g.odenen_toplam).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
          </span>
        );
      case "kalan":
        return (
          <span className={`cell-money ${kalan > 0 ? "cell-money--rose" : "cell-money--green"}`}>
            {kalan.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
          </span>
        );
      case "durum":
        return <span className="cell-secondary">{badge.label}</span>;
      case "vade":
        return <span className="cell-secondary">{fmtTarih(g.vade_tarihi)}</span>;
      case "islemler":
        return (
          <div className="row-actions">
            <button onClick={() => onDetail(g.id)} className="row-action-btn" title="Detay Görüntüle">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            </button>
            {!["odendi", "iptal"].includes(g.durum) && (
              <button onClick={() => onIptal(g.id)} className="row-action-btn danger" title="İptal Et">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" /></svg>
              </button>
            )}
            {g.durum === "taslak" && (
              <button onClick={() => onSil(g.id)} className="row-action-btn danger" title="Sil">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="finans-table-wrap">
      <table className="table-modern">
          <thead>
            <tr>{columnOrder.map((colId) => renderHeader(colId))}</tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id}>
                {columnOrder.map((colId) => {
                  const col = GIDER_TABLE_COLUMNS[colId];
                  return (
                    <td key={colId} data-col={colId} style={{ textAlign: col.align }}>
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
