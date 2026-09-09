import type { OgrenciIzin, SessionCode } from '@/lib/kutuphane-api';

export const PERIODS: { code: SessionCode; label: string }[] = [
  { code: 'MORNING', label: 'Sabah' },
  { code: 'AFTERNOON', label: 'Öğle' },
  { code: 'EVENING', label: 'Akşam' },
];

export const SEBEP_OPTIONS: { value: string; label: string }[] = [
  { value: 'HASTALIK', label: 'Hastalık' },
  { value: 'AILEVI', label: 'Ailevi' },
  { value: 'SINAV', label: 'Sınav' },
  { value: 'SPOR', label: 'Spor' },
  { value: 'RESMI_ISLEM', label: 'Resmi işlem' },
  { value: 'DIGER', label: 'Diğer' },
];

export const DAYS = [
  { key: 0, label: 'Pazartesi', short: 'Pzt' },
  { key: 1, label: 'Salı', short: 'Sal' },
  { key: 2, label: 'Çarşamba', short: 'Çar' },
  { key: 3, label: 'Perşembe', short: 'Per' },
  { key: 4, label: 'Cuma', short: 'Cum' },
  { key: 5, label: 'Cumartesi', short: 'Cmt' },
  { key: 6, label: 'Pazar', short: 'Paz' },
];

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function startOfIsoWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function pyWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function formatWeekRangeTr(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarGradient(key: string | number): string {
  const hues = [210, 168, 28, 262, 340, 152];
  const n = typeof key === 'number' ? key : key.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const h = hues[Math.abs(n) % hues.length];
  return `linear-gradient(135deg, hsl(${h} 55% 42%), hsl(${h + 18} 60% 32%))`;
}

export function izinCoversCell(iz: OgrenciIzin, date: Date, period: SessionCode): boolean {
  if (!iz.aktif_mi) return false;
  const iso = toIsoDate(date);
  if (iz.baslangic_tarihi > iso) return false;
  if (iz.bitis_tarihi && iz.bitis_tarihi < iso) return false;
  if ((iz.tekrar_modu || 'WEEKLY') === 'WEEKLY' && iz.gun != null && iz.gun !== pyWeekday(date)) {
    return false;
  }
  if (iz.izin_tipi === 'FULL_DAY') return true;
  return iz.periyot_kodu === period;
}

export function isSingleDayRange(iz: OgrenciIzin): boolean {
  return (iz.tekrar_modu || 'RANGE') === 'RANGE' && iz.baslangic_tarihi === iz.bitis_tarihi;
}

export function izinDurum(iz: OgrenciIzin, today = todayIso()): 'aktif' | 'gecmis' | 'suresiz' {
  if (!iz.aktif_mi) return 'gecmis';
  if (!iz.bitis_tarihi) return 'suresiz';
  if (iz.bitis_tarihi < today) return 'gecmis';
  return 'aktif';
}

export function countDaysInRange(start: string, end: string | null, weeklyGun?: number | null): number {
  if (!end) return weeklyGun == null ? 0 : 1;
  const a = parseIso(start);
  const b = parseIso(end);
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) {
    if (weeklyGun == null || pyWeekday(d) === weeklyGun) n += 1;
  }
  return n;
}

export function impactSummary(opts: {
  tekrar: 'RANGE' | 'WEEKLY';
  start: string;
  end: string | null;
  suresiz: boolean;
  fullDay: boolean;
  periods: SessionCode[];
  gun?: number | null;
}): string {
  const periods = opts.fullDay ? PERIODS.map((p) => p.code) : opts.periods;
  const academic = periods.filter((p) => p !== 'EVENING');
  if (opts.suresiz || !opts.end) {
    if (opts.tekrar === 'WEEKLY' && opts.gun != null) {
      const day = DAYS.find((d) => d.key === opts.gun)?.label || '';
      return `Her ${day} · ${opts.fullDay ? 'tam gün' : periods.map((p) => PERIODS.find((x) => x.code === p)?.label).join(', ')} · süresiz`;
    }
    return `Süresiz aralık · kütüphane ${opts.fullDay ? 3 : periods.length} oturum/gün · sınıf ${opts.fullDay ? 2 : academic.length} periyot/gün`;
  }
  const days = countDaysInRange(
    opts.start,
    opts.end,
    opts.tekrar === 'WEEKLY' ? opts.gun ?? null : null,
  );
  const lib = days * (opts.fullDay ? 3 : periods.length);
  const cls = days * (opts.fullDay ? 2 : academic.length);
  return `${days} gün · ${lib} kütüphane oturumu + ${cls} sınıf periyodu`;
}

export function sebepShort(iz: OgrenciIzin): string {
  if (iz.sebep_label) return iz.sebep_label;
  const kod = SEBEP_OPTIONS.find((s) => s.value === iz.sebep_kodu)?.label;
  if (kod && iz.sebep && iz.sebep !== kod) return `${kod}: ${iz.sebep}`;
  return iz.sebep || kod || 'İzinli';
}
