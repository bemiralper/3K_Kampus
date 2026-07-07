import { finansDownloadPost } from "@/app/finans/services/finans-http";
import type { ExportFormat, ExportOrientation } from "@/components/finans/ExportDropdown";
import { runFinansExport, triggerFileDownload } from "@/lib/finans-export";

export type CariExportColumn = { key: string; label: string };

async function downloadCariExport(
  path: string,
  payload: Record<string, unknown>,
  filenamePrefix: string,
  format: ExportFormat,
  signal: AbortSignal,
): Promise<void> {
  const { blob, filename } = await finansDownloadPost(path, payload, signal);
  const ext = format === "xlsx" ? "xlsx" : format;
  triggerFileDownload(blob, filename || `${filenamePrefix}.${ext}`);
}

export async function exportCariTabReport(
  opts: {
    cariHesapId: number;
    format: ExportFormat;
    orientation: ExportOrientation;
    title: string;
    columns: CariExportColumn[];
    rows: Record<string, unknown>[];
    filtersMeta?: Record<string, unknown>;
    filenamePrefix?: string;
  },
  callbacks?: { onError?: (message: string) => void },
): Promise<boolean> {
  const result = await runFinansExport(
    (signal) =>
      downloadCariExport(
        `/cari-hesaplar/${opts.cariHesapId}/export/`,
        {
          format: opts.format,
          orientation: opts.orientation,
          title: opts.title,
          columns: opts.columns,
          rows: opts.rows,
          filters_meta: opts.filtersMeta || {},
        },
        opts.filenamePrefix || "cari-rapor",
        opts.format,
        signal,
      ),
    { onError: callbacks?.onError },
  );
  return result !== null;
}

export async function exportCariRaporList(
  opts: {
    format: ExportFormat;
    orientation: ExportOrientation;
    title: string;
    columns: CariExportColumn[];
    rows: Record<string, unknown>[];
    filtersMeta?: Record<string, unknown>;
    filenamePrefix?: string;
  },
  callbacks?: { onError?: (message: string) => void },
): Promise<boolean> {
  const result = await runFinansExport(
    (signal) =>
      downloadCariExport(
        `/cari-hesaplar/rapor/export/`,
        {
          format: opts.format,
          orientation: opts.orientation,
          title: opts.title,
          columns: opts.columns,
          rows: opts.rows,
          filters_meta: opts.filtersMeta || {},
        },
        opts.filenamePrefix || "cari-bakiye-raporu",
        opts.format,
        signal,
      ),
    { onError: callbacks?.onError },
  );
  return result !== null;
}

export function fmtExportDate(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("tr-TR");
}

export function fmtExportMoney(v: number | string | null | undefined): string {
  return Number(v || 0).toFixed(2);
}
