import type { ColumnMeta } from "@/components/finans/column-order-utils";

export type CariOdemeTableColumnId =
  | "tarih"
  | "tur"
  | "kaynak"
  | "kategori"
  | "odeme_yontemi"
  | "tutar"
  | "bakiye_sonrasi"
  | "aciklama"
  | "islem";

export const CARI_ODEME_TABLE_COLUMNS: Record<CariOdemeTableColumnId, ColumnMeta> = {
  tarih: { label: "Tarih" },
  tur: { label: "Tür" },
  kaynak: { label: "Kaynak" },
  kategori: { label: "Kategori" },
  odeme_yontemi: { label: "Ödeme Türü" },
  tutar: { label: "Tutar", align: "right" },
  bakiye_sonrasi: { label: "Bakiye Sonrası", align: "right" },
  aciklama: { label: "Açıklama" },
  islem: { label: "İşlem", width: "72px", hideable: false },
};

export const DEFAULT_CARI_ODEME_COLUMN_ORDER: CariOdemeTableColumnId[] = [
  "tarih",
  "tur",
  "kaynak",
  "kategori",
  "odeme_yontemi",
  "tutar",
  "bakiye_sonrasi",
  "aciklama",
  "islem",
];

export const CARI_ODEME_COLUMN_STORAGE_KEY = "3k_cari_odeme_column_order";
