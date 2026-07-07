import { apiFetch } from '@/lib/api';

export type KimlikRol = {
  tip: 'personel' | 'ogrenci' | 'veli';
  id: number;
  kisi_id?: number | null;
  ad?: string;
  soyad?: string;
  tam_ad?: string;
  subeler?: string[];
  aktif_mi?: boolean;
  egitim_yili?: string;
  sinif_seviyesi?: string;
  gorev_sube?: string;
  son_gorev_yili?: string;
  son_kayit_tarihi?: string;
  bagli_ogrenciler?: Array<{ id: number; ad: string; soyad: string; yakinlik?: string }>;
  ogrenci_sayisi?: number;
  telefon?: string;
  email?: string;
  has_user_account?: boolean;
  meslek?: string;
  veli_turu_display?: string;
};

export type KimlikResolveResponse = {
  found: boolean;
  detail?: string;
  kisi?: {
    id: number;
    ad: string;
    soyad: string;
    tam_ad: string;
    tc_kimlik_no: string;
    telefon: string;
    dogum_tarihi?: string;
    cinsiyet?: string;
    email?: string;
    adres?: string;
    il?: string;
    ilce?: string;
    aktif_mi?: boolean;
  };
  roller?: KimlikRol[];
  ortak_alanlar?: Record<string, string>;
  uyarilar?: string[];
  engellenen?: boolean;
  engellenen_mesaj?: string;
  eslesme?: 'tc' | 'telefon';
};

export type KimlikConflictItem = {
  tip: string;
  kurum_id: number;
  kurum_ad?: string;
  tc?: string;
  telefon?: string;
  kayitlar?: Array<{ model: string; id: number; ad: string; tc?: string }>;
  onerilen_aksiyon?: string;
};

export type KimlikConflictsResponse = {
  count: number;
  conflicts: KimlikConflictItem[];
};

export async function fetchKimlikConflicts() {
  return apiFetch<KimlikConflictsResponse>('/api/kimlik/conflicts/');
}

export async function resolveKimlik(params: {
  tc?: string;
  telefon?: string;
  context?: 'personel' | 'ogrenci' | 'veli';
  exclude_kisi_id?: number;
}) {
  const qs = new URLSearchParams();
  if (params.tc) qs.set('tc', params.tc);
  if (params.telefon) qs.set('telefon', params.telefon);
  if (params.context) qs.set('context', params.context);
  if (params.exclude_kisi_id) qs.set('exclude_kisi_id', String(params.exclude_kisi_id));
  return apiFetch<KimlikResolveResponse>(`/api/kimlik/resolve/?${qs.toString()}`);
}

export function pickPersonelRol(roller?: KimlikRol[]) {
  return roller?.find((r) => r.tip === 'personel');
}

export function pickVeliRol(roller?: KimlikRol[]) {
  return roller?.find((r) => r.tip === 'veli');
}

export function pickOgrenciRol(roller?: KimlikRol[]) {
  return roller?.find((r) => r.tip === 'ogrenci');
}
