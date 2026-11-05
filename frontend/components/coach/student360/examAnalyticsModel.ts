import type { DevelopmentOutcome, DevelopmentSubject, StudentExamResult } from '@/components/olcme/types';

export const examTypeGroup = (type: string) => ({ YKS_TYT: 'TYT', TYT_11: 'TYT_11', YKS_AYT: 'AYT', AYT_11: 'AYT_11', LGS: 'LGS', LGS_7: 'LGS_7' }[type] || 'manuel');
export const examTypeLabel = (type: string) => ({ YKS_TYT: 'TYT', TYT_11: '11. sınıf TYT', YKS_AYT: 'AYT', AYT_11: '11. sınıf AYT', LGS: 'LGS', LGS_7: '7. sınıf LGS' }[type] || type);
export const numberLabel = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('tr-TR', { maximumFractionDigits: digits });
export type Counts = { question_count: number; correct: number; wrong: number; empty: number };
export type EvidencePoint = Counts & { exam_id: number };
export type LossState = 'unmeasured' | 'limited' | 'new_drop' | 'improving_loss' | 'recurring' | 'isolated' | 'no_loss';
export const lossStateLabels: Record<LossState, string> = {
  unmeasured: 'Yeniden ölçülmedi', limited: 'Sınırlı veri', new_drop: 'Yeni düşüş',
  improving_loss: 'İyileşiyor, kayıp sürüyor', recurring: 'Tekrarlayan kayıp', isolated: 'Tekil / dağınık kayıp', no_loss: 'Gözlenen kayıp yok',
};
export const sumCounts = (rows: Counts[]): Counts => rows.reduce((sum, row) => ({ question_count: sum.question_count + row.question_count, correct: sum.correct + row.correct, wrong: sum.wrong + row.wrong, empty: sum.empty + row.empty }), { question_count: 0, correct: 0, wrong: 0, empty: 0 });
export const lossRate = (row: Counts) => row.question_count > 0 ? 100 * (row.wrong + row.empty) / row.question_count : null;

function mergeEvidence(points: EvidencePoint[]): EvidencePoint[] {
  const byExam = new Map<number, Counts>();
  points.forEach(point => byExam.set(point.exam_id, sumCounts([...(byExam.has(point.exam_id) ? [byExam.get(point.exam_id)!] : []), point])));
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
  const before = sumCounts(previous), after = sumCounts(recent);
  const enough = previous.length >= 2 && recent.length >= 2 && before.question_count >= 5 && after.question_count >= 5;
  return { size, previousIds, recentIds, before, after, previousObservations: previous.length, recentObservations: recent.length,
    delta: enough ? lossRate(after)! - lossRate(before)! : null };
}

export function evidenceSummary(points: EvidencePoint[], examIds: number[]) {
  const byExam = new Map(mergeEvidence(points).map(point => [point.exam_id,point]));
  const ordered = Array.from(new Set(examIds)).flatMap(id => byExam.has(id) ? [byExam.get(id)!] : []);
  const counts = sumCounts(ordered);
  const affected = ordered.filter(p => p.wrong + p.empty > 0).length;
  const lastIndex = Math.max(-1, ...ordered.map(p => examIds.indexOf(p.exam_id)));
  const missingExams = lastIndex < 0 ? examIds.length : examIds.length - lastIndex - 1;
  const recentLoss = ordered.some(p => examIds.slice(-2).includes(p.exam_id) && p.wrong + p.empty > 0);
  const comparison = periodComparison(ordered, examIds);
  const previous = ordered.slice(0, -1), last = ordered.at(-1);
  const priorCounts = sumCounts(previous);
  const latestChange = last && previous.length >= 2 && priorCounts.question_count >= 5 && last.question_count >= 3 ? lossRate(last)! - lossRate(priorCounts)! : null;
  const loss = counts.wrong + counts.empty;
  let state: LossState = 'isolated';
  if (missingExams >= 2) state = 'unmeasured';
  else if (counts.question_count < 5 || ordered.length < 2) state = 'limited';
  else if (!loss) state = 'no_loss';
  else if ((comparison.delta != null && comparison.delta >= 10) || (latestChange != null && latestChange >= 15)) state = 'new_drop';
  else if (comparison.delta != null && comparison.delta <= -10 && recentLoss) state = 'improving_loss';
  else if (affected >= 2 && recentLoss) state = 'recurring';
  const rate = lossRate(counts);
  const reason = `${ordered.length} sınavda ${counts.question_count} gözlem; ${affected} sınavda kayıp. ${counts.wrong} yanlış, ${counts.empty} boş${rate == null ? '' : ` (%${numberLabel(rate)} kayıp)`}. ${missingExams ? `Son ${missingExams} sınavda ölçülmedi; iyileştiği varsayılmaz.` : comparison.delta == null ? 'Dönem değişimi için yeterli karşılaştırılabilir gözlem yok.' : `Son ${comparison.size} / önceki ${comparison.size} sınav: kayıp oranı ${comparison.delta > 0 ? '+' : ''}${numberLabel(comparison.delta)} yüzde puan.`}`;
  return { ...counts, loss, rate, affected, measured: ordered.length, missingExams, recentLoss, state, comparison, reason };
}

export function buildLossTopics(subjects: DevelopmentSubject[], examIds?: number[]) {
  return subjects.filter(subject => subject.score_included !== false).flatMap(subject => {
    const ids = examIds || subject.series.map(p => p.exam_id);
    const subjectLoss = subject.series.reduce((sum,p) => sum + p.wrong + p.empty, 0);
    const byTopic = new Map<string, EvidencePoint[]>();
    subject.outcomes.forEach(outcome => byTopic.set(outcome.topic, [...(byTopic.get(outcome.topic) || []), ...outcome.series]));
    const seriesByTopic = new Map(Array.from(byTopic, ([name,points]) => [name, mergeEvidence(points)]));
    return subject.topics.map(topic => {
      const allowedIds = new Set(ids);
      const series = (seriesByTopic.get(topic.name) || []).filter(point => allowedIds.has(point.exam_id));
      const evidence = evidenceSummary(series, ids);
      const loss = topic.wrong + topic.empty;
      return { ...topic, subject: subject.name, key: JSON.stringify([subject.name, topic.name]), loss,
        rate: lossRate(topic), share: subjectLoss ? 100 * loss / subjectLoss : null, series, evidence };
    });
  }).sort((a,b) => b.loss - a.loss || (b.rate || 0) - (a.rate || 0) || a.key.localeCompare(b.key));
}
export type LossTopic = ReturnType<typeof buildLossTopics>[number];
export type TopicSort = 'priority' | 'loss' | 'rate' | 'decline';
export function sortTopics(topics: LossTopic[], sort: TopicSort) {
  return topics.slice().sort((a,b) => {
    if (sort === 'priority') {
      const tier = (item: LossTopic) => item.question_count >= 5 && item.evidence.recentLoss ? 1 : 0;
      if (tier(a) !== tier(b)) return tier(b) - tier(a);
    }
    if (sort === 'rate' && a.rate !== b.rate) return (b.rate ?? -1) - (a.rate ?? -1);
    if (sort === 'decline' && a.evidence.comparison.delta !== b.evidence.comparison.delta) return (b.evidence.comparison.delta ?? -Infinity) - (a.evidence.comparison.delta ?? -Infinity);
    return b.loss - a.loss || (b.rate || 0) - (a.rate || 0) || b.evidence.affected - a.evidence.affected || a.key.localeCompare(b.key);
  });
}
export function coverage(subject: DevelopmentSubject) {
  const answers = sumCounts(subject.series);
  const total = answers.correct + answers.wrong + answers.empty;
  const mapped = subject.topics.reduce((sum,topic) => sum + topic.question_count, 0);
  return { total, mapped, percent: total > 0 ? 100 * mapped / total : null, inconsistent: mapped > total };
}
export function groupOutcomes(outcomes: DevelopmentOutcome[]) {
  const groups = new Map<string, { name: string; items: DevelopmentOutcome[] }>();
  outcomes.forEach((outcome,index) => {
    const key = outcome.outcome_id != null ? `id:${outcome.outcome_id}` : `unmapped:${index}`;
    const group = groups.get(key) || { name: outcome.parent_outcome_name || (outcome.sub_outcome_id ? `Üst kazanım ${outcome.outcome_id ?? 'eşlemesi yok'}` : outcome.name), items: [] };
    group.items.push(outcome); groups.set(key, group);
  });
  return Array.from(groups.values()).sort((a,b) => sumCounts(b.items).wrong + sumCounts(b.items).empty - sumCounts(a.items).wrong - sumCounts(a.items).empty);
}
export function chronologicalExams(exams: StudentExamResult[], type: string, window: string, from: string, to: string) {
  const filtered = exams.filter(exam => exam.exam_type === type && (!from || !!exam.exam_date && exam.exam_date >= from) && (!to || !!exam.exam_date && exam.exam_date <= to))
    .slice().sort((a,b) => (a.exam_date || '').localeCompare(b.exam_date || '') || a.exam_id - b.exam_id);
  return window === 'all' ? filtered : filtered.slice(-Number(window));
}
