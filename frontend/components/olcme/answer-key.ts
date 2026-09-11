import type { AnswerKey } from './types';

/**
 * Sınavın ana (A / kitapçıksız) cevap anahtarını seçer.
 *
 * Cevap Anahtarı ve Kazanımlar sekmeleri farklı kurallar kullandığı için
 * aynı sınavda farklı anahtarları düzenleyebiliyorlardı. Tek kural:
 * dolu + is_primary → dolu B olmayan → is_primary → ilk kayıt.
 */
export function pickPrimaryAnswerKey(keys: AnswerKey[]): AnswerKey | null {
  if (!keys || keys.length === 0) return null;
  const filled = keys.filter(k => (k.items?.length ?? 0) > 0);
  const byMostItems = (list: AnswerKey[]) =>
    list.reduce((best, k) => (k.items.length > best.items.length ? k : best));

  const primaryFilled = filled.filter(k => k.is_primary && k.booklet !== 'B');
  if (primaryFilled.length) return byMostItems(primaryFilled);

  const nonBFilled = filled.filter(k => k.booklet !== 'B');
  if (nonBFilled.length) return byMostItems(nonBFilled);

  if (filled.length) return byMostItems(filled);

  return keys.find(k => k.is_primary && k.booklet !== 'B')
    ?? keys.find(k => k.booklet !== 'B')
    ?? keys[0];
}
