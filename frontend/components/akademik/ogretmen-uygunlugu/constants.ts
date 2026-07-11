import type { SlotAvailabilityStatus } from '@/lib/academic-api';

export const STATUS_CYCLE: SlotAvailabilityStatus[] = ['UNAVAILABLE', 'AVAILABLE', 'PREFERRED'];

export const STATUS_META: Record<
  SlotAvailabilityStatus,
  { label: string; short: string; color: string; bg: string; border: string }
> = {
  UNAVAILABLE: {
    label: 'Uygun Değil',
    short: '✖',
    color: '#64748b',
    bg: '#f1f5f9',
    border: '#cbd5e1',
  },
  AVAILABLE: {
    label: 'Uygun',
    short: '✔',
    color: '#15803d',
    bg: '#dcfce7',
    border: '#86efac',
  },
  PREFERRED: {
    label: 'Tercih Edilir',
    short: '★',
    color: '#b45309',
    bg: '#fef3c7',
    border: '#fcd34d',
  },
};

export const SOZLESME_TURU_OPTIONS = [
  { value: '', label: 'Tümü' },
  { value: 'TAM_ZAMANLI', label: 'Tam Zamanlı' },
  { value: 'DERS_UCRETLI', label: 'Ders Ücretli' },
  { value: 'KARMA', label: 'Karma' },
];

export function nextStatus(current: SlotAvailabilityStatus): SlotAvailabilityStatus {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

export function defaultStatus(): SlotAvailabilityStatus {
  return 'UNAVAILABLE';
}
