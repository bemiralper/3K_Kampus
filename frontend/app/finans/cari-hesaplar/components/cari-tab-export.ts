import { finansDownloadPost } from "@/app/finans/services/finans-http";
import type { ExportFormat, ExportOrientation } from "@/components/finans/ExportDropdown";

export type CariExportColumn = { key: string; label: string };

export async function exportCariTabReport(opts: {
  cariHesapId: number;
  format: ExportFormat;
  orientation: ExportOrientation;
  title: string;
  columns: CariExportColumn[];
  rows: Record<string, unknown>[];
  filtersMeta?: Record<string, unknown>;
  filenamePrefix?: string;
}) {
  const { blob, filename } = await finansDownloadPost(
    `/cari-hesaplar/${opts.cariHesapId}/export/`,
    {
      format: opts.format,
      orientation: opts.orientation,
      title: opts.title,
      columns: opts.columns,
      rows: opts.rows,
      filters_meta: opts.filtersMeta || {},
    }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ext = opts.format === "xlsx" ? "xlsx" : opts.format;
  a.download = filename || `${opts.filenamePrefix || "cari-rapor"}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportCariRaporList(opts: {
  format: ExportFormat;
  orientation: ExportOrientation;
  title: string;
  columns: CariExportColumn[];
  rows: Record<string, unknown>[];
  filtersMeta?: Record<string, unknown>;
  filenamePrefix?: string;
}) {
  const { blob, filename } = await finansDownloadPost(`/cari-hesaplar/rapor/export/`, {
    format: opts.format,
    orientation: opts.orientation,
    title: opts.title,
    columns: opts.columns,
    rows: opts.rows,
    filters_meta: opts.filtersMeta || {},
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ext = opts.format === "xlsx" ? "xlsx" : opts.format;
  a.download = filename || `${opts.filenamePrefix || "cari-bakiye-raporu"}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function fmtExportDate(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("tr-TR");
}

export function fmtExportMoney(v: number | string | null | undefined): string {
  return Number(v || 0).toFixed(2);
}
