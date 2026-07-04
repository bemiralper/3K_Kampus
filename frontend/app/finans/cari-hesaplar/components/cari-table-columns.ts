import type { ColumnMeta } from "@/components/finans/column-order-utils";

export type CariTableColumnId =
  | "hesap"
  | "tur"
  | "telefon"
  | "odenen"
  | "alis"
  | "bakiye"
  | "durum"
  | "islemler";

export const CARI_TABLE_COLUMNS: Record<CariTableColumnId, ColumnMeta> = {
  hesap: { label: "Hesap" },
  tur: { label: "Tür" },
  telefon: { label: "Telefon" },
  odenen: { label: "Ödenen", align: "right" },
  alis: { label: "Alış", align: "right" },
  bakiye: { label: "Bakiye", align: "right" },
  durum: { label: "Durum" },
  islemler: { label: "İşlemler", align: "right", width: "148px", hideable: false },
};

export const DEFAULT_CARI_COLUMN_ORDER: CariTableColumnId[] = [
  "hesap",
  "tur",
  "telefon",
  "odenen",
  "alis",
  "bakiye",
  "durum",
  "islemler",
];

export const CARI_TABLE_COLUMN_STORAGE_KEY = "3k_cari_hesaplar_column_order";
