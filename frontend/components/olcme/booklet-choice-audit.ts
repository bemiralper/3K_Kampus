import type { ExamSection } from './types';
import { leafExamSections } from './section-ranges';

/**
 * B kitapçığı, aynı soruların test içinde yer değiştirmiş hâlidir.
 * Bu yüzden her testte A/B/C/D/E sayıları iki kitapçıkta aynı olmalıdır.
 *
 * Sosyal ve fen bir bütün sayılır (tarih, fizik gibi alt dersler ayrı bakılmaz).
 * Matematik ile geometri ayrı denetlenir.
 */
const FOLD_AS_WHOLE = /sosyal|fen/i;

export type AuditedChoice = 'A' | 'B' | 'C' | 'D' | 'E' | 'INVALID';

export const AUDITED_CHOICES: AuditedChoice[] = ['A', 'B', 'C', 'D', 'E', 'INVALID'];

const CHOICE_LABEL: Record<AuditedChoice, string> = {
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  E: 'E',
  INVALID: 'İptal',
};

export function normalizePastedAnswer(val: string): string {
  const upper = val.toUpperCase().trim();
  if (['A', 'B', 'C', 'D', 'E'].includes(upper)) return upper;
  if (upper === 'İPTAL' || upper === 'IPTAL' || upper === 'X' || upper === 'INVALID') return 'INVALID';
  if (upper === 'BOŞ' || upper === 'BOS' || upper === 'EMPTY' || upper === '-') return 'EMPTY';
  return '';
}

const NUMBERED_LINE = /^(\d{1,3})\s*[-.):\t ]\s*(\S+)$/;
const COMPACT_CHAR = /^[A-EX-]$/;

/**
 * Yapıştırılan cevapları soru sırasına dizer.
 *
 * - Alt alta (Excel sütunu): her satır bir soru; boş hücre boş soru sayılır.
 * - Yan yana: "ABCDE", "A B C D E" veya test test satırlar ("ABCDE…\nABCDE…").
 * - Numaralı: "1 A", "1-A", "1.A", "1)A", "1<tab>A". `order` verilirse numara
 *   o soruya oturur; verilmezse sıra korunur.
 */
export function parsePastedAnswers(raw: string, order?: readonly number[]): string[] {
  const lines = raw.replace(/\r/g, '').split('\n').map(line => line.trim());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  if (!lines.length) return [];

  const filled = lines.filter(Boolean);
  const numbered = filled.map(line => NUMBERED_LINE.exec(line.replace(/\t+/g, '\t')));
  if (filled.length > 1 && numbered.every(m => m && normalizePastedAnswer(m[2]))) {
    if (!order) return numbered.map(m => normalizePastedAnswer(m![2]));
    const index = new Map(order.map((q, i) => [q, i]));
    const out: string[] = new Array(order.length).fill('');
    for (const m of numbered) {
      const at = index.get(Number(m![1]));
      if (at !== undefined) out[at] = normalizePastedAnswer(m![2]);
    }
    return out;
  }

  const firstCell = (line: string) => line.split('\t').map(cell => cell.trim()).find(Boolean) ?? '';
  const column = lines.every(line => {
    if (!line) return true;
    const cells = line.split('\t').map(cell => cell.trim()).filter(Boolean);
    return cells.length === 1 && Boolean(normalizePastedAnswer(cells[0]));
  });
  if (column && (lines.length > 1 || filled[0].length > 1)) {
    return lines.map(line => normalizePastedAnswer(firstCell(line)));
  }

  const out: string[] = [];
  for (const line of filled) {
    for (const part of line.split(/[\s,;\t]+/).filter(Boolean)) {
      const word = normalizePastedAnswer(part);
      if (word && part.length > 1) {
        out.push(word);
        continue;
      }
      for (const ch of part.toUpperCase()) {
        if (COMPACT_CHAR.test(ch)) out.push(normalizePastedAnswer(ch));
      }
    }
  }
  return out;
}

export interface AuditGroup {
  name: string;
  start: number;
  end: number;
}

export function flattenExamSections(sections: ExamSection[] | undefined | null): ExamSection[] {
  const out: ExamSection[] = [];
  const seen = new Set<number>();
  const walk = (list: ExamSection[] | undefined | null) => {
    for (const sec of list ?? []) {
      if (seen.has(sec.id)) continue;
      seen.add(sec.id);
      out.push(sec);
      walk(sec.sub_sections);
    }
  };
  walk(sections);
  return out;
}

export function choiceAuditGroups(sections: ExamSection[] | undefined | null): AuditGroup[] {
  const all = flattenExamSections(sections);
  const mains = all
    .filter(sec => !sec.parent_section && !sec.is_sub_section)
    .slice()
    .sort((a, b) => a.question_start - b.question_start || a.order - b.order);

  const groups: AuditGroup[] = [];
  for (const main of mains) {
    const children = all
      .filter(sec => sec.parent_section === main.id)
      .slice()
      .sort((a, b) => a.question_start - b.question_start || a.order - b.order);
    if (children.length === 0 || FOLD_AS_WHOLE.test(main.name)) {
      groups.push({ name: main.name, start: main.question_start, end: main.question_end });
      continue;
    }
    for (const child of children) {
      groups.push({ name: child.name, start: child.question_start, end: child.question_end });
    }
  }
  return groups;
}

/** Cevap ızgarasıyla aynı soru sırası. Yapıştırılan B cevapları bu sıraya oturur. */
export function examQuestionOrder(sections: ExamSection[] | undefined | null): number[] {
  return leafExamSections(sections).flatMap(sec => {
    const nums: number[] = [];
    for (let q = sec.question_start; q <= sec.question_end; q += 1) nums.push(q);
    return nums;
  });
}

export interface ChoiceDiff {
  choice: AuditedChoice;
  label: string;
  a: number;
  b: number;
}

export interface TestChoiceAudit {
  name: string;
  start: number;
  questionCount: number;
  aFilled: number;
  bFilled: number;
  a: Record<AuditedChoice, number>;
  b: Record<AuditedChoice, number>;
  diffs: ChoiceDiff[];
  ok: boolean;
}

export interface BookletChoiceAudit {
  tests: TestChoiceAudit[];
  expected: number;
  received: number;
  lengthNote: string;
  ok: boolean;
}

function emptyTally(): Record<AuditedChoice, number> {
  return { A: 0, B: 0, C: 0, D: 0, E: 0, INVALID: 0 };
}

function isAudited(value: string): value is AuditedChoice {
  return (AUDITED_CHOICES as string[]).includes(value);
}

export function auditBookletChoiceCounts(
  sections: ExamSection[] | undefined | null,
  aByQuestion: ReadonlyMap<number, string>,
  bAnswersInOrder: readonly string[],
): BookletChoiceAudit {
  const order = examQuestionOrder(sections);
  const indexOf = new Map(order.map((q, i) => [q, i]));
  const tests: TestChoiceAudit[] = choiceAuditGroups(sections).map(group => {
    const a = emptyTally();
    const b = emptyTally();
    let aFilled = 0;
    let bFilled = 0;
    const questionCount = Math.max(0, group.end - group.start + 1);
    for (let q = group.start; q <= group.end; q += 1) {
      const aAnswer = aByQuestion.get(q) ?? '';
      if (isAudited(aAnswer)) {
        a[aAnswer] += 1;
        aFilled += 1;
      }
      const idx = indexOf.get(q);
      const bAnswer = idx === undefined ? '' : (bAnswersInOrder[idx] ?? '');
      if (isAudited(bAnswer)) {
        b[bAnswer] += 1;
        bFilled += 1;
      }
    }
    const diffs = AUDITED_CHOICES
      .filter(choice => a[choice] !== b[choice])
      .map(choice => ({
        choice,
        label: CHOICE_LABEL[choice],
        a: a[choice],
        b: b[choice],
      }));
    const complete = aFilled === questionCount && bFilled === questionCount;
    return {
      name: group.name,
      start: group.start,
      questionCount,
      aFilled,
      bFilled,
      a,
      b,
      diffs,
      ok: diffs.length === 0 && complete,
    };
  });

  const received = bAnswersInOrder.length;
  const expected = order.length;
  const lengthNote = received === expected
    ? ''
    : `B kitapçığında ${received} cevap var, sınavda ${expected} soru var.`;
  return {
    tests,
    expected,
    received,
    lengthNote,
    ok: tests.length > 0 && tests.every(test => test.ok) && lengthNote === '',
  };
}

export function formatChoiceAuditMessage(audit: BookletChoiceAudit): string {
  if (audit.ok) {
    return `✅ B kitapçığı şık dağılımı uyumlu: ${audit.tests.map(test => test.name).join(', ')}.`;
  }
  const parts: string[] = [];
  if (audit.lengthNote) parts.push(audit.lengthNote);
  for (const test of audit.tests) {
    if (test.ok) continue;
    const bits = test.diffs.map(diff => `${diff.label} ${diff.a}≠${diff.b}`);
    if (test.aFilled !== test.questionCount || test.bFilled !== test.questionCount) {
      bits.unshift(`cevap A ${test.aFilled}, B ${test.bFilled}, soru ${test.questionCount}`);
    }
    parts.push(`${test.name}: ${bits.join(', ')}`);
  }
  return `⚠️ B kitapçığı şık dağılımı uyuşmuyor. ${parts.join(' · ')}`;
}
