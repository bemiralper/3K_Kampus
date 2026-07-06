/**
 * Öğrenci listesi PDF dışa aktarma — jsPDF + autotable, kurum markası.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadJsPdf } from '@/lib/download-file';
import { EXPORT_COLUMNS } from './ogrenci-list-utils';

export type PdfOrientation = 'portrait' | 'landscape';

export interface OgrenciListPdfBranding {
  kurumAd: string;
  subeAd?: string;
  logoUrl?: string | null;
  temaRengi?: string;
}

export interface OgrenciListPdfOptions {
  rows: Record<string, string>[];
  columnKeys: string[];
  branding: OgrenciListPdfBranding;
  orientation?: PdfOrientation;
  filterSummary?: string;
}

const DEFAULT_PRIMARY: [number, number, number] = [2, 98, 167];
const WHITE: [number, number, number] = [255, 255, 255];
const DARK: [number, number, number] = [15, 23, 42];
const GRAY: [number, number, number] = [100, 116, 139];
const ROW_ALT: [number, number, number] = [248, 250, 252];

let fontPromise: Promise<{ regular: string; bold: string }> | null = null;

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function loadFonts() {
  if (fontPromise) return fontPromise;
  fontPromise = (async () => {
    const [regularBuf, boldBuf] = await Promise.all([
      fetch('/fonts/Roboto-Regular.ttf').then((r) => r.arrayBuffer()),
      fetch('/fonts/Roboto-Bold.ttf').then((r) => r.arrayBuffer()),
    ]);
    return { regular: arrayBufferToBase64(regularBuf), bold: arrayBufferToBase64(boldBuf) };
  })();
  return fontPromise;
}

async function loadLogoDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const ct = resp.headers.get('content-type') || 'image/png';
    return `data:${ct};base64,${arrayBufferToBase64(buf)}`;
  } catch {
    return null;
  }
}

function hexToRgb(hex: string | undefined): [number, number, number] {
  if (!hex) return DEFAULT_PRIMARY;
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return DEFAULT_PRIMARY;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return DEFAULT_PRIMARY;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function registerFonts(doc: jsPDF, fonts: { regular: string; bold: string }) {
  doc.addFileToVFS('Roboto-Regular.ttf', fonts.regular);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFileToVFS('Roboto-Bold.ttf', fonts.bold);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'normal');
}

function addFooter(doc: jsPDF, brandLine: string) {
  const pages = doc.getNumberOfPages();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GRAY);
    doc.setLineWidth(0.2);
    doc.line(10, ph - 10, pw - 10, ph - 10);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(brandLine, 10, ph - 6);
    doc.text(`Sayfa ${i} / ${pages}`, pw - 10, ph - 6, { align: 'right' });
  }
  doc.setTextColor(...DARK);
}

function drawHeader(
  doc: jsPDF,
  primary: [number, number, number],
  logo: string | null,
  kurumAd: string,
  subeAd: string | undefined,
  subtitle: string,
  meta: string,
): number {
  const pw = doc.internal.pageSize.getWidth();
  const barH = 22;
  doc.setFillColor(...primary);
  doc.rect(0, 0, pw, barH, 'F');

  let textX = 12;
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', 10, 3, 16, 16);
      textX = 30;
    } catch {
      /* logo yüklenemedi */
    }
  }

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text(kurumAd, textX, 9);

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8);
  const subLine = [subeAd, subtitle].filter(Boolean).join(' · ');
  doc.text(subLine, textX, 15);

  const now = new Date();
  doc.setFontSize(7.5);
  doc.text(
    now.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }),
    pw - 10,
    9,
    { align: 'right' },
  );
  doc.text(`${meta}`, pw - 10, 15, { align: 'right' });

  doc.setTextColor(...DARK);
  return barH + 6;
}

function buildColumnStyles(
  doc: jsPDF,
  dataColCount: number,
): Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> {
  const pageW = doc.internal.pageSize.getWidth();
  const tableW = pageW - 20;
  const idxW = 8;
  const perCol = dataColCount > 0 ? (tableW - idxW) / dataColCount : tableW - idxW;
  const styles: Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> = {
    0: { cellWidth: idxW, halign: 'center' },
  };
  for (let i = 1; i <= dataColCount; i++) {
    styles[i] = { cellWidth: perCol, halign: 'left' };
  }
  return styles;
}

function fontSizeForColumns(colCount: number, orientation: PdfOrientation): number {
  if (colCount > 12) return orientation === 'landscape' ? 6 : 5.5;
  if (colCount > 9) return orientation === 'landscape' ? 6.5 : 6;
  if (colCount > 6) return orientation === 'landscape' ? 7 : 6.5;
  return orientation === 'landscape' ? 8 : 7.5;
}

export async function exportOgrenciListPdf(options: OgrenciListPdfOptions): Promise<void> {
  const {
    rows,
    columnKeys,
    branding,
    orientation = columnKeys.length > 6 ? 'landscape' : 'portrait',
    filterSummary = '',
  } = options;

  const labels = columnKeys.map((k) => EXPORT_COLUMNS.find((c) => c.key === k)?.label || k);
  const body = rows.map((row, idx) => [
    String(idx + 1),
    ...columnKeys.map((k) => {
      const val = row[k] != null ? String(row[k]) : '—';
      return val.length > 120 ? `${val.slice(0, 117)}…` : val;
    }),
  ]);

  const totalCols = labels.length + 1;
  const tableFontSize = fontSizeForColumns(totalCols, orientation);

  const [fonts, logoData] = await Promise.all([
    loadFonts(),
    loadLogoDataUri(branding.logoUrl || '/img/3k-logo.png'),
  ]);

  const primary = hexToRgb(branding.temaRengi);
  const brandLine = [branding.kurumAd, branding.subeAd].filter(Boolean).join(' · ');

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });
  registerFonts(doc, fonts);

  const tableWidth = doc.internal.pageSize.getWidth() - 20;
  const columnStyles = buildColumnStyles(doc, labels.length);

  const startY = drawHeader(
    doc,
    primary,
    logoData,
    branding.kurumAd || 'Öğrenci Listesi',
    branding.subeAd,
    'Öğrenci Listesi',
    `${rows.length} kayıt`,
  );

  if (filterSummary) {
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(filterSummary, 10, startY - 2);
  }

  autoTable(doc, {
    startY: filterSummary ? startY + 2 : startY,
    tableWidth,
    head: [['#', ...labels]],
    body,
    showHead: 'everyPage',
    rowPageBreak: 'auto',
    styles: {
      font: 'Roboto',
      fontSize: tableFontSize,
      cellPadding: { top: 2, right: 1.5, bottom: 2, left: 1.5 },
      overflow: 'linebreak',
      valign: 'middle',
      textColor: DARK,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: primary,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: tableFontSize,
      halign: 'center',
      valign: 'middle',
      overflow: 'linebreak',
      minCellHeight: tableFontSize + 4,
    },
    bodyStyles: {
      overflow: 'linebreak',
      valign: 'middle',
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles,
    margin: { left: 10, right: 10, top: 28, bottom: 14 },
  });

  addFooter(doc, brandLine);
  await downloadJsPdf(doc, 'ogrenciler.pdf');
}
