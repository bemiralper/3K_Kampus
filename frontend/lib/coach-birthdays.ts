export const COACH_BIRTHDAY_PATH = "/coach/dogum-gunleri";

export function isBirthdayNotificationUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes("dogum-gunu=") || url.includes("/dogum-gunleri");
}

/** Koç panelinde doğum günü bildiriminin açacağı adres. Bildirimdeki gün korunur. */
export function coachBirthdayHref(url: string): string {
  const match = url.match(/dogum-gunu=(\d{4}-\d{2}-\d{2})/);
  if (!match) return COACH_BIRTHDAY_PATH;
  return `${COACH_BIRTHDAY_PATH}?dogum-gunu=${match[1]}`;
}
