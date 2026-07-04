/**
 * Görev Modülü — API Client
 * Backend: /gorev/api/
 */
import { apiGet, apiPost, apiPut, apiDelete, type ApiResponse } from './api';

const BASE = '/gorev/api';

export type GorevOncelik = 'KRITIK' | 'YUKSEK' | 'NORMAL' | 'DUSUK';
export type GorevDurum = 'BEKLIYOR' | 'BASLADI' | 'DEVAM_EDIYOR' | 'TAMAMLANDI' | 'TAMAMLANMADI' | 'IPTAL';
export type HedefTipi = 'KULLANICI' | 'ROL' | 'TUM_PERSONEL' | 'GRUP';

export interface GorevTipi {
  id: string;
  kod: string;
  ad: string;
  renk: string;
  ikon: string;
  is_system: boolean;
  is_active: boolean;
  sira: number;
}

export interface GorevAtama {
  id: string;
  gorev_id: string;
  atanan_user_id: number;
  atanan_ad?: string;
  durum: GorevDurum;
  ilk_acilma_at: string | null;
  baslama_at: string | null;
  tamamlanma_at: string | null;
  notlar: string;
  gorusuldu: boolean;
  gecikme_gun: number;
  gecikti_mi: boolean;
  gorev?: Gorev;
}

export interface Gorev {
  id: string;
  baslik: string;
  aciklama: string;
  oncelik: GorevOncelik;
  son_tarih: string;
  tahmini_sure_dk: number;
  tum_gun: boolean;
  hedef_tipi: HedefTipi;
  hedef_rol_kodu: string;
  hedef_user_ids: number[];
  kaynak_modul: string;
  kaynak_id: string;
  aksiyon_url: string;
  renk: string;
  gorev_tipi: GorevTipi | null;
  gorev_tipi_id: string;
  atamalar?: GorevAtama[];
  created_at: string;
  ekran_mesaji?: boolean;
}

export interface GorevDashboardOzet {
  bugun: number;
  geciken: number;
  bekleyen: number;
  tamamlanan: number;
  tip_sayaclari: Record<string, number>;
  role: string | null;
}

export interface FCEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  extendedProps: Record<string, unknown>;
}

export const ONCELIK_LABELS: Record<GorevOncelik, string> = {
  KRITIK: 'Kritik',
  YUKSEK: 'Yüksek',
  NORMAL: 'Normal',
  DUSUK: 'Düşük',
};

export const DURUM_LABELS: Record<GorevDurum, string> = {
  BEKLIYOR: 'Bekliyor',
  BASLADI: 'Başladı',
  DEVAM_EDIYOR: 'Devam Ediyor',
  TAMAMLANDI: 'Tamamlandı',
  TAMAMLANMADI: 'Tamamlanamadı',
  IPTAL: 'İptal',
};

/** Admin takip ekranı — yapıldı / yapılmadı odaklı etiketler */
export const YAPILMA_LABELS: Record<GorevDurum, string> = {
  BEKLIYOR: 'Bekliyor',
  BASLADI: 'Devam ediyor',
  DEVAM_EDIYOR: 'Devam ediyor',
  TAMAMLANDI: 'Yapıldı',
  TAMAMLANMADI: 'Yapılmadı',
  IPTAL: 'İptal',
};

export const HEDEF_LABELS: Record<HedefTipi, string> = {
  KULLANICI: 'Kişi',
  ROL: 'Rol / Grup',
  TUM_PERSONEL: 'Tüm Personel',
  GRUP: 'Grup',
};

export async function fetchGorevler(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiGet<Gorev[]>(`${BASE}/gorevler/${qs}`);
}

export async function fetchGorevDetail(id: string) {
  return apiGet<Gorev>(`${BASE}/gorevler/${id}/`);
}

export async function createGorev(data: Partial<Gorev> & { baslik: string; son_tarih: string; gorev_tipi_id?: string }) {
  return apiPost<Gorev>(`${BASE}/gorevler/`, data);
}

export async function updateGorev(id: string, data: Partial<Gorev>) {
  return apiPut<Gorev>(`${BASE}/gorevler/${id}/`, data);
}

export async function deleteGorev(id: string) {
  return apiDelete(`${BASE}/gorevler/${id}/`);
}

export async function fetchAtamalar(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiGet<GorevAtama[]>(`${BASE}/atamalar/${qs}`);
}

export interface GorevFilterAssignee {
  user_id: number;
  ad: string;
}

export async function fetchGorevFilterOptions() {
  return apiGet<GorevFilterAssignee[]>(`${BASE}/atamalar/filtre-secenekleri/`);
}

export async function fetchAtamaDetail(id: string) {
  return apiGet<GorevAtama>(`${BASE}/atamalar/${id}/`);
}

export async function updateAtama(id: string, data: Partial<GorevAtama>) {
  return apiPut<GorevAtama>(`${BASE}/atamalar/${id}/`, data);
}

export async function fetchGorevTipleri(all = false) {
  return apiGet<GorevTipi[]>(`${BASE}/tipler/${all ? '?all=true' : ''}`);
}

export async function seedGorevTipleri() {
  return apiPost<GorevTipi[]>(`${BASE}/tipler/seed/`, {});
}

export async function fetchGorevDashboardOzet() {
  return apiGet<GorevDashboardOzet>(`${BASE}/dashboard-ozet/`);
}

export async function fetchGorevTakvim(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiGet<FCEvent[]>(`${BASE}/takvim/${qs}`);
}

export type TekrarTipi =
  | 'GUNLUK' | 'HAFTALIK_PAZARTESI' | 'HAFTALIK_CUMA' | 'HAFTALIK'
  | 'AYLIK_GUN' | 'AY_SONU';

export interface GorevTekrarSablonu {
  id: string;
  baslik: string;
  aciklama: string;
  oncelik: GorevOncelik;
  tahmini_sure_dk: number;
  tum_gun: boolean;
  hedef_tipi: HedefTipi;
  hedef_rol_kodu: string;
  hedef_user_ids: number[];
  tekrar_tipi: TekrarTipi;
  tekrar_gun: number | null;
  sonraki_uretim_tarihi: string;
  aktif: boolean;
  gorev_tipi_id: string;
  gorev_tipi: GorevTipi | null;
}

export const TEKRAR_LABELS: Record<TekrarTipi, string> = {
  GUNLUK: 'Her Gün',
  HAFTALIK_PAZARTESI: 'Her Pazartesi',
  HAFTALIK_CUMA: 'Her Cuma',
  HAFTALIK: 'Her Hafta',
  AYLIK_GUN: 'Her Ayın Belirli Günü',
  AY_SONU: 'Ay Sonu',
};

export async function fetchTekrarSablonlari() {
  return apiGet<GorevTekrarSablonu[]>(`${BASE}/tekrar-sablonlari/`);
}

export async function createTekrarSablonu(data: Partial<GorevTekrarSablonu> & { baslik: string; gorev_tipi_id: string; sonraki_uretim_tarihi: string }) {
  return apiPost<GorevTekrarSablonu>(`${BASE}/tekrar-sablonlari/`, data);
}

export async function updateTekrarSablonu(id: string, data: Partial<GorevTekrarSablonu>) {
  return apiPut<GorevTekrarSablonu>(`${BASE}/tekrar-sablonlari/${id}/`, data);
}

export async function deleteTekrarSablonu(id: string) {
  return apiDelete(`${BASE}/tekrar-sablonlari/${id}/`);
}

export interface GorevAnalitikOzet {
  toplam: number;
  tamamlanan: number;
  geciken: number;
  hic_acilmayan: number;
  devam_eden: number;
  iptal: number;
  ortalama_tamamlama_saat: number;
  tamamlama_orani: number;
}

export interface GorevPersonelPerformans {
  user_id: number;
  ad: string;
  rol: string;
  toplam: number;
  tamamlanan: number;
  geciken: number;
  hic_acilmayan: number;
  ortalama_tamamlama_saat: number;
  tamamlama_orani: number;
}

export interface GorevAnalitik {
  ozet: GorevAnalitikOzet;
  personel_performans: GorevPersonelPerformans[];
  en_cok_geciken: GorevPersonelPerformans[];
  rol_kirilimi: { rol: string; toplam: number; tamamlanan: number; geciken: number }[];
  son_gorevler: {
    atama_id: string;
    baslik: string;
    atanan: string;
    durum: string;
    gecikti_mi: boolean;
    ilk_acilma_at: string | null;
    tamamlanma_at: string | null;
    son_tarih: string | null;
    gorev_tipi: string;
  }[];
}

export async function fetchGorevAnalitik(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiGet<GorevAnalitik>(`${BASE}/analitik/${qs}`);
}

export function formatGorevTarih(iso: string, tumGun = false): string {
  const d = new Date(iso);
  if (tumGun) {
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return d.toLocaleString('tr-TR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
