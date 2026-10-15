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

/** Haftalık program: 6 çalışma günü + son gün kontrol */
export const PROGRAM_DAY_COUNT = 7;
export const STUDY_DAY_COUNT = 6;
/** Tek güne rahat sığan soru. Üstü bölme önerisi üretir. */
export const SOFT_DAY_QUESTION_CAP = 80;

export function isSevenDayRange(start: string, end: string): boolean {
  return Boolean(start && end && inclusiveDayCount(start, end) === PROGRAM_DAY_COUNT);
}

/** İlk çalışma gününden 7 günlük aralık (son gün kontrol). */
export function rangeFromStart(start: string): { start: string; end: string } {
  if (!start) return { start: '', end: '' };
  return {
    start,
    end: formatDateLocal(addDays(new Date(`${start}T12:00:00`), PROGRAM_DAY_COUNT - 1)),
  };
}

/** Kontrol gününden geriye 7 günlük aralık. */
export function rangeFromEnd(end: string): { start: string; end: string } {
  if (!end) return { start: '', end: '' };
  return {
    start: formatDateLocal(addDays(new Date(`${end}T12:00:00`), -(PROGRAM_DAY_COUNT - 1))),
    end,
  };
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
 * Hafta 7 gündür ve son gün kontroldür. Ödevin verildiği gün
 * oturum günüdür; programa girmez.
 *
 * Örn. Verilme 15 Eki Per, kontrol 22 Eki Per
 *   → program 16 Eki Cum … 22 Eki Per (6 çalışma + kontrol)
 */
export function datesFromHomework(hw: HomeworkDateSource): { start: string; end: string } {
  const assigned = toDateInputValue(hw.assigned_date);
  const due = toDateInputValue(hw.due_date);

  let end = due;
  if (!end && assigned) {
    end = formatDateLocal(addDays(new Date(`${assigned}T12:00:00`), 7));
  }
  if (!end) return { start: '', end: '' };
  return rangeFromEnd(end);
}

/** Ödev tarihleri bu program haftasıyla kesişiyor mu? */
export function homeworkOverlapsWeek(
  hw: HomeworkDateSource,
  weekStart: string,
  weekEnd: string,
): boolean {
  const assigned = toDateInputValue(hw.assigned_date);
  const due = toDateInputValue(hw.due_date);
  const start = assigned || due;
  const end = due || assigned;
  if (!start || !end || !weekStart || !weekEnd) return false;
  return start <= weekEnd && end >= weekStart;
}

/** Büyük konuyu kaç güne bölmek gerektiğini söyler. */
export function splitSuggestion(questionCount: number, testCount = 0): string | null {
  if (questionCount > SOFT_DAY_QUESTION_CAP) {
    const days = Math.min(PROGRAM_DAY_COUNT, Math.ceil(questionCount / SOFT_DAY_QUESTION_CAP));
    const per = Math.ceil(questionCount / days);
    return `${days} güne bölününce günde yaklaşık ${per} soru`;
  }
  if (testCount > PROGRAM_DAY_COUNT) {
    return `${testCount} test 7 güne eşit yayılır`;
  }
  return null;
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
