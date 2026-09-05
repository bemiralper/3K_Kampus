export const K3_MODE_CODES = ['OGREN', 'PEKISTIR', 'TEKRARLA', 'HIZLAN', 'TAMAMLA'] as const;

export type K3Mode = (typeof K3_MODE_CODES)[number];

export interface K3ModeMeta {
  code: K3Mode;
  label: string;
  emoji: string;
  pdfText: string;
  focusText: string;
  color: string;
  bg: string;
  border: string;
}

export const K3_MODE_META: Record<K3Mode, K3ModeMeta> = {
  OGREN: {
    code: 'OGREN',
    label: 'ÖĞREN',
    emoji: '',
    pdfText: 'Konuyu çalış, öğren ve ardından sorularla uygula.',
    focusText: 'Konuyu öğren, sorularla uygula.',
    color: '#1d4ed8',
    bg: '#eff6ff',
    border: '#bfdbfe',
  },
  PEKISTIR: {
    code: 'PEKISTIR',
    label: 'PEKİŞTİR',
    emoji: '',
    pdfText: 'Öğrendiklerini sorular çözerek sağlamlaştır.',
    focusText: 'Öğrendiklerini sorularla sağlamlaştır.',
    color: '#047857',
    bg: '#ecfdf5',
    border: '#a7f3d0',
  },
  TEKRARLA: {
    code: 'TEKRARLA',
    label: 'TEKRARLA',
    emoji: '',
    pdfText: 'Konuyu yeniden gözden geçir, bilgilerini tazele.',
    focusText: 'Konuyu gözden geçir, bilgilerini tazele.',
    color: '#6d28d9',
    bg: '#f5f3ff',
    border: '#ddd6fe',
  },
  HIZLAN: {
    code: 'HIZLAN',
    label: 'HIZLAN',
    emoji: '',
    pdfText: 'Doğruluğunu koru, soruları daha hızlı çöz.',
    focusText: 'Doğruluğunu koru, daha hızlı çöz.',
    color: '#c2410c',
    bg: '#fff7ed',
    border: '#fed7aa',
  },
  TAMAMLA: {
    code: 'TAMAMLA',
    label: 'TAMAMLA',
    emoji: '',
    pdfText: 'Eksiklerini belirle, konuyu tamamla ve sorularla pekiştir.',
    focusText: 'Eksiklerini gider, konuyu tamamla.',
    color: '#334155',
    bg: '#f8fafc',
    border: '#cbd5e1',
  },
};

export const K3_MODES: K3ModeMeta[] = K3_MODE_CODES.map((code) => K3_MODE_META[code]);

export const FOCUS_MIN_SHARE = 40;
export const FOCUS_MIN_GAP = 15;

export interface TopicK3Value {
  mode: K3Mode;
  targetMinutes?: number | null;
}

export type TopicK3Map = Record<string, TopicK3Value>;

export function k3TopicKey(bookId: number, topicId: number): string {
  return `${bookId}:${topicId}`;
}

export function parseK3Mode(value: unknown): K3Mode | null {
  const raw = String(value || '').trim().toUpperCase();
  return (K3_MODE_CODES as readonly string[]).includes(raw) ? (raw as K3Mode) : null;
}

export function getK3Meta(value: unknown): K3ModeMeta | null {
  const mode = parseK3Mode(value);
  return mode ? K3_MODE_META[mode] : null;
}

export interface K3ShareRow {
  mode: K3Mode;
  label: string;
  emoji: string;
  questions: number;
  percent: number;
}

export function computeK3Distribution(
  modeQuestions: Iterable<{ mode?: string | null; questions?: number | null }>,
): K3ShareRow[] {
  const cleaned: Partial<Record<K3Mode, number>> = {};
  for (const row of modeQuestions) {
    const mode = parseK3Mode(row.mode);
    const n = Number(row.questions || 0);
    if (!mode || !Number.isFinite(n) || n <= 0) continue;
    cleaned[mode] = (cleaned[mode] || 0) + n;
  }
  const total = K3_MODE_CODES.reduce((s, m) => s + (cleaned[m] || 0), 0);
  const rows: K3ShareRow[] = [];
  for (const mode of K3_MODE_CODES) {
    const questions = cleaned[mode] || 0;
    if (questions <= 0) continue;
    const meta = K3_MODE_META[mode];
    rows.push({
      mode,
      label: meta.label,
      emoji: meta.emoji,
      questions,
      percent: total ? Math.round((100 * questions) / total) : 0,
    });
  }
  if (rows.length) {
    const drift = 100 - rows.reduce((s, r) => s + r.percent, 0);
    if (drift) rows[0].percent += drift;
  }
  return rows;
}

export function resolveWeekFocus(shares: K3ShareRow[]): K3ShareRow | null {
  const ranked = [...shares]
    .filter((s) => s.percent > 0)
    .sort((a, b) => {
      if (b.percent !== a.percent) return b.percent - a.percent;
      return K3_MODE_CODES.indexOf(a.mode) - K3_MODE_CODES.indexOf(b.mode);
    });
  if (ranked.length === 0) return null;
  if (ranked.length === 1) return ranked[0];
  const [top, second] = ranked;
  if (top.percent >= FOCUS_MIN_SHARE && top.percent - second.percent >= FOCUS_MIN_GAP) {
    return top;
  }
  return null;
}

export function topicK3FromItems<T extends {
  bookId: number;
  topicId: number;
  k3Mode?: string | null;
  k3TargetMinutes?: number | null;
}>(items: T[]): TopicK3Map {
  const map: TopicK3Map = {};
  for (const item of items) {
    const mode = parseK3Mode(item.k3Mode);
    if (!mode) continue;
    map[k3TopicKey(item.bookId, item.topicId)] = {
      mode,
      targetMinutes: mode === 'HIZLAN' ? (item.k3TargetMinutes ?? null) : null,
    };
  }
  return map;
}
