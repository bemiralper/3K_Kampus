/**
 * Profil fotoğrafı URL — same-origin /media rewrite (LAN/tablet uyumlu).
 * localhost:8000 tablet tarayıcısında erişilemez; göreli path kullanılır.
 */
export function resolveCoachPhotoUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return path;
  return `/media/${path.replace(/^\/?media\//, '')}`;
}
