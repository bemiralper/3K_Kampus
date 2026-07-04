import type { ColumnMeta } from "@/components/finans/column-order-utils";

export type CariRaporColumnId =
  | "hesap_kodu"
  | "cari_adi"
  | "tur"
  | "borc"
  | "alacak"
  | "bakiye"
  | "vadesi_gelen"
  | "vadesi_gecmis"
  | "gelecek_vadeli"
  | "son_islem_tarihi"
  | "son_islem_turu"
  | "son_islem_yapan";

export const CARI_RAPOR_TABLE_COLUMNS: Record<CariRaporColumnId, ColumnMeta> = {
  hesap_kodu: { label: "Cari Kodu", width: "100px", exportKey: "hesap_kodu" },
  cari_adi: { label: "Cari Adı", exportKey: "cari_adi" },
  tur: { label: "Tür", width: "100px", exportKey: "tur" },
  borc: { label: "Borç", align: "right", width: "110px", exportKey: "borc" },
  alacak: { label: "Alacak", align: "right", width: "110px", exportKey: "alacak" },
  bakiye: { label: "Bakiye", align: "right", width: "110px", exportKey: "bakiye" },
  vadesi_gelen: { label: "Vadesi Gelen", align: "right", width: "120px", exportKey: "vadesi_gelen" },
  vadesi_gecmis: { label: "Vadesi Geçmiş", align: "right", width: "120px", exportKey: "vadesi_gecmis" },
  gelecek_vadeli: { label: "Gelecek Vadeli", align: "right", width: "120px", exportKey: "gelecek_vadeli" },
  son_islem_tarihi: { label: "Son İşlem Tarihi", width: "120px", exportKey: "son_islem_tarihi" },
  son_islem_turu: { label: "Son İşlem Türü", width: "130px", exportKey: "son_islem_turu" },
  son_islem_yapan: { label: "Son İşlemi Yapan", width: "140px", exportKey: "son_islem_yapan" },
};

export const DEFAULT_CARI_RAPOR_COLUMN_ORDER: CariRaporColumnId[] = [
  "hesap_kodu",
  "cari_adi",
  "tur",
  "borc",
  "alacak",
  "bakiye",
  "vadesi_gelen",
  "vadesi_gecmis",
  "gelecek_vadeli",
  "son_islem_tarihi",
  "son_islem_turu",
  "son_islem_yapan",
];

export const CARI_RAPOR_COLUMN_STORAGE_KEY = "3k_cari_bakiye_rapor_column_order";
