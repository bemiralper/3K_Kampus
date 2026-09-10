import { trFold, trIncludes } from '@/lib/text-format';
import type { SubjectItem, TopicItem, OutcomeItem } from './types';

const STOP = new Set(['ve', 'ile', 'icin', 'bir']);

function nameTokens(value: string | null | undefined): string[] {
  return trFold(value || '')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP.has(w));
}

export function topicNameBelongsElsewhere(
  topic: TopicItem,
  home: SubjectItem | null,
  allSubjects: SubjectItem[],
): boolean {
  if (!home) return false;
  const title = nameTokens((topic.name || '').replace(/^.*·\s*/, ''));
  const homeToks = [...new Set([...nameTokens(home.name), ...nameTokens(home.display_name)])];
  if (homeToks.some(ht => title.some(tt => tt === ht || tt.startsWith(ht) || ht.startsWith(tt)))) {
    return false;
  }
  for (const other of allSubjects) {
    if (Number(other.id) === Number(home.id)) continue;
    const otherToks = [...new Set([...nameTokens(other.name), ...nameTokens(other.display_name)])];
    if (otherToks.length < 2) continue;
    const matched = otherToks.filter(ot =>
      title.some(tt => tt === ot || tt.startsWith(ot) || ot.startsWith(tt)),
    ).length;
    if (matched >= 2) return true;
  }
  return false;
}

export function dottedParts(raw: string): string[] {
  return (raw || '').trim().replace(/\.+$/, '').toLowerCase().split('.').filter(Boolean);
}

export function isDottedCode(value: string): boolean {
  return /^\d+(?:\.\d+)+$/.test((value || '').trim().replace(/\.+$/, ''));
}

/** 21.1 → 21.1.2 evet; 21.1 → 21.10.2 hayır. */
export function codeQueryHits(code: string | null | undefined, query: string): boolean {
  const q = (query || '').trim().replace(/\.+$/, '').toLowerCase();
  const c = (code || '').trim().replace(/\.+$/, '').toLowerCase();
  if (!q || !c) return false;
  if (isDottedCode(q)) {
    const qParts = dottedParts(q);
    const cParts = dottedParts(c);
    return c === q || (
      cParts.length > qParts.length && qParts.every((part, i) => cParts[i] === part)
    );
  }
  return c.includes(q);
}

export function outcomeHitsQuery(outcome: OutcomeItem, topic: TopicItem, query: string): boolean {
  const q = (query || '').trim();
  if (!q) return true;
  return (
    codeQueryHits(outcome.code, q) ||
    trIncludes(outcome.text, q) ||
    codeQueryHits(topic.code, q) ||
    trIncludes(topic.name, q) ||
    (outcome.sub_outcomes ?? []).some(sub =>
      codeQueryHits(sub.code, q) || trIncludes(sub.text, q),
    )
  );
}

export function filterTopicsByQuery(topics: TopicItem[], query: string): TopicItem[] {
  const q = (query || '').trim();
  if (!q) return topics;
  return topics
    .map(topic => {
      const topicHit = codeQueryHits(topic.code, q) || trIncludes(topic.name, q);
      const outcomes = (topic.outcomes ?? []).filter(o => topicHit || outcomeHitsQuery(o, topic, q));
      if (!topicHit && outcomes.length === 0) return null;
      return { ...topic, outcomes: topicHit && !isDottedCode(q) ? (topic.outcomes ?? []) : outcomes };
    })
    .filter((topic): topic is TopicItem => topic != null);
}

export function subjectsForSection(
  subjects: SubjectItem[],
  subjectId: number | null | undefined,
): SubjectItem[] {
  if (subjectId == null) return [];
  return subjects.filter(s => Number(s.id) === Number(subjectId));
}

export function flattenSubjectOutcomes(subjects: SubjectItem[]): OutcomeItem[] {
  const flat: OutcomeItem[] = [];
  for (const subj of subjects) {
    for (const topic of subj.topics ?? []) {
      for (const outcome of topic.outcomes ?? []) {
        flat.push({ ...outcome, sub_outcome_id: null });
        for (const sub of outcome.sub_outcomes ?? []) {
          flat.push({
            id: outcome.id,
            code: sub.code,
            text: sub.text,
            sub_outcome_id: sub.id,
          });
        }
      }
    }
  }
  return flat;
}

export function findOutcomeByText(input: string, outcomes: OutcomeItem[]): OutcomeItem | null {
  if (!input.trim()) return null;
  const q = input.trim().replace(/\.+$/, '').toLowerCase();

  const byCodeExact = outcomes.find(o => (o.code || '').trim().replace(/\.+$/, '').toLowerCase() === q);
  if (byCodeExact) return byCodeExact;

  const compact = q.replace(/\./g, '');
  const byCompact = outcomes.find(
    o => (o.code || '').toLowerCase().replace(/\./g, '') === compact,
  );
  if (byCompact) return byCompact;

  if (isDottedCode(q)) return null;

  const byTextExact = outcomes.find(o => (o.text || '').trim().toLowerCase() === q);
  if (byTextExact) return byTextExact;

  const byTextIncludes = outcomes.find(o => trIncludes(o.text, q));
  if (byTextIncludes) return byTextIncludes;

  return null;
}
