/**
 * Personel sözleşmesi — paylaşılan hesaplama mantığı.
 * Backend contract_calc_service.py ile aynı kuralları uygular.
 */
import type { MaasPlaniSatiri, MesaiSaati, OzetMetrikleri } from '../types';

const AVG_MONTH_DAYS = 30.4375;

function dec(val: unknown, defaultVal = 0): number {
  if (val === null || val === undefined || val === '') return defaultVal;
  const n = Number(val);
  return Number.isFinite(n) ? n : defaultVal;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val.slice(0, 10) + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function calcCalisilanGun(
  baslangic: string | null | undefined,
  bitis: string | null | undefined,
): number {
  const b = parseDate(baslangic);
  const e = parseDate(bitis);
  if (!b || !e || e < b) return 0;
  const diff = Math.floor((e.getTime() - b.getTime()) / 86400000);
  return diff + 1;
}

export function addMonths(d: Date, months: number): Date {
  const monthIndex = d.getMonth() + months;
  const year = d.getFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(d.getDate(), lastDay);
  return new Date(year, month, day);
}

export function monthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function deriveMonthDates(
  rows: MaasPlaniSatiri[],
  contractStart?: string | null,
): MaasPlaniSatiri[] {
  if (!rows.length) return rows;
  const start = contractStart || rows[0]?.baslangic_tarihi;
  if (!start) return rows;

  const out: MaasPlaniSatiri[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = { ...rows[i] };
    let b: Date;
    if (i === 0) {
      if (!row.baslangic_tarihi) row.baslangic_tarihi = start;
      b = parseDate(row.baslangic_tarihi) || parseDate(start)!;
      row.baslangic_tarihi = toIsoDate(b);
    } else {
      const prevEnd = parseDate(out[i - 1].bitis_tarihi);
      if (prevEnd) {
        b = new Date(prevEnd);
        b.setDate(b.getDate() + 1);
      } else {
        b = addMonths(parseDate(start)!, i);
      }
      row.baslangic_tarihi = toIsoDate(b);
    }
    // Kısmi ay (ör. son ay 15 gün): aynı ay içindeki kullanıcı bitişini koru.
    // Zincir kayınca (başlangıç başka aya kaydıysa) ay sonuna tamamla.
    const existingEnd = parseDate(row.bitis_tarihi);
    const sameMonth =
      !!existingEnd &&
      existingEnd.getFullYear() === b.getFullYear() &&
      existingEnd.getMonth() === b.getMonth();
    if (!existingEnd || existingEnd < b || !sameMonth) {
      row.bitis_tarihi = toIsoDate(monthEnd(b));
    }
    row.calisilan_gun = calcCalisilanGun(row.baslangic_tarihi, row.bitis_tarihi);
    out.push(row);
  }
  return out;
}

export function chainFillFromIndex(
  rows: MaasPlaniSatiri[],
  index: number,
  fields: (keyof MaasPlaniSatiri)[] = ['maas'],
): MaasPlaniSatiri[] {
  if (!rows.length || index < 0 || index >= rows.length) return rows;
  const out = rows.map((r) => ({ ...r }));
  const source = out[index];
  for (let i = index + 1; i < out.length; i++) {
    for (const f of fields) {
      const val = source[f];
      if (val !== null && val !== undefined && val !== '') {
        (out[i] as Record<string, unknown>)[f] = val;
      }
    }
  }
  return deriveMonthDates(out, out[0]?.baslangic_tarihi);
}

export function calcToplamMaas(rows: MaasPlaniSatiri[]): number {
  return rows.reduce((sum, r) => sum + dec(r.maas), 0);
}

export function contractNetMaas(s: {
  net_maas?: number;
  maas_plani?: { maas?: number }[];
  brut_maas?: number;
}): number {
  if (s.net_maas && s.net_maas > 0) return s.net_maas;
  const planMaas = s.maas_plani?.[0]?.maas;
  if (planMaas && planMaas > 0) return planMaas;
  return s.brut_maas ?? 0;
}

export function calcToplamCalismaSuresi(
  rows: MaasPlaniSatiri[],
  contractStart?: string | null,
  contractEnd?: string | null,
): number {
  const candidates: number[] = [];

  if (rows.length) {
    candidates.push(rows.length);
    const planStart = parseDate(rows[0]?.baslangic_tarihi);
    const planEnd = parseDate(rows[rows.length - 1]?.bitis_tarihi);
    if (planStart && planEnd && planEnd >= planStart) {
      candidates.push(monthsFromSpan(planStart, planEnd));
    }
  }

  const start = parseDate(contractStart ?? null);
  const end = parseDate(contractEnd ?? null);
  if (start && end && end >= start) {
    candidates.push(monthsFromSpan(start, end));
  }

  if (!candidates.length) return 0;
  return Math.max(...candidates);
}

function monthsFromSpan(start: Date, end: Date): number {
  const totalDays = calcCalisilanGun(toIsoDate(start), toIsoDate(end));
  if (totalDays <= 0) return 0;
  const raw = totalDays / AVG_MONTH_DAYS;
  const half = Math.round(raw * 2) / 2;
  if (Math.abs(half - Math.round(half)) < 0.001) return Math.round(half);
  return half;
}

/** Görüntüleme: "12 ay", "12,5 ay" */
export function fmtAySuresi(months: number): string {
  const half = Math.round(months * 2) / 2;
  if (Math.abs(half - Math.round(half)) < 0.001) {
    return `${Math.round(half)} ay`;
  }
  const whole = Math.floor(half);
  return `${whole},5 ay`;
}

function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const parts = t.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

export function calcGunlukSaat(
  baslangic: string | null | undefined,
  bitis: string | null | undefined,
  molaDakika = 0,
): number {
  const s = timeToMinutes(baslangic);
  const e = timeToMinutes(bitis);
  if (s === null || e === null || e <= s) return 0;
  const minutes = e - s - (molaDakika || 0);
  if (minutes <= 0) return 0;
  return round2(minutes / 60);
}

export function calcHaftalikSaat(mesaiRows: MesaiSaati[]): number {
  let total = 0;
  for (const row of mesaiRows) {
    if (!row.aktif) continue;
    total += calcGunlukSaat(row.baslangic, row.bitis, row.mola_dakika);
  }
  return round2(total);
}

export function defaultMesaiSaatleri(): MesaiSaati[] {
  const rows: MesaiSaati[] = [];
  for (let gun = 1; gun <= 7; gun++) {
    const aktif = gun <= 5;
    rows.push({
      gun,
      baslangic: aktif ? '09:00' : null,
      bitis: aktif ? '18:00' : null,
      mola_dakika: 0,
      aktif,
    });
  }
  return rows;
}

export function calcOzetMetrikleri(params: {
  maas_plani: MaasPlaniSatiri[];
  mesai_saatleri: MesaiSaati[];
  ders_birim_ucret?: number | string;
  ders_ucret_tipi?: string;
  sgk_gun?: number;
  haftalik_calisma_gun?: number;
  baslangic_tarihi?: string | null;
  bitis_tarihi?: string | null;
}): OzetMetrikleri {
  const {
    maas_plani,
    mesai_saatleri,
    ders_birim_ucret = 0,
    ders_ucret_tipi = '',
    sgk_gun = 30,
    haftalik_calisma_gun = 5,
    baslangic_tarihi,
    bitis_tarihi,
  } = params;

  const toplamMaas = calcToplamMaas(maas_plani);
  const toplamAy = calcToplamCalismaSuresi(
    maas_plani,
    baslangic_tarihi ?? maas_plani[0]?.baslangic_tarihi,
    bitis_tarihi,
  );
  const haftalikSaat = calcHaftalikSaat(mesai_saatleri);
  const dersUcret = dec(ders_birim_ucret);

  const totalDays = maas_plani.reduce(
    (sum, r) => sum + calcCalisilanGun(r.baslangic_tarihi, r.bitis_tarihi),
    0,
  );
  const gunlukUcret = totalDays ? round2(toplamMaas / totalDays) : 0;
  const saatlikUcret = gunlukUcret ? round2(gunlukUcret / 8) : 0;

  const aySayisi = maas_plani.length || 1;
  const tahminiAylik = round2(toplamMaas / aySayisi);

  let kalanGun = 0;
  const bitis = parseDate(bitis_tarihi);
  if (bitis) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    kalanGun = Math.max(0, Math.floor((bitis.getTime() - today.getTime()) / 86400000));
  }

  return {
    toplam_maas: toplamMaas,
    toplam_calisma_suresi_ay: toplamAy,
    haftalik_calisma_saati: haftalikSaat,
    ders_ucreti: dersUcret,
    ders_ucret_tipi,
    sgk_gun,
    haftalik_calisma_gun,
    gunluk_ucret: gunlukUcret,
    saatlik_ucret: saatlikUcret,
    tahmini_aylik_maliyet: tahminiAylik,
    kalan_gun: kalanGun,
  };
}

/** Sözleşme tarih aralığından ay bazlı maaş planı satırları üret. */
export function generateDefaultMaasPlani(
  baslangic: string,
  bitis: string,
  maas = 0,
): MaasPlaniSatiri[] {
  const start = parseDate(baslangic);
  const end = parseDate(bitis);
  if (!start || !end || end < start) {
    return [{
      sira_no: 1,
      baslangic_tarihi: baslangic || '',
      bitis_tarihi: bitis || '',
      calisilan_gun: calcCalisilanGun(baslangic, bitis),
      maas,
      aciklama: '',
    }];
  }

  const rows: MaasPlaniSatiri[] = [];
  let current = start;
  let sira = 1;

  while (current <= end && sira <= 120) {
    const mEnd = monthEnd(current);
    const rowEnd = mEnd > end ? end : mEnd;
    const bas = toIsoDate(current);
    const bit = toIsoDate(rowEnd);
    rows.push({
      sira_no: sira,
      baslangic_tarihi: bas,
      bitis_tarihi: bit,
      calisilan_gun: calcCalisilanGun(bas, bit),
      maas,
      aciklama: '',
    });
    const next = new Date(rowEnd);
    next.setDate(next.getDate() + 1);
    if (next > end) break;
    current = next;
    sira++;
  }

  return deriveMonthDates(rows, baslangic);
}

export const GUN_ADLARI: Record<number, string> = {
  1: 'Pazartesi',
  2: 'Salı',
  3: 'Çarşamba',
  4: 'Perşembe',
  5: 'Cuma',
  6: 'Cumartesi',
  7: 'Pazar',
};

export const fmtTL = (n: number) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

export const fmtTLDec = (n: number) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

export const fmtTarih = (d: string | null | undefined) => {
  if (!d) return '—';
  return new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};
