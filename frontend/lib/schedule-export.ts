import { apiFetch, getContextHeaders } from '@/lib/api';
import { colorForKeyHex, type ScheduleColorBy } from '@/lib/schedule-color';

export type { ScheduleColorBy };

export type ScheduleExportFormat = 'csv' | 'xlsx' | 'pdf';
export type ScheduleExportLayout = 'stacked' | 'per_class_sheet';
export type ScheduleExportScope = 'current' | 'selected' | 'all';
/** full = tam ad · initials = A. Y. · hidden = öğretmen yok */
export type ScheduleTeacherDisplay = 'full' | 'initials' | 'hidden';

export type ScheduleExportCell = {
  lesson: string;
  lesson_id: number | null;
  teacher: string;
  teacher_id: number | null;
  classroom?: string;
  classroom_id?: number | null;
  start?: string;
  end?: string;
  calendar_name?: string;
  label: string;
};

export type ScheduleExportGroup = {
  classroom_id: number;
  classroom_name: string;
  filled_count: number;
  rows: {
    slot_id: number;
    slot_name: string;
    slot_time: string;
    cells: (ScheduleExportCell | null)[];
  }[];
  day_cards?: ScheduleExportCell[][];
};

export type ScheduleExportPayload = {
  term: { id: number; name: string };
  version: { id: number; name: string; is_locked: boolean };
  /** Rapor başlığında versiyon adı yerine gösterilen çalışma takvimi */
  calendar_name?: string;
  report_title?: string;
  subject_kind?: 'class' | 'teacher';
  layout_kind?: 'grid' | 'day_cards';
  kurum_ad: string;
  sube_ad: string;
  egitim_yili?: string;
  days: { id: number; name: string; short_name: string; order: number }[];
  slots: { id: number; name: string; start: string; end: string; order: number }[];
  groups: ScheduleExportGroup[];
  teacher_display?: ScheduleTeacherDisplay;
};

function prettyClassLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').trim();
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

function cardColor(
  cell: ScheduleExportCell | null | undefined,
  colorBy: ScheduleColorBy | 'classroom' = 'ders',
) {
  if (!cell || colorBy === 'none') return null;
  const id =
    colorBy === 'ogretmen'
      ? cell.teacher_id
      : colorBy === 'classroom'
        ? cell.classroom_id || cell.teacher_id || cell.lesson_id
        : cell.lesson_id || cell.teacher_id || cell.classroom_id;
  return colorForKeyHex(id);
}

function parseMinutes(value?: string): number | null {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function scheduleGapLabel(prevEnd?: string, nextStart?: string): string | null {
  const end = parseMinutes(prevEnd);
  const start = parseMinutes(nextStart);
  if (end == null || start == null || start - end < 40) return null;
  if (end <= 13 * 60 && start >= 13 * 60) return 'Öğle arası';
  return 'Ara';
}

function classDayColumns(payload: ScheduleExportPayload, group: ScheduleExportGroup): ScheduleExportCell[][] {
  return dayCardColumns(payload, group).map((cards) =>
    cards.flatMap((card) => {
      const lessons = (card.lesson || '').split('\n').map((s) => s.trim()).filter(Boolean);
      const teachers = (card.teacher || '').split('\n').map((s) => s.trim());
      if (lessons.length <= 1) return [card];
      return lessons.map((lesson, index) => ({
        ...card,
        lesson,
        teacher: teachers[index] || teachers[0] || '',
      }));
    }),
  );
}

function dayCardColumns(payload: ScheduleExportPayload, group: ScheduleExportGroup): ScheduleExportCell[][] {
  if (group.day_cards?.length) return group.day_cards;
  const columns: ScheduleExportCell[][] = payload.days.map(() => []);
  for (const row of group.rows || []) {
    const [start = '', end = ''] = (row.slot_time || '').split(/[–-]/).map((p) => p.trim());
    (row.cells || []).forEach((cell, index) => {
      if (!cell || !columns[index]) return;
      columns[index].push({
        ...cell,
        start: cell.start || start,
        end: cell.end || end,
      });
    });
  }
  for (const cards of columns) {
    cards.sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99'));
  }
  return columns;
}

function occupiedDayColumns(
  payload: ScheduleExportPayload,
  group: ScheduleExportGroup,
): { day: ScheduleExportPayload['days'][number]; cards: ScheduleExportCell[] }[] {
  const columns = dayCardColumns(payload, group);
  return payload.days
    .map((day, index) => ({ day, cards: columns[index] || [] }))
    .filter((col) => col.cards.length > 0);
}

function buildQuery(params: {
  term_id: number;
  version_id?: number | null;
  classroom_ids?: number[];
  teacher_id?: number;
  all?: boolean;
  format: 'csv' | 'xlsx' | 'json' | 'pdf';
  layout?: ScheduleExportLayout;
  teacher_display?: ScheduleTeacherDisplay;
  color_by?: ScheduleColorBy;
}): string {
  const q = new URLSearchParams();
  q.set('term_id', String(params.term_id));
  if (params.version_id) q.set('version_id', String(params.version_id));
  if (params.teacher_id) q.set('teacher_id', String(params.teacher_id));
  if (params.all) q.set('all', '1');
  else if (params.classroom_ids?.length) {
    q.set('classroom_ids', params.classroom_ids.join(','));
  }
  q.set('export_format', params.format);
  if (params.layout) q.set('layout', params.layout);
  if (params.teacher_display) q.set('teacher_display', params.teacher_display);
  if (params.color_by) q.set('color_by', params.color_by);
  return q.toString();
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.error || body.detail || `Dışa aktarma başarısız (${res.status})`;
  } catch {
    return `Dışa aktarma başarısız (${res.status})`;
  }
}

function exportFilenameBase(termName: string): string {
  const slug = (termName || 'Donem').replace(/\s+/g, '');
  return `DersProgrami_${slug}`;
}

function exportDateLabel(): string {
  return new Intl.DateTimeFormat('tr-TR').format(new Date()).replace(/\//g, '.');
}

function safeNamePart(value: string, fallback: string): string {
  return (value || fallback).replace(/[\\/:*?"<>|]/g, '').trim() || fallback;
}

function teacherExportFilename(teacherName: string, extension: string): string {
  return `Öğretmen Programı ${safeNamePart(teacherName, 'Ogretmen')} ${exportDateLabel()}.${extension}`;
}

function classExportFilename(classNames: string[], extension: string): string {
  const date = exportDateLabel();
  if (classNames.length === 1) {
    return `Sınıf Programı ${safeNamePart(classNames[0], 'Sinif')} ${date}.${extension}`;
  }
  return `Sınıf Programları (${classNames.length}) ${date}.${extension}`;
}

export async function downloadScheduleExportFile(params: {
  term_id: number;
  version_id?: number | null;
  classroom_ids?: number[];
  teacher_id?: number;
  all?: boolean;
  format: 'csv' | 'xlsx' | 'pdf';
  layout?: ScheduleExportLayout;
  teacher_display?: ScheduleTeacherDisplay;
  color_by?: ScheduleColorBy;
}): Promise<void> {
  const q = new URLSearchParams(buildQuery({ ...params, format: params.format }));
  // Program verisi değişebildiği için tarayıcı ya da Next katmanından eski
  // bir GET yanıtı alınmamalı.
  q.set('_exported_at', String(Date.now()));
  const res = await fetch(`/api/academic/schedule/export/?${q.toString()}`, {
    credentials: 'include',
    headers: getContextHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const blob = await res.blob();
  if (blob.size === 0) {
    throw new Error('Dışa aktarma dosyası boş döndü. Lütfen tekrar deneyin.');
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || `${exportFilenameBase('Donem')}.${params.format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fetchScheduleExportJson(params: {
  term_id: number;
  version_id?: number | null;
  classroom_ids?: number[];
  teacher_id?: number;
  all?: boolean;
  teacher_display?: ScheduleTeacherDisplay;
}): Promise<ScheduleExportPayload> {
  const q = buildQuery({ ...params, format: 'json' });
  const res = await apiFetch<ScheduleExportPayload>(`/api/academic/schedule/export/?${q}`);
  if (!res.success || !res.data) {
    throw new Error(res.error || 'Program verisi alınamadı');
  }
  return res.data;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function loadRobotoFonts(): Promise<{ regular: string; bold: string }> {
  const [regularBuf, boldBuf] = await Promise.all([
    fetch('/fonts/Roboto-Regular.ttf').then((r) => {
      if (!r.ok) throw new Error('Roboto Regular yüklenemedi');
      return r.arrayBuffer();
    }),
    fetch('/fonts/Roboto-Bold.ttf').then((r) => {
      if (!r.ok) throw new Error('Roboto Bold yüklenemedi');
      return r.arrayBuffer();
    }),
  ]);
  return {
    regular: arrayBufferToBase64(regularBuf),
    bold: arrayBufferToBase64(boldBuf),
  };
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

async function loadLogoAsset(): Promise<{
  dataUri: string;
  width: number;
  height: number;
} | null> {
  try {
    const resp = await fetch('/img/beyaz-logo.png', { credentials: 'include' });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const dataUri = `data:image/png;base64,${arrayBufferToBase64(buf)}`;
    const dims = await getImageDimensions(dataUri);
    return { dataUri, ...dims };
  } catch {
    return null;
  }
}

function drawWeekCardBoard(
  doc: import('jspdf').jsPDF,
  payload: ScheduleExportPayload,
  group: ScheduleExportGroup,
  opts: {
    startY: number;
    pageW: number;
    pageH: number;
    margin: number;
    colorBy: ScheduleColorBy | 'classroom';
  },
) {
  const filled = occupiedDayColumns(payload, {
    ...group,
    day_cards: classDayColumns(payload, group),
  });
  const columns = filled.map((col) => col.cards);
  const days = filled.map((col) => col.day);
  const { startY, pageW, pageH, margin, colorBy } = opts;
  const showGaps = payload.subject_kind !== 'teacher';
  const whoOf = (card: ScheduleExportCell) =>
    prettyClassLabel(
      payload.subject_kind === 'teacher'
        ? card.classroom || card.teacher || ''
        : card.teacher || '',
    );
  const contentW = pageW - margin * 2;
  const colW = contentW / Math.max(1, days.length);
  const columnGap = 2.4;
  const cardW = colW - columnGap;
  const headH = 9;
  const cardGap = 1.6;
  const gapH = 5;
  const footer = 14;

  const columnMetrics = columns.map((cards) => {
    let gaps = 0;
    for (let i = 1; i < cards.length; i += 1) {
      if (showGaps && scheduleGapLabel(cards[i - 1].end, cards[i].start)) gaps += 1;
    }
    return { count: Math.max(1, cards.length), gaps };
  });
  const maxCards = Math.max(1, ...columnMetrics.map((m) => m.count));
  const maxGaps = Math.max(0, ...columnMetrics.map((m) => m.gaps));
  const availableH = pageH - (startY + headH + 2.2) - footer;
  const cardH = Math.min(
    22,
    Math.max(8, (availableH - maxGaps * gapH - (maxCards - 1) * cardGap) / maxCards),
  );
  const usedH = headH + 2.2 + maxCards * cardH + Math.max(0, maxCards - 1) * cardGap + maxGaps * gapH;
  const boardBottom = startY + usedH;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin - 3, startY - 3, contentW + 6, boardBottom - startY + 6, 2.2, 2.2, 'FD');

  const drawDayHead = (day: ScheduleExportPayload['days'][number], x: number, y: number) => {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, cardW, headH, 1.4, 1.4, 'FD');
    doc.setFillColor(2, 98, 167);
    doc.roundedRect(x, y, cardW, 1.4, 1.4, 1.4, 'F');
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(day.short_name || day.name, x + cardW / 2, y + 6, { align: 'center' });
  };

  const drawGap = (label: string, x: number, y: number) => {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.8, 0.7], 0);
    doc.line(x + 2, y + gapH / 2, x + cardW - 2, y + gapH / 2);
    doc.setLineDashPattern([], 0);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x + cardW / 2 - 12, y + 0.6, 24, gapH - 1.2, 1, 1, 'F');
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), x + cardW / 2, y + gapH / 2 + 1.1, { align: 'center' });
  };

  const drawCard = (card: ScheduleExportCell, x: number, y: number, order: number) => {
    const tint = cardColor(card, colorBy);
    const bg = tint ? hexToRgb(tint.bg) : [239, 246, 255];
    const border = tint ? hexToRgb(tint.border) : [147, 197, 253];
    const text = tint ? hexToRgb(tint.text) : [30, 58, 138];
    const railW = Math.min(14, Math.max(11, cardW * 0.22));

    doc.setFillColor(bg[0], bg[1], bg[2]);
    doc.setDrawColor(border[0], border[1], border[2]);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, cardW, cardH, 1.4, 1.4, 'FD');

    doc.setDrawColor(text[0], text[1], text[2]);
    doc.setLineWidth(0.35);
    doc.line(x + railW, y + 1.8, x + railW, y + cardH - 1.8);

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(cardH >= 16 ? 6.6 : 5.8);
    doc.setTextColor(text[0], text[1], text[2]);
    if (card.start) {
      doc.text(card.start, x + railW - 1.1, y + Math.min(4.8, cardH * 0.32), { align: 'right' });
    }
    if (card.end) {
      doc.text(card.end, x + railW - 1.1, y + cardH - 2, { align: 'right' });
    }

    const who = whoOf(card);
    const textX = x + railW + 2.2;
    const textW = cardW - railW - 3.4;
    const showWho = Boolean(who && cardH >= 14);
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(text[0], text[1], text[2]);
    doc.text(`${order}. Ders`, textX, y + 4.2, { maxWidth: textW });
    doc.setFontSize(cardH >= 16 ? 8.4 : 7.2);
    doc.text(card.lesson || '', textX, y + (showWho ? 8.6 : cardH / 2 + 2.2), { maxWidth: textW });
    if (showWho) {
      doc.setFont('Roboto', 'normal');
      doc.setFontSize(cardH >= 18 ? 7 : 6.2);
      doc.text(who, textX, y + cardH - 2.4, { maxWidth: textW });
    }
  };

  days.forEach((day, dayIndex) => {
    const cards = columns[dayIndex] || [];
    const x = margin + dayIndex * colW;
    drawDayHead(day, x, startY);
    let y = startY + headH + 2.2;
    cards.forEach((card, index) => {
      const gap = showGaps && index > 0 ? scheduleGapLabel(cards[index - 1].end, card.start) : null;
      if (gap) {
        drawGap(gap, x, y);
        y += gapH;
      }
      drawCard(card, x, y, index + 1);
      y += cardH + cardGap;
    });
    if (!cards.length) {
      doc.setFont('Roboto', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text('—', x + cardW / 2, startY + headH + 16, { align: 'center' });
    }
  });
}

/** PDF — Roboto (TR karakter) + oran koruyan logo; okunaklı tipografi. */
export async function exportSchedulePdf(
  payload: ScheduleExportPayload,
  options: {
    layout: ScheduleExportLayout;
    colorBy: ScheduleColorBy;
  },
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');

  const [fonts, logo] = await Promise.all([loadRobotoFonts(), loadLogoAsset()]);

  const isTeacher = payload.subject_kind === 'teacher';
  const programLabel = isTeacher ? 'ÖĞRETMEN PROGRAMI' : 'SINIF PROGRAMI';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('Roboto-Regular.ttf', fonts.regular);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFileToVFS('Roboto-Bold.ttf', fonts.bold);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'normal');

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const headerH = 22;
  const primary: [number, number, number] = [2, 98, 167];

  const drawBrandHeader = (subtitle: string) => {
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, pageW, pageH, 'F');
    doc.setFillColor(...primary);
    doc.rect(0, 0, pageW, headerH, 'F');
    doc.setFillColor(1, 76, 130);
    doc.circle(pageW + 4, -4, 30, 'F');
    doc.setFillColor(9, 120, 192);
    doc.circle(pageW - 16, headerH + 11, 22, 'F');
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.35);
    doc.line(margin + 40, 5, margin + 40, headerH - 5);
    if (logo) {
      try {
        const fitted = fitLogoBox(logo.width, logo.height, 35, 16);
        const logoY = (headerH - fitted.height) / 2;
        doc.addImage(logo.dataUri, 'PNG', margin, logoY, fitted.width, fitted.height);
      } catch {
        /* logo opsiyonel */
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(12);
    doc.text(prettyClassLabel(subtitle), margin + 42, 12);
    doc.setFontSize(7);
    doc.text(programLabel, pageW - margin, 9, { align: 'right', charSpace: 0.7 });
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(8);
    const meta = [payload.egitim_yili, new Intl.DateTimeFormat('tr-TR').format(new Date())]
      .filter(Boolean)
      .join(' · ');
    doc.text(meta, margin + 42, 17, { maxWidth: pageW - 120 });
    doc.setTextColor(15, 23, 42);
  };

  payload.groups.forEach((group, gi) => {
    if (gi > 0) doc.addPage();
    drawBrandHeader(group.classroom_name);
    const startY = headerH + 8;
    drawWeekCardBoard(doc, payload, group, {
      startY,
      pageW,
      pageH,
      margin,
      colorBy: isTeacher ? 'classroom' : options.colorBy,
    });
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(margin, pageH - 9, pageW - margin, pageH - 9);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('3K Kampüs LMS', margin, pageH - 6);
    doc.text(`Sayfa ${i} / ${pages}`, pageW - margin, pageH - 6, { align: 'right' });
  }

  const filename = isTeacher
    ? teacherExportFilename(payload.groups[0]?.classroom_name || '', 'pdf')
    : classExportFilename(payload.groups.map((g) => g.classroom_name), 'pdf');
  doc.save(filename);
}
