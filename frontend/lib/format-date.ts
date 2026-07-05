/** SSR + tarayıcıda aynı çıktı — hydration uyumlu TR tarih formatları */

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const WEEKDAY_NAMES = [
  'Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi',
];

/** YYYY-MM-DD → yerel öğlen (timezone kayması yok) */
export function parseISODate(value: string): Date {
  const iso = value.slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** 05.07.2026 */
export function formatDateTR(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? parseISODate(value) : value;
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

/** Cumartesi, 05 Temmuz 2026 */
export function formatDateTRLong(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? parseISODate(value) : value;
  const d = date.getDate();
  const m = date.getMonth();
  const y = date.getFullYear();
  return `${WEEKDAY_NAMES[date.getDay()]}, ${String(d).padStart(2, '0')} ${MONTH_NAMES[m]} ${y}`;
}
