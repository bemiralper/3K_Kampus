// ─── Finans Modülü — Gider Kategorisi Types ──────────────────

export interface GiderKategorisi {
  id: number;
  ad: string;
  ikon: string;
  renk: string;
  aciklama: string;
  siralama: number;
  aktif_mi: boolean;
  parent: number | null;
  parent_ad: string | null;
  kurum: number;
  kurum_ad: string;
  silindi_mi: boolean;
  silinme_tarihi: string | null;
  created_at: string;
  updated_at: string;
}

export interface GiderKategorisiTreeItem {
  id: number;
  ad: string;
  ikon: string;
  renk: string;
  aciklama: string;
  siralama: number;
  aktif_mi: boolean;
  created_at: string;
  updated_at: string;
  alt_kategoriler: GiderAltKategori[];
}

export interface GiderAltKategori {
  id: number;
  ad: string;
  ikon: string;
  renk: string;
  aciklama: string;
  siralama: number;
  aktif_mi: boolean;
  parent_id: number;
  created_at: string;
  updated_at: string;
}

export interface GiderKategorisiTreeResponse {
  kategoriler: GiderKategorisiTreeItem[];
  toplam_ana: number;
  toplam_alt: number;
}

export interface GiderKategorisiCreatePayload {
  kurum_id: number;
  sube_id: number;
  ad: string;
  parent_id?: number | null;
  ikon?: string;
  renk?: string;
  aciklama?: string;
  siralama?: number;
  aktif_mi?: boolean;
}

export interface GiderKategorisiUpdatePayload {
  ad?: string;
  ikon?: string;
  renk?: string;
  aciklama?: string;
  siralama?: number;
  aktif_mi?: boolean;
}

export interface GiderKategorisiSeedResponse {
  message: string;
  olusturulan_ana: number;
  olusturulan_alt: number;
}
