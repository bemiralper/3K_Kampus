/** Google Maps embed URL — iframe HTML veya paylaşım linkinden src çıkarır. */
export function parseMapEmbedUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  const text = raw.trim();
  if (!text) return '';

  const iframeMatch = text.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframeMatch?.[1]) return iframeMatch[1].trim();

  if (text.startsWith('http://') || text.startsWith('https://')) return text;
  return text;
}

/** Adresten basit Google Maps embed URL üretir. */
export function buildMapEmbedFromAddress(address: string | null | undefined): string {
  if (!address?.trim()) return '';
  const q = encodeURIComponent(address.trim());
  return `https://maps.google.com/maps?q=${q}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
}

/** Kayıt öncesi harita alanını normalize eder; boşsa adresten üretir. */
export function normalizeSiteMapSettings(
  settings: { adres?: string; harita_embed_url?: string },
): { harita_embed_url: string } {
  let harita = parseMapEmbedUrl(settings.harita_embed_url);
  if (!harita && settings.adres?.trim()) {
    harita = buildMapEmbedFromAddress(settings.adres);
  }
  return { harita_embed_url: harita };
}
