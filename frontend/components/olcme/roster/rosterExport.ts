import { downloadBlob } from '@/lib/download-file';
import type { PdfOrientation } from '@/app/ogrenciler/lib/ogrenciListPdfExport';
import type { ExportColumnDef } from '@/app/ogrenciler/lib/ogrenci-list-utils';
import type { ExamParticipantRow, ExamRoomItem } from '../types';

export type RosterPdfKind = 'yoklama' | 'salon' | 'oturma';
export type RosterExportFormat = 'pdf' | 'xlsx' | 'csv';
export type RosterExportSort = 'seat_asc' | 'name_asc' | 'okul_no_asc';
export type RosterPageMode = 'room' | 'single';

export const ROSTER_KIND_OPTIONS: { id: RosterPdfKind; label: string; desc: string }[] = [
  { id: 'yoklama', label: 'Yoklama listesi', desc: 'Salon bazlı geldi / gelmedi kutuları' },
  { id: 'salon', label: 'Salon listesi', desc: 'Salon görevlisi için öğrenci listesi' },
  { id: 'oturma', label: 'Oturma düzeni', desc: 'Sıra numarasına göre yerleşim' },
];

export const ROSTER_KIND_TITLES: Record<RosterPdfKind, string> = {
  yoklama: 'Yoklama Listesi',
  salon: 'Salon Listesi',
  oturma: 'Oturma Düzeni',
};

const G_SINAV = 'Sınav';
const G_OGRENCI = 'Öğrenci Bilgileri';
const G_EGITIM = 'Eğitim';
const G_VELI = 'Veli';
const G_YOKLAMA = 'Yoklama';

export const ROSTER_EXPORT_COLUMNS: ExportColumnDef[] = [
  { key: 'seat_no', label: 'Sıra', default: true, group: G_SINAV },
  { key: 'room_name', label: 'Salon', group: G_SINAV },
  { key: 'tam_ad', label: 'Ad Soyad', default: true, group: G_OGRENCI },
  { key: 'ad', label: 'Ad', group: G_OGRENCI },
  { key: 'soyad', label: 'Soyad', group: G_OGRENCI },
  { key: 'okul_no', label: 'Okul No', default: true, group: G_OGRENCI },
  { key: 'tc_kimlik_no', label: 'TC Kimlik No', group: G_OGRENCI },
  { key: 'telefon', label: 'Telefon', group: G_OGRENCI },
  { key: 'email', label: 'E-posta', group: G_OGRENCI },
  { key: 'sinif', label: 'Sınıf', default: true, group: G_EGITIM },
  { key: 'sinif_seviyesi', label: 'Sınıf Seviyesi', group: G_EGITIM },
  { key: 'veli_ad_soyad', label: 'Veli Ad Soyad', group: G_VELI },
  { key: 'veli_telefon', label: 'Veli Telefon', group: G_VELI },
  { key: 'geldi', label: 'Geldi', default: true, group: G_YOKLAMA },
  { key: 'gelmedi', label: 'Gelmedi', default: true, group: G_YOKLAMA },
];

export const DEFAULT_ROSTER_KEYS: Record<RosterPdfKind, string[]> = {
  yoklama: ['seat_no', 'tam_ad', 'okul_no', 'sinif', 'geldi', 'gelmedi'],
  salon: ['seat_no', 'tam_ad', 'okul_no', 'sinif', 'tc_kimlik_no'],
  oturma: ['seat_no', 'tam_ad', 'sinif'],
};

const CHECKBOX_KEYS = new Set(['geldi', 'gelmedi']);

export function rosterColumnLabel(key: string): string {
  return ROSTER_EXPORT_COLUMNS.find(c => c.key === key)?.label || key;
}

function trCmp(a: string, b: string) {
  return a.localeCompare(b, 'tr', { sensitivity: 'base' });
}

export function sortRosterRows(rows: ExamParticipantRow[], sort: RosterExportSort): ExamParticipantRow[] {
  const arr = [...rows];
  if (sort === 'name_asc') {
    arr.sort((a, b) => trCmp(a.full_name, b.full_name) || (a.seat_no ?? 0) - (b.seat_no ?? 0));
  } else if (sort === 'okul_no_asc') {
    arr.sort((a, b) => trCmp(a.okul_no || '', b.okul_no || '') || trCmp(a.full_name, b.full_name));
  } else {
    arr.sort((a, b) => {
      const sa = a.seat_no ?? 9999;
      const sb = b.seat_no ?? 9999;
      if (sa !== sb) return sa - sb;
      return trCmp(a.room_name || '', b.room_name || '') || trCmp(a.full_name, b.full_name);
    });
  }
  return arr;
}

export function participantExportValue(
  row: ExamParticipantRow,
  key: string,
  markAttendance: boolean,
): string {
  switch (key) {
    case 'seat_no':
      return row.seat_no != null ? String(row.seat_no) : '';
    case 'room_name':
      return row.room_name || '';
    case 'tam_ad':
      return row.full_name || '';
    case 'ad':
      return row.ad || '';
    case 'soyad':
      return row.soyad || '';
    case 'okul_no':
      return row.okul_no || '';
    case 'tc_kimlik_no':
      return row.tc_kimlik_no || '';
    case 'telefon':
      return row.telefon || '';
    case 'email':
      return row.email || '';
    case 'sinif':
      return row.sinif || '';
    case 'sinif_seviyesi':
      return row.sinif_seviyesi || '';
    case 'veli_ad_soyad':
      return row.veli_ad_soyad || '';
    case 'veli_telefon':
      return row.veli_telefon || '';
    case 'geldi':
      return markAttendance && row.attendance === 'present' ? '1' : '';
    case 'gelmedi':
      return markAttendance && row.attendance === 'absent' ? '1' : '';
    default:
      return '';
  }
}

export function toExportRecord(
  row: ExamParticipantRow,
  keys: string[],
  markAttendance: boolean,
): Record<string, string> {
  const rec: Record<string, string> = {};
  for (const key of keys) rec[key] = participantExportValue(row, key, markAttendance);
  return rec;
}

function groupByRoom(rows: ExamParticipantRow[]): { title: string; items: ExamParticipantRow[] }[] {
  const map = new Map<string, ExamParticipantRow[]>();
  for (const row of rows) {
    const key = row.room_name || 'Salon atanmadı';
    map.set(key, [...(map.get(key) || []), row]);
  }
  if (map.size === 0) return [{ title: 'Salon atanmadı', items: [] }];
  return [...map.entries()].map(([title, items]) => ({ title, items }));
}

function csvEscape(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function attendanceText(value: string, markAttendance: boolean): string {
  if (!markAttendance) return '';
  return value === '1' ? '✓' : '';
}

export async function downloadRosterWorkbook(opts: {
  examName: string;
  kind: RosterPdfKind;
  format: 'xlsx' | 'csv';
  rows: ExamParticipantRow[];
  columnKeys: string[];
  sort: RosterExportSort;
  pageMode: RosterPageMode;
  markAttendance: boolean;
}) {
  const { examName, kind, format, columnKeys, sort, pageMode, markAttendance } = opts;
  const sorted = sortRosterRows(opts.rows, sort);
  const headers = columnKeys.map(rosterColumnLabel);
  const stamp = new Date().toISOString().slice(0, 10);
  const fileBase = `${examName}_${kind}_${stamp}`.replace(/\s+/g, '_');

  const sheetRows = (items: ExamParticipantRow[]) =>
    items.map(row =>
      columnKeys.map(key => {
        const raw = participantExportValue(row, key, markAttendance);
        return CHECKBOX_KEYS.has(key) ? attendanceText(raw, markAttendance) : raw;
      }),
    );

  if (format === 'csv') {
    const lines: string[] = [];
    const groups = pageMode === 'room' ? groupByRoom(sorted) : [{ title: '', items: sorted }];
    for (const group of groups) {
      if (group.title) lines.push(csvEscape(group.title));
      lines.push(headers.map(csvEscape).join(';'));
      for (const cells of sheetRows(group.items)) {
        lines.push(cells.map(csvEscape).join(';'));
      }
      if (pageMode === 'room') lines.push('');
    }
    downloadBlob(
      new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
      `${fileBase}.csv`,
    );
    return;
  }

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const groups = pageMode === 'room' ? groupByRoom(sorted) : [{ title: ROSTER_KIND_TITLES[kind], items: sorted }];
  for (const group of groups) {
    const aoa = [headers, ...sheetRows(group.items)];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, (group.title || 'Liste').slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${fileBase}.xlsx`,
  );
}

export async function downloadRosterPdf(opts: {
  examName: string;
  examDate?: string;
  kind: RosterPdfKind;
  rows: ExamParticipantRow[];
  rooms?: ExamRoomItem[];
  columnKeys: string[];
  sort: RosterExportSort;
  pageMode: RosterPageMode;
  orientation: PdfOrientation;
  markAttendance: boolean;
  branding: {
    kurumAd: string;
    subeAd?: string;
    logoUrl?: string | null;
    temaRengi?: string;
  };
}) {
  const stamp = new Date().toISOString().slice(0, 10);
  const { renderRosterPdf } = await import('./rosterPdf');
  await renderRosterPdf({
    ...opts,
    fileName: `${opts.examName}_${opts.kind}_${stamp}.pdf`.replace(/\s+/g, '_'),
  });
}
