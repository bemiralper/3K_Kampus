import { apiFetch, getContextHeaders } from '@/lib/api';
import { colorForKeyHex, type ScheduleColorBy } from '@/lib/schedule-color';

export type { ScheduleColorBy };

export type ScheduleExportFormat = 'csv' | 'xlsx' | 'pdf';
export type ScheduleExportLayout = 'stacked' | 'per_class_sheet';
export type ScheduleExportScope = 'current' | 'selected' | 'all';
/** full = tam ad · initials = A. Y. · hidden = öğretmen yok */
export type ScheduleTeacherDisplay = 'full' | 'initials' | 'hidden';

export type ScheduleExportGroup = {
  classroom_id: number;
  classroom_name: string;
  filled_count: number;
  rows: {
    slot_id: number;
    slot_name: string;
    slot_time: string;
    cells: ({
      lesson: string;
      lesson_id: number | null;
      teacher: string;
      teacher_id: number | null;
      label: string;
    } | null)[];
  }[];
};

export type ScheduleExportPayload = {
  term: { id: number; name: string };
  version: { id: number; name: string; is_locked: boolean };
  /** Rapor başlığında versiyon adı yerine gösterilen çalışma takvimi */
  calendar_name?: string;
  kurum_ad: string;
  sube_ad: string;
  egitim_yili?: string;
  days: { id: number; name: string; short_name: string; order: number }[];
  slots: { id: number; name: string; start: string; end: string; order: number }[];
  groups: ScheduleExportGroup[];
  teacher_display?: ScheduleTeacherDisplay;
};

function buildQuery(params: {
  term_id: number;
  version_id: number;
  classroom_ids?: number[];
  all?: boolean;
  format: 'csv' | 'xlsx' | 'json';
  layout?: ScheduleExportLayout;
  teacher_display?: ScheduleTeacherDisplay;
  color_by?: ScheduleColorBy;
}): string {
  const q = new URLSearchParams();
  q.set('term_id', String(params.term_id));
  q.set('version_id', String(params.version_id));
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

export async function downloadScheduleExportFile(params: {
  term_id: number;
  version_id: number;
  classroom_ids?: number[];
  all?: boolean;
  format: 'csv' | 'xlsx';
  layout?: ScheduleExportLayout;
  teacher_display?: ScheduleTeacherDisplay;
  color_by?: ScheduleColorBy;
}): Promise<void> {
  const q = buildQuery({ ...params, format: params.format });
  const res = await fetch(`/api/academic/schedule/export/?${q}`, {
    credentials: 'include',
    headers: getContextHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const blob = await res.blob();
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
  version_id: number;
  classroom_ids?: number[];
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

/** PDF — Roboto (TR karakter) + oran koruyan logo; okunaklı tipografi. */
export async function exportSchedulePdf(
  payload: ScheduleExportPayload,
  options: {
    layout: ScheduleExportLayout;
    colorBy: ScheduleColorBy;
  },
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const [fonts, logo] = await Promise.all([loadRobotoFonts(), loadLogoAsset()]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('Roboto-Regular.ttf', fonts.regular);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFileToVFS('Roboto-Bold.ttf', fonts.bold);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'normal');

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const headerH = 32;
  const primary: [number, number, number] = [2, 98, 167];

  type DocWithTable = typeof doc & { lastAutoTable?: { finalY: number } };

  const drawBrandHeader = (subtitle: string) => {
    doc.setFillColor(...primary);
    doc.rect(0, 0, pageW, headerH, 'F');
    if (logo) {
      try {
        const fitted = fitLogoBox(logo.width, logo.height, 42, 18);
        const logoY = (headerH - fitted.height) / 2;
        doc.addImage(logo.dataUri, 'PNG', margin, logoY, fitted.width, fitted.height);
      } catch {
        /* logo opsiyonel */
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(16);
    doc.text('DERS PROGRAMI', pageW - margin, 12, { align: 'right' });
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(9);
    const meta = [
      payload.kurum_ad,
      payload.sube_ad,
      payload.egitim_yili,
      payload.term.name,
      payload.calendar_name,
      subtitle,
    ]
      .filter(Boolean)
      .join(' · ');
    doc.text(meta, pageW - margin, 22, { align: 'right', maxWidth: pageW - 70 });
    doc.setTextColor(15, 23, 42);
  };

  payload.groups.forEach((group, gi) => {
    const d = doc as DocWithTable;
    if (gi > 0) {
      if (options.layout === 'per_class_sheet') {
        doc.addPage();
      } else if (d.lastAutoTable) {
        const y = d.lastAutoTable.finalY + 14;
        if (y > pageH - 50) doc.addPage();
      }
    }

    const needsBrand = gi === 0 || options.layout === 'per_class_sheet';
    if (needsBrand) {
      drawBrandHeader(group.classroom_name);
    } else {
      doc.setFont('Roboto', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...primary);
      const y = Math.max(headerH + 6, (d.lastAutoTable?.finalY || headerH) + 10);
      doc.text(group.classroom_name, margin, y);
      doc.setTextColor(15, 23, 42);
    }

    const startY = needsBrand
      ? headerH + 8
      : Math.max(headerH + 10, (d.lastAutoTable?.finalY || headerH) + 14);

    const head = [['Saat', ...payload.days.map((day) => day.short_name || day.name)]];
    const body = group.rows.map((row) => [
      row.slot_time ? `${row.slot_name}\n${row.slot_time}` : row.slot_name,
      ...row.cells.map((cell) => {
        if (!cell) return '';
        if (cell.label) return cell.label;
        return cell.teacher ? `${cell.lesson}\n${cell.teacher}` : cell.lesson;
      }),
    ]);

    autoTable(doc, {
      startY,
      head,
      body,
      styles: {
        font: 'Roboto',
        fontSize: 9,
        cellPadding: { top: 3, right: 2.5, bottom: 3, left: 2.5 },
        valign: 'middle',
        halign: 'center',
        overflow: 'linebreak',
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
        textColor: [15, 23, 42],
        minCellHeight: 12,
      },
      headStyles: {
        font: 'Roboto',
        fontStyle: 'bold',
        fontSize: 10,
        fillColor: primary,
        textColor: [255, 255, 255],
        cellPadding: { top: 3.5, right: 2.5, bottom: 3.5, left: 2.5 },
      },
      columnStyles: {
        0: {
          halign: 'left',
          cellWidth: 32,
          fontStyle: 'bold',
          fontSize: 8.5,
          fillColor: [248, 250, 252],
        },
      },
      margin: { left: margin, right: margin, bottom: 12 },
      didParseCell: (data) => {
        if (options.colorBy === 'none') return;
        if (data.section !== 'body' || data.column.index === 0) return;
        const cell = group.rows[data.row.index]?.cells[data.column.index - 1];
        if (!cell) return;
        const id = options.colorBy === 'ogretmen' ? cell.teacher_id : cell.lesson_id;
        const hex = colorForKeyHex(id);
        if (!hex) return;
        data.cell.styles.fillColor = [
          parseInt(hex.bg.slice(1, 3), 16),
          parseInt(hex.bg.slice(3, 5), 16),
          parseInt(hex.bg.slice(5, 7), 16),
        ];
      },
    });
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('3K Kampüs LMS', margin, pageH - 6);
    doc.text(`Sayfa ${i} / ${pages}`, pageW - margin, pageH - 6, { align: 'right' });
  }

  doc.save(`${exportFilenameBase(payload.term.name)}.pdf`);
}
