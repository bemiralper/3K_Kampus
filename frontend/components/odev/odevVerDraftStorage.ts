import type { SelectedContent } from '@/app/admin/odev/ver/types';
import type { TopicK3Map } from '@/lib/k3-mode';

const STORAGE_PREFIX = 'odev-ver-draft:v1:';

export type OdevVerDraft = {
  studentId: number;
  cart: SelectedContent[];
  contentNotes: Record<number, string>;
  topicK3?: TopicK3Map;
  title: string;
  notes: string;
  dueDate: string;
  priority: string;
  currentStep: number;
  updatedAt: number;
};

function storageKey(studentId: number): string {
  return `${STORAGE_PREFIX}${studentId}`;
}

export function loadOdevVerDraft(studentId: number): OdevVerDraft | null {
  if (typeof window === 'undefined' || !studentId) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(studentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OdevVerDraft;
    if (!parsed || parsed.studentId !== studentId || !Array.isArray(parsed.cart)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveOdevVerDraft(draft: OdevVerDraft): void {
  if (typeof window === 'undefined' || !draft.studentId) return;
  try {
    sessionStorage.setItem(storageKey(draft.studentId), JSON.stringify({
      ...draft,
      updatedAt: Date.now(),
    }));
  } catch {
    /* quota / private mode */
  }
}

export function clearOdevVerDraft(studentId: number): void {
  if (typeof window === 'undefined' || !studentId) return;
  try {
    sessionStorage.removeItem(storageKey(studentId));
  } catch {
    /* ignore */
  }
}
