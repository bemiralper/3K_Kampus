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

export function leafSectionForQuestion(
  sections: ExamSection[] | undefined | null,
  questionNumber: number,
): ExamSection | undefined {
  return leafExamSections(sections).find(
    sec => questionNumber >= sec.question_start && questionNumber <= sec.question_end,
  );
}
