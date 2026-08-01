/**
 * Türkiye telefon formatı — giriş ve gösterim: 0XXX XXX XX XX
 * Örnek: 0212 555 00 00, 0532 555 00 00
 */

function normalizeDigits(value: string): string {
  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('90') && digits.length >= 12) {
    digits = '0' + digits.slice(2);
  }

  if (!digits.startsWith('0') && digits.startsWith('5')) {
    digits = `0${digits}`;
  }

  return digits.slice(0, 11);
}

/** Kullanıcı yazarken otomatik biçimlendirme */
export function formatPhoneInput(value: string): string {
  const digits = normalizeDigits(value);
  if (!digits) return '';

  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  if (digits.length <= 9) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
}

/** Sayfada gösterim — ham değeri biçimlendirilmiş metne çevirir */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  const formatted = formatPhoneInput(phone);
  return formatted || phone.trim();
}

/** tel: / wa.me linkleri için yalnızca rakamlar */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Birden fazla telefon — satır / virgül / noktalı virgül / tire ile ayrılmış.
 * Örn. "0442…\n0540…" veya "0442…-0540…-0530…"
 */
export function parsePhoneList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const parts = raw
    .split(/[\n,;|]+|(?<=\d)\s*[-–—]\s*(?=\d)/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const digits = phoneDigits(part);
    if (digits.length < 10) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    out.push(formatPhoneDisplay(part) || part);
  }
  return out;
}

/** Admin kaydı için satır satır telefon listesi */
export function formatPhoneListInput(raw: string | null | undefined): string {
  return parsePhoneList(raw).join('\n');
}
