import type { CoachStudentProfileStudent } from '@/lib/coach-api';

/**
 * Yalnızca API'deki sınıf seviyesi kaydı (ör. "11. Sınıf").
 * Sınıf adından (12-A, 8/B) türetilmez.
 */
export function resolveCoachStudentGradeLevel(
  student: CoachStudentProfileStudent
): string | null {
  const explicit = student.sinif_seviyesi?.ad?.trim();
  return explicit || null;
}
