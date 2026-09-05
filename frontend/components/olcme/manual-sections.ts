export const MANUAL_SECTION_EXAM_TYPES = ['KONU_TARAMA', 'KAZANIM', 'OZEL'] as const;

export type ManualSectionDraft = {
  name: string;
  question_count: number;
  subject_id: number | null;
  sub_sections: ManualSectionDraft[];
};

export type RangedSection = {
  name: string;
  question_start: number;
  question_end: number;
  question_count: number;
  order: number;
  subject?: number | null;
  sub_sections: RangedSection[];
};

export function emptyDraft(name = '', question_count = 20, subject_id: number | null = null): ManualSectionDraft {
  return { name, question_count, subject_id, sub_sections: [] };
}

export function isManualSectionExamType(examType: string | ''): boolean {
  return (MANUAL_SECTION_EXAM_TYPES as readonly string[]).includes(examType);
}

export function rangesFromTree(drafts: ManualSectionDraft[]): RangedSection[] {
  let cursor = 1;
  return drafts
    .map(d => ({
      name: d.name.trim(),
      question_count: Math.max(1, Number(d.question_count) || 1),
      subject_id: d.subject_id ?? null,
      sub_sections: (d.sub_sections || [])
        .map(s => ({
          name: s.name.trim(),
          question_count: Math.max(1, Number(s.question_count) || 1),
          subject_id: s.subject_id ?? null,
          sub_sections: [] as ManualSectionDraft[],
        }))
        .filter(s => s.name),
    }))
    .filter(d => d.name)
    .map((main, order) => {
      if (main.sub_sections.length) {
        const subs: RangedSection[] = main.sub_sections.map((sub, j) => {
          const start = cursor;
          const end = start + sub.question_count - 1;
          cursor = end + 1;
          return {
            name: sub.name,
            question_start: start,
            question_end: end,
            question_count: sub.question_count,
            order: j,
            subject: sub.subject_id,
            sub_sections: [],
          };
        });
        const start = subs[0].question_start;
        const end = subs[subs.length - 1].question_end;
        return {
          name: main.name,
          question_start: start,
          question_end: end,
          question_count: end - start + 1,
          order,
          subject: main.subject_id,
          sub_sections: subs,
        };
      }
      const start = cursor;
      const end = start + main.question_count - 1;
      cursor = end + 1;
      return {
        name: main.name,
        question_start: start,
        question_end: end,
        question_count: main.question_count,
        order,
        subject: main.subject_id,
        sub_sections: [],
      };
    });
}

/** Geriye dönük ad — üst ders ağacını aralığa çevirir. */
export const rangesFromCounts = rangesFromTree;

export function totalQuestionsFromDrafts(drafts: ManualSectionDraft[]) {
  return rangesFromTree(drafts).reduce((sum, row) => sum + row.question_count, 0);
}

export type TemplateSectionLike = {
  name: string;
  question_start: number;
  question_end: number;
};

export function templateToDrafts(
  sections: TemplateSectionLike[],
  subSections?: Record<string, TemplateSectionLike[]>,
): ManualSectionDraft[] {
  return sections.map(sec => {
    const subs = subSections?.[sec.name] || [];
    return {
      name: sec.name,
      question_count: Math.max(1, sec.question_end - sec.question_start + 1),
      subject_id: null,
      sub_sections: subs.map(sub => ({
        name: sub.name,
        question_count: Math.max(1, sub.question_end - sub.question_start + 1),
        subject_id: null,
        sub_sections: [],
      })),
    };
  });
}
