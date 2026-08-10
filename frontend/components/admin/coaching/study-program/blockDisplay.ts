/** Takvim / havuz görünen metin yardımcıları */

export function isWeekHomeworkTitle(title: string | null | undefined): boolean {
  const t = (title || '').trim();
  if (!t) return false;
  return /hafta\s*ödev/i.test(t) || /ayı\s*\d/i.test(t) || /^ödev\b/i.test(t);
}

/** Kartta asıl satır: konu → (haftalık başlık değilse) title → ders */
export function primaryBlockLabel(block: {
  topic_name?: string | null;
  title?: string | null;
  lesson_name?: string | null;
}): string {
  const topic = block.topic_name?.trim();
  if (topic) return topic;
  const title = block.title?.trim();
  if (title && !isWeekHomeworkTitle(title)) return title;
  return block.lesson_name?.trim() || 'Çalışma';
}

export function lessonAccent(name: string | null | undefined): string {
  if (!name) return '#64748b';
  const map: Record<string, string> = {
    matematik: '#2563eb',
    türkçe: '#dc2626',
    turkce: '#dc2626',
    fizik: '#7c3aed',
    kimya: '#059669',
    biyoloji: '#16a34a',
    fen: '#0d9488',
    tarih: '#ea580c',
    coğrafya: '#d97706',
    cografya: '#d97706',
    edebiyat: '#be185d',
    geometri: '#4f46e5',
  };
  const lower = name.toLocaleLowerCase('tr-TR');
  for (const [k, c] of Object.entries(map)) {
    if (lower.includes(k)) return c;
  }
  return '#0061a6';
}
