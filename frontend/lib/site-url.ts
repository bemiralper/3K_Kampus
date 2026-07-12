/** Kamu site kök URL — SEO canonical, sitemap, Open Graph */
export function getSiteBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.replace(':8000', ':3000');
  if (fromEnv) {
    const cleaned = fromEnv.replace(/\/$/, '');
    // LMS app host'unu kamu site sanma
    if (cleaned.includes('app.3kkampus.com')) return 'https://www.3kkampus.com';
    if (cleaned.includes('localhost') || cleaned.includes('127.0.0.1')) {
      // robots/sitemap örneklerinde canlı domain kullan
      return process.env.NODE_ENV === 'production' ? 'https://www.3kkampus.com' : cleaned;
    }
    return cleaned;
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname.includes('localhost')) return 'https://www.3kkampus.com';
    return window.location.origin;
  }
  return 'https://www.3kkampus.com';
}

export function absoluteSiteUrl(path: string): string {
  const base = getSiteBaseUrl();
  if (!path) return base;
  if (path.startsWith('http')) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
