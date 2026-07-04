/**
 * Takvim hücrelerinde gösterilecek kısa etiket.
 * "İnaktif öğrenci: Muhammed Alper" → "Muhammed Alper"
 */
export function shortEventLabel(title: string, maxLen = 26): string {
  const trimmed = title.trim();
  if (!trimmed) return '';

  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0 && colonIdx < trimmed.length - 1) {
    const detail = trimmed.slice(colonIdx + 1).trim();
    if (detail.length > 0) {
      return detail.length <= maxLen ? detail : truncateAtWord(detail, maxLen);
    }
  }

  return truncateAtWord(trimmed, maxLen);
}

export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  const base = sp > max * 0.45 ? cut.slice(0, sp) : cut;
  return `${base.trimEnd()}…`;
}

export function isTitleTruncated(full: string, shown: string): boolean {
  return full.trim() !== shown.trim() && shown.endsWith('…');
}
