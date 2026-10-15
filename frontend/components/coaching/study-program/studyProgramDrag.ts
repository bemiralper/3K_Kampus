import type { HomeworkPoolItem, ProgramBlock } from '@/lib/study-program-api';

/** Safari özel MIME türünü drop anında boş döndürür. Yük burada durur. */
export type StudyDrag =
  | { kind: 'block'; block: ProgramBlock; fromDayId: number; fromIdx: number }
  | { kind: 'homework'; item: HomeworkPoolItem };

let current: StudyDrag | null = null;

export function setStudyDrag(payload: StudyDrag | null) {
  current = payload;
}

export function getStudyDrag() {
  return current;
}
