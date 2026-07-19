export interface CoachRecentVisit {
  id: number;
  tam_ad: string;
  sinif?: string | null;
  profil_foto?: string | null;
  visited_at: string;
}

const MAX_RECENT = 4;

function key(userId: number, suffix: string): string {
  return `3k_coach_${suffix}_${userId}`;
}

function readJson<T>(storageKey: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(storageKey: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function getPinnedStudentIds(userId: number): number[] {
  return readJson<number[]>(key(userId, 'pinned'), []);
}

export function togglePinnedStudent(userId: number, studentId: number): number[] {
  const current = getPinnedStudentIds(userId);
  const next = current.includes(studentId)
    ? current.filter((id) => id !== studentId)
    : [...current, studentId];
  writeJson(key(userId, 'pinned'), next);
  return next;
}

export function isPinnedStudent(userId: number, studentId: number): boolean {
  return getPinnedStudentIds(userId).includes(studentId);
}

export function recordRecentVisit(
  userId: number,
  visit: Omit<CoachRecentVisit, 'visited_at'>
): void {
  const list = getRecentVisits(userId).filter((v) => v.id !== visit.id);
  const next: CoachRecentVisit[] = [
    { ...visit, visited_at: new Date().toISOString() },
    ...list,
  ].slice(0, MAX_RECENT);
  writeJson(key(userId, 'recent'), next);
}

export function getRecentVisits(userId: number): CoachRecentVisit[] {
  return readJson<CoachRecentVisit[]>(key(userId, 'recent'), []);
}

/**
 * Son ziyaret / sabitleme localStorage geçmişidir.
 * Artık koça atanmayan (veya listede olmayan) öğrencileri temizler.
 */
export function pruneCoachPrefsToStudentIds(
  userId: number,
  allowedStudentIds: Iterable<number>
): { recent: CoachRecentVisit[]; pinned: number[] } {
  const allowed = new Set(
    [...allowedStudentIds].map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
  );

  const recent = getRecentVisits(userId)
    .filter((v) => allowed.has(Number(v.id)))
    .slice(0, MAX_RECENT);
  const pinned = getPinnedStudentIds(userId).filter((id) => allowed.has(Number(id)));

  writeJson(key(userId, 'recent'), recent);
  writeJson(key(userId, 'pinned'), pinned);

  return { recent, pinned };
}

const SNOOZE_MS = 24 * 60 * 60 * 1000;

export function snoozeReminders(userId: number, hours = 24): void {
  writeJson(key(userId, 'reminder_snooze'), Date.now() + hours * 60 * 60 * 1000);
}

export function areRemindersSnoozed(userId: number): boolean {
  const until = readJson<number | null>(key(userId, 'reminder_snooze'), null);
  if (!until) return false;
  if (Date.now() > until) {
    writeJson(key(userId, 'reminder_snooze'), null);
    return false;
  }
  return true;
}

const NOTIFIED_SESSION_KEY = '3k_coach_reminder_notified';

export function markReminderNotifiedThisSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(NOTIFIED_SESSION_KEY, '1');
}

export function wasReminderNotifiedThisSession(): boolean {
  if (typeof sessionStorage === 'undefined') return true;
  return sessionStorage.getItem(NOTIFIED_SESSION_KEY) === '1';
}
