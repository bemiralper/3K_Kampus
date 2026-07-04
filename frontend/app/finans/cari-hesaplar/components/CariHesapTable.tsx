"use client";

import Link from "next/link";
import FinansDataTable from "@/components/finans/FinansDataTable";
import {
  CariHesapListItem,
  HESAP_TURLERI,
} from "../../types/cari-hesap-types";
import { CariBakiyeCell, CariTutarCell } from "./CariBalanceCells";
import {
  CARI_TABLE_COLUMNS,
  CARI_TABLE_COLUMN_STORAGE_KEY,
  CariTableColumnId,
  DEFAULT_CARI_COLUMN_ORDER,
} from "./cari-table-columns";
import "@/components/finans/finans-list.css";

export default function CariHesapTable({
  hesaplar,
  href,
  onEdit,
  onToggle,
  onDelete,
  onColumnsReady,
}: {
  hesaplar: CariHesapListItem[];
  href: (path: string) => string;
  onEdit: (id: number) => void;
  onToggle: (id: number) => void;
  onDelete: (id: number, unvan: string) => void;
  onColumnsReady?: Parameters<
    typeof FinansDataTable<CariTableColumnId, CariHesapListItem>
  >[0]["onColumnsReady"];
}) {
  const avatarColors = ["blue", "green", "purple", "orange", "pink", "teal"];

  const renderCell = (colId: CariTableColumnId, h: CariHesapListItem) => {
    const bakiye = Number(h.bakiye);
    const index = hesaplar.indexOf(h);
    const avatarColor = avatarColors[index % avatarColors.length];
    const hesapTuruMeta = HESAP_TURLERI.find((t) => t.value === h.hesap_turu);

    switch (colId) {
      case "hesap":
        return (
          <div className="cell-with-icon">
            <div className={`avatar-circle ${avatarColor}`}>
              {(h.kisa_ad || h.unvan).slice(0, 2).toUpperCase()}
            </div>
            <div className="cell-info">
              <Link href={href(`cari-hesaplar/${h.id}`)} className="cell-primary cell-link">
                {h.gorunen_ad}
              </Link>
              {h.kisa_ad && h.kisa_ad !== h.unvan && (
                <span className="cell-secondary">{h.unvan}</span>
              )}
            </div>
          </div>
        );
      case "tur":
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${hesapTuruMeta?.color || "bg-gray-100 text-gray-600"}`}>
            {hesapTuruMeta?.icon} {h.hesap_turu_display}
          </span>
        );
      case "telefon":
        return h.telefon ? <span className="cell-secondary">{h.telefon}</span> : <span className="cell-secondary">—</span>;
      case "odenen":
        return <CariTutarCell kind="odenen" amount={Number(h.toplam_borc)} />;
      case "alis":
        return <CariTutarCell kind="alis" amount={Number(h.toplam_alacak)} />;
      case "bakiye":
        return <CariBakiyeCell bakiye={bakiye} bakiyeDurumu={h.bakiye_durumu} />;
      case "durum":
        return (
          <span className={`badge-modern ${h.aktif_mi ? "success" : "danger"}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {h.aktif_mi ? (
                <polyline points="20 6 9 17 4 12" />
              ) : (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              )}
            </svg>
            {h.aktif_mi ? "Aktif" : "Pasif"}
          </span>
        );
      case "islemler":
        return (
          <div className="row-actions">
            <Link href={href(`cari-hesaplar/${h.id}`)} className="row-action-btn" title="Detay Sayfası">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </Link>
            <button type="button" onClick={() => onEdit(h.id)} className="row-action-btn" title="Düzenle">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button type="button" onClick={() => onToggle(h.id)} className="row-action-btn" title={h.aktif_mi ? "Pasif Yap" : "Aktif Yap"}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </button>
            <button type="button" onClick={() => onDelete(h.id, h.unvan)} className="row-action-btn danger" title="Sil">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
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
      storageKey={CARI_TABLE_COLUMN_STORAGE_KEY}
      defaultOrder={DEFAULT_CARI_COLUMN_ORDER}
      columns={CARI_TABLE_COLUMNS}
      items={hesaplar}
      rowKey={(h) => h.id}
      renderCell={renderCell}
      onColumnsReady={onColumnsReady}
    />
  );
}

export function buildCariHesapExportRows(items: CariHesapListItem[]) {
  return items.map((h) => ({
    hesap: h.gorunen_ad || h.unvan,
    tur: h.hesap_turu_display,
    telefon: h.telefon || "",
    odenen: Number(h.toplam_borc || 0).toFixed(2),
    alis: Number(h.toplam_alacak || 0).toFixed(2),
    bakiye: Number(h.bakiye || 0).toFixed(2),
    durum: h.aktif_mi ? "Aktif" : "Pasif",
  }));
}
