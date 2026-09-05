/** Türkçe harfleri ASCII karşılığına indirger: İpek↔ipek, Güneş↔gunes, Işık↔isik. */
const TR_FOLD_RE = /[İIıiÇçĞğÖöŞşÜü]/g;
const TR_FOLD_MAP: Record<string, string> = {
  İ: "i",
  I: "i",
  ı: "i",
  i: "i",
  Ç: "c",
  ç: "c",
  Ğ: "g",
  ğ: "g",
  Ö: "o",
  ö: "o",
  Ş: "s",
  ş: "s",
  Ü: "u",
  ü: "u",
};

export function trFold(value: string): string {
  return (value || "")
    .replace(TR_FOLD_RE, (ch) => TR_FOLD_MAP[ch] || ch)
    .toLocaleLowerCase("tr-TR");
}

export function trIncludes(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  if (!needle) return true;
  return trFold(haystack || "").includes(trFold(needle));
}

export function trIncludesAny(
  needle: string | null | undefined,
  ...fields: (string | null | undefined)[]
): boolean {
  if (!needle) return true;
  return fields.some((field) => trIncludes(field, needle));
}

/**
 * Her kelimenin ilk harfini büyük, kalanını küçük yapar (tr-TR).
 * Kaynak kütüphanesinde ünite/konu adları için kullanılır.
 * Örn: "üNİTE 1 - kAREKÖK" → "Ünite 1 - Karekök"
 */
export function toTitleCaseTr(value: string): string {
  const trimmed = (value || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  return trimmed
    .split(' ')
    .map((token) =>
      token
        .split(/([-–—/])/)
        .map((part) => {
          if (!part || /^[-–—/]$/.test(part)) return part;
          const lower = part.toLocaleLowerCase('tr-TR');
          return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
        })
        .join('')
    )
    .join(' ');
}
