/** Çalışma programı tarih yardımcıları */

export function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Inclusive gün sayısı */
export function inclusiveDayCount(start: string, end: string): number {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

/**
 * ISO / datetime → date input (YYYY-MM-DD).
 * Ödev due_date çoğu zaman …T23:59 — takvim günü için YYYY-MM-DD öneki.
 */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const prefix = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (prefix) return prefix[1];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatDateLocal(d);
}

export type HomeworkDateSource = {
  assigned_date?: string | null;
  due_date?: string | null;
};

/**
 * Ödevden program tarih aralığı.
 *
 * Kural:
 * - Ödev Pzt verildi → kontrol = haftaya Pzt (+7)
 * - Program ertesi gün başlar (Salı)
 * - Kontrol = aralığın son günü
 *
 * Örn. Verilme 4 Ağu Pzt, kontrol 11 Ağu Pzt
 *   → program 5 Ağu Salı … 11 Ağu Pzt (son gün kontrol)
 */
export function datesFromHomework(hw: HomeworkDateSource): { start: string; end: string } {
  const assigned = toDateInputValue(hw.assigned_date);
  const due = toDateInputValue(hw.due_date);

  let end = due;
  if (!end && assigned) {
    // Kontrol: verilmeden tam 1 hafta sonra (aynı hafta günü)
    end = formatDateLocal(addDays(new Date(`${assigned}T12:00:00`), 7));
  }

  let start = '';
  if (assigned) {
    // Program, ödev verilen günün ERTESİ başlar
    start = formatDateLocal(addDays(new Date(`${assigned}T12:00:00`), 1));
  } else if (end) {
    // Sadece kontrol biliniyor → 6 gün önce ilk çalışma (kontrol hariç 6 gün + kontrol = 7)
    start = formatDateLocal(addDays(new Date(`${end}T12:00:00`), -6));
  }

  if (start && end && start > end) {
    start = formatDateLocal(addDays(new Date(`${end}T12:00:00`), -6));
  }

  return { start, end };
}

/** Kontrol günü = aralığın son günü (week_end) */
export function isControlDay(dayDate: string, weekEnd: string): boolean {
  return Boolean(dayDate && weekEnd && dayDate === weekEnd);
}

/** Son çalışma günü = kontrolden bir gün önce */
export function studyRangeEnd(weekEnd: string): string {
  if (!weekEnd) return weekEnd;
  return formatDateLocal(addDays(new Date(`${weekEnd}T12:00:00`), -1));
}

/** Listeden kontrol gününü çıkar (PDF) */
export function excludeControlDay<T extends { day_date: string }>(
  days: T[],
  weekEnd: string,
): T[] {
  if (!weekEnd) return days;
  return days.filter((d) => d.day_date !== weekEnd);
}
