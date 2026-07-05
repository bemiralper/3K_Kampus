import type { ColumnMeta } from "@/components/finans/column-order-utils";
import type { CariHesapTuru } from "../../types/cari-hesap-types";

export type CariEkstreColumnId =
  | "tarih"
  | "islem"
  | "aciklama"
  | "kategori"
  | "odeme_yontemi"
  | "islem_yapan"
  | "alacak"
  | "borc"
  | "bakiye";

function kolonBasliklari(hesapTuru: CariHesapTuru) {
  switch (hesapTuru) {
    case "musteri":
      return { alacak: "Tahsilat", borc: "Satış" };
    case "tedarikci":
      return { alacak: "Alış", borc: "Ödeme" };
    default:
      return { alacak: "Alacak", borc: "Borç" };
  }
}

export function buildEkstreColumns(hesapTuru: CariHesapTuru): Record<CariEkstreColumnId, ColumnMeta> {
  const k = kolonBasliklari(hesapTuru);
  return {
    tarih: { label: "Tarih", width: "100px" },
    islem: { label: "İşlem", width: "110px" },
    aciklama: { label: "Açıklama" },
    kategori: { label: "Kategori", width: "120px" },
    odeme_yontemi: { label: "Ödeme", width: "120px" },
    islem_yapan: { label: "İşlemi Yapan", width: "130px", exportKey: "islem_yapan" },
    alacak: { label: k.alacak, align: "right", width: "110px", exportKey: "alacak" },
    borc: { label: k.borc, align: "right", width: "110px", exportKey: "borc" },
    bakiye: { label: "Bakiye", align: "right", width: "110px" },
  };
}

export const DEFAULT_CARI_EKSTRE_COLUMN_ORDER: CariEkstreColumnId[] = [
  "tarih",
  "islem",
  "aciklama",
  "kategori",
  "odeme_yontemi",
  "islem_yapan",
  "alacak",
  "borc",
  "bakiye",
];

export const CARI_EKSTRE_COLUMN_STORAGE_KEY = "3k_cari_ekstre_column_order_v2";

/** Tablo render edilmeden export için sabit kolon listesi */
export function buildEkstreExportColumns(
  hesapTuru: CariHesapTuru,
): { key: string; label: string }[] {
  const cols = buildEkstreColumns(hesapTuru);
  return DEFAULT_CARI_EKSTRE_COLUMN_ORDER.map((id) => ({
    key: cols[id].exportKey || id,
    label: cols[id].label,
  }));
}
