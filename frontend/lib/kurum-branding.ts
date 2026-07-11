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

/** Backend mutlak URL → same-origin /media/ yolu (sorgu dizesi korunur — favicon cache bust) */
export function resolveBrandingAssetUrl(url: string | null | undefined, fallback: string): string {
  if (!url) return fallback;
  if (url.startsWith('/media/')) return url;
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (parsed.pathname.startsWith('/media/')) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* relative path */
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

export type SubeBrandingInput = {
  ad: string;
  gorunen_ad?: string;
  slogan?: string;
  login_logo_url?: string | null;
  app_logo_url?: string | null;
  favicon_url?: string | null;
  login_arkaplan_rengi?: string;
  login_arkaplan_rengi_2?: string;
  tema_rengi?: string;
};

/** Şube markası — kurum fallback yok */
export function brandingFromSube(sube: SubeBrandingInput): KurumBranding {
  return mergeBranding({
    ad: sube.ad,
    gorunen_ad: sube.gorunen_ad || sube.ad,
    slogan: sube.slogan,
    login_logo_url: sube.login_logo_url ?? null,
    app_logo_url: sube.app_logo_url ?? null,
    favicon_url: sube.favicon_url ?? null,
    login_arkaplan_rengi: sube.login_arkaplan_rengi,
    login_arkaplan_rengi_2: sube.login_arkaplan_rengi_2,
    tema_rengi: sube.tema_rengi,
  });
}

/**
 * Yazdırma/PDF logosu — yalnızca şubede tanımlı app_logo / login_logo.
 * Kurum logosuna düşmez.
 */
export function getSubePrintLogo(sube: SubeBrandingInput | null | undefined): {
  src: string;
  /** login_logo (beyaz) kullanıldığında koyu zemin gerekir */
  onDarkBackground: boolean;
} {
  if (!sube) {
    return { src: DEFAULT_APP_LOGO, onDarkBackground: false };
  }
  if (sube.app_logo_url) {
    return {
      src: resolveBrandingAssetUrl(sube.app_logo_url, DEFAULT_APP_LOGO),
      onDarkBackground: false,
    };
  }
  if (sube.login_logo_url) {
    return {
      src: resolveBrandingAssetUrl(sube.login_logo_url, DEFAULT_LOGIN_LOGO),
      onDarkBackground: true,
    };
  }
  return { src: DEFAULT_APP_LOGO, onDarkBackground: false };
}

export function getFaviconUrl(branding: KurumBranding): string {
  if (!branding.favicon_url) return DEFAULT_FAVICON;
  return resolveBrandingAssetUrl(branding.favicon_url, DEFAULT_FAVICON);
}

const KURUM_FAVICON_ATTR = 'data-kurum-favicon';

/** Aynı kurum favicon'unun her render'da tekrar indirilmesini önler */
let lastAppliedFaviconKey = '';
/** Önceki blob: URL'yi serbest bırakmak için */
let lastFaviconBlobUrl: string | null = null;
/** Aynı favicon için üst üste gelen fetch isteklerini engeller */
let faviconFetchToken = 0;

export function brandingFaviconKey(branding: KurumBranding): string {
  return `${branding.favicon_url ?? ''}|${branding.tema_rengi}`;
}

/** Var olan node'u yeniden kullanmak yerine her zaman sıfırdan oluşturur —
 *  bazı tarayıcılar (özellikle Chrome'un sekme/geçmiş favicon önbelleği)
 *  mevcut bir <link>'in href'ini değiştirmeyi güvenilir şekilde algılamaz. */
function faviconMimeType(href: string): string | undefined {
  const path = href.split('?')[0].split('#')[0].toLowerCase();
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.ico')) return 'image/x-icon';
  return undefined;
}

function replaceFaviconLink(rel: string, href: string, sizes?: string) {
  const key = rel.replace(/\s+/g, '-');
  const selector = `link[${KURUM_FAVICON_ATTR}="${key}"]`;
  const existing = document.head.querySelector(selector);
  let link: HTMLLinkElement;
  if (existing instanceof HTMLLinkElement) {
    link = existing;
  } else {
    link = document.createElement('link');
    link.setAttribute(KURUM_FAVICON_ATTR, key);
    link.rel = rel;
    document.head.appendChild(link);
  }
  if (sizes) link.setAttribute('sizes', sizes);
  else link.removeAttribute('sizes');
  const mime = faviconMimeType(href);
  if (mime) link.type = mime;
  else link.removeAttribute('type');
  link.href = href;
}

function setFaviconHref(href: string) {
  // Next.js metadata ile çakışmamak için yalnızca kendi link'lerimizi güncelleriz;
  // React'ın yönettiği head node'larına dokunmayız.
  replaceFaviconLink('icon', href);
  replaceFaviconLink('apple-touch-icon', href, '180x180');
}

export function applyFavicon(branding: KurumBranding, options?: { force?: boolean }) {
  if (typeof document === 'undefined') return;
  const favicon = getFaviconUrl(branding);
  const applyKey = brandingFaviconKey(branding);
  if (!options?.force && applyKey === lastAppliedFaviconKey) return;
  lastAppliedFaviconKey = applyKey;

  const isDefault = favicon === DEFAULT_FAVICON;
  const bustedUrl = `${favicon}${favicon.includes('?') ? '&' : '?'}t=${Date.now()}`;

  // Varsayılan (statik) favicon için blob'a ihtiyaç yok — direkt uygula.
  if (isDefault || typeof fetch === 'undefined') {
    setFaviconHref(isDefault ? favicon : bustedUrl);
    return;
  }

  // Özel favicon: blob: URL'ye çevirerek tüm HTTP/tarayıcı önbelleğini bypass et.
  // Chrome'un sekme seviyesindeki favicon önbelleği, href değişse de bazen
  // yeniden fetch tetiklemiyor; blob: URL her zaman "yeni" bir kaynak sayılır.
  const token = ++faviconFetchToken;
  fetch(bustedUrl, { cache: 'no-store' })
    .then(res => (res.ok ? res.blob() : Promise.reject(new Error('favicon fetch failed'))))
    .then(blob => {
      if (token !== faviconFetchToken) return; // daha yeni bir istek başladı
      const objectUrl = URL.createObjectURL(blob);
      setFaviconHref(objectUrl);
      if (lastFaviconBlobUrl) URL.revokeObjectURL(lastFaviconBlobUrl);
      lastFaviconBlobUrl = objectUrl;
    })
    .catch(() => {
      if (token !== faviconFetchToken) return;
      // Blob başarısız olursa düz URL ile dene (en azından cache-bust'lı)
      setFaviconHref(bustedUrl);
    });
}

/** Yükleme sonrası favicon önbelleğini sıfırla */
export function resetFaviconCache() {
  lastAppliedFaviconKey = '';
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

function pickOverride<T extends string | null | undefined>(override: T, fallback: string): string {
  if (override != null && override !== '') return override;
  return fallback;
}

/** Giriş sonrası uygulama — şube markası kurum markasının üzerine yazar. */
export function brandingFromContext(
  kurum: Parameters<typeof brandingFromKurum>[0] | null | undefined,
  sube?: {
    ad?: string;
    gorunen_ad?: string;
    slogan?: string;
    login_logo_url?: string | null;
    app_logo_url?: string | null;
    favicon_url?: string | null;
    login_arkaplan_rengi?: string;
    login_arkaplan_rengi_2?: string;
    tema_rengi?: string;
  } | null,
): KurumBranding {
  const base = kurum ? brandingFromKurum(kurum) : DEFAULT_BRANDING;
  if (!sube) return base;
  return mergeBranding({
    ...base,
    gorunen_ad: pickOverride(sube.gorunen_ad, sube.ad || base.gorunen_ad),
    slogan: pickOverride(sube.slogan, base.slogan),
    login_logo_url: sube.login_logo_url ?? base.login_logo_url,
    app_logo_url: sube.app_logo_url ?? base.app_logo_url,
    favicon_url: sube.favicon_url != null && sube.favicon_url !== ''
      ? sube.favicon_url
      : base.favicon_url,
    login_arkaplan_rengi: pickOverride(sube.login_arkaplan_rengi, base.login_arkaplan_rengi),
    login_arkaplan_rengi_2: pickOverride(sube.login_arkaplan_rengi_2, base.login_arkaplan_rengi_2),
    tema_rengi: pickOverride(sube.tema_rengi, base.tema_rengi),
  });
}

/** Anasayfa renkleri — kurum markasından türetilir. */
export function landingColorsFromBranding(branding?: Partial<KurumBranding> | null) {
  const b = mergeBranding(branding);
  return {
    navy: b.login_arkaplan_rengi,
    navyLight: b.login_arkaplan_rengi_2,
    accent: b.tema_rengi,
  };
}
