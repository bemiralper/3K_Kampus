"use client";

import { CariHareket } from "../../types/cari-hesap-types";
import FinansDataTable from "@/components/finans/FinansDataTable";
import FinansAciklamaCell from "@/components/finans/FinansAciklamaCell";
import FinansOdemeTipCell from "@/components/finans/FinansOdemeTipBadge";
import {
  CARI_ODEME_COLUMN_STORAGE_KEY,
  CARI_ODEME_TABLE_COLUMNS,
  CariOdemeTableColumnId,
  DEFAULT_CARI_ODEME_COLUMN_ORDER,
} from "./cari-odeme-table-columns";

function fmt(v: number | string | null | undefined) {
  return Number(v || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTarih(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getKaynakMeta(o: CariHareket, all: CariHareket[]) {
  const isIptal = o.kaynak_tip === "SerbestOdemeIptal" || o.islem_turu === "iade";
  const isMahsup = o.islem_turu === "mahsup";
  const isSerbest = o.kaynak_tip === "SerbestOdeme";
  const isGiderOdeme = o.kaynak_tip === "GiderOdeme";

  const iptalEdilmisMi =
    !isIptal &&
    (all.some((x) => x.kaynak_tip === "SerbestOdemeIptal" && x.kaynak_id === o.id) ||
      (isGiderOdeme &&
        o.kaynak_id != null &&
        all.some(
          (x) =>
            x.kaynak_tip === "GiderOdeme" &&
            x.islem_turu === "iade" &&
            x.kaynak_id === o.kaynak_id &&
            x.id !== o.id
        )));

  const kaynakLabel = isIptal
    ? "İptal"
    : isSerbest
      ? "Serbest Ödeme"
      : isGiderOdeme
        ? "Gider Ödemesi"
        : isMahsup
          ? "Bakiyeden Mahsup"
          : "—";

  return { isIptal, isSerbest, isGiderOdeme, iptalEdilmisMi, kaynakLabel };
}

export default function CariOdemeTable({
  items,
  onSerbestOdemeIptal,
  onGiderOdemeIptal,
  onColumnsReady,
  emptyMessage,
}: {
  items: CariHareket[];
  onSerbestOdemeIptal: (id: number) => void;
  onGiderOdemeIptal: (odemeId: number) => void;
  onColumnsReady?: Parameters<typeof FinansDataTable<CariOdemeTableColumnId, CariHareket>>[0]["onColumnsReady"];
  emptyMessage?: string;
}) {
  const renderCell = (colId: CariOdemeTableColumnId, o: CariHareket) => {
    const meta = getKaynakMeta(o, items);
    const bs = (o.borc_sonrasi ?? 0) - (o.alacak_sonrasi ?? 0);

    switch (colId) {
      case "tarih":
        return <span className="cell-secondary">{fmtTarih(o.islem_tarihi)}</span>;
      case "tur":
        return <span className="cell-secondary">{o.islem_turu_display || "Ödeme"}</span>;
      case "kaynak":
        return <span className="cell-secondary">{meta.kaynakLabel}</span>;
      case "kategori":
        return <span className="cell-secondary">{o.kategori_adi || "—"}</span>;
      case "odeme_yontemi":
        return <FinansOdemeTipCell tip={o.odeme_yontemi_tip} ad={o.odeme_yontemi_adi} />;
      case "tutar":
        return (
          <span className={`cell-money ${meta.isIptal ? "cell-money--rose" : "cell-money--green"}`}>
            {meta.isIptal ? "−" : ""}{fmt(o.tutar)} ₺
          </span>
        );
      case "bakiye_sonrasi":
        return <span className="cell-money">{fmt(Math.abs(bs))} ₺</span>;
      case "aciklama":
        return <FinansAciklamaCell text={o.aciklama || o.belge_no || ""} />;
      case "islem":
        if (meta.iptalEdilmisMi) return <span className="cell-secondary">İptal edildi</span>;
        if (meta.isIptal) return null;
        if (meta.isSerbest) {
          return (
            <button type="button" onClick={() => onSerbestOdemeIptal(o.id)} className="row-action-btn danger" title="İptal">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          );
        }
        if (meta.isGiderOdeme && o.kaynak_id) {
          return (
            <button type="button" onClick={() => onGiderOdemeIptal(o.kaynak_id!)} className="row-action-btn danger" title="İptal">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          );
        }
        return null;
      default:
        return null;
    }
  };

  return (
    <FinansDataTable
      storageKey={CARI_ODEME_COLUMN_STORAGE_KEY}
      defaultOrder={DEFAULT_CARI_ODEME_COLUMN_ORDER}
      columns={CARI_ODEME_TABLE_COLUMNS}
      items={items}
      rowKey={(o) => o.id}
      renderCell={renderCell}
      emptyMessage={emptyMessage}
      onColumnsReady={onColumnsReady}
    />
  );
}

export function buildOdemeExportRows(items: CariHareket[]) {
  return items.map((o) => {
    const meta = getKaynakMeta(o, items);
    const bs = (o.borc_sonrasi ?? 0) - (o.alacak_sonrasi ?? 0);
    return {
      tarih: fmtTarih(o.islem_tarihi),
      tur: o.islem_turu_display || o.islem_turu,
      kaynak: meta.kaynakLabel,
      kategori: o.kategori_adi || "",
      odeme_yontemi: o.odeme_yontemi_adi || "",
      tutar: fmt(o.tutar),
      bakiye_sonrasi: fmt(Math.abs(bs)),
      aciklama: o.aciklama || o.belge_no || "",
    };
  });
}
