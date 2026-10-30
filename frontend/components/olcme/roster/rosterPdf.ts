/**
 * Salon / oturma / yoklama PDF — öğrenci listesi şablonundan bağımsız.
 * Sıra numarası asıl indekstir; sütunlar ağırlıklı genişlik alır.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadJsPdf } from '@/lib/download-file';
import type { PdfOrientation } from '@/app/ogrenciler/lib/ogrenciListPdfExport';
import type { ExamParticipantRow, ExamRoomItem } from '../types';
import { candidateSeats, formatInactiveSeats, inactiveSeatSet } from './seating';
import {
  ROSTER_KIND_TITLES,
  groupRosterByRoom,
  participantExportValue,
  rosterColumnLabel,
  sortRosterRows,
  type RosterExportSort,
  type RosterPageMode,
  type RosterPdfKind,
} from './rosterExport';

const PRIMARY: [number, number, number] = [2, 98, 167];
const PRIMARY_DARK: [number, number, number] = [1, 74, 127];
const DARK: [number, number, number] = [15, 23, 42];
const INK: [number, number, number] = [71, 85, 105];
const GRAY: [number, number, number] = [148, 163, 184];
const LINE: [number, number, number] = [220, 229, 239];
const ROW_ALT: [number, number, number] = [247, 250, 252];
const WHITE: [number, number, number] = [255, 255, 255];
const CARD_BG: [number, number, number] = [248, 250, 252];
const SEAT_BG: [number, number, number] = [234, 242, 250];
const MARGIN = 10;

const COL_MM: Record<string, number> = {
  seat_no: 16,
  room_name: 28,
  tam_ad: 58,
  ad: 28,
  soyad: 28,
  okul_no: 22,
  tc_kimlik_no: 28,
  telefon: 28,
  email: 36,
  sinif: 24,
  sinif_seviyesi: 28,
  veli_ad_soyad: 40,
  veli_telefon: 28,
  geldi: 18,
  gelmedi: 20,
};

const CHECKBOX_KEYS = new Set(['geldi', 'gelmedi']);

type Branding = {
  kurumAd: string;
  subeAd?: string;
  logoUrl?: string | null;
  temaRengi?: string;
};

let fontPromise: Promise<{ regular: string; bold: string }> | null = null;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function loadFonts() {
  if (!fontPromise) {
    fontPromise = Promise.all([
      fetch('/fonts/Roboto-Regular.ttf').then(r => r.arrayBuffer()),
      fetch('/fonts/Roboto-Bold.ttf').then(r => r.arrayBuffer()),
    ]).then(([regular, bold]) => ({ regular: toBase64(regular), bold: toBase64(bold) }));
  }
  return fontPromise;
}

type LogoAsset = { dataUri: string; width: number; height: number };

async function loadLogo(url?: string | null): Promise<LogoAsset | null> {
  const src = url || '/img/beyaz-logo.png';
  try {
    const resp = await fetch(src, { credentials: 'include' });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const ct = resp.headers.get('content-type') || 'image/png';
    const dataUri = `data:${ct};base64,${toBase64(buf)}`;
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
      img.onerror = () => resolve({ width: 1, height: 1 });
      img.src = dataUri;
    });
    return { dataUri, ...dims };
  } catch {
    return null;
  }
}

function hexToRgb(hex?: string): [number, number, number] {
  if (!hex) return PRIMARY;
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return PRIMARY;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return PRIMARY;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function fitLogo(nw: number, nh: number, maxW: number, maxH: number) {
  if (nw <= 0 || nh <= 0) return { width: maxW, height: maxH };
  const s = Math.min(maxW / nw, maxH / nh);
  return { width: nw * s, height: nh * s };
}

function registerFonts(doc: jsPDF, fonts: { regular: string; bold: string }) {
  doc.addFileToVFS('Roboto-Regular.ttf', fonts.regular);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFileToVFS('Roboto-Bold.ttf', fonts.bold);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'normal');
}

function drawHeader(
  doc: jsPDF,
  primary: [number, number, number],
  logo: LogoAsset | null,
  opts: { eyebrow: string; examName: string; roomName: string; meta: string[] },
): number {
  const pw = doc.internal.pageSize.getWidth();
  const bandH = 18;

  doc.setFillColor(...PRIMARY_DARK);
  doc.rect(0, 0, pw, bandH, 'F');
  doc.setFillColor(...primary);
  doc.rect(0, 0, pw * 0.7, bandH, 'F');

  let tx = MARGIN;
  if (logo) {
    try {
      const box = fitLogo(logo.width, logo.height, 28, 12);
      const fmt = /^data:image\/jpe?g/i.test(logo.dataUri) ? 'JPEG' : 'PNG';
      doc.addImage(logo.dataUri, fmt, MARGIN, (bandH - box.height) / 2, box.width, box.height);
      tx = MARGIN + box.width + 5;
    } catch { /* logo yok */ }
  }

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...WHITE);
  doc.text(opts.eyebrow.toLocaleUpperCase('tr-TR'), tx, bandH / 2 + 1.2);

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }),
    pw - MARGIN, bandH / 2 + 1.2, { align: 'right' },
  );

  let y = bandH + 8;
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text(opts.examName, MARGIN, y, { maxWidth: pw - MARGIN * 2 });
  y += 6;

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text(opts.roomName, MARGIN, y);

  if (opts.meta.length) {
    y += 5;
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text(opts.meta.join('   ·   '), MARGIN, y, { maxWidth: pw - MARGIN * 2 });
  }

  y += 3;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.35);
  doc.line(MARGIN, y, pw - MARGIN, y);
  doc.setTextColor(...DARK);
  return y + 4;
}

function addFooter(doc: jsPDF, brand: string) {
  const pages = doc.getNumberOfPages();
  const now = new Date();
  const stamp = `${now.toLocaleDateString('tr-TR')} ${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    const w = doc.internal.pageSize.getWidth();
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, h - 9, w - MARGIN, h - 9);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(brand, MARGIN, h - 5);
    doc.text(stamp, w / 2, h - 5, { align: 'center' });
    doc.text(`Sayfa ${i} / ${pages}`, w - MARGIN, h - 5, { align: 'right' });
  }
}

function columnWidths(keys: string[], tableW: number): number[] {
  const raw = keys.map(k => COL_MM[k] || 28);
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map(w => (w / sum) * tableW);
}

function drawCheckbox(
  doc: jsPDF,
  cell: { x: number; y: number; width: number; height: number },
  checked: boolean,
  primary: [number, number, number],
) {
  const size = Math.min(4.2, cell.width - 3, cell.height - 3);
  const x = cell.x + (cell.width - size) / 2;
  const y = cell.y + (cell.height - size) / 2;
  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.35);
  doc.setFillColor(...WHITE);
  doc.roundedRect(x, y, size, size, 0.4, 0.4, 'S');
  if (!checked) return;
  doc.setDrawColor(...primary);
  doc.setLineWidth(0.55);
  doc.line(x + size * 0.2, y + size * 0.52, x + size * 0.42, y + size * 0.76);
  doc.line(x + size * 0.42, y + size * 0.76, x + size * 0.82, y + size * 0.22);
}

function drawTablePage(
  doc: jsPDF,
  startY: number,
  keys: string[],
  items: ExamParticipantRow[],
  markAttendance: boolean,
  primary: [number, number, number],
) {
  const tableW = doc.internal.pageSize.getWidth() - MARGIN * 2;
  const widths = columnWidths(keys, tableW);
  const checkIdx = new Set(keys.map((k, i) => (CHECKBOX_KEYS.has(k) ? i : -1)).filter(i => i >= 0));
  const colStyles: Record<number, { cellWidth: number; halign: 'left' | 'center' }> = {};
  keys.forEach((key, i) => {
    colStyles[i] = {
      cellWidth: widths[i],
      halign: key === 'seat_no' || CHECKBOX_KEYS.has(key) ? 'center' : 'left',
    };
  });

  const body = items.map(row =>
    keys.map(key => {
      if (CHECKBOX_KEYS.has(key)) return participantExportValue(row, key, markAttendance);
      return participantExportValue(row, key, markAttendance) || '—';
    }),
  );

  autoTable(doc, {
    startY,
    tableWidth: tableW,
    head: [keys.map(rosterColumnLabel)],
    body,
    showHead: 'everyPage',
    styles: {
      font: 'Roboto',
      fontSize: keys.length > 7 ? 7 : 8.5,
      cellPadding: { top: 2.2, right: 1.6, bottom: 2.2, left: 1.6 },
      overflow: 'linebreak',
      valign: 'middle',
      textColor: DARK,
      lineColor: LINE,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: primary,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
    },
    bodyStyles: { minCellHeight: checkIdx.size ? 9 : 7.5 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: colStyles,
    margin: { left: MARGIN, right: MARGIN, top: 28, bottom: 14 },
    didParseCell(data) {
      if (data.section === 'body' && checkIdx.has(data.column.index)) {
        data.cell.text = [''];
      }
      if (data.section === 'body' && keys[data.column.index] === 'tam_ad') {
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawCell(data) {
      if (data.section !== 'body' || !checkIdx.has(data.column.index)) return;
      drawCheckbox(doc, data.cell, String(data.cell.raw || '') === '1', primary);
    },
  });
}

type CardLine = { text: string; bold: boolean };

function wrapText(doc: jsPDF, text: string, width: number): string[] {
  const parts = doc.splitTextToSize(text, Math.max(8, width));
  return Array.isArray(parts) ? parts : [String(parts)];
}

/** Sıra rozeti ve sayfa başlığındaki salon, kart metninde tekrarlanmaz. Diğer seçili sütunlar yazılır. */
function seatingCardLines(
  doc: jsPDF,
  row: ExamParticipantRow,
  keys: string[],
  markAttendance: boolean,
  textW: number,
): CardLine[] {
  const out: CardLine[] = [];
  for (const key of keys) {
    if (key === 'seat_no' || key === 'room_name') continue;
    const raw = participantExportValue(row, key, markAttendance);
    const bold = key === 'tam_ad';
    let text = '';
    if (CHECKBOX_KEYS.has(key)) text = `${rosterColumnLabel(key)} ${raw === '1' ? '✓' : '—'}`;
    else if (raw) text = raw;
    if (!text) continue;
    doc.setFont('Roboto', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 9 : 7.5);
    for (const part of wrapText(doc, text, textW)) out.push({ text: part, bold });
  }
  return out.length ? out : [{ text: '—', bold: false }];
}

function drawSeatingGrid(
  doc: jsPDF,
  startY: number,
  items: ExamParticipantRow[],
  seats: number[],
  passive: Set<number>,
  columnKeys: string[],
  markAttendance: boolean,
) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tableW = pw - MARGIN * 2;
  const cols = pw > 200 ? 3 : 2;
  const gap = 3.5;
  const cardW = (tableW - gap * (cols - 1)) / cols;
  const textW = cardW - 18;
  const bySeat = new Map<number, ExamParticipantRow>();
  let maxSeat = 0;
  for (const row of items) {
    const n = row.seat_no || 0;
    if (n && !bySeat.has(n)) {
      bySeat.set(n, row);
      if (n > maxSeat) maxSeat = n;
    }
  }
  const plan = seats.length ? seats : Array.from({ length: Math.max(maxSeat, items.length) }, (_, i) => i + 1);
  const slots: { seat: number; row: ExamParticipantRow | null; passive: boolean }[] = plan.map(seat => ({
    seat,
    row: bySeat.get(seat) || null,
    passive: passive.has(seat),
  }));
  const placed = new Set(slots.map(s => s.row?.id).filter((id): id is number => id != null));
  items.forEach(row => {
    if (placed.has(row.id)) return;
    slots.push({ seat: row.seat_no ?? 0, row, passive: false });
  });

  let y = startY;
  for (let i = 0; i < slots.length; i += cols) {
    const rowSlots = slots.slice(i, i + cols);
    const prepared = rowSlots.map(slot => {
      if (slot.row) {
        return { slot, lines: seatingCardLines(doc, slot.row, columnKeys, markAttendance, textW) };
      }
      return {
        slot,
        lines: [{ text: slot.passive ? 'Pasif' : 'Boş sıra', bold: false }] as CardLine[],
      };
    });
    const lineCount = Math.max(1, ...prepared.map(item => item.lines.length));
    const cardH = Math.max(15, 7 + lineCount * 3.6);
    if (y + cardH > ph - 14) {
      doc.addPage();
      y = 16;
    }
    prepared.forEach((item, col) => {
      const x = MARGIN + col * (cardW + gap);
      const occupied = Boolean(item.slot.row);
      doc.setFillColor(...(occupied ? WHITE : CARD_BG));
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, cardW, cardH, 1.2, 1.2, 'FD');

      doc.setFillColor(...(item.slot.passive && !occupied ? LINE : SEAT_BG));
      doc.roundedRect(x + 1.4, y + 2.4, 11, 10, 1, 1, 'F');
      doc.setFont('Roboto', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...(item.slot.passive && !occupied ? INK : PRIMARY));
      doc.text(item.slot.seat > 0 ? String(item.slot.seat) : '—', x + 7, y + 9.2, { align: 'center' });

      const textX = x + 15;
      item.lines.forEach((line, lineIndex) => {
        doc.setFont('Roboto', line.bold ? 'bold' : 'normal');
        doc.setFontSize(line.bold ? 9 : 7.5);
        doc.setTextColor(...(occupied ? (line.bold ? DARK : INK) : GRAY));
        doc.text(line.text, textX, y + 6.2 + lineIndex * 3.6, { maxWidth: textW });
      });
    });
    y += cardH + gap;
  }
}

function drawSalonSignature(doc: jsPDF) {
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8.5);
  const duty = 'Salon görevlisi: ____________________';
  const sign = 'İmza: ____________________';
  const signW = doc.getTextWidth(sign);
  const signX = MARGIN + doc.getTextWidth(duty) + 8;
  const wraps = signX + signW > pageW - MARGIN;
  const afterTable = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 20;
  let sigY = afterTable + 12;
  if (sigY + (wraps ? 6 : 0) > pageH - 16) {
    doc.addPage();
    sigY = 18;
  }
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text(duty, MARGIN, sigY);
  if (wraps) doc.text(sign, MARGIN, sigY + 6);
  else doc.text(sign, signX, sigY);
}

export async function renderRosterPdf(opts: {
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
  branding: Branding;
  fileName: string;
}) {
  const {
    examName, examDate, kind, rooms = [], columnKeys, sort, pageMode,
    orientation, markAttendance, branding, fileName,
  } = opts;
  const sorted = sortRosterRows(opts.rows, sort, rooms);
  const fonts = await loadFonts();
  const logo = await loadLogo(branding.logoUrl);
  const primary = hexToRgb(branding.temaRengi);
  const brandLine = [branding.kurumAd, branding.subeAd].filter(Boolean).join(' · ');

  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  registerFonts(doc, fonts);

  const groups = pageMode === 'room'
    ? groupRosterByRoom(sorted, rooms)
    : [{ title: 'Tüm salonlar', room: undefined, items: sorted }];
  const sessionNames = [...new Set(sorted.map(row => (row.exam_session_name || '').trim()).filter(Boolean))];
  const sessionLabel = sessionNames.length === 1 ? sessionNames[0] : '';

  groups.forEach((group, gi) => {
    if (gi > 0) doc.addPage();
    const room = group.room ?? rooms.find(item => item.id != null && group.items.some(row => row.room_id === item.id));
    const plan = room ? candidateSeats(room) : [];
    const passiveSeats = room
      ? plan.filter(n => inactiveSeatSet(room.inactive_seats).has(n))
      : [];
    const assignable = plan.filter(n => !inactiveSeatSet(room?.inactive_seats).has(n));
    const passiveLabel = passiveSeats.length
      ? (passiveSeats.length <= 12 ? formatInactiveSeats(passiveSeats) : `${passiveSeats.length} sıra`)
      : '';
    const seatLabel = assignable.length
      ? (room?.seat_gap
        ? `${assignable[0]}’den, ara ${room.seat_gap}`
        : `${assignable[0]}–${assignable[assignable.length - 1]}`)
      : '';
    const seatMeta = [seatLabel, passiveLabel ? `pasif ${passiveLabel}` : ''].filter(Boolean).join(' · ');
    const startY = drawHeader(doc, primary, logo, {
      eyebrow: ROSTER_KIND_TITLES[kind],
      examName,
      roomName: group.title,
      meta: [
        examDate || '',
        sessionLabel,
        `${group.items.length} öğrenci`,
        kind === 'oturma' && pageMode === 'room' && sort === 'seat_asc' && seatMeta ? seatMeta : '',
      ].filter(Boolean),
    });

    if (kind === 'oturma' && pageMode === 'room' && sort === 'seat_asc') {
      drawSeatingGrid(
        doc,
        startY,
        group.items,
        plan,
        new Set(passiveSeats),
        columnKeys,
        markAttendance,
      );
      return;
    }

    drawTablePage(doc, startY, columnKeys, group.items, markAttendance, primary);

    if (kind === 'salon') drawSalonSignature(doc);
  });

  addFooter(doc, brandLine || branding.kurumAd);
  await downloadJsPdf(doc, fileName);
}
