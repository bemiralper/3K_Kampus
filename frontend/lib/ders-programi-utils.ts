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
  /** Düz renk — tablo/PDF'te oturum şeridi ve kenarlıklarda kullanılır. */
  accent: string;
}[] = [
  { code: 'MORNING', label: 'Sabah', icon: '☀', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)', light: '#fffbeb', accent: '#d97706' },
  { code: 'AFTERNOON', label: 'Öğle', icon: '🌤', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)', light: '#eff6ff', accent: '#2563eb' },
  { code: 'EVENING', label: 'Akşam', icon: '🌙', gradient: 'linear-gradient(135deg, #6366f1, #4f46e5)', light: '#eef2ff', accent: '#4f46e5' },
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

/** Sadece aktif (kapalı olmayan) günleri döner — salt-okunur tablo/dışa aktarma görünümleri için. */
export function getActiveDayDefs(
  gunAktiflik: Record<string, GunAktiflik>,
): (typeof DAY_DEFS)[number][] {
  return DAY_DEFS.filter((d) => gunAktiflik[d.key]?.aktif);
}

/** İki oturum arasındaki boşluk (örn. Sabah bitişi → Öğle başlangıcı = öğle arası). */
export interface SessionBreakDef {
  afterCode: DaySessionCode;
  beforeCode: DaySessionCode;
  label: string;
  icon: string;
}

export const SESSION_BREAK_DEFS: SessionBreakDef[] = [
  { afterCode: 'MORNING', beforeCode: 'AFTERNOON', label: 'Öğle Arası', icon: '🍽' },
  { afterCode: 'AFTERNOON', beforeCode: 'EVENING', label: 'Akşam Arası', icon: '☕' },
];

export interface SessionBreak {
  baslangic: string;
  bitis: string;
  dakika: number;
}

/** Bir günün iki oturumu arasındaki boşluğu hesaplar (son etüt bitişi → ilk etüt başlangıcı). */
export function getSessionBreak(
  daySchedule: DaySchedule | undefined,
  afterCode: DaySessionCode,
  beforeCode: DaySessionCode,
): SessionBreak | null {
  const afterDersler = daySchedule?.[afterCode]?.dersler;
  const beforeDersler = daySchedule?.[beforeCode]?.dersler;
  if (!afterDersler?.length || !beforeDersler?.length) return null;
  const baslangic = afterDersler[afterDersler.length - 1]?.bitis?.slice(0, 5);
  const bitis = beforeDersler[0]?.baslangic?.slice(0, 5);
  if (!baslangic || !bitis) return null;
  const [bh, bm] = baslangic.split(':').map(Number);
  const [eh, em] = bitis.split(':').map(Number);
  const dakika = (eh * 60 + em) - (bh * 60 + bm);
  if (dakika <= 0) return null;
  return { baslangic, bitis, dakika };
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

// Oturumlar arasında tam 1 saatlik ara (öğle yemeği / akşam arası) bırakılacak şekilde ayarlanmıştır.
const STD_MORNING: [string, string][] = [['09:00', '10:30'], ['10:45', '12:00']];
const STD_AFTERNOON: [string, string][] = [['13:00', '14:30'], ['14:45', '16:00']];
const STD_EVENING: [string, string][] = [['17:00', '18:30'], ['18:45', '20:00']];

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

export interface DersProgramiExportColumn {
  key: string;
  label: string;
  /** Backend ExportColumn tipi — hizalama ve sayı biçimini belirler. */
  type?: 'text' | 'integer';
}

/** Excel/CSV hücresi: "09:00 - 09:40". Boş hücre gerçekten boş kalır ki filtreler çalışsın. */
function exportRange(baslangic?: string, bitis?: string): string {
  const from = (baslangic || '').slice(0, 5);
  const to = (bitis || '').slice(0, 5);
  return from && to ? `${from} - ${to}` : '';
}

/**
 * Haftalık çalışma saatleri — kurumsal Excel/CSV dışa aktarma tablosu.
 *
 * Ekrandaki matrisin veri hâli: her satır bir etüt ya da ara, her aktif gün bir
 * sütun. Oturum/Bölüm/Tür ayrı sütunlarda tutulur (tek bir "☀ Sabah — 1. Etüt"
 * metnine sıkıştırılmaz) ki Excel'de süzme, gruplama ve pivot yapılabilsin.
 */
export function buildDersProgramiExportTable(
  gunluk: GunlukDersSaatleri,
  gunAktiflik: Record<string, GunAktiflik>,
): { columns: DersProgramiExportColumn[]; rows: Record<string, string | number>[] } {
  const activeDays = getActiveDayDefs(gunAktiflik);
  const columns: DersProgramiExportColumn[] = [
    { key: 'oturum', label: 'Oturum' },
    { key: 'bolum', label: 'Bölüm' },
    { key: 'tur', label: 'Tür' },
    { key: 'sure', label: 'Süre (dk)', type: 'integer' },
    ...activeDays.map((d) => ({ key: d.key, label: d.label, type: 'text' as const })),
  ];

  const rows: Record<string, string | number>[] = [];

  PERIOD_DEFS.forEach((period, periodIdx) => {
    const maxCount = activeDays.reduce(
      (max, d) => Math.max(max, gunluk[d.key]?.[period.code]?.dersler?.length || 0),
      0,
    );

    for (let i = 0; i < maxCount; i++) {
      const row: Record<string, string | number> = {
        oturum: period.label,
        bolum: `${i + 1}. Etüt`,
        tur: 'Etüt',
        sure: '',
      };
      for (const day of activeDays) {
        const ders = gunluk[day.key]?.[period.code]?.dersler?.[i];
        row[day.key] = exportRange(ders?.baslangic, ders?.bitis);
        if (!row.sure && ders) {
          const from = timeToMinutes(ders.baslangic);
          const to = timeToMinutes(ders.bitis);
          if (from !== null && to !== null && to > from) row.sure = to - from;
        }
      }
      rows.push(row);
    }

    const breakDef = SESSION_BREAK_DEFS.find((b) => b.afterCode === period.code);
    if (breakDef && PERIOD_DEFS[periodIdx + 1]) {
      const breakRow: Record<string, string | number> = {
        oturum: period.label,
        bolum: breakDef.label,
        tur: 'Ara',
        sure: '',
      };
      let hasAnyBreak = false;
      for (const day of activeDays) {
        const brk = getSessionBreak(gunluk[day.key], breakDef.afterCode, breakDef.beforeCode);
        breakRow[day.key] = brk ? exportRange(brk.baslangic, brk.bitis) : '';
        if (brk) {
          hasAnyBreak = true;
          if (!breakRow.sure) {
            const from = timeToMinutes(brk.baslangic);
            const to = timeToMinutes(brk.bitis);
            if (from !== null && to !== null && to > from) breakRow.sure = to - from;
          }
        }
      }
      if (hasAnyBreak) rows.push(breakRow);
    }
  });

  return { columns, rows };
}

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** 'HH:MM' → gün başından itibaren dakika. Geçersiz girdide null. */
export function timeToMinutes(time: string | undefined | null): number | null {
  if (!time) return null;
  const [h, m] = time.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const safe = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * Elle yazılan saati normalize eder: "930", "9:30", "0930", "9.30" → "09:30".
 * Anlaşılamayan girdide null döner (çağıran eski değere geri döner).
 */
export function parseTimeInput(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 3 || digits.length > 4) return null;
  const hh = Number(digits.slice(0, digits.length - 2));
  const mm = Number(digits.slice(-2));
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** "1 sa 30 dk" / "45 dk" */
export function formatDuration(dakika: number): string {
  const saat = Math.floor(dakika / 60);
  const kalan = dakika % 60;
  if (saat > 0) return kalan ? `${saat} sa ${kalan} dk` : `${saat} sa`;
  return `${kalan} dk`;
}

// ─────────────────────────────────────────────────────────────
// Otomatik program üretimi
// ─────────────────────────────────────────────────────────────

/** Bir oturumun (sabah/öğle/akşam) çalışma penceresi. */
export interface SessionWindow {
  enabled: boolean;
  start: string;
  end: string;
}

export interface AutoScheduleConfig {
  windows: Record<DaySessionCode, SessionWindow>;
  /** Tek bir etüdün süresi (dk). */
  dersSuresiDk: number;
  /** Etütler arası teneffüs (dk). */
  teneffusDk: number;
  /** Hangi günlere uygulanacak. */
  days: string[];
}

export const DEFAULT_AUTO_CONFIG: AutoScheduleConfig = {
  windows: {
    MORNING: { enabled: true, start: '09:00', end: '12:00' },
    AFTERNOON: { enabled: true, start: '13:00', end: '16:00' },
    EVENING: { enabled: false, start: '17:00', end: '20:00' },
  },
  dersSuresiDk: 40,
  teneffusDk: 10,
  days: ['0', '1', '2', '3', '4'],
};

/** Üretim sırasında bozuk girdinin sonsuz döngüye dönmemesi için üst sınır. */
const MAX_SLOTS_PER_SESSION = 24;

/**
 * Bir oturum penceresini etütlere böler: pencereye sığdığı sürece
 * `dersSuresiDk` uzunluğunda etüt açar, aralarına `teneffusDk` bırakır.
 */
export function buildSessionSlots(
  window: SessionWindow,
  dersSuresiDk: number,
  teneffusDk: number,
): { baslangic: string; bitis: string }[] {
  if (!window?.enabled) return [];
  const start = timeToMinutes(window.start);
  const end = timeToMinutes(window.end);
  const sure = Math.round(dersSuresiDk);
  if (start === null || end === null || sure <= 0 || end <= start) return [];

  const ara = Math.max(0, Math.round(teneffusDk));
  const slots: { baslangic: string; bitis: string }[] = [];
  let cursor = start;
  while (cursor + sure <= end && slots.length < MAX_SLOTS_PER_SESSION) {
    slots.push({ baslangic: minutesToTime(cursor), bitis: minutesToTime(cursor + sure) });
    cursor += sure + ara;
  }
  return slots;
}

function autoDaySchedule(config: AutoScheduleConfig): DaySchedule {
  const schedule = emptyDaySchedule();
  for (const code of PERIOD_CODES) {
    const slots = buildSessionSlots(config.windows[code], config.dersSuresiDk, config.teneffusDk);
    schedule[code] = {
      ders_sayisi: slots.length,
      ders_suresi_dk: config.dersSuresiDk,
      dersler: slots.map((slot, idx) => ({ ders_no: idx + 1, ...slot })),
      molalar: [],
    };
  }
  return schedule;
}

/**
 * Seçilen günlere otomatik program yazar. Seçilmeyen günler `base`'den olduğu gibi
 * korunur, böylece hafta içi otomatik üretilip cumartesi elde düzenlenebilir.
 */
export function buildAutoSchedule(
  config: AutoScheduleConfig,
  base?: GunlukDersSaatleri,
): GunlukDersSaatleri {
  const targetDays = new Set(config.days);
  const generated = autoDaySchedule(config);
  return Object.fromEntries(DAY_DEFS.map((day) => [
    day.key,
    targetDays.has(day.key)
      ? cloneDaySchedule(generated)
      : cloneDaySchedule(base?.[day.key] || emptyDaySchedule()),
  ])) as GunlukDersSaatleri;
}

export interface AutoBreakPreview extends SessionBreak {
  label: string;
  icon: string;
}

/**
 * Öğle/akşam arası, ayrıca girilmez: bir oturumun son etüdü ile bir sonraki
 * oturumun ilk etüdü arasında kalan boşluktan türetilir.
 */
export function previewAutoBreaks(config: AutoScheduleConfig): AutoBreakPreview[] {
  const day = autoDaySchedule(config);
  return SESSION_BREAK_DEFS.flatMap((def) => {
    const brk = getSessionBreak(day, def.afterCode, def.beforeCode);
    return brk ? [{ ...brk, label: def.label, icon: def.icon }] : [];
  });
}

// ─────────────────────────────────────────────────────────────
// Tablo matrisi — satır: etüt/ara, sütun: gün
// ─────────────────────────────────────────────────────────────

export interface ScheduleMatrixCell {
  baslangic: string;
  bitis: string;
}

export interface ScheduleMatrixRow {
  kind: 'etut' | 'ara';
  periodCode: DaySessionCode;
  /** Oturum içindeki etüt sırası; ara satırlarında -1. */
  slotIndex: number;
  label: string;
  cells: Record<string, ScheduleMatrixCell | null>;
}

export interface ScheduleMatrixSection {
  code: DaySessionCode;
  label: string;
  icon: string;
  gradient: string;
  light: string;
  accent: string;
  rows: ScheduleMatrixRow[];
  /** Bu oturumdan sonraki ara (öğle/akşam arası); yoksa null. */
  breakRow: ScheduleMatrixRow | null;
}

/**
 * Haftalık programı "satır = etüt/ara, sütun = gün" tablosuna çevirir.
 * Günler arasında etüt sayısı farklıysa eksik hücreler null kalır.
 */
export function buildScheduleMatrix(
  gunluk: GunlukDersSaatleri,
  days: readonly { key: string }[],
): ScheduleMatrixSection[] {
  return PERIOD_DEFS.map((period, periodIdx) => {
    const slotCount = days.reduce(
      (max, day) => Math.max(max, gunluk[day.key]?.[period.code]?.dersler?.length || 0),
      0,
    );

    const rows: ScheduleMatrixRow[] = [];
    for (let i = 0; i < slotCount; i++) {
      const cells: Record<string, ScheduleMatrixCell | null> = {};
      for (const day of days) {
        const ders = gunluk[day.key]?.[period.code]?.dersler?.[i];
        cells[day.key] = ders
          ? { baslangic: (ders.baslangic || '').slice(0, 5), bitis: (ders.bitis || '').slice(0, 5) }
          : null;
      }
      rows.push({ kind: 'etut', periodCode: period.code, slotIndex: i, label: `${i + 1}. Etüt`, cells });
    }

    const breakDef = SESSION_BREAK_DEFS.find((b) => b.afterCode === period.code);
    let breakRow: ScheduleMatrixRow | null = null;
    if (breakDef && PERIOD_DEFS[periodIdx + 1]) {
      const cells: Record<string, ScheduleMatrixCell | null> = {};
      let hasAny = false;
      for (const day of days) {
        const brk = getSessionBreak(gunluk[day.key], breakDef.afterCode, breakDef.beforeCode);
        cells[day.key] = brk ? { baslangic: brk.baslangic, bitis: brk.bitis } : null;
        if (brk) hasAny = true;
      }
      if (hasAny) {
        breakRow = {
          kind: 'ara',
          periodCode: period.code,
          slotIndex: -1,
          label: breakDef.label,
          cells,
        };
      }
    }

    return { ...period, rows, breakRow };
  });
}

// ─────────────────────────────────────────────────────────────
// Satır bazlı düzenleme (matris hücreleri)
// ─────────────────────────────────────────────────────────────

/** Belirli bir günün belirli etüdünün başlangıç/bitiş saatini değiştirir. */
export function setSlotTime(
  gunluk: GunlukDersSaatleri,
  dayKey: string,
  periodCode: DaySessionCode,
  slotIndex: number,
  field: 'baslangic' | 'bitis',
  value: string,
): GunlukDersSaatleri {
  const block = gunluk[dayKey]?.[periodCode] || emptyPeriodBlock();
  const dersler = block.dersler.map((d, i) => (i === slotIndex ? { ...d, [field]: value } : d));
  return updatePeriodBlock(gunluk, dayKey, periodCode, { ...block, dersler });
}

/**
 * Verilen günlere bu oturum için bir etüt daha ekler. Saat, günün son etüdünün
 * bitişine `teneffusDk` eklenerek bulunur; ilk etütte oturumun varsayılan başlangıcı kullanılır.
 */
export function appendSlotToDays(
  gunluk: GunlukDersSaatleri,
  dayKeys: string[],
  periodCode: DaySessionCode,
  dersSuresiDk = 40,
  teneffusDk = 10,
): GunlukDersSaatleri {
  const fallbackStart = DEFAULT_AUTO_CONFIG.windows[periodCode].start;
  let next = gunluk;
  for (const dayKey of dayKeys) {
    const block = next[dayKey]?.[periodCode] || emptyPeriodBlock();
    const last = block.dersler[block.dersler.length - 1];
    const start = last?.bitis ? addMinutes(last.bitis, teneffusDk) : fallbackStart;
    const dersler = [
      ...block.dersler,
      { ders_no: block.dersler.length + 1, baslangic: start, bitis: addMinutes(start, dersSuresiDk) },
    ];
    next = updatePeriodBlock(next, dayKey, periodCode, { ...block, dersler });
  }
  return next;
}

/** Verilen günlerde bu oturumun `slotIndex`'inci etüdünü siler. */
export function removeSlotFromDays(
  gunluk: GunlukDersSaatleri,
  dayKeys: string[],
  periodCode: DaySessionCode,
  slotIndex: number,
): GunlukDersSaatleri {
  let next = gunluk;
  for (const dayKey of dayKeys) {
    const block = next[dayKey]?.[periodCode] || emptyPeriodBlock();
    if (slotIndex >= block.dersler.length) continue;
    const dersler = block.dersler
      .filter((_, i) => i !== slotIndex)
      .map((d, i) => ({ ...d, ders_no: i + 1 }));
    next = updatePeriodBlock(next, dayKey, periodCode, { ...block, dersler });
  }
  return next;
}

/** Tek bir günün tek etüdünü siler (matris hücresindeki ✕). */
export function removeSlotCell(
  gunluk: GunlukDersSaatleri,
  dayKey: string,
  periodCode: DaySessionCode,
  slotIndex: number,
): GunlukDersSaatleri {
  return removeSlotFromDays(gunluk, [dayKey], periodCode, slotIndex);
}
