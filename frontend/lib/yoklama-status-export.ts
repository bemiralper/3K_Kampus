import { downloadBlob, downloadJsPdf } from "@/lib/download-file";
import { getContextHeaders } from "@/lib/api";
import type { CoachDayRosterRow, CoachDayRosterStatus, ClassPeriodCode } from "@/lib/academic-api";

export type YoklamaExportFormat = "pdf" | "xlsx" | "csv";

const HEADER = ["Sınıf", "Periyot", "Öğrenci", "Durum", "Saat", "Not"];

function toMatrix(rows: CoachDayRosterRow[]) {
  return rows.map((r) => [
    r.classroom_ad,
    r.period_label,
    r.student_name,
    r.status_display,
    r.late_time || "",
    r.note || "",
  ]);
}

function fileStamp(date: string) {
  return date.replaceAll("-", "");
}

export async function exportYoklamaStatusList(opts: {
  rows: CoachDayRosterRow[];
  date: string;
  dateLabel: string;
  filterSummary?: string;
  format: YoklamaExportFormat;
  statuses?: CoachDayRosterStatus[];
  classroomIds?: number[];
  period?: "all" | ClassPeriodCode;
}) {
  const { rows, date, dateLabel, filterSummary, format } = opts;
  const stamp = fileStamp(date);
  const body = toMatrix(rows);

  if (format === "xlsx" || format === "csv") {
    await downloadStyledRosterFile({
      date,
      format,
      statuses: opts.statuses,
      classroomIds: opts.classroomIds,
      period: opts.period,
    });
    return;
  }

  await exportYoklamaPdf({ rows: body, dateLabel, filterSummary, fileName: `sinif_yoklama_${stamp}.pdf` });
}

async function downloadStyledRosterFile(opts: {
  date: string;
  format: "xlsx" | "csv";
  statuses?: string[];
  classroomIds?: number[];
  period?: string;
}) {
  const q = new URLSearchParams({ date: opts.date, file_format: opts.format });
  if (opts.statuses?.length) q.set("statuses", opts.statuses.join(","));
  if (opts.classroomIds?.length) q.set("classroom_ids", opts.classroomIds.join(","));
  if (opts.period && opts.period !== "all") q.set("period", opts.period);
  const res = await fetch(`/api/academic/class-period-attendance/coach-day-roster/export/?${q}`, {
    credentials: "include",
    headers: getContextHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Dışa aktarma başarısız");
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename="?([^"]+)"?/i);
  downloadBlob(blob, match?.[1] || `sinif_yoklama_${fileStamp(opts.date)}.${opts.format}`);
}

async function loadRoboto() {
  const [regular, bold] = await Promise.all([
    fetch("/fonts/Roboto-Regular.ttf").then((r) => r.arrayBuffer()),
    fetch("/fonts/Roboto-Bold.ttf").then((r) => r.arrayBuffer()),
  ]);
  const toB64 = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };
  return { regular: toB64(regular), bold: toB64(bold) };
}

const STATUS_RGB: Record<string, [number, number, number]> = {
  Var: [4, 120, 87],
  Geç: [180, 83, 9],
  Yok: [185, 28, 28],
  İzinli: [29, 78, 216],
};

async function exportYoklamaPdf(opts: {
  rows: string[][];
  dateLabel: string;
  filterSummary?: string;
  fileName: string;
}) {
  const [{ default: jsPDF }, { default: autoTable }, fonts] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadRoboto(),
  ]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.addFileToVFS("Roboto-Regular.ttf", fonts.regular);
  doc.addFileToVFS("Roboto-Bold.ttf", fonts.bold);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  doc.setFont("Roboto", "normal");

  const pw = doc.internal.pageSize.getWidth();
  const primary: [number, number, number] = [2, 98, 167];
  doc.setFillColor(...primary);
  doc.rect(0, 0, pw, 28, "F");
  doc.setFont("Roboto", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text("Sınıf yoklaması", 12, 12);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(214, 228, 242);
  doc.text(opts.dateLabel, 12, 19);
  if (opts.filterSummary) {
    doc.text(opts.filterSummary, 12, 24, { maxWidth: pw - 24 });
  }
  doc.setFont("Roboto", "bold");
  doc.setFontSize(8);
  const badge = `${opts.rows.length} kayıt`;
  const badgeW = Math.max(doc.getTextWidth(badge) + 8, 22);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(pw - 12 - badgeW, 10, badgeW, 7, 2, 2, "F");
  doc.setTextColor(...primary);
  doc.text(badge, pw - 12 - badgeW / 2, 15, { align: "center" });

  autoTable(doc, {
    startY: 34,
    head: [HEADER],
    body: opts.rows,
    theme: "grid",
    styles: {
      font: "Roboto",
      fontSize: 9,
      cellPadding: 2.2,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      font: "Roboto",
      fontStyle: "bold",
      fillColor: primary,
      textColor: [255, 255, 255],
      halign: "center",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 28 },
      2: { cellWidth: 48 },
      3: { cellWidth: 22, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 16, halign: "center" },
    },
    margin: { left: 10, right: 10, top: 34, bottom: 14 },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 3) return;
      const color = STATUS_RGB[String(data.cell.raw || "")];
      if (color) data.cell.styles.textColor = color;
    },
  });

  const pages = doc.getNumberOfPages();
  const ph = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont("Roboto", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Sınıf yoklaması", 10, ph - 6);
    doc.text(`Sayfa ${i} / ${pages}`, pw - 10, ph - 6, { align: "right" });
  }

  await downloadJsPdf(doc, opts.fileName);
}
