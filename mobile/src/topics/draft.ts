import { readSecret, writeSecret } from '@/auth/storage';

export type TopicDraft = {
  topicId: number | null;
  outcomeIds?: number[];
  note: string;
  key: string;
};

type Bag = Record<string, TopicDraft>;

const STORAGE_KEY = 'topic-drafts';

function draftKey(accountId: number, kurumId: number, subeId: number, planId: number, cellId: number, date: string) {
  return `${accountId}:${kurumId}:${subeId}:${planId}:${cellId}:${date}`;
}

async function readBag(): Promise<Bag> {
  const raw = await readSecret(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Bag;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function readTopicDraft(
  accountId: number,
  kurumId: number,
  subeId: number,
  planId: number,
  cellId: number,
  date: string,
): Promise<TopicDraft | null> {
  const bag = await readBag();
  return bag[draftKey(accountId, kurumId, subeId, planId, cellId, date)] ?? null;
}

export async function writeTopicDraft(
  accountId: number,
  kurumId: number,
  subeId: number,
  planId: number,
  cellId: number,
  date: string,
  draft: TopicDraft | null,
): Promise<void> {
  const bag = await readBag();
  const key = draftKey(accountId, kurumId, subeId, planId, cellId, date);
  if (draft == null) delete bag[key];
  else bag[key] = draft;
  await writeSecret(STORAGE_KEY, JSON.stringify(bag));
}

export function dateForWeekday(dayIndex: number) {
  const now = new Date();
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayOffset = (now.getDay() + 6) % 7;
  cursor.setDate(cursor.getDate() - mondayOffset + dayIndex);
  const month = String(cursor.getMonth() + 1).padStart(2, '0');
  const day = String(cursor.getDate()).padStart(2, '0');
  return `${cursor.getFullYear()}-${month}-${day}`;
}

export function newRequestKey() {
  return `konu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
