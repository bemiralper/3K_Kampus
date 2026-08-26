/** Genel notları numaralı satır listesi olarak saklar (API/taslak hâlâ tek string). */

import { isEmptyNoteHtml, sanitizeNoteHtml } from '@/lib/note-html';

export function parseNotesList(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/\n+/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter((line) => !isEmptyNoteHtml(line));
}

export function serializeNotesList(items: string[]): string {
  return items
    .map((text) => sanitizeNoteHtml(text).replace(/\n+/g, ' ').trim())
    .filter((text) => !isEmptyNoteHtml(text))
    .map((text, i) => `${i + 1}. ${text}`)
    .join('\n');
}
