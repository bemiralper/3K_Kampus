import type { ColumnMeta } from "@/components/finans/column-order-utils";

export type CariTableColumnId =
  | "hesap"
  | "tur"
  | "telefon"
  | "yetkili"
  | "borc"
  | "alacak"
  | "bakiye"
  | "son_islem"
  | "durum"
  | "islemler";

export const CARI_TABLE_COLUMNS: Record<CariTableColumnId, ColumnMeta> = {
  hesap: { label: "Hesap" },
  tur: { label: "Tür" },
  telefon: { label: "Telefon" },
  yetkili: { label: "Yetkili Kişi", hideable: true },
  borc: { label: "Verecek", align: "right" },
  alacak: { label: "Alacak", align: "right" },
  bakiye: { label: "Net Bakiye", align: "right" },
  son_islem: { label: "Son İşlem", hideable: true, width: "110px" },
  durum: { label: "Durum" },
  islemler: { label: "İşlemler", align: "right", width: "148px", hideable: false },
};

export const DEFAULT_CARI_COLUMN_ORDER: CariTableColumnId[] = [
  "hesap",
  "tur",
  "telefon",
  "borc",
  "alacak",
  "bakiye",
  "durum",
  "islemler",
];

/** Eski localStorage sıralamasını yeni kolon kimliklerine taşır */
export function migrateCariColumnOrder(order: string[]): CariTableColumnId[] {
  const map: Record<string, CariTableColumnId> = {
    odenen: "borc",
    alis: "alacak",
  };
  const seen = new Set<CariTableColumnId>();
  const result: CariTableColumnId[] = [];
  for (const raw of order) {
    const id = (map[raw] || raw) as CariTableColumnId;
    if (id in CARI_TABLE_COLUMNS && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of DEFAULT_CARI_COLUMN_ORDER) {
    if (!seen.has(id)) result.push(id);
  }
  return result;
}

export const CARI_TABLE_COLUMN_STORAGE_KEY = "3k_cari_hesaplar_column_order";
