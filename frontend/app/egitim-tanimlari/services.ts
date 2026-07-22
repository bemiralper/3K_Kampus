// Şube Tanımları API Services

import { Oda, Sinif, OdaTur, OdaFormData, SinifFormData } from './types';
import { parseJsonResponse } from '@/lib/api';

const API_BASE = '/api';

// Helper: localStorage'daki context değerini oku (düz ID veya JSON nesne)
function readContextId(storageKey: string): string | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'number') return String(parsed);
    if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    if (parsed && typeof parsed === 'object' && 'id' in parsed && parsed.id != null) {
      return String(parsed.id);
    }
  } catch {
    // KurumContext düz ID string olarak kaydeder
    if (raw.trim()) return raw.trim();
  }
  return null;
}

// Helper function to get headers with context IDs
function getContextHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (typeof window !== 'undefined') {
    const kurumId = readContextId('3k_active_kurum');
    const subeId = readContextId('3k_active_sube');
    const egitimYiliId = readContextId('3k_active_egitim_yili');
    
    if (kurumId) headers['X-Kurum-ID'] = kurumId;
    if (subeId) headers['X-Sube-ID'] = subeId;
    if (egitimYiliId) headers['X-EgitimYili-ID'] = egitimYiliId;
  }
  
  return headers;
}

// ============ ODA API'leri ============

export async function getOdalar(subeId?: number): Promise<Oda[]> {
  let url = `${API_BASE}/odalar/api/`;
  if (subeId) {
    url += `?sube_id=${subeId}`;
  }
  
  const res = await fetch(url, { 
    credentials: 'include',
    headers: getContextHeaders(),
  });
  if (!res.ok) throw new Error('Odalar yüklenemedi');
  const data = await res.json();
  return data.odalar || [];
}

export async function getOdaTurleri(): Promise<OdaTur[]> {
  const res = await fetch(`${API_BASE}/odalar/api/turler/`, { 
    credentials: 'include',
    headers: getContextHeaders(),
  });
  if (!res.ok) throw new Error('Oda türleri yüklenemedi');
  const data = await res.json();
  return data.turler || [];
}

export async function createOda(formData: OdaFormData) {
  if (!formData.ad?.trim()) {
    throw new Error('Oda adı zorunludur');
  }

  const payload: Record<string, unknown> = {
    ad: formData.ad.trim(),
    kapasite: parseInt(formData.kapasite, 10) || 30,
    oda_turu: formData.oda_turu,
    aciklama: formData.aciklama,
    aktif_mi: formData.aktif_mi,
  };
  if (formData.sube_id) {
    const subeId = Number(formData.sube_id);
    if (Number.isFinite(subeId) && subeId > 0) {
      payload.sube_id = subeId;
    }
  }

  const res = await fetch(`${API_BASE}/odalar/api/create/`, {
    method: 'POST',
    headers: getContextHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(res, 'Oda oluşturulamadı');
}

export async function updateOda(id: number, formData: OdaFormData) {
  const res = await fetch(`${API_BASE}/odalar/api/${id}/update/`, {
    method: 'PUT',
    headers: getContextHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      ad: formData.ad,
      kapasite: parseInt(formData.kapasite, 10),
      oda_turu: formData.oda_turu,
      aciklama: formData.aciklama,
      aktif_mi: formData.aktif_mi,
    }),
  });

  return parseJsonResponse(res, 'Oda güncellenemedi');
}

export async function deleteOda(id: number) {
  const res = await fetch(`${API_BASE}/odalar/api/${id}/delete/`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getContextHeaders(),
  });

  return parseJsonResponse(res, 'Oda silinemedi');
}

// ============ SINIF API'leri ============

export async function getSiniflar(subeId?: number): Promise<Sinif[]> {
  let url = `${API_BASE}/siniflar/api/`;
  if (subeId) {
    url += `?sube_id=${subeId}`;
  }
  
  const res = await fetch(url, { 
    credentials: 'include',
    headers: getContextHeaders(),
  });
  if (!res.ok) throw new Error('Sınıflar yüklenemedi');
  const data = await res.json();
  return data.siniflar || [];
}

export async function createSinif(formData: SinifFormData) {
  // Validate required fields
  if (!formData.sube_id || !formData.egitim_yili_id || !formData.ad) {
    throw new Error('Şube, eğitim yılı ve sınıf adı zorunludur');
  }
  
  const payload = {
    sube_id: Number(formData.sube_id) || 0,
    egitim_yili_id: Number(formData.egitim_yili_id) || 0,
    ad: formData.ad,
    kod: formData.kod || '',
    kapasite: Number(formData.kapasite) || 30,
    oda_id: formData.oda_id ? Number(formData.oda_id) : null,
    sinif_seviyesi_id: formData.sinif_seviyesi_id ? Number(formData.sinif_seviyesi_id) : null,
    aktif_mi: formData.aktif_mi,
  };
  
  console.log('Creating sinif with payload:', payload);
  
  try {
    const res = await fetch(`${API_BASE}/siniflar/api/create/`, {
      method: 'POST',
      headers: getContextHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Sınıf oluşturulamadı (${res.status})`);
    }
    
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('createSinif error:', err);
    if (err instanceof TypeError && err.message.includes('Load failed')) {
      throw new Error('Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.');
    }
    throw err;
  }
}

export async function updateSinif(id: number, formData: SinifFormData) {
  const res = await fetch(`${API_BASE}/siniflar/api/${id}/update/`, {
    method: 'PUT',
    headers: getContextHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      sube_id: formData.sube_id ? parseInt(formData.sube_id) : null,
      egitim_yili_id: formData.egitim_yili_id ? parseInt(formData.egitim_yili_id) : null,
      ad: formData.ad,
      kod: formData.kod || '',
      kapasite: parseInt(formData.kapasite),
      oda_id: formData.oda_id ? parseInt(formData.oda_id) : null,
      sinif_seviyesi_id: formData.sinif_seviyesi_id ? parseInt(formData.sinif_seviyesi_id) : null,
      aktif_mi: formData.aktif_mi,
    }),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Sınıf güncellenemedi');
  return data;
}

export async function deleteSinif(id: number) {
  const res = await fetch(`${API_BASE}/siniflar/api/${id}/delete/`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getContextHeaders(),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Sınıf silinemedi');
  return data;
}

// ============ YARDIMCI API'ler ============

// Bu fonksiyonlar artık fallback olarak kullanılıyor
// Ana veriler KurumContext'ten alınıyor

export async function getSubeler(): Promise<{ id: number; ad: string }[]> {
  try {
    // Legacy API endpoint'ini kullan - subeler dahil
    const res = await fetch(`${API_BASE}/kurum-yonetimi/api/legacy/kurumlar/`, { 
      credentials: 'include',
      headers: getContextHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data?.subeler || [];
  } catch {
    return [];
  }
}

export async function getEgitimYillari(): Promise<{ id: number; yil_str?: string; ad?: string; aktif_mi?: boolean }[]> {
  try {
    // Legacy API endpoint'ini kullan - egitim_yillari dahil
    const res = await fetch(`${API_BASE}/kurum-yonetimi/api/legacy/kurumlar/`, { 
      credentials: 'include',
      headers: getContextHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data?.egitim_yillari || [];
  } catch {
    return [];
  }
}

export async function getSinifSeviyeleri(): Promise<{ id: number; ad: string }[]> {
  try {
    // Önce proxy üzerinden dene
    let res = await fetch(`${API_BASE}/egitim-tanimlari/api/sinif-seviyeleri/`, { 
      credentials: 'include',
      headers: getContextHeaders(),
    });
    
    // Redirect veya hata varsa direkt backend'e git
    if (!res.ok || res.redirected) {
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      res = await fetch(`${BACKEND_URL}/egitim-tanimlari/api/sinif-seviyeleri/`, { 
        credentials: 'include',
        headers: getContextHeaders(),
      });
    }
    
    if (!res.ok) {
      console.error('Sinif seviyeleri yüklenemedi:', res.status, res.statusText);
      return [];
    }
    
    const data = await res.json();
    console.log('Sinif seviyeleri data:', data);
    return data.sinif_seviyeleri || data || [];
  } catch (err) {
    console.error('Sinif seviyeleri fetch hatası:', err);
    return [];
  }
}

// ============ SINIF EXPORT ============

export type SinifExportFilters = {
  egitim_yili_id?: number;
  aktif?: "true" | "false";
};

function buildSinifExportParams(filters: SinifExportFilters, format: "csv" | "xlsx"): URLSearchParams {
  const params = new URLSearchParams();
  params.set("format", format);
  if (filters.egitim_yili_id) params.set("egitim_yili_id", String(filters.egitim_yili_id));
  if (filters.aktif) params.set("aktif", filters.aktif);
  return params;
}

async function downloadSinifExport(filters: SinifExportFilters, format: "csv" | "xlsx"): Promise<Blob> {
  const params = buildSinifExportParams(filters, format);
  const res = await fetch(`${API_BASE}/siniflar/api/export/?${params.toString()}`, {
    credentials: "include",
    headers: getContextHeaders(),
  });
  if (!res.ok) {
    throw new Error(format === "xlsx" ? "Excel dışa aktarma başarısız" : "CSV dışa aktarma başarısız");
  }
  return res.blob();
}

export async function downloadSinifExportCsv(filters: SinifExportFilters = {}): Promise<Blob> {
  return downloadSinifExport(filters, "csv");
}

export async function downloadSinifExportXlsx(filters: SinifExportFilters = {}): Promise<Blob> {
  return downloadSinifExport(filters, "xlsx");
}
