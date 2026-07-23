// Şube Tanımları Types

export interface Sube {
  id: number;
  ad: string;
}

export interface EgitimYili {
  id: number;
  ad?: string;
  yil_str?: string;
  baslangic_yil?: number;
  bitis_yil?: number;
  aktif_mi?: boolean;
}

// Oda Types
export interface Oda {
  id: number;
  ad: string;
  kapasite: number;
  oda_turu: string;
  oda_turu_display: string;
  aciklama: string;
  aktif_mi: boolean;
  sube: Sube;
  created_at: string | null;
}

export interface OdaTur {
  value: string;
  label: string;
}

export interface OdaFormData {
  sube_id: string;
  ad: string;
  kapasite: string;
  oda_turu: string;
  aciklama: string;
  aktif_mi: boolean;
}

// Sınıf Types
export interface SinifSeviyesi {
  id: number;
  ad: string;
  value?: string;  // Uyumluluk için
  label?: string;  // Uyumluluk için
}

export interface Sinif {
  id: number;
  ad: string;
  kod: string;
  kapasite: number;
  ogrenci_sayisi?: number;
  mevcutluk: number;
  doluluk_orani: number;
  aktif_mi: boolean;
  egitim_yili: EgitimYili;
  sube: Sube;
  oda: { id: number; ad: string } | null;
  sinif_seviyesi: SinifSeviyesi | null;
  created_at: string | null;
}

export interface AktifDonem {
  id: number;
  name: string;
  code?: string;
  term_type?: string;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
}

export interface AtanmamisOgrenci {
  id: number;
  ad: string;
  soyad: string;
  tam_ad: string;
  okul_no: string;
  alan?: { id: number; ad: string } | null;
  sinif_yerlesim?: { id: number; ad: string } | null;
  bu_sinifta?: boolean;
}

export interface SinifListResult {
  siniflar: Sinif[];
  aktif_donem: AktifDonem | null;
}

export interface SinifPlacementSkip {
  student_id: number;
  reason: string;
}

export interface SinifPlacementResult {
  created?: number[];
  updated?: number[];
  removed?: number[];
  skipped?: SinifPlacementSkip[];
  errors?: SinifPlacementSkip[];
}

export interface SinifOgrenciAtamaResponse {
  success: boolean;
  message?: string;
  mevcutluk: number;
  result?: SinifPlacementResult;
}

export interface SinifOgrenciCikarResponse {
  success: boolean;
  message?: string;
  mevcutluk: number;
  result?: SinifPlacementResult;
}

export interface SinifOgrenciRosterResponse {
  ogrenciler?: AtanmamisOgrenci[];
  aktif_donem?: AktifDonem | null;
  sinif?: { id: number; ad: string; kapasite: number; mevcutluk: number };
}

export interface SinifFormData {
  sube_id: string;
  egitim_yili_id: string;
  ad: string;
  kod: string;
  kapasite: string;
  oda_id: string;
  sinif_seviyesi_id: string;
  aktif_mi: boolean;
}

// Tab Type
export type TabType = 'odalar' | 'siniflar';
