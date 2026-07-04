import type { ColumnMeta } from "@/components/finans/column-order-utils";

export type GiderTableColumnId =
  | "aciklama"
  | "cari_hesap"
  | "odeme_yontemi"
  | "kategori"
  | "net_tutar"
  | "odenen"
  | "kalan"
  | "durum"
  | "vade"
  | "islemler";

export const GIDER_TABLE_COLUMNS: Record<GiderTableColumnId, ColumnMeta> = {
  aciklama: { label: "Açıklama" },
  cari_hesap: { label: "Cari Hesap" },
  odeme_yontemi: { label: "Ödeme Türü" },
  kategori: { label: "Kategori" },
  net_tutar: { label: "Net Tutar", align: "right" },
  odenen: { label: "Ödenen", align: "right" },
  kalan: { label: "Kalan", align: "right" },
  durum: { label: "Durum" },
  vade: { label: "Vade" },
  islemler: { label: "İşlemler", align: "right", width: "148px" },
};

export const DEFAULT_GIDER_COLUMN_ORDER: GiderTableColumnId[] = [
  "cari_hesap",
  "odeme_yontemi",
  "kategori",
  "vade",
  "net_tutar",
  "odenen",
  "kalan",
  "durum",
  "aciklama",
  "islemler",
];

export const GIDER_COLUMN_STORAGE_KEY = "3k_gider_kayitlari_column_order";
