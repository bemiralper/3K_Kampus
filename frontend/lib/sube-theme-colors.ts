/** Şube tema_rengi → okunabilir arka plan / yazı çiftleri */

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function mixWithWhite(rgb: [number, number, number], whiteRatio: number): string {
  const t = Math.min(1, Math.max(0, whiteRatio));
  return toHex(
    rgb[0] + (255 - rgb[0]) * t,
    rgb[1] + (255 - rgb[1]) * t,
    rgb[2] + (255 - rgb[2]) * t,
  );
}

function darken(rgb: [number, number, number], amount: number): string {
  const f = 1 - Math.min(1, Math.max(0, amount));
  return toHex(rgb[0] * f, rgb[1] * f, rgb[2] * f);
}

/** Öğle arası satır/rozet — şube tema_rengi ile yüksek kontrast */
export function lunchBreakColors(themeHex?: string | null): {
  color: string;
  bg: string;
  border: string;
} {
  const fallback = parseHex('#c2410c')!;
  const rgb = (themeHex && parseHex(themeHex)) || fallback;
  return {
    bg: mixWithWhite(rgb, 0.88),
    color: darken(rgb, 0.35),
    border: mixWithWhite(rgb, 0.65),
  };
}
