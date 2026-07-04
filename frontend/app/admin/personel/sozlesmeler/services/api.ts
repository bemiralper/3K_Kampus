/* ═══════════════════════════════════════════
   Personel Sözleşmeleri — API Servisi
   ═══════════════════════════════════════════ */
import { apiGet, apiPost, apiPut, apiDelete, type ApiResponse } from '@/lib/api';
import type { Sozlesme, SozlesmeFormData, SozlesmeStats, Hakedis, HakedisStats, HelperData, AvansKaydi, PersonelOdemeGecmisi, GiderKategorisi, FesihData } from '../types';

const BASE = '/personel/api/sozlesmeler';

// ── Sözleşmeler ──

export async function fetchSozlesmeler(filters?: Record<string, string>): Promise<ApiResponse<Sozlesme[]>> {
  const params = new URLSearchParams(filters || {}).toString();
  return apiGet<Sozlesme[]>(`${BASE}/${params ? `?${params}` : ''}`);
}

export async function fetchSozlesme(id: number): Promise<ApiResponse<Sozlesme>> {
  return apiGet<Sozlesme>(`${BASE}/${id}/`);
}

export async function createSozlesme(data: SozlesmeFormData): Promise<ApiResponse<Sozlesme>> {
  return apiPost<Sozlesme>(`${BASE}/`, data);
}

export async function updateSozlesme(id: number, data: Partial<SozlesmeFormData>): Promise<ApiResponse<Sozlesme>> {
  return apiPut<Sozlesme>(`${BASE}/${id}/`, data);
}

export async function deleteSozlesme(id: number): Promise<ApiResponse<void>> {
  return apiDelete<void>(`${BASE}/${id}/`);
}

export async function changeSozlesmeDurum(id: number, durum: string, fesihData?: FesihData): Promise<ApiResponse<Sozlesme>> {
  return apiPost<Sozlesme>(`${BASE}/${id}/durum/`, { durum, ...fesihData });
}

export async function fetchSozlesmeStats(): Promise<ApiResponse<SozlesmeStats>> {
  return apiGet<SozlesmeStats>(`${BASE}/stats/`);
}

export async function fetchHelperData(): Promise<ApiResponse<HelperData>> {
  return apiGet<HelperData>(`${BASE}/helper-data/`);
}

// ── Hakedişler ──

export async function fetchHakedisler(yil?: number, ay?: number, durum?: string): Promise<ApiResponse<Hakedis[]>> {
  const params = new URLSearchParams();
  if (yil) params.set('yil', String(yil));
  if (ay) params.set('ay', String(ay));
  if (durum) params.set('durum', durum);
  const qs = params.toString();
  return apiGet<Hakedis[]>(`${BASE}/hakedis/${qs ? `?${qs}` : ''}`);
}

export async function fetchHakedis(id: number): Promise<ApiResponse<Hakedis>> {
  return apiGet<Hakedis>(`${BASE}/hakedis/${id}/`);
}

export async function createHakedis(data: Record<string, unknown>): Promise<ApiResponse<Hakedis>> {
  return apiPost<Hakedis>(`${BASE}/hakedis/`, data);
}

export async function updateHakedis(id: number, data: Record<string, unknown>): Promise<ApiResponse<Hakedis>> {
  return apiPut<Hakedis>(`${BASE}/hakedis/${id}/`, data);
}

export async function deleteHakedis(id: number): Promise<ApiResponse<void>> {
  return apiDelete<void>(`${BASE}/hakedis/${id}/`);
}

export async function onaylaHakedis(id: number): Promise<ApiResponse<Hakedis>> {
  return apiPost<Hakedis>(`${BASE}/hakedis/${id}/onayla/`, {});
}

export async function odendiHakedis(id: number, odeme_tarihi: string): Promise<ApiResponse<Hakedis>> {
  return apiPost<Hakedis>(`${BASE}/hakedis/${id}/odendi/`, { odeme_tarihi });
}

export async function topluHakedisOlustur(yil: number, ay: number): Promise<ApiResponse<{ olusturulan: number; hakedisler: Hakedis[] }>> {
  return apiPost<{ olusturulan: number; hakedisler: Hakedis[] }>(`${BASE}/hakedis/toplu-olustur/`, { yil, ay });
}

export async function fetchHakedisStats(yil: number, ay: number): Promise<ApiResponse<HakedisStats>> {
  return apiGet<HakedisStats>(`${BASE}/hakedis/stats/?yil=${yil}&ay=${ay}`);
}

// ── Raporlar ──

export interface YillikRaporAylik {
  ay: number;
  ay_adi: string;
  personel_sayisi: number;
  brut_toplam: number;
  net_toplam: number;
  ders_saat_toplam: number;
  ders_ucret_toplam: number;
  sabit_maas_toplam: number;
  prim_toplam: number;
  fazla_mesai_toplam: number;
  ek_odeme_toplam: number;
  avans_toplam: number;
  kesinti_toplam: number;
}

export interface YillikRapor {
  yil: number;
  aylik: YillikRaporAylik[];
  genel_brut: number;
  genel_net: number;
  genel_ders_saat: number;
  tur_dagilimi: { tur: string; toplam_brut: number; toplam_net: number; kisi_sayisi: number }[];
  durum_dagilimi: { durum: string; sayi: number; toplam: number }[];
}

export async function fetchYillikRapor(yil: number): Promise<ApiResponse<YillikRapor>> {
  return apiGet<YillikRapor>(`${BASE}/rapor/yillik/?yil=${yil}`);
}

// ── Avanslar ──

export async function fetchAvanslar(params?: { sozlesme_id?: number; personel_id?: number; yil?: number; ay?: number }): Promise<ApiResponse<AvansKaydi[]>> {
  const sp = new URLSearchParams();
  if (params?.sozlesme_id) sp.set('sozlesme_id', String(params.sozlesme_id));
  if (params?.personel_id) sp.set('personel_id', String(params.personel_id));
  if (params?.yil) sp.set('yil', String(params.yil));
  if (params?.ay) sp.set('ay', String(params.ay));
  const qs = sp.toString();
  return apiGet<AvansKaydi[]>(`${BASE}/avans/${qs ? `?${qs}` : ''}`);
}

export async function createAvans(data: Record<string, unknown>): Promise<ApiResponse<AvansKaydi>> {
  return apiPost<AvansKaydi>(`${BASE}/avans/`, data);
}

export async function updateAvans(id: number, data: Record<string, unknown>): Promise<ApiResponse<AvansKaydi>> {
  return apiPut<AvansKaydi>(`${BASE}/avans/${id}/`, data);
}

export async function deleteAvans(id: number): Promise<ApiResponse<void>> {
  return apiDelete<void>(`${BASE}/avans/${id}/`);
}

// ── Toplu İşlemler ──

export async function topluOnayla(ids: number[]): Promise<ApiResponse<{ onaylanan: number; hatalar: string[] }>> {
  return apiPost<{ onaylanan: number; hatalar: string[] }>(`${BASE}/hakedis/toplu-onayla/`, { ids });
}

export async function topluOdendi(ids: number[], odeme_tarihi: string): Promise<ApiResponse<{ odenen: number; hatalar: string[] }>> {
  return apiPost<{ odenen: number; hatalar: string[] }>(`${BASE}/hakedis/toplu-odendi/`, { ids, odeme_tarihi });
}

// ── Personel Detay ──

export async function fetchPersonelOdemeGecmisi(personelId: number): Promise<ApiResponse<PersonelOdemeGecmisi>> {
  return apiGet<PersonelOdemeGecmisi>(`${BASE}/personel/${personelId}/odeme-gecmisi/`);
}

// ── PDF Export ──

export function getBordroPdfTekilUrl(hakedisId: number): string {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
  return `${backendUrl}${BASE}/hakedis/${hakedisId}/pdf/`;
}

export function getBordroPdfTopluUrl(yil: number, ay: number): string {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
  return `${backendUrl}${BASE}/hakedis/pdf-toplu/?yil=${yil}&ay=${ay}`;
}

// ── Finans Entegrasyonu ──

export async function fetchGiderKategorileri(): Promise<ApiResponse<GiderKategorisi[]>> {
  return apiGet<GiderKategorisi[]>(`${BASE}/finans/gider-kategorileri/`);
}

export async function maasGiderKaydet(data: {
  yil: number;
  ay: number;
  gider_kategorisi_id: number;
  mali_hesap_id?: number;
  odeme_yontemi_id?: number;
  fatura_tarihi?: string;
}): Promise<ApiResponse<{ olusturulan: number; giderler: { id: number; personel: string; tutar: number }[]; toplam: number }>> {
  return apiPost<{ olusturulan: number; giderler: { id: number; personel: string; tutar: number }[]; toplam: number }>(`${BASE}/finans/gider-kaydet/`, data);
}
