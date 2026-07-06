import type { DaySchedule, GunAktiflik, PeriyotDersler } from '@/lib/kutuphane-api';

export const DAY_DEFS = [
  { key: '0', label: 'Pazartesi', short: 'Pzt' },
  { key: '1', label: 'Salı', short: 'Sal' },
  { key: '2', label: 'Çarşamba', short: 'Çar' },
  { key: '3', label: 'Perşembe', short: 'Per' },
  { key: '4', label: 'Cuma', short: 'Cum' },
  { key: '5', label: 'Cumartesi', short: 'Cmt' },
  { key: '6', label: 'Pazar', short: 'Paz' },
] as const;

export const PERIOD_DEFS: {
  code: DaySessionCode;
  label: string;
  icon: string;
  gradient: string;
  light: string;
}[] = [
  { code: 'MORNING', label: 'Sabah', icon: '☀', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)', light: '#fffbeb' },
  { code: 'AFTERNOON', label: 'Öğle', icon: '🌤', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)', light: '#eff6ff' },
  { code: 'EVENING', label: 'Akşam', icon: '🌙', gradient: 'linear-gradient(135deg, #6366f1, #4f46e5)', light: '#eef2ff' },
];

export type GunlukDersSaatleri = Record<string, DaySchedule>;

const PERIOD_CODES = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
export type DaySessionCode = typeof PERIOD_CODES[number];

export function isV2DersSaatleri(data: Record<string, unknown> | null | undefined): boolean {
  if (!data || typeof data !== 'object') return false;
  const keys = Object.keys(data);
  if (keys.some((k) => PERIOD_CODES.includes(k as DaySessionCode))) return false;
  return keys.some((k) => /^[0-6]$/.test(k));
}

export function emptyPeriodBlock(): PeriyotDersler {
  return { ders_sayisi: 0, ders_suresi_dk: 40, dersler: [], molalar: [] };
}

export function emptyDaySchedule(): DaySchedule {
  return {
    MORNING: emptyPeriodBlock(),
    AFTERNOON: emptyPeriodBlock(),
    EVENING: emptyPeriodBlock(),
  };
}

export function defaultGunBazliAktiflik(): Record<string, GunAktiflik> {
  const result: Record<string, GunAktiflik> = {};
  for (let i = 0; i <= 6; i++) {
    result[String(i)] = {
      aktif: i < 6,
      periyotlar: i < 6 ? ['MORNING', 'AFTERNOON', 'EVENING'] : [],
    };
  }
  return result;
}

function normalizePeriodBlock(raw: Partial<PeriyotDersler> | undefined): PeriyotDersler {
  const dersler = (raw?.dersler || [])
    .filter((d) => d.baslangic && d.bitis)
    .map((d, idx) => ({
      ders_no: idx + 1,
      baslangic: d.baslangic.slice(0, 5),
      bitis: d.bitis.slice(0, 5),
    }));
  return {
    ders_sayisi: dersler.length,
    ders_suresi_dk: raw?.ders_suresi_dk || 40,
    dersler,
    molalar: raw?.molalar || [],
  };
}

function samplePeriod(times: [string, string][]): PeriyotDersler {
  const dersler = times.map(([baslangic, bitis], idx) => ({
    ders_no: idx + 1,
    baslangic,
    bitis,
  }));
  return { ders_sayisi: dersler.length, ders_suresi_dk: 40, dersler, molalar: [] };
}

export function migrateV1ToV2(
  v1: Record<string, PeriyotDersler>,
  gunBazli?: Record<string, GunAktiflik>,
): GunlukDersSaatleri {
  const aktiflik = gunBazli || defaultGunBazliAktiflik();
  const result: GunlukDersSaatleri = {};
  for (const day of DAY_DEFS) {
    const info = aktiflik[day.key] || { aktif: false, periyotlar: [] };
    const daySchedule = emptyDaySchedule();
    if (info.aktif) {
      for (const code of PERIOD_CODES) {
        if (info.periyotlar.includes(code)) {
          daySchedule[code] = normalizePeriodBlock(v1[code]);
        }
      }
    }
    result[day.key] = daySchedule;
  }
  return result;
}

export function normalizeGunlukDersSaatleri(
  data: Record<string, unknown> | null | undefined,
  gunBazli?: Record<string, GunAktiflik>,
): GunlukDersSaatleri {
  if (!data || Object.keys(data).length === 0) {
    return Object.fromEntries(DAY_DEFS.map((d) => [d.key, emptyDaySchedule()])) as GunlukDersSaatleri;
  }
  if (isV2DersSaatleri(data)) {
    const result: GunlukDersSaatleri = {};
    for (const day of DAY_DEFS) {
      const raw = (data[day.key] || {}) as Partial<DaySchedule>;
      const daySchedule = emptyDaySchedule();
      for (const code of PERIOD_CODES) {
        daySchedule[code] = normalizePeriodBlock(raw[code]);
      }
      result[day.key] = daySchedule;
    }
    return result;
  }
  return migrateV1ToV2(data as Record<string, PeriyotDersler>, gunBazli);
}

export function deriveGunAktiflik(gunluk: GunlukDersSaatleri): Record<string, GunAktiflik> {
  const result: Record<string, GunAktiflik> = {};
  for (const day of DAY_DEFS) {
    const schedule = gunluk[day.key] || emptyDaySchedule();
    const periyotlar = PERIOD_CODES.filter((code) => (schedule[code]?.dersler?.length || 0) > 0);
    result[day.key] = { aktif: periyotlar.length > 0, periyotlar };
  }
  return result;
}

export function copyDaySchedule(
  gunluk: GunlukDersSaatleri,
  fromKey: string,
  toKeys: string[],
): GunlukDersSaatleri {
  const source = gunluk[fromKey] || emptyDaySchedule();
  const next = { ...gunluk };
  for (const key of toKeys) {
    next[key] = {
      MORNING: { ...source.MORNING, dersler: source.MORNING.dersler.map((d) => ({ ...d })) },
      AFTERNOON: { ...source.AFTERNOON, dersler: source.AFTERNOON.dersler.map((d) => ({ ...d })) },
      EVENING: { ...source.EVENING, dersler: source.EVENING.dersler.map((d) => ({ ...d })) },
    };
  }
  return next;
}

export type ProgramTemplateId = 'hafta_ici' | 'hafta_sonu' | 'yaz' | 'kis';

export const PROGRAM_TEMPLATES: { id: ProgramTemplateId; label: string; description: string }[] = [
  { id: 'hafta_ici', label: 'Hafta içi', description: 'Pzt–Cum tam gün, Cmt/Paz kapalı' },
  { id: 'hafta_sonu', label: 'Hafta sonu', description: 'Cumartesi sabah, Pazar kapalı' },
  { id: 'yaz', label: 'Yaz Dönemi', description: 'Kısa günler, öğleden sonra yok' },
  { id: 'kis', label: 'Kış Dönemi', description: 'Hafta içi standart + akşam' },
];

function weekdayBlock(
  morning: [string, string][],
  afternoon: [string, string][],
  evening: [string, string][] = [],
): DaySchedule {
  return {
    MORNING: morning.length ? samplePeriod(morning) : emptyPeriodBlock(),
    AFTERNOON: afternoon.length ? samplePeriod(afternoon) : emptyPeriodBlock(),
    EVENING: evening.length ? samplePeriod(evening) : emptyPeriodBlock(),
  };
}

const STD_MORNING: [string, string][] = [['09:00', '10:30'], ['10:45', '12:15']];
const STD_AFTERNOON: [string, string][] = [['13:00', '14:30'], ['14:45', '16:15']];
const STD_EVENING: [string, string][] = [['18:00', '19:30'], ['19:45', '21:15']];

function cloneDaySchedule(day: DaySchedule): DaySchedule {
  return {
    MORNING: { ...day.MORNING, dersler: day.MORNING.dersler.map((d) => ({ ...d })) },
    AFTERNOON: { ...day.AFTERNOON, dersler: day.AFTERNOON.dersler.map((d) => ({ ...d })) },
    EVENING: { ...day.EVENING, dersler: day.EVENING.dersler.map((d) => ({ ...d })) },
  };
}

export function applyProgramTemplate(templateId: ProgramTemplateId): GunlukDersSaatleri {
  const empty = emptyDaySchedule();
  const full = weekdayBlock(STD_MORNING, STD_AFTERNOON, STD_EVENING);
  const morningOnly = weekdayBlock(STD_MORNING, [], []);
  const yazBlock = weekdayBlock(
    [['09:30', '11:00'], ['11:15', '12:45']],
    [],
    [['17:00', '18:30']],
  );

  const result = Object.fromEntries(DAY_DEFS.map((d) => [d.key, cloneDaySchedule(empty)])) as GunlukDersSaatleri;

  switch (templateId) {
    case 'hafta_ici':
      ['0', '1', '2', '3', '4'].forEach((k) => { result[k] = cloneDaySchedule(full); });
      break;
    case 'hafta_sonu':
      result['5'] = cloneDaySchedule(morningOnly);
      break;
    case 'yaz':
      ['0', '1', '2', '3', '4'].forEach((k) => { result[k] = cloneDaySchedule(yazBlock); });
      break;
    case 'kis':
      ['0', '1', '2', '3', '4'].forEach((k) => { result[k] = cloneDaySchedule(full); });
      result['5'] = cloneDaySchedule(morningOnly);
      break;
    default:
      break;
  }
  return result;
}

export function countWeeklyStats(gunluk: GunlukDersSaatleri) {
  const gunAktiflik = deriveGunAktiflik(gunluk);
  const activeDays = DAY_DEFS.filter((d) => gunAktiflik[d.key]?.aktif).length;
  const totalPeriods = Object.values(gunAktiflik).reduce((s, g) => s + (g.periyotlar?.length || 0), 0);
  const totalDers = Object.values(gunluk).reduce(
    (s, day) => s + PERIOD_CODES.reduce((ps, code) => ps + (day[code]?.dersler?.length || 0), 0),
    0,
  );
  return { activeDays, totalPeriods, totalDers };
}

export function addPeriodToSession(
  gunluk: GunlukDersSaatleri,
  dayKey: string,
  periodCode: DaySessionCode,
): GunlukDersSaatleri {
  const day = gunluk[dayKey] || emptyDaySchedule();
  const block = day[periodCode] || emptyPeriodBlock();
  const last = block.dersler[block.dersler.length - 1];
  const start = last ? addMinutes(last.bitis, 15) : periodCode === 'MORNING' ? '09:00' : periodCode === 'AFTERNOON' ? '13:00' : '18:00';
  const end = addMinutes(start, block.ders_suresi_dk || 40);
  const dersler = [...block.dersler, { ders_no: block.dersler.length + 1, baslangic: start, bitis: end }];
  return updatePeriodBlock(gunluk, dayKey, periodCode, { ...block, dersler });
}

export function removePeriodFromSession(
  gunluk: GunlukDersSaatleri,
  dayKey: string,
  periodCode: DaySessionCode,
  index: number,
): GunlukDersSaatleri {
  const day = gunluk[dayKey] || emptyDaySchedule();
  const block = day[periodCode] || emptyPeriodBlock();
  const dersler = block.dersler.filter((_, i) => i !== index).map((d, i) => ({ ...d, ders_no: i + 1 }));
  return updatePeriodBlock(gunluk, dayKey, periodCode, { ...block, dersler });
}

export function updatePeriodBlock(
  gunluk: GunlukDersSaatleri,
  dayKey: string,
  periodCode: DaySessionCode,
  block: PeriyotDersler,
): GunlukDersSaatleri {
  const day = { ...(gunluk[dayKey] || emptyDaySchedule()) };
  const normalized = normalizePeriodBlock(block);
  day[periodCode] = normalized;
  return { ...gunluk, [dayKey]: day };
}

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
