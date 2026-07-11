import type { SlotTypeCode } from '@/lib/academic-api';
import { lunchBreakColors } from '@/lib/sube-theme-colors';

export const GUN_YAPISI_PRESETS = [
  'Hafta İçi',
  'Hafta Sonu',
  'Yaz Okulu',
  'Akşam Grubu',
  'Özel Ders',
  'Kamp Programı',
  'Online Program',
] as const;

export type SlotTypeOption = {
  value: SlotTypeCode;
  label: string;
  color: string;
  bg: string;
};

export const SLOT_TYPE_OPTIONS: SlotTypeOption[] = [
  { value: 'LESSON', label: 'Normal Ders', color: '#1d4ed8', bg: '#eff6ff' },
  { value: 'SHORT_BREAK', label: 'Teneffüs', color: '#64748b', bg: '#f8fafc' },
  { value: 'LUNCH_BREAK', label: 'Öğle Arası', color: '#c2410c', bg: '#fff7ed' },
  { value: 'CUSTOM_BREAK', label: 'Etüt', color: '#7c3aed', bg: '#f5f3ff' },
  { value: 'EVENING_BREAK', label: 'Serbest Saat', color: '#0f766e', bg: '#f0fdfa' },
];

const DEFAULT_LUNCH = SLOT_TYPE_OPTIONS.find((o) => o.value === 'LUNCH_BREAK')!;

export function slotTypeMeta(type: SlotTypeCode, subeThemeHex?: string | null): SlotTypeOption {
  if (type === 'LUNCH_BREAK' && subeThemeHex) {
    const lunch = lunchBreakColors(subeThemeHex);
    return {
      value: 'LUNCH_BREAK',
      label: 'Öğle Arası',
      color: lunch.color,
      bg: lunch.bg,
    };
  }
  return SLOT_TYPE_OPTIONS.find((o) => o.value === type) ?? SLOT_TYPE_OPTIONS[0];
}

/** Görüntüleme adı — teneffüsler numarasız */
export function displaySlotName(name: string, slotType: SlotTypeCode): string {
  if (slotType === 'SHORT_BREAK') return 'Teneffüs';
  if (slotType === 'LUNCH_BREAK') return 'Öğle Arası';
  if (slotType === 'EVENING_BREAK') return 'Serbest Saat';
  if (slotType === 'CUSTOM_BREAK' && /^etüt/i.test(name.trim())) return name;
  if (slotType === 'CUSTOM_BREAK') return name || 'Etüt';
  return name;
}

export function lessonOnlyCount(slots: { slot_type: SlotTypeCode }[]): number {
  return slots.filter((s) => s.slot_type === 'LESSON').length;
}
