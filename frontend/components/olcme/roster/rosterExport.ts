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

/** Tek listede salon sütunu yoksa öğrencinin salonu kaybolur. Sıra numarasının hemen ardına eklenir. */
export function columnsForPageMode(keys: string[], pageMode: RosterPageMode): string[] {
  if (pageMode !== 'single' || keys.includes('room_name')) return keys;
  const next = [...keys];
  const seatAt = next.indexOf('seat_no');
  next.splice(seatAt >= 0 ? seatAt + 1 : 0, 0, 'room_name');
  return next;
}

export function rosterExportStamp(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function rosterFileBase(examName: string, kind: string, stamp: string): string {
  const raw = `${examName}_${kind}_${stamp}`
    .replace(/\s+/g, '_')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return (raw || `liste_${stamp}`).slice(0, 140);
}

function trCmp(a: string, b: string) {
  return a.localeCompare(b, 'tr', { sensitivity: 'base' });
}

function cmpOkulNo(a: string, b: string): number {
  const aa = (a || '').trim();
  const bb = (b || '').trim();
  if (!aa && !bb) return 0;
  if (!aa) return 1;
  if (!bb) return -1;
  const na = /^(\d+)$/.exec(aa);
  const nb = /^(\d+)$/.exec(bb);
  if (na && nb) {
    const diff = Number(na[1]) - Number(nb[1]);
    if (diff !== 0) return diff;
  }
  return trCmp(aa, bb);
}

function roomIndexes(rooms: ExamRoomItem[]) {
  const byId = new Map<number, number>();
  const byName = new Map<string, number>();
  rooms.forEach((room, index) => {
    if (room.id != null) byId.set(room.id, index);
    const name = (room.name || '').trim();
    if (name && !byName.has(name)) byName.set(name, index);
  });
  return { byId, byName };
}

/** Ekrandaki blok sırası: salonu olmayanlar önce, sonra salonların kayıt sırası. */
function roomRank(
  row: ExamParticipantRow,
  byId: Map<number, number>,
  byName: Map<string, number>,
): number {
  const name = (row.room_name || '').trim();
  if (row.room_id == null && !name) return -1;
  if (row.room_id != null && byId.has(row.room_id)) return byId.get(row.room_id)!;
  if (name && byName.has(name)) return byName.get(name)!;
  return 100_000;
}

export function sortRosterRows(
  rows: ExamParticipantRow[],
  sort: RosterExportSort,
  rooms: ExamRoomItem[] = [],
): ExamParticipantRow[] {
  const { byId, byName } = roomIndexes(rooms);
  const arr = [...rows];
  const rank = (row: ExamParticipantRow) => roomRank(row, byId, byName);
  if (sort === 'name_asc') {
    arr.sort((a, b) => trCmp(a.full_name, b.full_name)
      || (a.seat_no ?? 999999) - (b.seat_no ?? 999999)
      || rank(a) - rank(b));
  } else if (sort === 'okul_no_asc') {
    arr.sort((a, b) => cmpOkulNo(a.okul_no || '', b.okul_no || '')
      || trCmp(a.full_name, b.full_name)
      || rank(a) - rank(b));
  } else {
    arr.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra >= 100_000) {
        const byRoom = trCmp(a.room_name || '', b.room_name || '');
        if (byRoom) return byRoom;
      }
      const sa = a.seat_no ?? 999999;
      const sb = b.seat_no ?? 999999;
      if (sa !== sb) return sa - sb;
      return trCmp(a.full_name, b.full_name);
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

export type RosterRoomGroup = {
  title: string;
  room?: ExamRoomItem;
  items: ExamParticipantRow[];
};

/** Satırlar sıralı gelmeli. Salon sayfaları ekrandaki salon sırasını izler, sıralama salonun içinde kalır. */
export function groupRosterByRoom(
  rows: ExamParticipantRow[],
  rooms: ExamRoomItem[] = [],
): RosterRoomGroup[] {
  const byId = new Map<number, ExamParticipantRow[]>();
  const unassigned: ExamParticipantRow[] = [];
  const orphans = new Map<string, ExamParticipantRow[]>();

  for (const row of rows) {
    if (row.room_id != null) {
      const list = byId.get(row.room_id) || [];
      list.push(row);
      byId.set(row.room_id, list);
      continue;
    }
    const name = (row.room_name || '').trim();
    if (!name) {
      unassigned.push(row);
      continue;
    }
    const list = orphans.get(name) || [];
    list.push(row);
    orphans.set(name, list);
  }

  const groups: RosterRoomGroup[] = [];
  if (unassigned.length) {
    groups.push({ title: 'Salon atanmadı', items: unassigned });
  }

  const consumedOrphans = new Set<string>();
  for (const room of rooms) {
    if (room.id == null) continue;
    const items = byId.get(room.id) || [];
    byId.delete(room.id);
    const named = orphans.get(room.name);
    if (named?.length) {
      items.push(...named);
      consumedOrphans.add(room.name);
    }
    if (!items.length) continue;
    groups.push({ title: room.name || 'Salon', room, items });
  }

  for (const [id, items] of byId) {
    groups.push({ title: items[0]?.room_name || `Salon ${id}`, items });
  }
  for (const [name, items] of orphans) {
    if (!consumedOrphans.has(name)) groups.push({ title: name, items });
  }

  const seen = new Map<string, number>();
  for (const group of groups) {
    const base = group.title || 'Salon';
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    if (n > 1) group.title = `${base} (${n})`;
  }
  if (!groups.length) groups.push({ title: 'Salon atanmadı', items: [] });
  return groups;
}

function safeSheetName(raw: string, used: Set<string>): string {
  const cleaned = (raw || 'Liste')
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Liste';
  const base = cleaned.slice(0, 31);
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLocaleLowerCase('tr-TR'))) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    n += 1;
    if (n > 50) break;
  }
  used.add(candidate.toLocaleLowerCase('tr-TR'));
  return candidate;
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
  rooms?: ExamRoomItem[];
  columnKeys: string[];
  sort: RosterExportSort;
  pageMode: RosterPageMode;
  markAttendance: boolean;
  stamp?: string;
}) {
  const { examName, kind, format, sort, pageMode, markAttendance, rooms = [] } = opts;
  const columnKeys = columnsForPageMode(opts.columnKeys, pageMode);
  const sorted = sortRosterRows(opts.rows, sort, rooms);
  const headers = columnKeys.map(rosterColumnLabel);
  const stamp = opts.stamp || rosterExportStamp();
  const fileBase = rosterFileBase(examName, kind, stamp);

  const sheetRows = (items: ExamParticipantRow[]) =>
    items.map(row =>
      columnKeys.map(key => {
        const raw = participantExportValue(row, key, markAttendance);
        return CHECKBOX_KEYS.has(key) ? attendanceText(raw, markAttendance) : raw;
      }),
    );

  if (format === 'csv') {
    const lines: string[] = [];
    const groups = pageMode === 'room' ? groupRosterByRoom(sorted, rooms) : [{ title: '', items: sorted }];
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
  const groups = pageMode === 'room'
    ? groupRosterByRoom(sorted, rooms)
    : [{ title: ROSTER_KIND_TITLES[kind], items: sorted }];
  const usedSheets = new Set<string>();
  for (const group of groups) {
    const aoa = [headers, ...sheetRows(group.items)];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(group.title || 'Liste', usedSheets));
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
  stamp?: string;
  branding: {
    kurumAd: string;
    subeAd?: string;
    logoUrl?: string | null;
    temaRengi?: string;
  };
}) {
  const stamp = opts.stamp || rosterExportStamp();
  const { renderRosterPdf } = await import('./rosterPdf');
  await renderRosterPdf({
    ...opts,
    columnKeys: columnsForPageMode(opts.columnKeys, opts.pageMode),
    fileName: `${rosterFileBase(opts.examName, opts.kind, stamp)}.pdf`,
  });
}
