/**
 * Kurum marka (white-label) — tipler, varsayılanlar, tema uygulama
 */

export type KurumBranding = {
  id?: number;
  kod?: string;
  ad?: string;
  gorunen_ad: string;
  slogan: string;
  login_logo_url: string | null;
  app_logo_url: string | null;
  favicon_url: string | null;
  login_arkaplan_rengi: string;
  login_arkaplan_rengi_2: string;
  tema_rengi: string;
};

export const DEFAULT_BRANDING: KurumBranding = {
  gorunen_ad: '3K Kampüs',
  slogan: 'Yeni Nesil Eğitim Merkezi',
  login_logo_url: null,
  app_logo_url: null,
  favicon_url: null,
  login_arkaplan_rengi: '#1e3a5f',
  login_arkaplan_rengi_2: '#2d5a87',
  tema_rengi: '#0262a7',
};

export const DEFAULT_LOGIN_LOGO = '/img/beyaz-logo.png';
export const DEFAULT_APP_LOGO = '/img/3k-logo.png';
export const DEFAULT_FAVICON = '/favicon.svg';

export const LOGIN_KURUM_KOD_KEY = '3k_login_kurum_kod';

export function mergeBranding(partial?: Partial<KurumBranding> | null): KurumBranding {
  if (!partial) return { ...DEFAULT_BRANDING };
  return {
    ...DEFAULT_BRANDING,
    ...partial,
    gorunen_ad: (partial.gorunen_ad || partial.ad || DEFAULT_BRANDING.gorunen_ad).trim(),
    slogan: partial.slogan ?? DEFAULT_BRANDING.slogan,
    login_logo_url: partial.login_logo_url ?? null,
    app_logo_url: partial.app_logo_url ?? null,
    favicon_url: partial.favicon_url ?? null,
    login_arkaplan_rengi: partial.login_arkaplan_rengi || DEFAULT_BRANDING.login_arkaplan_rengi,
    login_arkaplan_rengi_2: partial.login_arkaplan_rengi_2 || DEFAULT_BRANDING.login_arkaplan_rengi_2,
    tema_rengi: partial.tema_rengi || DEFAULT_BRANDING.tema_rengi,
  };
}

/** Backend mutlak URL → same-origin /media/ yolu */
export function resolveBrandingAssetUrl(url: string | null | undefined, fallback: string): string {
  if (!url) return fallback;
  if (url.startsWith('/media/')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/media/')) return parsed.pathname;
  } catch {
    /* relative */
  }
  return url.startsWith('/') ? url : fallback;
}

export function getLoginLogo(branding: KurumBranding): string {
  return resolveBrandingAssetUrl(branding.login_logo_url, DEFAULT_LOGIN_LOGO);
}

export function getAppLogo(branding: KurumBranding): string {
  return resolveBrandingAssetUrl(branding.app_logo_url, DEFAULT_APP_LOGO);
}

/** Açık arka planlı header — önce app_logo, yoksa login_logo */
export function getHeaderLogo(branding: KurumBranding): string {
  if (branding.app_logo_url) {
    return resolveBrandingAssetUrl(branding.app_logo_url, DEFAULT_APP_LOGO);
  }
  if (branding.login_logo_url) {
    return resolveBrandingAssetUrl(branding.login_logo_url, DEFAULT_APP_LOGO);
  }
  return DEFAULT_APP_LOGO;
}

export function getFaviconUrl(branding: KurumBranding): string {
  if (!branding.favicon_url) return DEFAULT_FAVICON;
  const url = resolveBrandingAssetUrl(branding.favicon_url, DEFAULT_FAVICON);
  if (url === DEFAULT_FAVICON) return url;
  const sep = url.includes('?') ? '&' : '?';
  const stamp = encodeURIComponent(String(branding.favicon_url).slice(-24));
  return `${url}${sep}v=${stamp}`;
}

const KURUM_FAVICON_ATTR = 'data-kurum-favicon';

/** Aynı kurum favicon'unun her render'da tekrar indirilmesini önler */
let lastAppliedFaviconKey = '';

export function brandingFaviconKey(branding: KurumBranding): string {
  return `${getFaviconUrl(branding)}|${branding.tema_rengi}`;
}

function upsertFaviconLink(rel: string, href: string, sizes?: string) {
  const key = rel.replace(/\s+/g, '-');
  let link = document.querySelector<HTMLLinkElement>(`link[${KURUM_FAVICON_ATTR}="${key}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    link.setAttribute(KURUM_FAVICON_ATTR, key);
    document.head.appendChild(link);
  }
  const resolved = new URL(href, window.location.origin).href;
  if (link.href === resolved) return;
  link.href = href;
  if (sizes) link.setAttribute('sizes', sizes);
  else link.removeAttribute('sizes');
}

export function applyFavicon(branding: KurumBranding, options?: { force?: boolean }) {
  if (typeof document === 'undefined') return;
  const favicon = getFaviconUrl(branding);
  const applyKey = brandingFaviconKey(branding);
  if (!options?.force && applyKey === lastAppliedFaviconKey) return;
  lastAppliedFaviconKey = applyKey;

  // Next.js layout metadata and static favicon.svg compete with dynamic icons — remove them
  document.querySelectorAll('link[rel]').forEach(el => {
    if (!(el instanceof HTMLLinkElement)) return;
    if (el.hasAttribute(KURUM_FAVICON_ATTR)) return;
    const rel = el.rel.toLowerCase();
    if (rel.includes('icon')) el.remove();
  });

  const href = options?.force
    ? `${favicon}${favicon.includes('?') ? '&' : '?'}t=${Date.now()}`
    : favicon;

  upsertFaviconLink('icon', href);
  upsertFaviconLink('apple-touch-icon', href, '180x180');
}

export function applyKurumTheme(branding?: Partial<KurumBranding> | null): KurumBranding {
  const b = mergeBranding(branding);
  if (typeof document === 'undefined') return b;
  const root = document.documentElement;
  root.style.setProperty('--primary', b.tema_rengi);
  root.style.setProperty('--sidebar-accent', b.tema_rengi);
  root.style.setProperty('--brand-login-bg', b.login_arkaplan_rengi);
  root.style.setProperty('--brand-login-bg-2', b.login_arkaplan_rengi_2);
  root.style.setProperty('--brand-theme', b.tema_rengi);
  return b;
}

export function setPageBranding(branding: KurumBranding) {
  if (typeof document === 'undefined') return;
  document.title = `${branding.gorunen_ad} — Giriş`;
  applyFavicon(branding);
}

export function brandingFromKurum(kurum: {
  ad: string;
  kod?: string;
  gorunen_ad?: string;
  slogan?: string;
  login_logo_url?: string | null;
  app_logo_url?: string | null;
  favicon_url?: string | null;
  login_arkaplan_rengi?: string;
  login_arkaplan_rengi_2?: string;
  tema_rengi?: string;
}): KurumBranding {
  return mergeBranding({
    kod: kurum.kod,
    ad: kurum.ad,
    gorunen_ad: kurum.gorunen_ad || kurum.ad,
    slogan: kurum.slogan,
    login_logo_url: kurum.login_logo_url ?? null,
    app_logo_url: kurum.app_logo_url ?? null,
    favicon_url: kurum.favicon_url ?? null,
    login_arkaplan_rengi: kurum.login_arkaplan_rengi,
    login_arkaplan_rengi_2: kurum.login_arkaplan_rengi_2,
    tema_rengi: kurum.tema_rengi,
  });
}
