import type {
  DevelopmentOutcome,
  DevelopmentSubject,
  StudentExamResult,
  StudentExamSectionDetail,
  StudyRecommendation,
} from '@/components/olcme/types';

export const examTypeGroup = (type: string) =>
  ({ YKS_TYT: 'TYT', TYT_11: 'TYT_11', YKS_AYT: 'AYT', AYT_11: 'AYT_11', LGS: 'LGS', LGS_7: 'LGS_7' }[type] || 'manuel');

export const examTypeLabel = (type: string) =>
  ({
    YKS_TYT: 'TYT',
    TYT_11: '11. sınıf TYT',
    YKS_AYT: 'AYT',
    AYT_11: '11. sınıf AYT',
    LGS: 'LGS',
    LGS_7: '7. sınıf LGS',
    DENEME: 'Deneme',
  }[type] || type);

export const numberLabel = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString('tr-TR', { maximumFractionDigits: digits });

export const fixedLabel = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const signedLabel = (value: number | null | undefined, digits = 1) => {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value).toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (value > 0.004) return `+${abs}`;
  if (value < -0.004) return `−${abs}`;
  return abs;
};

export const dateLabel = (date?: string | null, withYear = false) =>
  date
    ? new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        ...(withYear ? { year: 'numeric' } : {}),
      })
    : 'Tarihsiz';

export const examPenaltyRatio = (examType?: string | null) =>
  examType === 'LGS' || examType === 'LGS_7' ? 1 / 3 : 1 / 4;

export const estimateNetPotential = (wrong: number, empty: number, examType?: string | null) =>
  wrong * (1 + examPenaltyRatio(examType)) + empty;

export const estimatePenaltyCost = (wrong: number, examType?: string | null) =>
  wrong * examPenaltyRatio(examType);

export type LossDominance = 'wrong' | 'empty' | 'balanced';

export function lossDominance(wrong: number, empty: number): {
  kind: LossDominance;
  shortLabel: string;
  coachHint: string;
} {
  const total = wrong + empty;
  if (!total) {
    return { kind: 'balanced', shortLabel: 'Hata yok', coachHint: '' };
  }
  const wrongRatio = wrong / total;
  if (wrongRatio >= 0.65) {
    return {
      kind: 'wrong',
      shortLabel: 'Yanlış ağırlıklı',
      coachHint: 'Öğrenci soruları çözüyor ancak kavram yanılgısı, çeldirici veya acele okuma nedeniyle yanlış işaretliyor.',
    };
  }
  if (wrongRatio <= 0.35) {
    return {
      kind: 'empty',
      shortLabel: 'Boş ağırlıklı',
      coachHint: 'Konu eksiği, soru tipine yabancılık veya süre yetiştirememe nedeniyle sorular boş bırakılıyor.',
    };
  }
  return {
    kind: 'balanced',
    shortLabel: 'Yanlış ve boş dengeli',
    coachHint: 'Hem konu tekrarı hem de soru pratiği birlikte desteklenmeli.',
  };
}

export type Counts = { question_count: number; correct: number; wrong: number; empty: number };
export type EvidencePoint = Counts & { exam_id: number };
export type LossState = 'unmeasured' | 'limited' | 'new_drop' | 'improving_loss' | 'recurring' | 'isolated' | 'no_loss';

export const lossStateLabels: Record<LossState, string> = {
  unmeasured: 'Son sınavlarda çıkmadı',
  limited: 'Az soru',
  new_drop: 'Hata arttı',
  improving_loss: 'Hata azalıyor',
  recurring: 'Tekrarlayan hata',
  isolated: 'Tek seferlik',
  no_loss: 'Hata yok',
};

export const sumCounts = (rows: Counts[]): Counts =>
  rows.reduce(
    (sum, row) => ({
      question_count: sum.question_count + row.question_count,
      correct: sum.correct + row.correct,
      wrong: sum.wrong + row.wrong,
      empty: sum.empty + row.empty,
    }),
    { question_count: 0, correct: 0, wrong: 0, empty: 0 }
  );

export const lossRate = (row: Counts) =>
  row.question_count > 0 ? (100 * (row.wrong + row.empty)) / row.question_count : null;

function mergeEvidence(points: EvidencePoint[]): EvidencePoint[] {
  const byExam = new Map<number, Counts>();
  points.forEach(point =>
    byExam.set(point.exam_id, sumCounts([...(byExam.has(point.exam_id) ? [byExam.get(point.exam_id)!] : []), point]))
  );
  return Array.from(byExam, ([exam_id, counts]) => ({ exam_id, ...counts }));
}

/** Disjoint, equal-sized exam windows, at most three exams each. Never fills missing evidence with zero. */
export function periodComparison(points: EvidencePoint[], examIds: number[]) {
  const size = Math.min(3, Math.floor(examIds.length / 2));
  const previousIds = size >= 2 ? examIds.slice(-size * 2, -size) : [];
  const recentIds = size >= 2 ? examIds.slice(-size) : [];
  const merged = mergeEvidence(points);
  const previous = merged.filter(p => previousIds.includes(p.exam_id));
  const recent = merged.filter(p => recentIds.includes(p.exam_id));
  const before = sumCounts(previous);
  const after = sumCounts(recent);
  const enough = previous.length >= 2 && recent.length >= 2 && before.question_count >= 5 && after.question_count >= 5;
  return {
    size,
    previousIds,
    recentIds,
    before,
    after,
    previousObservations: previous.length,
    recentObservations: recent.length,
    delta: enough ? lossRate(after)! - lossRate(before)! : null,
  };
}

export function evidenceSummary(points: EvidencePoint[], examIds: number[]) {
  const byExam = new Map(mergeEvidence(points).map(point => [point.exam_id, point]));
  const ordered = Array.from(new Set(examIds)).flatMap(id => (byExam.has(id) ? [byExam.get(id)!] : []));
  const counts = sumCounts(ordered);
  const affected = ordered.filter(p => p.wrong + p.empty > 0).length;
  const lastIndex = Math.max(-1, ...ordered.map(p => examIds.indexOf(p.exam_id)));
  const missingExams = lastIndex < 0 ? examIds.length : examIds.length - lastIndex - 1;
  const recentLoss = ordered.some(p => examIds.slice(-2).includes(p.exam_id) && p.wrong + p.empty > 0);
  const comparison = periodComparison(ordered, examIds);
  const previous = ordered.slice(0, -1);
  const last = ordered.at(-1);
  const priorCounts = sumCounts(previous);
  const latestChange =
    last && previous.length >= 2 && priorCounts.question_count >= 5 && last.question_count >= 3
      ? lossRate(last)! - lossRate(priorCounts)!
      : null;
  const loss = counts.wrong + counts.empty;
  let state: LossState = 'isolated';
  if (missingExams >= 2) state = 'unmeasured';
  else if (counts.question_count < 5 || ordered.length < 2) state = 'limited';
  else if (!loss) state = 'no_loss';
  else if ((comparison.delta != null && comparison.delta >= 10) || (latestChange != null && latestChange >= 15))
    state = 'new_drop';
  else if (comparison.delta != null && comparison.delta <= -10 && recentLoss) state = 'improving_loss';
  else if (affected >= 2 && recentLoss) state = 'recurring';
  const rate = lossRate(counts);
  const baseText = `Bu konudan ${ordered.length} sınavda toplam ${counts.question_count} soru soruldu; ${affected} sınavda hata yapıldı (${counts.wrong} yanlış, ${counts.empty} boş${rate == null ? '' : ` · %${numberLabel(rate)} hata`}).`;
  const tailText = missingExams
    ? ` Son ${missingExams === 1 ? 'sınavda' : `${missingExams} sınavda`} bu konudan soru çıkmadı; eksikliğin kapandığını görmek için sonraki sınavları takip edin.`
    : comparison.delta == null
      ? ' Dönem karşılaştırması için henüz yeterli soru sayısı oluşmadı.'
      : ` Önceki ${comparison.size} sınava göre son ${comparison.size} sınavda hata oranı ${
          comparison.delta > 0
            ? `+${numberLabel(comparison.delta)} puan arttı.`
            : comparison.delta < 0
              ? `${numberLabel(Math.abs(comparison.delta))} puan azaldı.`
              : 'değişmedi.'
        }`;
  const reason = baseText + tailText;
  return { ...counts, loss, rate, affected, measured: ordered.length, missingExams, recentLoss, state, comparison, reason };
}

export function buildLossTopics(subjects: DevelopmentSubject[], examIds?: number[], examType?: string | null) {
  return subjects
    .filter(subject => subject.score_included !== false)
    .flatMap(subject => {
      const ids = examIds || subject.series.map(p => p.exam_id);
      const subjectLoss = subject.series.reduce((sum, p) => sum + p.wrong + p.empty, 0);
      const byTopic = new Map<string, EvidencePoint[]>();
      subject.outcomes.forEach(outcome =>
        byTopic.set(outcome.topic, [...(byTopic.get(outcome.topic) || []), ...outcome.series])
      );
      const seriesByTopic = new Map(Array.from(byTopic, ([name, points]) => [name, mergeEvidence(points)]));
      return subject.topics.map(topic => {
        const allowedIds = new Set(ids);
        const series = (seriesByTopic.get(topic.name) || []).filter(point => allowedIds.has(point.exam_id));
        const evidence = evidenceSummary(series, ids);
        const loss = topic.wrong + topic.empty;
        const examDivisor = Math.max(evidence.measured || 1, 1);
        const avgGainPerExam = estimateNetPotential(topic.wrong, topic.empty, examType) / examDivisor;
        return {
          ...topic,
          subject: subject.name,
          key: JSON.stringify([subject.name, topic.name]),
          loss,
          rate: lossRate(topic),
          share: subjectLoss ? (100 * loss) / subjectLoss : null,
          netPotentialTotal: estimateNetPotential(topic.wrong, topic.empty, examType),
          netPotentialPerExam: avgGainPerExam,
          dominance: lossDominance(topic.wrong, topic.empty),
          series,
          evidence,
        };
      });
    })
    .sort((a, b) => b.loss - a.loss || (b.rate || 0) - (a.rate || 0) || a.key.localeCompare(b.key));
}

export type LossTopic = ReturnType<typeof buildLossTopics>[number];
export type TopicSort = 'priority' | 'loss' | 'rate' | 'decline';

export function sortTopics(topics: LossTopic[], sort: TopicSort) {
  return topics.slice().sort((a, b) => {
    if (sort === 'priority') {
      const tier = (item: LossTopic) => (item.question_count >= 5 && item.evidence.recentLoss ? 1 : 0);
      if (tier(a) !== tier(b)) return tier(b) - tier(a);
    }
    if (sort === 'rate' && a.rate !== b.rate) return (b.rate ?? -1) - (a.rate ?? -1);
    if (sort === 'decline' && a.evidence.comparison.delta !== b.evidence.comparison.delta)
      return (b.evidence.comparison.delta ?? -Infinity) - (a.evidence.comparison.delta ?? -Infinity);
    return (
      b.loss - a.loss ||
      (b.rate || 0) - (a.rate || 0) ||
      b.evidence.affected - a.evidence.affected ||
      a.key.localeCompare(b.key)
    );
  });
}

export function coverage(subject: DevelopmentSubject) {
  const answers = sumCounts(subject.series);
  const total = answers.correct + answers.wrong + answers.empty;
  const mapped = subject.topics.reduce((sum, topic) => sum + topic.question_count, 0);
  return { total, mapped, percent: total > 0 ? (100 * mapped) / total : null, inconsistent: mapped > total };
}

export function groupOutcomes(outcomes: DevelopmentOutcome[]) {
  const groups = new Map<string, { name: string; items: DevelopmentOutcome[] }>();
  outcomes.forEach((outcome, index) => {
    const key = outcome.outcome_id != null ? `id:${outcome.outcome_id}` : `unmapped:${index}`;
    const group =
      groups.get(key) || {
        name:
          outcome.parent_outcome_name ||
          (outcome.sub_outcome_id ? `Üst kazanım ${outcome.outcome_id ?? 'belirtilmemiş'}` : outcome.name),
        items: [],
      };
    group.items.push(outcome);
    groups.set(key, group);
  });
  return Array.from(groups.values()).sort(
    (a, b) => sumCounts(b.items).wrong + sumCounts(b.items).empty - sumCounts(a.items).wrong - sumCounts(a.items).empty
  );
}

export function chronologicalExams(exams: StudentExamResult[], type: string, window: string, from: string, to: string) {
  const filtered = exams
    .filter(
      exam =>
        exam.exam_type === type &&
        (!from || (!!exam.exam_date && exam.exam_date >= from)) &&
        (!to || (!!exam.exam_date && exam.exam_date <= to))
    )
    .slice()
    .sort((a, b) => (a.exam_date || '').localeCompare(b.exam_date || '') || a.exam_id - b.exam_id);
  return window === 'all' ? filtered : filtered.slice(-Number(window));
}

// ── Section Tree & Exam Comparison Helpers ───────────────────────────────────

const AYT_ALAN_KEYS: Record<string, Set<string>> = {
  SAYISAL: new Set(['matematik', 'geometri', 'fizik', 'kimya', 'biyoloji']),
  ESIT_AGIRLIK: new Set(['edebiyat', 'tarih1', 'cografya1', 'matematik', 'geometri']),
  SOZEL: new Set([
    'edebiyat',
    'tarih1',
    'cografya1',
    'tarih2',
    'cografya2',
    'felsefegrubu',
    'dkab',
    'felsefesecmeli',
  ]),
};

export function foldTr(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

export function sectionKey(name: string) {
  const compact = foldTr(name).replace(/[\s_\-()]/g, '');
  return (
    {
      turkce: 'turkce',
      turkdiliveedebiyati: 'edebiyat',
      turkdili: 'edebiyat',
      tde: 'edebiyat',
      edebiyat: 'edebiyat',
      tarih: 'tarih',
      tarih1: 'tarih1',
      cografya: 'cografya',
      cografya1: 'cografya1',
      tarih2: 'tarih2',
      cografya2: 'cografya2',
      felsefe: 'felsefe',
      felsefegrubu: 'felsefegrubu',
      dinkulturuveahlakbilgisi: 'dkab',
      dinkulturu: 'dkab',
      dkab: 'dkab',
      sosyalbilimler: 'sosyal',
      temelmatematik: 'temelmatematik',
      matematik: 'matematik',
      matematik2: 'matematik',
      mat2: 'matematik',
      yabancidil: 'ingilizce',
      inkilaptarihi: 'inkilap',
      geometri: 'geometri',
      fenbilimleri: 'fen',
      fizik: 'fizik',
      kimya: 'kimya',
      biyoloji: 'biyoloji',
      felsefesecmeli: 'felsefesecmeli',
      inkilap: 'inkilap',
      tcinkilap: 'inkilap',
      inkilaptarihiveataturkculuk: 'inkilap',
      ingilizce: 'ingilizce',
    }[compact] || compact
  );
}

function normalizeAlan(alan?: string | null) {
  if (!alan) return null;
  const compact = foldTr(alan).replace(/[\s_\-]/g, '');
  if (['sayisal', 'say', 'sys'].includes(compact)) return 'SAYISAL';
  if (['esitagirlik', 'ea'].includes(compact)) return 'ESIT_AGIRLIK';
  if (['sozel', 'soz'].includes(compact)) return 'SOZEL';
  return ['SAYISAL', 'ESIT_AGIRLIK', 'SOZEL'].includes(alan) ? alan : null;
}

function aytSectionAllowed(name: string, alan?: string | null) {
  const allowed = AYT_ALAN_KEYS[normalizeAlan(alan) || ''];
  if (!allowed) return true;
  return allowed.has(sectionKey(name));
}

function trackAllowed(name: string, alan?: string | null) {
  if (sectionKey(name) === 'felsefesecmeli' && normalizeAlan(alan) !== 'SOZEL') return false;
  return true;
}

const FEN_CHILDREN = new Set(['fizik', 'kimya', 'biyoloji']);
const SOS_CHILDREN = new Set(['tarih', 'cografya', 'felsefe', 'dkab', 'felsefesecmeli']);
const MAT_CHILDREN = new Set(['matematik', 'geometri']);

export type SectionNode = StudentExamSectionDetail & { children: StudentExamSectionDetail[] };

function mainSections(exam: StudentExamResult) {
  return (exam.section_details || []).filter(s => !s.is_sub_section);
}

function subSections(exam: StudentExamResult) {
  return (exam.section_details || []).filter(s => s.is_sub_section);
}

export function relevantSections(exam: StudentExamResult, alan?: string | null) {
  alan = exam.alan ?? alan;
  if (exam.exam_type !== 'YKS_AYT') {
    return mainSections(exam).filter(s => trackAllowed(s.section_name, alan));
  }
  const all = [...mainSections(exam), ...subSections(exam)];
  const leaves = all.filter(row => {
    const kids = all.filter(s => s.parent_section_id === row.section_id);
    return !kids.length || kids.reduce((sum, s) => sum + s.question_count, 0) < row.question_count;
  });
  return leaves.filter(
    s => (s.alana_dahil ?? aytSectionAllowed(s.section_name, alan)) && (trackAllowed(s.section_name, alan) || s.correct + s.wrong > 0)
  );
}

function inferParentId(exam: StudentExamResult, sub: StudentExamSectionDetail, mains: StudentExamSectionDetail[]) {
  if (sub.parent_section_id) return sub.parent_section_id;
  if (exam.exam_type === 'YKS_AYT') return null;
  const key = sectionKey(sub.section_name);
  const needle = FEN_CHILDREN.has(key)
    ? 'fen'
    : SOS_CHILDREN.has(key)
      ? 'sosyal'
      : MAT_CHILDREN.has(key)
        ? 'matematik'
        : null;
  if (!needle) return null;
  const parent = mains.find(main => foldTr(main.section_name).replace(/[\s_\-()]/g, '').includes(needle));
  return parent?.section_id ?? null;
}

export function buildSectionTree(exam: StudentExamResult, alan?: string | null): SectionNode[] {
  alan = exam.alan ?? alan;
  const mains = mainSections(exam).filter(sec => trackAllowed(sec.section_name, alan));
  const subs = subSections(exam).filter(sec => trackAllowed(sec.section_name, alan));
  if (exam.exam_type === 'YKS_AYT') {
    return relevantSections(exam, alan).map(sec => ({ ...sec, children: [] }));
  }
  const used = new Set<number>();
  const tree = mains.map(main => {
    const children = subs.filter(sub => inferParentId(exam, sub, mains) === main.section_id);
    children.forEach(child => used.add(child.section_id));
    return { ...main, children };
  });
  subs
    .filter(sub => !used.has(sub.section_id))
    .forEach(sub => {
      tree.push({ ...sub, children: [] });
    });
  return tree;
}

export function examRank(exam: StudentExamResult, alan?: string | null) {
  alan = exam.alan ?? alan;
  if (['YKS_AYT', 'AYT_11'].includes(exam.exam_type) && exam.puan_turleri) {
    const key =
      exam.alan_puan_turu ||
      (normalizeAlan(alan) === 'ESIT_AGIRLIK' ? 'EA' : normalizeAlan(alan) === 'SOZEL' ? 'SOZ' : 'SAY');
    const pt = exam.puan_turleri[key as keyof NonNullable<StudentExamResult['puan_turleri']>];
    if (pt) {
      return {
        rank: pt.tahmini_siralama ?? exam.tahmini_siralama,
        pct: pt.yuzdelik_dilim ?? exam.yuzdelik_dilim,
        puan: pt.puan ?? exam.puan,
        kind: key,
      };
    }
  }
  return {
    rank: exam.tahmini_siralama,
    pct: exam.yuzdelik_dilim,
    puan: exam.puan ?? 0,
    kind: null as string | null,
  };
}

export function sectionComparisonRows(left: StudentExamResult, right: StudentExamResult) {
  const leftSecs = relevantSections(left);
  const rightSecs = relevantSections(right);
  const byKey = new Map<
    string,
    { name: string; leftNet: number | null; rightNet: number | null; leftLoss: number | null; rightLoss: number | null }
  >();
  leftSecs.forEach(sec => {
    const key = sectionKey(sec.section_name);
    byKey.set(key, {
      name: sec.section_name,
      leftNet: sec.net,
      rightNet: null,
      leftLoss: sec.wrong + sec.empty,
      rightLoss: null,
    });
  });
  rightSecs.forEach(sec => {
    const key = sectionKey(sec.section_name);
    const cur = byKey.get(key);
    if (cur) {
      cur.rightNet = sec.net;
      cur.rightLoss = sec.wrong + sec.empty;
    } else {
      byKey.set(key, {
        name: sec.section_name,
        leftNet: null,
        rightNet: sec.net,
        leftLoss: null,
        rightLoss: sec.wrong + sec.empty,
      });
    }
  });
  return Array.from(byKey.values()).map(row => ({
    ...row,
    diff: row.leftNet != null && row.rightNet != null ? row.rightNet - row.leftNet : null,
  }));
}

export function matchAgendaForOutcome(
  agendaItems: StudyRecommendation[] | undefined,
  outcome: DevelopmentOutcome
): StudyRecommendation | undefined {
  if (!agendaItems?.length) return undefined;
  return agendaItems.find(
    item =>
      item.subject === outcome.subject &&
      (item.name === outcome.name || (item.topic === outcome.topic && foldTr(item.name) === foldTr(outcome.name)))
  );
}

export type PrecisionRecommendation = {
  item: StudyRecommendation;
  totalQuestions: number;
  totalWrong: number;
  totalEmpty: number;
  totalLoss: number;
  errorRate: number;
  measuredExams: number;
  missedExams: number;
  netPotentialPerExam: number;
  recentHasLoss: boolean;
  isWorsening: boolean;
  dominance: ReturnType<typeof lossDominance>;
  studyMethod: string;
  whyText: string;
  tier: 'priority' | 'secondary' | 'watch';
};

export type PrecisionRecommendationBundle = {
  priority: PrecisionRecommendation[];
  secondary: PrecisionRecommendation[];
  watch: PrecisionRecommendation[];
  planned: PrecisionRecommendation[];
  deferred: PrecisionRecommendation[];
  totalNetPotential: number;
};

function studyMethodFor(kind: LossDominance) {
  if (kind === 'wrong') {
    return 'Yanlış soruların çözümünü birlikte inceleyin; kavram kontrolü ve orta seviye soru pratiği yapın.';
  }
  if (kind === 'empty') {
    return 'Kısa konu özeti tekrarı yapın; temel seviye soru çözümü ve sınav süresi pratiği planlayın.';
  }
  return 'Kısa konu tekrarı ardından temel ve orta seviye karma soru çözümü ile pekiştirin.';
}

/**
 * Sıfır yanlış yönlendirme için 4 kurallı nokta atışı öneri filtresi:
 * 1. Alan dışı dersler ve kazanımı girilmemiş sorular hariç tutulur.
 * 2. Öncelikli öneri: en az 2 sınavda hata + toplam en az 3 soru + son 2 sınavda güncel hata + toparlanmamış.
 * 3. En fazla 5 öncelikli öneri öne çıkarılır (sınav başı net kazanç potansiyeline göre).
 * 4. Plana alınanlar, geçilenler ve kontrol edilebilir (tek sınav / son sınavda çıkmayan) konular ayrıştırılır.
 */
export function buildPrecisionRecommendations(
  items: StudyRecommendation[] | undefined,
  exams: StudentExamResult[],
  examType?: string | null
): PrecisionRecommendationBundle {
  const empty: PrecisionRecommendationBundle = {
    priority: [],
    secondary: [],
    watch: [],
    planned: [],
    deferred: [],
    totalNetPotential: 0,
  };
  if (!items?.length) return empty;

  const examIds = exams.map(e => e.exam_id);
  const lastTwoIds = new Set(examIds.slice(-2));

  const enriched: PrecisionRecommendation[] = [];

  for (const item of items) {
    // 1. Alan dışı dersleri, kazanımı girilmemiş satırları ve ders-geneli fallback satırlarını hariç tut.
    if (item.kind === 'academic') continue;
    if (
      item.topic === 'Eşleme eksik' ||
      foldTr(item.name).includes('kazanimi eslenmemis') ||
      foldTr(item.name).includes('kirilim eksik') ||
      (!item.outcome_id && !item.sub_outcome_id && foldTr(item.name) === foldTr(item.subject))
    ) {
      continue;
    }

    const series = item.evidence || [];
    const totalQuestions = series.length
      ? series.reduce((sum, p) => sum + (p.question_count || 0), 0)
      : item.question_count || 0;
    const totalWrong = series.length ? series.reduce((sum, p) => sum + (p.wrong || 0), 0) : item.wrong || 0;
    const totalEmpty = series.length ? series.reduce((sum, p) => sum + (p.empty || 0), 0) : item.empty || 0;
    const totalLoss = totalWrong + totalEmpty;
    if (totalLoss <= 0 || totalQuestions <= 0) continue;

    const measuredExams = Math.max(1, item.exam_count || series.length || 1);
    const missedExams = Math.max(
      1,
      item.missed_exam_count || series.filter(p => (p.wrong || 0) + (p.empty || 0) > 0).length || 1
    );

    const recentPoints = series.filter(p => lastTwoIds.has(p.exam_id));
    const recentHasLoss =
      item.kind === 'current' ||
      item.kind === 'recurring' ||
      recentPoints.some(p => (p.wrong || 0) + (p.empty || 0) > 0);
    const recentRecovered =
      recentPoints.length >= 2 && recentPoints.every(p => (p.mastery_rate ?? 0) >= 80);

    // Eğer son 2 sınavda toparlandıysa ve koç tarafından özellikle plana alınmadıysa önerme.
    if (recentRecovered && item.status !== 'planned') continue;

    const ev = series.length ? evidenceSummary(series, examIds) : null;
    const isWorsening = ev?.state === 'new_drop';
    const errorRate = (100 * totalLoss) / totalQuestions;
    const netPotentialPerExam =
      estimateNetPotential(totalWrong, totalEmpty, examType) / measuredExams;
    const dominance = lossDominance(totalWrong, totalEmpty);
    const studyMethod = studyMethodFor(dominance.kind);

    const whyParts: string[] = [];
    if (missedExams >= 2) {
      whyParts.push(`Sorulduğu ${measuredExams} sınavın ${missedExams} tanesinde hata yapıldı`);
    } else {
      whyParts.push(`Son sınavda ${totalLoss} soru kaybı var`);
    }
    whyParts.push(`toplam ${totalQuestions} soruda %${numberLabel(errorRate, 0)} hata`);
    if (netPotentialPerExam >= 0.25) {
      whyParts.push(`sınav başına ≈ +${numberLabel(netPotentialPerExam, 2)} net potansiyeli`);
    }

    const passesStrictRule = missedExams >= 2 && totalQuestions >= 3 && recentHasLoss && !recentRecovered;
    const tier: PrecisionRecommendation['tier'] = passesStrictRule ? 'priority' : 'watch';

    enriched.push({
      item,
      totalQuestions,
      totalWrong,
      totalEmpty,
      totalLoss,
      errorRate,
      measuredExams,
      missedExams,
      netPotentialPerExam,
      recentHasLoss,
      isWorsening,
      dominance,
      studyMethod,
      whyText: whyParts.join(' · '),
      tier,
    });
  }

  // Sıralama: önce hata artanlar, sonra sınav başı net potansiyeli, sonra tekrar sayısı, sonra toplam kayıp.
  const rankSort = (a: PrecisionRecommendation, b: PrecisionRecommendation) =>
    Number(b.isWorsening) - Number(a.isWorsening) ||
    b.netPotentialPerExam - a.netPotentialPerExam ||
    b.missedExams - a.missedExams ||
    b.totalLoss - a.totalLoss ||
    a.item.subject.localeCompare(b.item.subject, 'tr');

  const planned = enriched.filter(r => r.item.status === 'planned').sort(rankSort);
  const deferred = enriched
    .filter(r => r.item.status === 'deferred' || r.item.status === 'dismissed')
    .sort(rankSort);
  const active = enriched.filter(
    r => !['planned', 'deferred', 'dismissed'].includes(r.item.status)
  );

  const strictAll = active.filter(r => r.tier === 'priority').sort(rankSort);
  const priority = strictAll.slice(0, 5);
  const secondary = strictAll.slice(5).map(r => ({ ...r, tier: 'secondary' as const }));
  const watch = active.filter(r => r.tier === 'watch').sort(rankSort);

  const totalNetPotential = priority.reduce((sum, r) => sum + r.netPotentialPerExam, 0);

  return { priority, secondary, watch, planned, deferred, totalNetPotential };
}
