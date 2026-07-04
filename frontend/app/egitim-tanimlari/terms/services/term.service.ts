/**
 * Term Service - API Calls
 */

import { apiFetch, apiGet } from '@/lib/api';
import { Term, TermFormData, EgitimYili } from '../types';

type TermsListResponse = { terms: Term[] };
type ActiveYearResponse = {
  id: number;
  baslangic_yil: number;
  bitis_yil: number;
  aktif_mi: boolean;
  display: string;
};

function unwrapPayload<T>(data: unknown): T {
  if (data && typeof data === 'object' && 'data' in data) {
    return (data as { data: T }).data;
  }
  return data as T;
}

/**
 * Aktif eğitim yılını getir
 */
export async function getActiveYear(): Promise<EgitimYili | null> {
  const res = await apiGet<EgitimYili>('/api/terms/active-year/');
  if (!res.success || !res.data?.id) return null;
  return res.data;
}

/**
 * Dönem listesini getir
 */
export async function getTerms(): Promise<Term[]> {
  const res = await apiGet<TermsListResponse>('/api/terms/');
  if (!res.success) {
    throw new Error(res.error || 'Dönemler yüklenemedi');
  }
  const payload = res.data as TermsListResponse & { terms?: Term[] };
  return payload?.terms ?? [];
}

/**
 * Dönem detayı getir
 */
export async function getTerm(id: number): Promise<Term> {
  const res = await apiGet<Term>(`/api/terms/${id}/`);
  if (!res.success) {
    throw new Error(res.error || 'Dönem bulunamadı');
  }
  return unwrapPayload(res.data as Term);
}

/**
 * Yeni dönem oluştur
 */
export async function createTerm(formData: TermFormData): Promise<void> {
  const res = await apiFetch('/api/terms/create/', {
    method: 'POST',
    body: JSON.stringify(formData),
  });

  if (!res.success) {
    throw new Error(res.error || 'Dönem oluşturulamadı');
  }
}

/**
 * Dönem güncelle
 */
export async function updateTerm(id: number, formData: Partial<TermFormData>): Promise<void> {
  const res = await apiFetch(`/api/terms/${id}/update/`, {
    method: 'PATCH',
    body: JSON.stringify(formData),
  });

  if (!res.success) {
    throw new Error(res.error || 'Dönem güncellenemedi');
  }
}
