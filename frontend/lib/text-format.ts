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
