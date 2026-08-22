/** Genel notları numaralı satır listesi olarak saklar (API/taslak hâlâ tek string). */

export function parseNotesList(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/\n+/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

export function serializeNotesList(items: string[]): string {
  return items
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, i) => `${i + 1}. ${text}`)
    .join('\n');
}
