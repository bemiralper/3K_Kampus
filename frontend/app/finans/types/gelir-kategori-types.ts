// ─── Gelir Kategorisi Types ────────────────────────────────────

export interface GelirKategorisi {
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

export interface GelirKategorisiTreeItem {
  id: number;
  ad: string;
  ikon: string;
  renk: string;
  aciklama: string;
  siralama: number;
  aktif_mi: boolean;
  created_at: string;
  updated_at: string;
  alt_kategoriler: GelirAltKategori[];
}

export interface GelirAltKategori {
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

export interface GelirKategorisiTreeResponse {
  kategoriler: GelirKategorisiTreeItem[];
  toplam_ana: number;
  toplam_alt: number;
}

export interface GelirKategorisiCreatePayload {
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

export interface GelirKategorisiUpdatePayload {
  ad?: string;
  ikon?: string;
  renk?: string;
  aciklama?: string;
  siralama?: number;
  aktif_mi?: boolean;
}

export interface GelirKategorisiSeedResponse {
  message: string;
  olusturulan_ana: number;
  olusturulan_alt: number;
}
