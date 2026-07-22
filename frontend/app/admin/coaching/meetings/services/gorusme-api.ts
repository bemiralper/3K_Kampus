// ═══════════════════════════════════════════════════════════════
// Koçluk Görüşme Yönetimi — API Service Layer
// Admin MeetingsClient ve Koç Portalı drawer'ları ortak kullanır.
// İstekler lib/api.ts ile aynı: /api proxy + kurum context header'ları.
// ═══════════════════════════════════════════════════════════════

import { parseJsonResponse } from '@/lib/api';
import {
  GorusmeKaydiListItem,
  GorusmeKaydiDetail,
  GorusmeCreatePayload,
  GorusmeOzet,
  GorusmeAksiyon,
  GorusmeHatirlatma,
  KullaniciBilgi,
} from '../types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const STORAGE_KEYS = {
  activeKurum: '3k_active_kurum',
  activeSube: '3k_active_sube',
  activeEgitimYili: '3k_active_egitim_yili',
};

function readContextId(storageKey: string): string | null {
  if (typeof window === 'undefined') return null;
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
    if (raw.trim()) return raw.trim();
  }
  return null;
}

function getContextHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const headers: Record<string, string> = {};
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const subeId = readContextId(STORAGE_KEYS.activeSube);
  const egitimYiliId = readContextId(STORAGE_KEYS.activeEgitimYili);
  if (kurumId) headers['X-Kurum-ID'] = kurumId;
  if (subeId) headers['X-Sube-ID'] = subeId;
  if (egitimYiliId) headers['X-Egitim-Yili-ID'] = egitimYiliId;
  return headers;
}

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'lms_csrftoken') return value;
  }
  return null;
}

function coachingApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined') {
    return `/api/coaching${normalized}`;
  }
  return `${BACKEND_URL}/api/coaching${normalized}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const csrf = getCsrfToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getContextHeaders(),
    ...(options.headers as Record<string, string> || {}),
  };
  if (csrf && options.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method)) {
    headers['X-CSRFToken'] = csrf;
  }

  const res = await fetch(coachingApiUrl(path), { ...options, headers, credentials: 'include' });

  if (res.status === 204) return undefined as T;

  return parseJsonResponse<T>(res, 'Görüşme API isteği başarısız');
}

// ═══════════════════════════════════════════════════════════════
// DIŞA AKTARMA (Excel / CSV)
// ═══════════════════════════════════════════════════════════════

export type GorusmeExportFilters = {
  kurum_id?: string;
  durum?: string;
  gorusme_turu?: string;
  search?: string;
};

function buildExportParams(filters: GorusmeExportFilters, format: 'csv' | 'xlsx'): URLSearchParams {
  const params = new URLSearchParams();
  params.set('format', format);
  if (filters.kurum_id) params.set('kurum_id', filters.kurum_id);
  if (filters.durum) params.set('durum', filters.durum);
  if (filters.gorusme_turu) params.set('gorusme_turu', filters.gorusme_turu);
  if (filters.search) params.set('search', filters.search);
  return params;
}

async function downloadGorusmeExport(filters: GorusmeExportFilters, format: 'csv' | 'xlsx'): Promise<Blob> {
  const params = buildExportParams(filters, format);
  const res = await fetch(coachingApiUrl(`/gorusmeler/export/?${params}`), {
    credentials: 'include',
    headers: getContextHeaders(),
  });
  if (!res.ok) {
    throw new Error(format === 'xlsx' ? 'Excel dışa aktarma başarısız' : 'CSV dışa aktarma başarısız');
  }
  return res.blob();
}

export const gorusmeExportService = {
  downloadCsv(filters: GorusmeExportFilters): Promise<Blob> {
    return downloadGorusmeExport(filters, 'csv');
  },
  downloadXlsx(filters: GorusmeExportFilters): Promise<Blob> {
    return downloadGorusmeExport(filters, 'xlsx');
  },
};

// ═══════════════════════════════════════════════════════════════
// GÖRÜŞME SERVİSİ
// ═══════════════════════════════════════════════════════════════

export const gorusmeService = {
  list(params: Record<string, string>): Promise<GorusmeKaydiListItem[]> {
    const qs = new URLSearchParams(params);
    return request<GorusmeKaydiListItem[]>(`/gorusmeler/?${qs}`);
  },

  get(id: number): Promise<GorusmeKaydiDetail> {
    return request<GorusmeKaydiDetail>(`/gorusmeler/${id}/`);
  },

  create(payload: GorusmeCreatePayload): Promise<GorusmeKaydiDetail> {
    return request<GorusmeKaydiDetail>('/gorusmeler/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  update(id: number, payload: Partial<GorusmeCreatePayload>): Promise<GorusmeKaydiDetail> {
    return request<GorusmeKaydiDetail>(`/gorusmeler/${id}/`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  delete(id: number): Promise<void> {
    return request<void>(`/gorusmeler/${id}/`, { method: 'DELETE' });
  },

  durumGuncelle(id: number, durum: string): Promise<{ detail: string; durum: string; durum_display: string }> {
    return request(`/gorusmeler/${id}/durum/`, {
      method: 'POST',
      body: JSON.stringify({ durum }),
    });
  },

  ozet(params: Record<string, string>): Promise<GorusmeOzet> {
    const qs = new URLSearchParams(params);
    return request<GorusmeOzet>(`/gorusmeler/ozet/?${qs}`);
  },

  kullaniciBilgi(): Promise<KullaniciBilgi> {
    return request<KullaniciBilgi>('/gorusmeler/kullanici-bilgi/');
  },
};

export const aksiyonService = {
  list(gorusmeId: number): Promise<GorusmeAksiyon[]> {
    return request<GorusmeAksiyon[]>(`/gorusmeler/${gorusmeId}/aksiyonlar/`);
  },

  create(gorusmeId: number, payload: { aciklama: string; sorumlu?: string; deadline?: string | null }): Promise<GorusmeAksiyon> {
    return request<GorusmeAksiyon>(`/gorusmeler/${gorusmeId}/aksiyonlar/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  update(id: number, payload: Partial<GorusmeAksiyon>): Promise<GorusmeAksiyon> {
    return request<GorusmeAksiyon>(`/aksiyonlar/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  delete(id: number): Promise<void> {
    return request<void>(`/aksiyonlar/${id}/`, { method: 'DELETE' });
  },
};

export const hatirlatmaService = {
  create(gorusmeId: number, payload: { hatirlatma_tarihi: string; mesaj: string; tip?: string }): Promise<GorusmeHatirlatma> {
    return request<GorusmeHatirlatma>(`/gorusmeler/${gorusmeId}/hatirlatmalar/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  delete(id: number): Promise<void> {
    return request<void>(`/hatirlatmalar/${id}/`, { method: 'DELETE' });
  },
};
