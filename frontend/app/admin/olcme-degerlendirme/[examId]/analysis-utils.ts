import type { ExamSection, StudentAnalysis } from '../../../../components/olcme/types';

export type PtKey = 'SAY' | 'EA' | 'SOZ';

export const PT_LABEL: Record<PtKey, string> = { SAY: 'SAY', EA: 'EA', SOZ: 'SÖZ' };

export const ALAN_TO_PT: Record<string, PtKey> = {
  SAYISAL: 'SAY',
  ESIT_AGIRLIK: 'EA',
  SOZEL: 'SOZ',
};

export const NO_CLASS = '__none__';

export const RANKED_EXAM_TYPES = ['YKS_TYT', 'YKS_AYT', 'TYT_11', 'AYT_11'];

export function ptKeysFor(examType: string): PtKey[] {
  if (examType === 'YKS_AYT') return ['SAY', 'EA', 'SOZ'];
  if (examType === 'AYT_11') return ['SAY', 'EA'];
  return [];
}

export const fmt = (n: number | null | undefined, digits = 2) =>
  n == null || Number.isNaN(n)
    ? '—'
    : n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmt1 = (n: number | null | undefined) => fmt(n, 1);

export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('tr-TR'));

export const fmtPct = (n: number | null | undefined, digits = 0) =>
  n == null ? '—' : `%${n.toLocaleString('tr-TR', { maximumFractionDigits: digits })}`;

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const norm = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/** Ana bölümler (alt dersi olsun olmasın), soru sırasıyla. */
export function mainSections(sections: ExamSection[] | undefined) {
  return (sections ?? [])
    .filter(sec => !sec.is_sub_section)
    .slice()
    .sort((a, b) => a.question_start - b.question_start);
}

export function childSections(sections: ExamSection[] | undefined, parentId: number) {
  return (sections ?? [])
    .filter(sec => sec.is_sub_section && sec.parent_section === parentId)
    .slice()
    .sort((a, b) => a.question_start - b.question_start);
}

/** Öğrencinin seçilen puan türündeki puanı; puan türü yoksa genel puan. */
export function studentScore(st: StudentAnalysis, pt: PtKey | null) {
  if (pt && st.puan_turleri?.[pt]) return st.puan_turleri[pt].puan;
  return st.puan;
}

export function studentNet(st: StudentAnalysis, pt: PtKey | null) {
  if (pt && st.puan_turleri?.[pt]) return st.puan_turleri[pt].ayt_net;
  return st.alan_net ?? st.toplam_net;
}

/** Tahmini Türkiye sırası ve yüzdelik: seçilen puan türü, yoksa öğrencinin alanı. */
export function studentEstimate(st: StudentAnalysis, examType: string, pt: PtKey | null) {
  const key = pt ?? (examType === 'YKS_AYT' || examType === 'AYT_11' ? (ALAN_TO_PT[st.alan || ''] || 'SAY') : null);
  const row = key ? st.puan_turleri?.[key] : undefined;
  return {
    sira: row?.tahmini_siralama ?? st.tahmini_siralama,
    yuzdelik: row?.yuzdelik_dilim ?? st.yuzdelik_dilim,
    key: row ? key : null,
  };
}

/** Değerin ortalamaya göre rengi: ±%10 bandı nötr. */
export function toneVsAvg(value: number, reference: number) {
  if (!reference) return 0;
  const diff = (value - reference) / Math.abs(reference);
  if (diff >= 0.1) return 1;
  if (diff <= -0.1) return -1;
  return 0;
}
