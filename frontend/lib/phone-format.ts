/**
 * Türkiye telefon formatı — giriş ve gösterim: 0XXX XXX XX XX
 * Örnek: 0212 555 00 00, 0532 555 00 00
 */

function normalizeDigits(value: string): string {
  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('90') && digits.length >= 12) {
    digits = '0' + digits.slice(2);
  }

  if (!digits.startsWith('0') && digits.startsWith('5')) {
    digits = `0${digits}`;
  }

  return digits.slice(0, 11);
}

/** Kullanıcı yazarken otomatik biçimlendirme */
export function formatPhoneInput(value: string): string {
  const digits = normalizeDigits(value);
  if (!digits) return '';

  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  if (digits.length <= 9) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
}

/** Sayfada gösterim — ham değeri biçimlendirilmiş metne çevirir */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  const formatted = formatPhoneInput(phone);
  return formatted || phone.trim();
}

/** tel: / wa.me linkleri için yalnızca rakamlar */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}
