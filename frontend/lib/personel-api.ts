/**
 * Personel Listesi — Excel/CSV dışa aktarma
 */
import { getContextHeaders } from "./api";

export type PersonelExportFilters = {
  q?: string;
  show_inactive?: boolean;
};

function buildExportParams(filters: PersonelExportFilters, format: "csv" | "xlsx"): URLSearchParams {
  const params = new URLSearchParams();
  params.set("format", format);
  if (filters.q) params.set("q", filters.q);
  if (filters.show_inactive) params.set("show_inactive", "true");
  return params;
}

async function downloadPersonelExport(
  filters: PersonelExportFilters,
  format: "csv" | "xlsx",
): Promise<Blob> {
  const params = buildExportParams(filters, format);
  const res = await fetch(`/api/personel/api/export/?${params.toString()}`, {
    credentials: "include",
    headers: getContextHeaders(),
  });
  if (!res.ok) {
    throw new Error(format === "xlsx" ? "Excel dışa aktarma başarısız" : "CSV dışa aktarma başarısız");
  }
  return res.blob();
}

export async function downloadPersonelExportCsv(filters: PersonelExportFilters): Promise<Blob> {
  return downloadPersonelExport(filters, "csv");
}

export async function downloadPersonelExportXlsx(filters: PersonelExportFilters): Promise<Blob> {
  return downloadPersonelExport(filters, "xlsx");
}
