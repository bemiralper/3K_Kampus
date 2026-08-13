/** Haftalık şablon grid yardımcıları — şablon ve ops sayfası ortak. */

export type PeriodRow = {
  key: string;
  index: number;
  label: string;
  baslangic: string;
  bitis: string;
  isBreak: boolean;
};

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, mins));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildPeriods(
  startTime: string,
  sureDk: number,
  araDk: number,
  dersAdet: number,
): PeriodRow[] {
  const rows: PeriodRow[] = [];
  let cursor = timeToMinutes(startTime);
  for (let i = 1; i <= dersAdet; i += 1) {
    const baslangic = minutesToTime(cursor);
    const bitis = minutesToTime(cursor + sureDk);
    rows.push({
      key: `ders-${i}`,
      index: i,
      label: `${i}. Ders`,
      baslangic,
      bitis,
      isBreak: false,
    });
    cursor += sureDk + (i < dersAdet ? araDk : 0);
  }
  return rows;
}

export function matchLessonToPeriod<T extends { baslangic: string }>(
  lesson: T,
  periods: PeriodRow[],
): PeriodRow | null {
  const start = lesson.baslangic.slice(0, 5);
  const lessonPeriods = periods.filter((p) => !p.isBreak);
  const exact = lessonPeriods.find((p) => p.baslangic === start);
  if (exact) return exact;
  const startM = timeToMinutes(start);
  let best: PeriodRow | null = null;
  let bestDiff = Infinity;
  for (const p of lessonPeriods) {
    const diff = Math.abs(timeToMinutes(p.baslangic) - startM);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  return bestDiff <= 30 ? best : null;
}

export function formatDurationDk(dk: number): string {
  const n = Math.max(0, Math.round(dk || 0));
  if (n === 0) return '0 dk';
  if (n < 60) return `${n} dk`;
  const hours = Math.round((n / 60) * 10) / 10;
  return Number.isInteger(hours) ? `${hours} sa` : `${hours} sa`;
}

export function formatDateTr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}
