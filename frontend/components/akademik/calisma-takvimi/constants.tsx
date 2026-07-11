'use client';

import {
  BookOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  FireOutlined,
  MoonOutlined,
  ReadOutlined,
  StarOutlined,
  SunOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

export const WEEKDAY_ORDER = [0, 1, 2, 3, 4, 5, 6] as const;

export const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Pazartesi',
  1: 'Salı',
  2: 'Çarşamba',
  3: 'Perşembe',
  4: 'Cuma',
  5: 'Cumartesi',
  6: 'Pazar',
};

export const TAKVIM_ICON_OPTIONS = [
  { value: 'calendar', label: 'Takvim', icon: CalendarOutlined },
  { value: 'book', label: 'Kitap', icon: BookOutlined },
  { value: 'sun', label: 'Gündüz', icon: SunOutlined },
  { value: 'moon', label: 'Akşam', icon: MoonOutlined },
  { value: 'clock', label: 'Saat', icon: ClockCircleOutlined },
  { value: 'team', label: 'Grup', icon: TeamOutlined },
  { value: 'star', label: 'Kamp', icon: StarOutlined },
  { value: 'fire', label: 'Yoğun', icon: FireOutlined },
  { value: 'read', label: 'Eğitim', icon: ReadOutlined },
] as const;

export const TAKVIM_COLOR_PRESETS = [
  '#0262a7',
  '#1d4ed8',
  '#0f766e',
  '#7c3aed',
  '#c2410c',
  '#be123c',
  '#475569',
];

export function takvimIconNode(key: string, color?: string): ReactNode {
  const found = TAKVIM_ICON_OPTIONS.find((o) => o.value === key);
  const Icon = found?.icon ?? CalendarOutlined;
  return <Icon style={{ color: color || '#0262a7', fontSize: 18 }} />;
}

export function validateWeeklyPlan(
  days: { day_of_week: number; is_active: boolean; schedule_template?: number | null; name?: string }[],
): string | null {
  const active = days.filter((d) => d.is_active);
  if (active.length === 0) return 'En az bir gün aktif olmalıdır.';
  for (const day of active) {
    if (!day.schedule_template) {
      const label = day.name || WEEKDAY_LABELS[day.day_of_week];
      return `${label} için ders saati şablonu seçilmelidir.`;
    }
  }
  return null;
}

export function defaultWeekDays() {
  return WEEKDAY_ORDER.map((dow) => ({
    day_of_week: dow,
    name: WEEKDAY_LABELS[dow],
    order: dow + 1,
    is_active: dow < 5,
    schedule_template: null as number | null,
    note: '',
  }));
}
