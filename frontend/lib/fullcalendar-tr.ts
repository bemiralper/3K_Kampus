/**
 * FullCalendar — Türkçe yerelleştirme ve ortak ayarlar
 */
import trLocale from '@fullcalendar/core/locales/tr';

export const FC_TR_LOCALE = trLocale;

export const FC_TR_BUTTON_TEXT = {
  today: 'Bugün',
  month: 'Ay',
  week: 'Hafta',
  day: 'Gün',
  list: 'Liste',
};

export const FC_TR_COMMON = {
  locale: 'tr' as const,
  locales: [trLocale],
  buttonText: FC_TR_BUTTON_TEXT,
  allDayText: 'Tüm gün',
  noEventsText: 'Etkinlik yok',
  moreLinkText: (n: number) => `+${n} daha`,
  weekText: 'Hf',
};
