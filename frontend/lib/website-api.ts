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

/** Django medya URL'sini frontend proxy ile uyumlu hale getirir; cacheKey ile tarayıcı önbelleğini kırar */
export function resolveMediaUrl(url: string | null | undefined, cacheKey?: string | null): string | null {
  if (!url) return null;
  let resolved = url;
  if (url.startsWith('/media/')) resolved = url;
  else {
    const idx = url.indexOf('/media/');
    if (idx >= 0) resolved = url.slice(idx);
    else resolved = url;
  }
  if (!cacheKey) return resolved;
  const base = resolved.split('?')[0];
  return `${base}?v=${encodeURIComponent(cacheKey)}`;
}

export type LandingFeatureCard = {
  id: string;
  badge?: string;
  title: string;
  accent?: string;
  description?: string;
  highlights?: string[];
};

export type DersFormatlariConfig = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  footer_note?: string;
  cards?: LandingFeatureCard[];
};

export type LandingBolum = {
  id: string;
  section_id?: string;
  kart_adi?: string;
  kart_ikon?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  footer_note?: string;
  cards: LandingFeatureCard[];
};

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
  hero_rotating_words?: string[];
  hero_gallery?: { url: string; caption?: string }[];
  neden_baslik?: string;
  neden_alt_baslik?: string;
  ders_formatlari_config?: DersFormatlariConfig;
  landing_bolumleri?: LandingBolum[];
  landing_section_order?: string[];
  landing_sections_hidden?: string[];
  yorumlar_goster?: boolean;
  sss_goster?: boolean;
  settings_updated_at?: string | null;
  tanitim_baslik?: string;
  tanitim_icerik?: string;
  youtube_video_id?: string;
  harita_embed_url?: string;
  footer_copyright?: string;
  footer_baslik?: string;
  footer_aciklama?: string;
  footer_marka_metni?: string;
  seo_baslik?: string;
  seo_aciklama?: string;
  seo_anahtar_kelimeler?: string;
  seo_canonical_url?: string;
  google_site_verification?: string;
  google_analytics_id?: string;
  seo_robots_index?: boolean;
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
  id: number; tur: string; tarih: string;
  saat?: string | null; saat_bitis?: string | null;
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

type ApiResponse<T> = { success: boolean; data?: T; error?: string; message?: string; kurum_id?: number; kurum_kod?: string; kurum_ad?: string };

const LANDING_CACHE_TTL_MS = 30_000;
const landingCache = new Map<
  string,
  { data: LandingData | null; ts: number; promise?: Promise<LandingData | null> }
>();

/** Admin kaydı sonrası anasayfa önbelleğini temizle */
export async function invalidateLandingCache(kod = '3K') {
  landingCache.delete(kod);
  if (typeof window !== 'undefined') {
    try {
      await fetch('/api/revalidate-landing', { method: 'POST' });
    } catch {
      /* SSR revalidate isteği başarısız olabilir — client cache yine temizlendi */
    }
  }
}

export async function fetchLandingData(kod = '3K'): Promise<LandingData | null> {
  const now = Date.now();
  const cached = landingCache.get(kod);
  if (cached?.promise) return cached.promise;
  if (cached && now - cached.ts < LANDING_CACHE_TTL_MS) return cached.data;

  const promise = (async () => {
    const res = await fetchJson<ApiResponse<LandingData>>(
      resolveUrl(`${BASE}/public/${encodeURIComponent(kod)}/`),
      { cache: 'no-store' },
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
  let res: Response;
  try {
    res = await fetch(resolveUrl(`${ADMIN_BASE}${path}`), { credentials: 'include', ...init });
  } catch {
    // Ağ hatası — panellerin çökmesini önle, kullanıcıya anlaşılır mesaj göster
    return { success: false, error: 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.' };
  }
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
      if (key.includes('tarih') || key === 'saat' || key === 'saat_bitis') out[key] = null;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export const websiteAdminApi = {
  getLanding: () => adminFetch<LandingData>('/landing/'),
  seedDefaults: (overwrite = false) =>
    adminFetch<LandingData>(overwrite ? '/seed-defaults/?overwrite=1' : '/seed-defaults/', { method: 'POST' }),
  getSettings: () => adminFetch<SiteSettings>('/settings/'),
  updateSettings: async (data: Partial<SiteSettings>) => {
    const res = await adminFetch<SiteSettings>('/settings/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.success) await invalidateLandingCache();
    return res;
  },
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

// ─── CMS v2 Admin + Public ───────────────────────────────────

const V2_ADMIN = '/v2';

export type CmsBlock = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style?: Record<string, unknown>;
};

export type CmsPage = {
  id: number;
  title: string;
  slug: string;
  status: string;
  template?: string;
  locale?: string;
  show_in_menu?: boolean;
  show_breadcrumb?: boolean;
  is_homepage?: boolean;
  publish_at?: string | null;
  unpublish_at?: string | null;
  parent_id?: number | null;
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string;
  canonical_url?: string;
  robots_index?: boolean;
  robots_follow?: boolean;
  og_title?: string;
  og_description?: string;
  og_image?: string;
  twitter_card?: string;
  schema_json?: Record<string, unknown>;
  sitemap_include?: boolean;
  sitemap_priority?: number;
  published_version?: number | null;
  preview_token?: string;
  updated_at?: string | null;
  created_at?: string | null;
  blocks?: CmsBlock[];
  version?: number;
  version_id?: number | null;
};

export type CmsDashboard = {
  totals: Record<string, number>;
  recent_pages: CmsPage[];
  seo_warnings: Array<{ level?: string; message: string; page_id?: number; code?: string }>;
  health: Record<string, boolean>;
};

export type CmsMediaAsset = {
  id: number;
  title: string;
  kind: string;
  folder: string;
  url: string | null;
  mime_type?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  alt_text?: string;
  caption?: string;
  description?: string;
  tags?: string[];
  seo_filename?: string;
  usage_refs?: unknown[];
  variants?: Array<{ format: string; width: number; url: string | null }>;
  created_at?: string | null;
};

export type CmsNavItem = {
  id: number;
  parent_id?: number | null;
  label: string;
  url: string;
  page_id?: number | null;
  icon?: string;
  badge?: string;
  description?: string;
  open_in_new_tab?: boolean;
  is_mega?: boolean;
  sira: number;
  aktif: boolean;
  children?: CmsNavItem[];
};

export type CmsMenu = {
  id: number;
  name: string;
  location: string;
  aktif: boolean;
  items: CmsNavItem[];
};

export type CmsTheme = {
  logo_url?: string;
  favicon_url?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  font_heading?: string;
  font_body?: string;
  border_radius?: string;
  button_style?: string;
  card_style?: string;
  header_config?: Record<string, unknown>;
  footer_config?: Record<string, unknown>;
  css_variables?: Record<string, unknown>;
  custom_css?: string;
  dark_mode_enabled?: boolean;
};

export type CmsIntegrations = Record<string, unknown> & {
  search_console_html_filename?: string;
  search_console_html_uploaded?: boolean;
  search_console_verification?: string;
};

export type CmsRedirect = {
  id: number;
  source_path: string;
  target_path: string;
  redirect_type: string;
  aktif: boolean;
  hit_count?: number;
};

export type CmsForm = {
  id: number;
  name: string;
  slug: string;
  description?: string;
  fields?: unknown[];
  settings?: Record<string, unknown>;
  aktif: boolean;
  submission_count?: number;
};

export type CmsFormSubmission = {
  id: number;
  payload: Record<string, unknown>;
  created_at?: string | null;
};

export type CmsContentEntry = {
  id: number;
  kind: string;
  title: string;
  slug: string;
  excerpt?: string;
  status: string;
  is_featured?: boolean;
  is_pinned?: boolean;
  cover_url?: string;
  sira?: number;
  publish_at?: string | null;
  view_count?: number;
  // full detay
  body?: string;
  author_name?: string;
  meta_title?: string;
  meta_description?: string;
  show_as_popup?: boolean;
};

export type CmsPublicPagePayload = {
  page: CmsPage;
  menu?: { id: number; name: string; items: CmsNavItem[] } | null;
  footer_menu?: { id: number; name: string; items: CmsNavItem[] } | null;
  theme?: Partial<CmsTheme>;
  integrations?: Record<string, string>;
  contact?: Record<string, string>;
};

export type CmsBlockTypeMeta = {
  type: string;
  label: string;
  category: string;
  defaults: Record<string, unknown>;
  defaultStyle: Record<string, unknown>;
};

export type CmsPageVersion = {
  id: number;
  version: number;
  label?: string;
  is_autosave?: boolean;
  created_at?: string | null;
  block_count?: number;
};

export type CmsSeoScore = {
  score?: number;
  warnings?: Array<{ message: string; level?: string }>;
  [key: string]: unknown;
};

async function v2Fetch<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  return adminFetch<T>(`${V2_ADMIN}${path}`, init);
}

function v2Json(method: string, data?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  };
}

export const websiteCmsV2Api = {
  getDashboard: () => v2Fetch<CmsDashboard>('/dashboard/'),
  listBlockTypes: () => v2Fetch<CmsBlockTypeMeta[]>('/block-types/'),
  listPages: (status?: string) =>
    v2Fetch<CmsPage[]>(status ? `/pages/?status=${encodeURIComponent(status)}` : '/pages/'),
  getPage: (id: number, version?: number) =>
    v2Fetch<CmsPage>(
      version != null ? `/pages/${id}/?version=${version}` : `/pages/${id}/`,
    ),
  createPage: (data: Partial<CmsPage> & { title: string; blocks?: CmsBlock[] }) =>
    v2Fetch<CmsPage>('/pages/', v2Json('POST', data)),
  updatePage: (id: number, data: Partial<CmsPage> & { blocks?: CmsBlock[]; autosave?: boolean }) =>
    v2Fetch<CmsPage>(`/pages/${id}/`, v2Json('PATCH', data)),
  publishPage: (id: number, version?: number) =>
    v2Fetch<CmsPage>(`/pages/${id}/publish/`, v2Json('POST', version != null ? { version } : {})),
  listVersions: (id: number) => v2Fetch<CmsPageVersion[]>(`/pages/${id}/versions/`),
  seoScore: (id: number) => v2Fetch<CmsSeoScore>(`/pages/${id}/seo-score/`),
  duplicatePage: (id: number) => v2Fetch<CmsPage>(`/pages/${id}/duplicate/`, v2Json('POST', {})),
  deletePage: (id: number) => v2Fetch<{ deleted: boolean }>(`/pages/${id}/`, { method: 'DELETE' }),

  listMedia: (params?: { folder?: string; q?: string; unused?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.folder) qs.set('folder', params.folder);
    if (params?.q) qs.set('q', params.q);
    if (params?.unused) qs.set('unused', '1');
    const q = qs.toString();
    return v2Fetch<CmsMediaAsset[]>(q ? `/media/?${q}` : '/media/');
  },
  uploadMedia: (file: File, meta?: { title?: string; alt_text?: string; folder?: string }) => {
    const fd = new FormData();
    fd.append('file', file);
    if (meta?.title) fd.append('title', meta.title);
    if (meta?.alt_text) fd.append('alt_text', meta.alt_text);
    if (meta?.folder) fd.append('folder', meta.folder);
    return v2Fetch<CmsMediaAsset>('/media/', { method: 'POST', body: fd });
  },
  updateMedia: (id: number, data: Partial<CmsMediaAsset>) =>
    v2Fetch<CmsMediaAsset>(`/media/${id}/`, v2Json('PATCH', data)),
  deleteMedia: (id: number) =>
    v2Fetch<{ deleted: boolean }>(`/media/${id}/`, { method: 'DELETE' }),

  listMenus: () => v2Fetch<CmsMenu[]>('/menus/'),
  createMenu: (data: { name?: string; location?: string; aktif?: boolean }) =>
    v2Fetch<CmsMenu>('/menus/', v2Json('POST', data)),
  createMenuItem: (menuId: number, data: Partial<CmsNavItem>) =>
    v2Fetch<CmsNavItem>(`/menus/${menuId}/items/`, v2Json('POST', data)),
  updateMenuItem: (menuId: number, data: Partial<CmsNavItem> & { id: number }) =>
    v2Fetch<CmsNavItem>(`/menus/${menuId}/items/`, v2Json('PATCH', data)),
  deleteMenuItem: (menuId: number, id: number) =>
    v2Fetch<{ deleted: boolean }>(`/menus/${menuId}/items/`, v2Json('DELETE', { id })),
  reorderMenuItems: (menuId: number, items: Array<{ id: number; parent_id?: number | null; sira: number }>) =>
    v2Fetch<{ reordered: boolean }>(`/menus/${menuId}/items/`, v2Json('POST', { reorder: true, items })),

  getTheme: () => v2Fetch<CmsTheme>('/theme/'),
  patchTheme: (data: Partial<CmsTheme>) => v2Fetch<{ saved: boolean }>('/theme/', v2Json('PATCH', data)),
  getIntegrations: () => v2Fetch<CmsIntegrations>('/integrations/'),
  patchIntegrations: (data: CmsIntegrations) =>
    v2Fetch<{ saved: boolean }>('/integrations/', v2Json('PATCH', data)),
  testIntegration: (service: string) =>
    v2Fetch<{ service: string; ok: boolean; detail: string }>(
      '/integrations/test/',
      v2Json('POST', { service }),
    ),
  uploadSearchConsoleFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return v2Fetch<{ filename: string; url: string; search_console_verification?: string }>(
      '/integrations/search-console-file/',
      { method: 'POST', body: fd },
    );
  },
  deleteSearchConsoleFile: () =>
    v2Fetch<{ deleted: boolean }>('/integrations/search-console-file/', { method: 'DELETE' }),

  listRedirects: () => v2Fetch<CmsRedirect[]>('/redirects/'),
  createRedirect: (data: { source_path: string; target_path?: string; redirect_type?: string; aktif?: boolean }) =>
    v2Fetch<{ id: number }>('/redirects/', v2Json('POST', data)),

  listForms: () => v2Fetch<CmsForm[]>('/forms/'),
  createForm: (data: { name: string; slug?: string; description?: string; fields?: unknown[]; settings?: Record<string, unknown>; aktif?: boolean }) =>
    v2Fetch<{ id: number; slug: string }>('/forms/', v2Json('POST', data)),
  listSubmissions: (formId: number) =>
    v2Fetch<CmsFormSubmission[]>(`/forms/${formId}/submissions/`),

  listContent: (kind?: string) =>
    v2Fetch<CmsContentEntry[]>(kind ? `/content/?kind=${encodeURIComponent(kind)}` : '/content/'),
  createContent: (data: Partial<CmsContentEntry> & { title: string }) =>
    v2Fetch<{ id: number; slug: string }>('/content/', v2Json('POST', data)),
  getContent: (id: number) => v2Fetch<CmsContentEntry>(`/content/${id}/`),
  updateContent: (id: number, data: Partial<CmsContentEntry>) =>
    v2Fetch<CmsContentEntry>(`/content/${id}/`, v2Json('PATCH', data)),
  deleteContent: (id: number) =>
    v2Fetch<{ deleted: boolean }>(`/content/${id}/`, { method: 'DELETE' }),
  reorderContent: (items: Array<{ id: number; sira: number }>) =>
    v2Fetch<{ reordered: boolean }>('/content/', v2Json('POST', { reorder: true, items })),

  migrateLegacy: (force = false) =>
    v2Fetch<Record<string, unknown>>('/migrate-legacy/', v2Json('POST', { force })),
  ensureHealth: (ga4Id?: string) =>
    v2Fetch<{
      ok: boolean;
      changes: string[];
      preview?: Record<string, unknown>;
      error?: string;
    }>('/ensure-health/', v2Json('POST', ga4Id ? { ga4_id: ga4Id } : {})),
  bootstrapContent: (forceHome = true) =>
    v2Fetch<{
      ok: boolean;
      homepage_id?: number;
      homepage_updated?: boolean;
      pages_updated?: string[];
      legal_pages?: number;
      form_slug?: string;
      error?: string;
    }>('/bootstrap-content/', v2Json('POST', { force_home: forceHome })),
  seoWarnings: () =>
    v2Fetch<Array<{ level?: string; message: string; page_id?: number; code?: string }>>('/seo-warnings/'),

  fetchPublicPage: async (kod: string, slug?: string): Promise<CmsPublicPagePayload | null> => {
    const path = slug && slug !== 'home' && slug !== ''
      ? `${BASE}/public/${encodeURIComponent(kod)}/v2/page/${encodeURIComponent(slug)}/`
      : `${BASE}/public/${encodeURIComponent(kod)}/v2/page/`;
    const fetchOpts =
      typeof window === 'undefined'
        ? { next: { revalidate: 60 } }
        : { cache: 'no-store' as const };
    try {
      const res = await fetchJson<ApiResponse<CmsPublicPagePayload>>(resolveUrl(path), fetchOpts);
      return res.data?.data ?? null;
    } catch {
      return null;
    }
  },
};
