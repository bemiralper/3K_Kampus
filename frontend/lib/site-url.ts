/** Kamu site kök URL — SEO canonical, sitemap, Open Graph */
export function getSiteBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.replace(':8000', ':3000');
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3000';
}

export function absoluteSiteUrl(path: string): string {
  const base = getSiteBaseUrl();
  if (!path) return base;
  if (path.startsWith('http')) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
