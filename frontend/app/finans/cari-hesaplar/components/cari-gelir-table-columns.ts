import type { ColumnMeta } from "@/components/finans/column-order-utils";

export type CariGelirTableColumnId =
  | "tarih"
  | "kategori"
  | "odeme_yontemi"
  | "net_tutar"
  | "tahsil_edilen"
  | "kalan"
  | "durum"
  | "aciklama"
  | "islem";

export const CARI_GELIR_TABLE_COLUMNS: Record<CariGelirTableColumnId, ColumnMeta> = {
  tarih: { label: "Tarih" },
  kategori: { label: "Kategori" },
  odeme_yontemi: { label: "Ödeme Türü" },
  net_tutar: { label: "Net Tutar", align: "right" },
  tahsil_edilen: { label: "Tahsil Edilen", align: "right" },
  kalan: { label: "Kalan", align: "right" },
  durum: { label: "Durum" },
  aciklama: { label: "Açıklama" },
  islem: { label: "İşlem", width: "72px", hideable: false },
};

export const DEFAULT_CARI_GELIR_COLUMN_ORDER: CariGelirTableColumnId[] = [
  "tarih",
  "kategori",
  "odeme_yontemi",
  "net_tutar",
  "tahsil_edilen",
  "kalan",
  "durum",
  "aciklama",
  "islem",
];

export const CARI_GELIR_COLUMN_STORAGE_KEY = "3k_cari_gelir_column_order";
