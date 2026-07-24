/** Deterministik pastel renk — ders / öğretmen kimliğine göre. */

export type ScheduleColorBy = 'ders' | 'ogretmen' | 'none';

export type ScheduleColor = {
  bg: string;
  border: string;
  text: string;
};

const STORAGE_KEY = 'dp-color-by';

export function getScheduleColorBy(): ScheduleColorBy {
  if (typeof window === 'undefined') return 'ders';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'ogretmen' || v === 'none' || v === 'ders') return v;
  return 'ders';
}

export function setScheduleColorBy(value: ScheduleColorBy): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, value);
}

function hashId(id: number): number {
  let x = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return Math.abs(x);
}

/** HSL pastel arka plan + koyu metin. */
export function colorForKey(id: number | null | undefined): ScheduleColor | null {
  if (id == null || id <= 0) return null;
  const h = hashId(id) % 360;
  const s = 48 + (hashId(id + 7) % 18); // 48–65
  const l = 88 + (hashId(id + 13) % 6); // 88–93
  const borderL = Math.max(62, l - 22);
  const textL = 22;
  return {
    bg: `hsl(${h} ${s}% ${l}%)`,
    border: `hsl(${h} ${Math.min(70, s + 12)}% ${borderL}%)`,
    text: `hsl(${h} ${Math.min(55, s)}% ${textL}%)`,
  };
}

/** PDF / export için hex (#RRGGBB). */
export function colorForKeyHex(id: number | null | undefined): {
  bg: string;
  text: string;
} | null {
  const c = colorForKey(id);
  if (!c) return null;
  return {
    bg: hslToHex(c.bg),
    text: hslToHex(c.text),
  };
}

function hslToHex(hsl: string): string {
  const m = hsl.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/);
  if (!m) return '#e2e8f0';
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
