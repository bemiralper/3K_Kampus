export const BAND_YKS = 'YKS';
export const BAND_LGS = 'LGS';

export type CurriculumBand = typeof BAND_YKS | typeof BAND_LGS;

const YKS_TYPES = new Set(['YKS_TYT', 'YKS_AYT', 'DENEME']);
const LGS_TYPES = new Set(['LGS']);

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
