/** SSR + tarayıcıda aynı çıktı — hydration uyumlu TR tarih formatları */

export const APP_TIMEZONE = 'Europe/Istanbul';

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const WEEKDAY_NAMES = [
  'Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi',
];

/** Sunucu UTC olsa bile Türkiye takvim günü — ay başı hidrasyon kaymasını önler. */
export function calendarDateInAppTz(now = new Date()): {
  year: number;
  monthIndex: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: num('year'),
    monthIndex: num('month') - 1,
    day: num('day'),
  };
}

/** Örn. 1 Eylül 2026 — sunucu ve tarayıcıda aynı */
export function formatNowTRLong(now = new Date()): string {
  return now.toLocaleDateString('tr-TR', {
    timeZone: APP_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

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
