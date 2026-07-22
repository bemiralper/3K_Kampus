import type { YasalMetinMeta, YasalSection } from '@/lib/yasal-metin-types';

export const YASAL_ICERIK_VERSION = 1;

export type YasalStructuredContent = {
  v: typeof YASAL_ICERIK_VERSION;
  meta: YasalMetinMeta;
  sections: YasalSection[];
};

export function buildYasalStructuredContent(
  meta: YasalMetinMeta,
  sections: YasalSection[],
): YasalStructuredContent {
  return { v: YASAL_ICERIK_VERSION, meta, sections };
}

export function serializeYasalStructured(content: YasalStructuredContent): string {
  return JSON.stringify(content);
}

export function parseYasalStructured(raw: string | null | undefined): YasalStructuredContent | null {
  if (!raw?.trim()) return null;
  try {
    const data = JSON.parse(raw) as YasalStructuredContent;
    if (data?.v !== YASAL_ICERIK_VERSION || !data.meta?.title || !Array.isArray(data.sections)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function isPlaceholderYasalContent(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return true;
  if (parseYasalStructured(raw)) return false;
  const text = raw.toLowerCase();
  return (
    raw.length < 400
    || text.includes('metni buradan düzenleyin')
    || text.includes('örnek bir kvkk')
    || text.includes('örnek metindir')
    || text.includes('bu metni güncelleyin')
    || text.includes('bu metni kurum')
  );
}
