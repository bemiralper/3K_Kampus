/**
 * Yerel tarih yardımcıları — toISOString() UTC kayması yapmaz.
 */

/** Date → YYYY-MM-DD (yerel saat dilimi) */
export function dateToIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD → yerel Date (gece yarısı) */
export function isoToLocalDate(iso: string): Date | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Bugünün yerel tarihi YYYY-MM-DD */
export function todayIsoLocal(): string {
  return dateToIsoLocal(new Date());
}
