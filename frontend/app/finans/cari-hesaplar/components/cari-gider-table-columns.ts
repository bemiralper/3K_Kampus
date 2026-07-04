import type { ColumnMeta } from "@/components/finans/column-order-utils";

export type CariGiderTableColumnId =
  | "kategori"
  | "odeme_yontemi"
  | "tarih"
  | "net_tutar"
  | "taksit"
  | "odeme_durumu"
  | "durum"
  | "olusturan"
  | "aciklama"
  | "islemler";

export const CARI_GIDER_TABLE_COLUMNS: Record<CariGiderTableColumnId, ColumnMeta> = {
  kategori: { label: "Kategori" },
  odeme_yontemi: { label: "Ödeme Türü" },
  tarih: { label: "Tarih" },
  net_tutar: { label: "Net Tutar", align: "right" },
  taksit: { label: "Taksit" },
  odeme_durumu: { label: "Ödeme Durumu" },
  durum: { label: "Durum" },
  olusturan: { label: "İşlemi Yapan" },
  aciklama: { label: "Açıklama" },
  islemler: { label: "İşlemler", width: "100px", hideable: false },
};

export const DEFAULT_CARI_GIDER_COLUMN_ORDER: CariGiderTableColumnId[] = [
  "kategori",
  "odeme_yontemi",
  "tarih",
  "net_tutar",
  "taksit",
  "odeme_durumu",
  "durum",
  "olusturan",
  "aciklama",
  "islemler",
];

export const CARI_GIDER_COLUMN_STORAGE_KEY = "3k_cari_gider_column_order";
