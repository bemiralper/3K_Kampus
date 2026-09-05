/**
 * Salon / oturma / yoklama PDF — öğrenci listesi şablonundan bağımsız.
 * Sıra numarası asıl indekstir; sütunlar ağırlıklı genişlik alır.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadJsPdf } from '@/lib/download-file';
import type { PdfOrientation } from '@/app/ogrenciler/lib/ogrenciListPdfExport';
import type { ExamParticipantRow, ExamRoomItem } from '../types';
import {
  ROSTER_KIND_TITLES,
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

function groupByRoom(rows: ExamParticipantRow[]): { title: string; items: ExamParticipantRow[] }[] {
  const map = new Map<string, ExamParticipantRow[]>();
  for (const row of rows) {
    const key = row.room_name || 'Salon atanmadı';
    map.set(key, [...(map.get(key) || []), row]);
  }
  return map.size ? [...map.entries()].map(([title, items]) => ({ title, items }))
    : [{ title: 'Salon atanmadı', items: [] }];
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

function drawSeatingGrid(
  doc: jsPDF,
  startY: number,
  items: ExamParticipantRow[],
  capacity: number,
  extraKeys: string[],
) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tableW = pw - MARGIN * 2;
  const cols = pw > 200 ? 3 : 2;
  const gap = 3.5;
  const cardW = (tableW - gap * (cols - 1)) / cols;
  const cardH = extraKeys.length ? 18 : 15;
  const bySeat = new Map<number, ExamParticipantRow>();
  let maxSeat = 0;
  for (const row of items) {
    const n = row.seat_no || 0;
    if (n) {
      bySeat.set(n, row);
      if (n > maxSeat) maxSeat = n;
    }
  }
  const unseated = items.filter(r => !r.seat_no);
  const total = Math.max(capacity, maxSeat, items.length);
  const slots: { seat: number; row: ExamParticipantRow | null }[] = [];
  for (let n = 1; n <= total; n++) {
    slots.push({ seat: n, row: bySeat.get(n) || null });
  }
  unseated.forEach((row, i) => {
    const empty = slots.find(s => !s.row);
    if (empty) empty.row = row;
    else slots.push({ seat: total + i + 1, row });
  });

  let y = startY;
  slots.forEach((slot, i) => {
    const col = i % cols;
    if (col === 0 && i > 0) y += cardH + gap;
    if (col === 0 && y + cardH > ph - 14) {
      doc.addPage();
      y = 16;
    }
    const x = MARGIN + col * (cardW + gap);
    const occupied = Boolean(slot.row);
    doc.setFillColor(...(occupied ? WHITE : CARD_BG));
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, cardH, 1.2, 1.2, 'FD');

    doc.setFillColor(...SEAT_BG);
    doc.roundedRect(x + 1.4, y + 2.4, 11, 10, 1, 1, 'F');
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...PRIMARY);
    doc.text(String(slot.seat), x + 7, y + 9.2, { align: 'center' });

    const textX = x + 15;
    const textW = cardW - 18;
    if (slot.row) {
      doc.setFont('Roboto', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      doc.text(slot.row.full_name || '—', textX, y + 6.6, { maxWidth: textW });
      const bits = [
        slot.row.sinif || slot.row.sinif_seviyesi,
        extraKeys.includes('okul_no') && slot.row.okul_no ? `#${slot.row.okul_no}` : '',
        extraKeys.includes('tc_kimlik_no') && slot.row.tc_kimlik_no ? slot.row.tc_kimlik_no : '',
      ].filter(Boolean);
      doc.setFont('Roboto', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...INK);
      doc.text(bits.join('  ·  ') || '—', textX, y + 11.8, { maxWidth: textW });
    } else {
      doc.setFont('Roboto', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text('Boş sıra', textX, y + 9);
    }
  });
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
  const sorted = sortRosterRows(opts.rows, sort);
  const fonts = await loadFonts();
  const logo = await loadLogo(branding.logoUrl);
  const primary = hexToRgb(branding.temaRengi);
  const brandLine = [branding.kurumAd, branding.subeAd].filter(Boolean).join(' · ');

  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  registerFonts(doc, fonts);

  const byRoom = kind === 'oturma' || pageMode === 'room';
  const groups = byRoom
    ? groupByRoom(sorted)
    : [{ title: 'Tüm salonlar', items: sorted }];
  const oturmaExtra = columnKeys.filter(k => !['seat_no', 'tam_ad', 'room_name'].includes(k));

  groups.forEach((group, gi) => {
    if (gi > 0) doc.addPage();
    const cap = rooms.find(r => r.name === group.title)?.capacity || 0;
    const startY = drawHeader(doc, primary, logo, {
      eyebrow: ROSTER_KIND_TITLES[kind],
      examName,
      roomName: group.title,
      meta: [
        examDate || '',
        `${group.items.length} öğrenci`,
        kind === 'oturma' && cap ? `${cap} sıra` : '',
      ].filter(Boolean),
    });

    if (kind === 'oturma') {
      drawSeatingGrid(doc, startY, group.items, cap || group.items.length, oturmaExtra);
      return;
    }

    drawTablePage(doc, startY, columnKeys, group.items, markAttendance, primary);

    if (kind === 'salon') {
      const y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || startY;
      const pageH = doc.internal.pageSize.getHeight();
      const sigY = Math.min(y + 12, pageH - 22);
      doc.setFont('Roboto', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...INK);
      doc.text('Salon görevlisi: ________________________________', MARGIN, sigY);
      doc.text('İmza: ____________________', MARGIN + 92, sigY);
    }
  });

  addFooter(doc, brandLine || branding.kurumAd);
  await downloadJsPdf(doc, fileName);
}
