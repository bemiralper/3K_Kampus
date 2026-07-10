/** Ortak paket/hizmet seçim tipleri — kayıt ve sözleşme ekranları */

export type ParentPackageTur = "grup_dersi" | "premium";

export type ParentPackageRef = {
  tur: ParentPackageTur;
  id: number;
};

export type StudentPackageSelection = {
  parent: ParentPackageRef | null;
  ozelDersIds: number[];
  denemePaketiId: number | null;
  yayinPaketiIds: number[];
  ekHizmetIds: number[];
};

export const EMPTY_SELECTION: StudentPackageSelection = {
  parent: null,
  ozelDersIds: [],
  denemePaketiId: null,
  yayinPaketiIds: [],
  ekHizmetIds: [],
};

export type CatalogParentItem = {
  id: number;
  ad: string;
  fiyat?: number;
  kdv_orani?: number;
  kategori: "grup_dersleri" | "premium_paketler";
  alan_id?: number | null;
  dahil_ek_hizmet_ids?: number[];
  dahil_deneme_paketi_ids?: number[];
  dahil_yayin_paketi_ids?: number[];
};

export type CatalogOzelDers = { id: number; ad: string; fiyat: number; kdv_orani: number };
export type CatalogDeneme = { id: number; ad: string; fiyat: number; kdv_orani: number };
export type CatalogYayin = { id: number; ad: string; fiyat: number; kdv_orani: number };
export type CatalogEkHizmet = {
  id: number;
  ad: string;
  hizmet_turu: string;
  fiyat: number;
  kdv_orani: number;
};

export type PackageCatalog = {
  grupDersleri: CatalogParentItem[];
  premiumPaketler: CatalogParentItem[];
  ozelDersler: CatalogOzelDers[];
  denemeler: CatalogDeneme[];
  yayinPaketleri: CatalogYayin[];
  ekHizmetler: CatalogEkHizmet[];
};

export type IncludedSet = {
  ekHizmetIds: Set<number>;
  denemePaketiIds: Set<number>;
  yayinPaketiIds: Set<number>;
};

export type BillableLineItem = {
  key: string;
  kalem_turu: "paket" | "ek_hizmet";
  paket_turu?: string;
  kalem_id: number;
  kalem_adi: string;
  fiyat: number;
  kdv_orani: number;
};

export type KalemRowInput = {
  key: string;
  kalem_turu: "paket" | "ek_hizmet";
  paket_turu?: string;
  kalem_id: number;
  kalem_adi: string;
  fiyat: number;
  kdv_orani: number;
};

/** Kayıt API uyumluluğu — eski composite ID formatı */
export type LegacyPackageData = {
  paketler: string[];
  ek_hizmet_ids: number[];
  deneme_paketi_id: number | null;
  yayin_paketi_ids: number[];
};

export function parentTurToKategori(tur: ParentPackageTur): string {
  return tur === "grup_dersi" ? "grup_dersleri" : "premium_paketler";
}

export function kategoriToParentTur(kategori: string): ParentPackageTur | null {
  const n = kategori.replace(/-/g, "_");
  if (n === "grup_dersleri" || n === "grup_dersi") return "grup_dersi";
  if (n === "premium_paketler" || n === "premium") return "premium";
  return null;
}

export function compositePackageId(kategori: string, dbId: number): string {
  return `${kategori}_${dbId}`;
}

export function parseCompositePackageId(id: string): { kategori: string; dbId: number } | null {
  const idx = id.lastIndexOf("_");
  if (idx <= 0) return null;
  const dbId = parseInt(id.slice(idx + 1), 10);
  if (Number.isNaN(dbId)) return null;
  return { kategori: id.slice(0, idx), dbId };
}

export function stablePaketKey(tur: string, id: number): string {
  return `paket:${tur}:${id}`;
}
