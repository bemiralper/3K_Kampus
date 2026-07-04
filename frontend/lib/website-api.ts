import { fetchJson } from '@/lib/fetchJson';
import type { KurumBranding } from '@/lib/kurum-branding';

const BASE = '/website/api';
const ADMIN_BASE = '/website-yonetimi/api';

/** Tarayıcıda Next.js proxy (/api/...), SSR'da doğrudan Django backend */
function resolveUrl(path: string): string {
  if (typeof window !== 'undefined') {
    if (path.startsWith('/api/')) return path;
    return `/api${path.startsWith('/') ? path : `/${path}`}`;
  }
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
  return `${backend}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Django medya URL'sini frontend proxy ile uyumlu hale getirir */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/media/')) return url;
  const idx = url.indexOf('/media/');
  if (idx >= 0) return url.slice(idx);
  return url;
}

export type SiteSettings = {
  telefon?: string;
  whatsapp?: string;
  eposta?: string;
  adres?: string;
  calisma_saatleri?: string;
  hero_baslik?: string;
  hero_alt_baslik?: string;
  hero_slogan?: string;
  hero_maddeler?: string[];
  tanitim_baslik?: string;
  tanitim_icerik?: string;
  youtube_video_id?: string;
  harita_embed_url?: string;
  footer_copyright?: string;
  seo_baslik?: string;
  seo_aciklama?: string;
};

export type SocialLink = { id: number; platform: string; url: string; sira: number; aktif: boolean };
export type FooterLink = { id: number; kolon: string; etiket: string; url: string; sira: number; aktif: boolean };
export type HeroSlide = { id: number; gorsel_url: string | null; sira: number; aktif: boolean };
export type Duyuru = {
  id: number; baslik: string; slug: string; ozet: string;
  kapak_gorseli_url?: string | null; yayin_tarihi?: string | null; sira: number;
  icerik?: string;
};
export type SinavTakvim = {
  id: number; tur: string; tarih: string; saat?: string | null;
  kapsam: string; baslik: string; yayin_adi?: string; aciklama: string; gorsel_url?: string | null;
};
export type NedenKart = { id: number; ikon: string; baslik: string; aciklama: string; sira: number };
export type BasariIstatistik = { id: number; etiket: string; deger: string; sira: number };
export type OgrenciYorumu = { id: number; ad: string; rol: string; puan: number; yorum: string; sira: number };
export type SSSItem = { id: number; soru: string; cevap: string; sira: number };
export type YasalOzet = { tur: string; baslik: string };
export type YasalMetin = { id: number; tur: string; baslik: string; icerik: string; updated_at: string };

export type LandingData = {
  kurum: KurumBranding & { id?: number; kod?: string; ad?: string };
  settings: SiteSettings | null;
  social_links: SocialLink[];
  footer_links: FooterLink[];
  hero_slides: HeroSlide[];
  duyurular: Duyuru[];
  sinav_takvimi: SinavTakvim[];
  neden_kartlari: NedenKart[];
  basari_istatistikleri: BasariIstatistik[];
  ogrenci_yorumlari: OgrenciYorumu[];
  sss: SSSItem[];
  yasal_metinler: YasalOzet[];
};

type ApiResponse<T> = { success: boolean; data?: T; error?: string; message?: string; kurum_id?: number };

const LANDING_CACHE_TTL_MS = 30_000;
const landingCache = new Map<
  string,
  { data: LandingData | null; ts: number; promise?: Promise<LandingData | null> }
>();

export async function fetchLandingData(kod = '3K'): Promise<LandingData | null> {
  const now = Date.now();
  const cached = landingCache.get(kod);
  if (cached?.promise) return cached.promise;
  if (cached && now - cached.ts < LANDING_CACHE_TTL_MS) return cached.data;

  const promise = (async () => {
    const fetchOpts =
      typeof window === 'undefined'
        ? { next: { revalidate: 60 } }
        : { cache: 'no-store' as const };
    const res = await fetchJson<ApiResponse<LandingData>>(
      resolveUrl(`${BASE}/public/${encodeURIComponent(kod)}/`),
      fetchOpts,
    );
    const data = res.data?.data ?? null;
    landingCache.set(kod, { data, ts: Date.now() });
    return data;
  })();

  landingCache.set(kod, {
    data: cached?.data ?? null,
    ts: cached?.ts ?? 0,
    promise,
  });

  try {
    return await promise;
  } finally {
    const entry = landingCache.get(kod);
    if (entry?.promise === promise) {
      landingCache.set(kod, { data: entry.data, ts: entry.ts });
    }
  }
}

export async function fetchDuyuruDetail(kod: string, slug: string): Promise<Duyuru | null> {
  const res = await fetchJson<ApiResponse<Duyuru>>(
    resolveUrl(`${BASE}/public/${encodeURIComponent(kod)}/duyurular/${slug}/`),
    { cache: 'no-store' },
  );
  return res.data?.data ?? null;
}

export async function fetchYasalDetail(kod: string, tur: string): Promise<YasalMetin | null> {
  const res = await fetchJson<ApiResponse<YasalMetin>>(
    resolveUrl(`${BASE}/public/${encodeURIComponent(kod)}/yasal/${tur}/`),
    { cache: 'no-store' },
  );
  return res.data?.data ?? null;
}

export async function submitIletisimForm(kod: string, payload: { ad_soyad: string; telefon: string; mesaj: string }) {
  const res = await fetch(resolveUrl(`${BASE}/public/${encodeURIComponent(kod)}/iletisim/`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<ApiResponse<unknown>>;
}

// Admin API

async function adminFetch<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(resolveUrl(`${ADMIN_BASE}${path}`), { credentials: 'include', ...init });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    return {
      success: false,
      error: res.ok
        ? 'Sunucudan geçersiz yanıt alındı'
        : `İstek başarısız (${res.status})${text.includes('<!DOCTYPE') ? '' : `: ${text.slice(0, 120)}`}`,
    };
  }
  try {
    return await res.json();
  } catch {
    return { success: false, error: 'Yanıt JSON olarak okunamadı' };
  }
}

/** Boş tarih/metin alanlarını API için temizle */
export function cleanWebsiteFormPayload(data: Record<string, string | number | boolean | null | undefined>) {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === '' || value === undefined) {
      if (key.includes('tarih') || key === 'saat') out[key] = null;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export const websiteAdminApi = {
  getLanding: () => adminFetch<LandingData>('/landing/'),
  getSettings: () => adminFetch<SiteSettings>('/settings/'),
  updateSettings: (data: Partial<SiteSettings>) =>
    adminFetch<SiteSettings>('/settings/', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  list: <T>(resource: string) => adminFetch<T[]>(`/${resource}/`),
  create: <T>(resource: string, data: unknown) =>
    adminFetch<T>(`/${resource}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanWebsiteFormPayload(data as Record<string, string | number | boolean | null | undefined>)),
    }),
  update: <T>(resource: string, id: number, data: unknown) =>
    adminFetch<T>(`/${resource}/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanWebsiteFormPayload(data as Record<string, string | number | boolean | null | undefined>)),
    }),
  remove: (resource: string, id: number) =>
    adminFetch<unknown>(`/${resource}/${id}/`, { method: 'DELETE' }),
  upload: (resource: string, id: number, file: File, field = 'gorsel') => {
    const fd = new FormData();
    fd.append(field, file);
    return adminFetch<unknown>(`/${resource}/${id}/upload/`, { method: 'POST', body: fd });
  },
};
