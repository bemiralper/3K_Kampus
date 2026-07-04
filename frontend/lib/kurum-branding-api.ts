/**
 * Kurum marka API
 */
import type { KurumBranding } from './kurum-branding';
import { mergeBranding } from './kurum-branding';

const BASE = '/kurum-yonetimi/api';

function resolveUrl(path: string): string {
  if (typeof window !== 'undefined') {
    if (path.startsWith('/api/')) return path;
    return `/api${path.startsWith('/') ? path : `/${path}`}`;
  }
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
  return `${backend}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function fetchKurumBrandingByKod(kod: string): Promise<{
  success: boolean;
  data?: KurumBranding;
  error?: string;
}> {
  try {
    const res = await fetch(resolveUrl(`${BASE}/branding/${encodeURIComponent(kod)}/`), {
      credentials: 'include',
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Marka bilgisi alınamadı' };
    }
    return { success: true, data: mergeBranding(json.data) };
  } catch {
    return { success: false, error: 'Bağlantı hatası' };
  }
}

export async function uploadKurumBrandingFile(
  kurumId: number,
  type: 'login-logo' | 'app-logo' | 'favicon',
  file: File,
): Promise<{ success: boolean; data?: KurumBranding; error?: string }> {
  const form = new FormData();
  const fieldMap = {
    'login-logo': 'login_logo',
    'app-logo': 'app_logo',
    'favicon': 'favicon',
  } as const;
  form.append(fieldMap[type], file);

  try {
    const res = await fetch(
      resolveUrl(`${BASE}/kurum/${kurumId}/branding/${type}/`),
      { method: 'POST', body: form, credentials: 'include' },
    );
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Yükleme başarısız' };
    }
    return { success: true, data: mergeBranding(json.data) };
  } catch {
    return { success: false, error: 'Yükleme hatası' };
  }
}
