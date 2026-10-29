export const BAND_YKS = 'YKS';
export const BAND_LGS = 'LGS';

export type CurriculumBand = typeof BAND_YKS | typeof BAND_LGS;

const YKS_TYPES = new Set(['YKS_TYT', 'YKS_AYT', 'AYT_11', 'TYT_11', 'DENEME']);
const LGS_TYPES = new Set(['LGS', 'LGS_7']);

export function bandForExamType(examType: string | ''): CurriculumBand {
  return LGS_TYPES.has(examType) ? BAND_LGS : BAND_YKS;
}

export function bandIsLocked(examType: string | ''): boolean {
  return YKS_TYPES.has(examType) || LGS_TYPES.has(examType);
}

export function resolveBand(examType: string | '', stored?: string | null): CurriculumBand {
  if (bandIsLocked(examType)) return bandForExamType(examType);
  if (stored === BAND_LGS || stored === BAND_YKS) return stored;
  return bandForExamType(examType);
}

export function bandLabel(band: CurriculumBand): string {
  return band === BAND_LGS ? 'LGS · 5–8' : 'YKS · 9–12';
}

/** Maarif sınavları kataloğun tamamını, YKS sınavları yalnız 2018 programını arar. */
export function curriculumProgramForExam(examType: string): '' | 'maarif' | 'program_2018' {
  if (examType === 'AYT_11' || examType === 'TYT_11') return 'maarif';
  if (examType === 'YKS_TYT' || examType === 'YKS_AYT' || examType === 'DENEME') return 'program_2018';
  return '';
}

/** 'SHG21 · SAYILAR' / '9. sınıf · KÜMELER' → asıl konu başlığı. */
export function topicDisplayName(name: string): string {
  const raw = (name || '').trim();
  const parts = raw.split(/\s*[·•|:]\s*/);
  return (parts[parts.length - 1] || raw).trim() || raw;
}
