import type { ColumnMeta } from "@/components/finans/column-order-utils";

export type GelirTableColumnId =
  | "cari_hesap"
  | "odeme_yontemi"
  | "aciklama"
  | "vade_tarihi"
  | "net_tutar"
  | "tahsil_edilen"
  | "kalan"
  | "durum"
  | "islemler";

export const GELIR_TABLE_COLUMNS: Record<GelirTableColumnId, ColumnMeta> = {
  cari_hesap: { label: "Cari Hesap" },
  odeme_yontemi: { label: "Ödeme Türü" },
  aciklama: { label: "Açıklama" },
  vade_tarihi: { label: "Vade Tarihi" },
  net_tutar: { label: "Net Tutar", align: "right" },
  tahsil_edilen: { label: "Tahsil Edilen", align: "right" },
  kalan: { label: "Kalan", align: "right" },
  durum: { label: "Durum" },
  islemler: { label: "İşlemler", align: "right" },
};

export const DEFAULT_GELIR_COLUMN_ORDER: GelirTableColumnId[] = [
  "cari_hesap",
  "odeme_yontemi",
  "vade_tarihi",
  "net_tutar",
  "tahsil_edilen",
  "kalan",
  "durum",
  "aciklama",
  "islemler",
];

export const GELIR_COLUMN_STORAGE_KEY = "3k_gelir_kayitlari_column_order";
