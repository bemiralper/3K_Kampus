import type { ExamSection } from './types';

/** Alt dersi olan üst dersleri eleyip yaprak dersleri döner. */
export function leafExamSections(sections: ExamSection[] | undefined | null): ExamSection[] {
  const all = sections ?? [];
  const parentsWithChildren = new Set(
    all.filter(sec => sec.is_sub_section).map(sec => sec.parent_section).filter(Boolean),
  );
  return all
    .filter(sec => sec.is_sub_section || !parentsWithChildren.has(sec.id))
    .slice()
    .sort((a, b) => a.question_start - b.question_start);
}

/**
 * Üst dersinin aralığı dışına taşan alt dersler (ör. TYT Felsefe seçmeli 61–65).
 * Optik formda yer kaplar ve puanlanır ama öğrenci başına soru sayısına girmez.
 */
export function optionalSectionIds(sections: ExamSection[] | undefined | null): Set<number> {
  const all = sections ?? [];
  const byId = new Map(all.map(sec => [sec.id, sec]));
  const ids = new Set<number>();
  for (const sec of all) {
    if (!sec.is_sub_section || sec.parent_section == null) continue;
    const parent = byId.get(sec.parent_section);
    if (parent && (sec.question_start > parent.question_end || sec.question_end < parent.question_start)) {
      ids.add(sec.id);
    }
  }
  return ids;
}

export function optionalQuestionCount(sections: ExamSection[] | undefined | null): number {
  const ids = optionalSectionIds(sections);
  return (sections ?? [])
    .filter(sec => ids.has(sec.id))
    .reduce((sum, sec) => sum + Math.max(0, sec.question_end - sec.question_start + 1), 0);
}

export function leafSectionForQuestion(
  sections: ExamSection[] | undefined | null,
  questionNumber: number,
): ExamSection | undefined {
  return leafExamSections(sections).find(
    sec => questionNumber >= sec.question_start && questionNumber <= sec.question_end,
  );
}
