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
  /** Verilirse EXPORT_COLUMNS yerine bu etiketler kullanılır */
  columnLabels?: string[];
  branding: OgrenciListPdfBranding;
  orientation?: PdfOrientation;
  filterSummary?: string;
  documentTitle?: string;
  fileName?: string;
  /** Bu kolonlarda metin yerine onay kutusu çizilir (`1` = işaretli). */
  checkboxKeys?: string[];
}

const DEFAULT_PRIMARY: [number, number, number] = [2, 98, 167];
const WHITE: [number, number, number] = [255, 255, 255];
const DARK: [number, number, number] = [15, 23, 42];
const GRAY: [number, number, number] = [100, 116, 139];
const ROW_ALT: [number, number, number] = [248, 250, 252];
const LIGHT_ON_PRIMARY: [number, number, number] = [214, 228, 242];
const MUTED_ON_PRIMARY: [number, number, number] = [175, 196, 218];
const DEFAULT_PDF_LOGO = '/img/beyaz-logo.png';

let fontPromise: Promise<{ regular: string; bold: string }> | null = null;

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function isOpenTypeFont(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const tag = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  return tag === '\x00\x01\x00\x00' || tag === 'OTTO' || tag === 'true' || tag === 'typ1';
}

async function fetchFontBuffer(url: string): Promise<ArrayBuffer> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`PDF yazı tipi yüklenemedi (${url}): ${resp.status}`);
  }
  const buf = await resp.arrayBuffer();
  if (!isOpenTypeFont(buf)) {
    throw new Error(`PDF yazı tipi geçersiz veya eksik: ${url}`);
  }
  return buf;
}

async function loadFonts() {
  if (fontPromise) return fontPromise;
  fontPromise = (async () => {
    const [regularBuf, boldBuf] = await Promise.all([
      fetchFontBuffer('/fonts/Roboto-Regular.ttf'),
      fetchFontBuffer('/fonts/Roboto-Bold.ttf'),
    ]);
    return { regular: arrayBufferToBase64(regularBuf), bold: arrayBufferToBase64(boldBuf) };
  })();
  return fontPromise;
}

function rasterizeToPng(dataUri: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) {
        resolve(null);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUri;
  });
}

async function loadLogoDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const ct = (resp.headers.get('content-type') || 'image/png').split(';')[0].trim();
    const raw = `data:${ct};base64,${arrayBufferToBase64(buf)}`;
    if (/^data:image\/(png|jpe?g)/i.test(raw)) return raw;
    return (await rasterizeToPng(raw)) || raw;
  } catch {
    return null;
  }
}

interface LogoAsset {
  dataUri: string;
  width: number;
  height: number;
}

function getImageDimensions(dataUri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width || 1,
        height: img.naturalHeight || img.height || 1,
      });
    };
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUri;
  });
}

async function loadLogoAsset(url: string | null | undefined): Promise<LogoAsset | null> {
  const dataUri = await loadLogoDataUri(url);
  if (!dataUri) return null;
  const { width, height } = await getImageDimensions(dataUri);
  return { dataUri, width, height };
}

function fitLogoBox(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  if (naturalW <= 0 || naturalH <= 0) return { width: maxH, height: maxH };
  const scale = Math.min(maxW / naturalW, maxH / naturalH, 1);
  return {
    width: naturalW * scale,
    height: naturalH * scale,
  };
}

function hexToRgb(hex: string | undefined): [number, number, number] {
  if (!hex) return DEFAULT_PRIMARY;
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return DEFAULT_PRIMARY;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return DEFAULT_PRIMARY;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function darkenRgb([r, g, b]: [number, number, number], amount = 0.2): [number, number, number] {
  return [
    Math.max(0, Math.round(r * (1 - amount))),
    Math.max(0, Math.round(g * (1 - amount))),
    Math.max(0, Math.round(b * (1 - amount))),
  ];
}

function imageFormatFromDataUri(uri: string): 'PNG' | 'JPEG' {
  if (/^data:image\/jpe?g/i.test(uri)) return 'JPEG';
  return 'PNG';
}

function registerFonts(doc: jsPDF, fonts: { regular: string; bold: string }) {
  doc.addFileToVFS('Roboto-Regular.ttf', fonts.regular);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFileToVFS('Roboto-Bold.ttf', fonts.bold);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  const registered = doc.getFontList()?.Roboto || [];
  if (!registered.includes('normal') || !registered.includes('bold')) {
    throw new Error('PDF yazı tipi kaydedilemedi');
  }
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

interface PdfHeaderOptions {
  documentTitle: string;
  kurumAd: string;
  subeAd?: string;
  filterSummary?: string;
  meta: string;
}

function drawHeader(
  doc: jsPDF,
  primary: [number, number, number],
  logo: LogoAsset | null,
  options: PdfHeaderOptions,
): number {
  const pw = doc.internal.pageSize.getWidth();
  const bandH = 30;
  const primaryDark = darkenRgb(primary, 0.22);
  const textRight = pw - 12;

  doc.setFillColor(...primaryDark);
  doc.rect(0, 0, pw, bandH, 'F');
  doc.setFillColor(...primary);
  doc.rect(0, 0, pw * 0.68, bandH, 'F');

  const logoX = 12;
  const maxLogoW = 34;
  const maxLogoH = 18;
  let logoW = maxLogoH;
  let logoH = maxLogoH;
  if (logo) {
    const fitted = fitLogoBox(logo.width, logo.height, maxLogoW, maxLogoH);
    logoW = fitted.width;
    logoH = fitted.height;
    const logoY = (bandH - logoH) / 2;
    try {
      doc.addImage(
        logo.dataUri,
        imageFormatFromDataUri(logo.dataUri),
        logoX,
        logoY,
        logoW,
        logoH,
      );
    } catch {
      /* logo yüklenemedi */
    }
  }

  const textX = logoX + logoW + 8;
  const textBlockMaxW = Math.max(48, pw - textX - 46);
  const title = options.documentTitle.toLocaleUpperCase('tr-TR');

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...WHITE);
  doc.text(title, textX, 12, { maxWidth: textBlockMaxW });

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...LIGHT_ON_PRIMARY);
  const orgLine = [options.kurumAd, options.subeAd].filter(Boolean).join(' · ');
  if (orgLine) {
    doc.text(orgLine, textX, 18, { maxWidth: textBlockMaxW });
  }

  if (options.filterSummary) {
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED_ON_PRIMARY);
    doc.text(options.filterSummary, textX, 23.5, { maxWidth: textBlockMaxW });
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...LIGHT_ON_PRIMARY);
  doc.text(dateStr, textRight, 11.5, { align: 'right' });
  doc.text(timeStr, textRight, 16, { align: 'right' });

  const badgeText = options.meta;
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(8);
  const badgeW = Math.min(Math.max(doc.getTextWidth(badgeText) + 10, 22), 42);
  const badgeH = 6.5;
  const badgeX = textRight - badgeW;
  const badgeY = 19;
  doc.setFillColor(...WHITE);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, 'F');
  doc.setTextColor(...primary);
  doc.text(badgeText, badgeX + badgeW / 2, badgeY + 4.4, { align: 'center' });

  doc.setFillColor(...primary);
  doc.rect(0, bandH, pw, 1.4, 'F');

  doc.setTextColor(...DARK);
  return bandH + 7;
}

const INDEX_COL_W = 12;
const CHECK_COL_W = 20;

function dataColumnKeys(columnKeys: string[]): string[] {
  return columnKeys.filter((key) => key !== 'sira');
}

function buildColumnStyles(
  keys: string[],
  checkboxIndexes?: Set<number>,
): Record<number, { minCellWidth?: number; halign: 'left' | 'center' | 'right' }> {
  const styles: Record<number, { minCellWidth?: number; halign: 'left' | 'center' | 'right' }> = {
    0: { minCellWidth: INDEX_COL_W, halign: 'center' },
  };
  keys.forEach((_, i) => {
    const index = i + 1;
    if (checkboxIndexes?.has(index)) {
      styles[index] = { minCellWidth: CHECK_COL_W, halign: 'center' };
    } else {
      styles[index] = { halign: 'left' };
    }
  });
  return styles;
}

function checkboxIndexSet(columnKeys: string[], checkboxKeys?: string[]): Set<number> {
  const wanted = new Set(checkboxKeys || []);
  const indexes = new Set<number>();
  columnKeys.forEach((key, i) => {
    if (wanted.has(key)) indexes.add(i + 1);
  });
  return indexes;
}

function drawCheckbox(
  doc: jsPDF,
  cell: { x: number; y: number; width: number; height: number },
  checked: boolean,
  primary: [number, number, number],
) {
  const size = Math.min(4.1, cell.width - 3, cell.height - 3);
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

function checkboxHooks(
  checkboxIndexes: Set<number>,
  primary: [number, number, number],
) {
  if (checkboxIndexes.size === 0) return {};
  return {
    didParseCell: (data: { section: string; column: { index: number }; cell: { text: string[] } }) => {
      if (data.section === 'body' && checkboxIndexes.has(data.column.index)) {
        data.cell.text = [''];
      }
    },
    didDrawCell: (data: {
      section: string;
      column: { index: number };
      cell: { x: number; y: number; width: number; height: number; raw: unknown };
      doc: jsPDF;
    }) => {
      if (data.section !== 'body' || !checkboxIndexes.has(data.column.index)) return;
      drawCheckbox(data.doc, data.cell, String(data.cell.raw || '') === '1', primary);
    },
  };
}

function formatPdfCell(value: unknown, isCheckbox: boolean): string {
  if (isCheckbox) return String(value || '') === '1' ? '1' : '';
  const val = value != null && String(value) !== '' ? String(value) : '—';
  return val.length > 120 ? `${val.slice(0, 117)}…` : val;
}

function fontSizeForColumns(colCount: number, orientation: PdfOrientation): number {
  if (colCount > 10) return orientation === 'landscape' ? 8 : 7.5;
  if (colCount > 6) return 9;
  return 10;
}

function useHorizontalBreak(colCount: number, orientation: PdfOrientation): boolean {
  return colCount > (orientation === 'landscape' ? 10 : 7);
}

function tableLayoutOptions(
  keys: string[],
  orientation: PdfOrientation,
  primary: [number, number, number],
  checkboxIndexes: Set<number>,
) {
  const totalCols = keys.length + 1;
  const tableFontSize = fontSizeForColumns(totalCols, orientation);
  const wide = useHorizontalBreak(totalCols, orientation);
  const nameIndex = keys.findIndex((key) => key === 'tam_ad' || key === 'ogrenci');
  return {
    showHead: 'everyPage' as const,
    rowPageBreak: 'auto' as const,
    horizontalPageBreak: wide,
    horizontalPageBreakRepeat: wide ? (nameIndex >= 0 ? [0, nameIndex + 1] : [0]) : undefined,
    styles: {
      font: 'Roboto',
      fontStyle: 'normal' as const,
      fontSize: tableFontSize,
      cellPadding: 2,
      overflow: 'linebreak' as const,
      valign: 'middle' as const,
      textColor: DARK,
      lineColor: [226, 232, 240] as [number, number, number],
      lineWidth: 0.2,
    },
    headStyles: {
      font: 'Roboto',
      fontStyle: 'bold' as const,
      fillColor: primary,
      textColor: WHITE,
      fontSize: tableFontSize,
      halign: 'center' as const,
      valign: 'middle' as const,
      overflow: 'linebreak' as const,
      minCellHeight: tableFontSize + (checkboxIndexes.size ? 8 : 5),
    },
    bodyStyles: {
      font: 'Roboto',
      fontStyle: 'normal' as const,
      overflow: 'linebreak' as const,
      valign: 'middle' as const,
      // NOT: `minCellHeight: undefined` autotable içinde Math.max(h, undefined) = NaN
      // üretip satır yüksekliklerini bozuyor; değer yoksa anahtarı hiç ekleme.
      ...(checkboxIndexes.size ? { minCellHeight: 9 } : {}),
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: buildColumnStyles(keys, checkboxIndexes),
    margin: { left: 10, right: 10, top: 36, bottom: 14 },
    ...checkboxHooks(checkboxIndexes, primary),
  };
}

export async function exportGroupedOgrenciListPdf(options: {
  sections: { title: string; rows: Record<string, string>[]; emptyMessage?: string }[];
  columnKeys: string[];
  columnLabels?: string[];
  branding: OgrenciListPdfBranding;
  orientation?: PdfOrientation;
  filterSummary?: string;
  documentTitle?: string;
  fileName?: string;
  totalRecordsLabel?: string;
  /** true: her bölüm yeni sayfada başlar */
  pageBreakBetweenSections?: boolean;
  /** Bu kolonlarda metin yerine onay kutusu çizilir (`1` = işaretli). */
  checkboxKeys?: string[];
}): Promise<void> {
  const {
    sections,
    columnKeys,
    columnLabels,
    branding,
    orientation = columnKeys.length > 6 ? 'landscape' : 'portrait',
    filterSummary = '',
    documentTitle = 'Öğrenci Listesi',
    fileName = 'ogrenciler.pdf',
    totalRecordsLabel,
    pageBreakBetweenSections = false,
    checkboxKeys,
  } = options;

  const keys = dataColumnKeys(columnKeys);
  const sourceLabels =
    columnLabels && columnLabels.length === columnKeys.length
      ? columnLabels
      : columnKeys.map((k) => EXPORT_COLUMNS.find((c) => c.key === k)?.label || k);
  const labels = columnKeys
    .map((key, i) => ({ key, label: sourceLabels[i] }))
    .filter((col) => col.key !== 'sira')
    .map((col) => col.label);

  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0);
  const metaCount = totalRecordsLabel ?? `${totalRows} kayıt`;

  const [fonts, logoData] = await Promise.all([
    loadFonts(),
    loadLogoAsset(branding.logoUrl || DEFAULT_PDF_LOGO),
  ]);

  const primary = hexToRgb(branding.temaRengi);
  const brandLine = [branding.kurumAd, branding.subeAd].filter(Boolean).join(' · ');

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });
  registerFonts(doc, fonts);

  const checkboxIndexes = checkboxIndexSet(keys, checkboxKeys);
  const tableOptions = tableLayoutOptions(keys, orientation, primary, checkboxIndexes);

  // Ayrı sayfalarda her bölüm kendi başlığını çizer (ölçüt adı: 12. Sınıf / 12/Loca 4)
  let startY = pageBreakBetweenSections
    ? 0
    : drawHeader(doc, primary, logoData, {
        documentTitle,
        kurumAd: branding.kurumAd || 'Kurum',
        subeAd: branding.subeAd,
        filterSummary,
        meta: metaCount,
      });

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    const sectionTitle = (section.title || '').trim() || documentTitle;
    const sectionCount = `${section.rows.length} kayıt`;

    if (pageBreakBetweenSections) {
      if (si > 0) doc.addPage();
      // Başlık = grup ölçütü (örn. 12. Sınıf, 12/Loca 4)
      startY = drawHeader(doc, primary, logoData, {
        documentTitle: sectionTitle,
        kurumAd: branding.kurumAd || 'Kurum',
        subeAd: branding.subeAd,
        filterSummary,
        meta: sectionCount,
      });
    } else {
      const pageH = doc.internal.pageSize.getHeight();
      if (startY > pageH - 40) {
        doc.addPage();
        startY = 36;
      }
      doc.setFont('Roboto', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...primary);
      doc.text(sectionTitle, 10, startY);
      startY += 5;
    }

    if (section.rows.length === 0) {
      doc.setFont('Roboto', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text(section.emptyMessage || '(Bu sınıfta yerleşmiş öğrenci yok)', 10, startY);
      startY += 10;
      continue;
    }

    const body = section.rows.map((row, idx) => [
      String(idx + 1),
      ...keys.map((k) => formatPdfCell(row[k], checkboxIndexes.has(keys.indexOf(k) + 1))),
    ]);

    autoTable(doc, {
      ...tableOptions,
      startY,
      head: [['Sıra', ...labels]],
      body,
    });

    startY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  addFooter(doc, brandLine);
  await downloadJsPdf(doc, fileName);
}

export async function exportOgrenciListPdf(options: OgrenciListPdfOptions): Promise<void> {
  const {
    rows,
    columnKeys,
    columnLabels,
    branding,
    orientation = columnKeys.length > 6 ? 'landscape' : 'portrait',
    filterSummary = '',
    documentTitle = 'Öğrenci Listesi',
    fileName = 'ogrenciler.pdf',
    checkboxKeys,
  } = options;

  const keys = dataColumnKeys(columnKeys);
  const sourceLabels =
    columnLabels && columnLabels.length === columnKeys.length
      ? columnLabels
      : columnKeys.map((k) => EXPORT_COLUMNS.find((c) => c.key === k)?.label || k);
  const labels = columnKeys
    .map((key, i) => ({ key, label: sourceLabels[i] }))
    .filter((col) => col.key !== 'sira')
    .map((col) => col.label);
  const checkboxIndexes = checkboxIndexSet(keys, checkboxKeys);
  const body = rows.map((row, idx) => [
    String(idx + 1),
    ...keys.map((k) => formatPdfCell(row[k], checkboxIndexes.has(keys.indexOf(k) + 1))),
  ]);

  const [fonts, logoData] = await Promise.all([
    loadFonts(),
    loadLogoAsset(branding.logoUrl || DEFAULT_PDF_LOGO),
  ]);

  const primary = hexToRgb(branding.temaRengi);
  const brandLine = [branding.kurumAd, branding.subeAd].filter(Boolean).join(' · ');

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });
  registerFonts(doc, fonts);

  const startY = drawHeader(doc, primary, logoData, {
    documentTitle,
    kurumAd: branding.kurumAd || 'Kurum',
    subeAd: branding.subeAd,
    filterSummary,
    meta: `${rows.length} kayıt`,
  });

  autoTable(doc, {
    startY,
    head: [['Sıra', ...labels]],
    body,
    ...tableLayoutOptions(keys, orientation, primary, checkboxIndexes),
  });

  addFooter(doc, brandLine);
  await downloadJsPdf(doc, fileName);
}
