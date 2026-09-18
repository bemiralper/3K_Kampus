import * as XLSX from "xlsx";
import { downloadBlob } from "@/lib/download-file";
import { brandingFromContext, getPdfHeaderLogo } from "@/lib/kurum-branding";
import { exportOgrenciListPdf, type PdfOrientation } from "@/app/ogrenciler/lib/ogrenciListPdfExport";
import { formatCurrency, formatDate, tahsilatDurumLabel, tahsilatTuruLabel } from "../helpers";
import type { TahsilatItem } from "../types";

export type TahsilatExportFormat = "csv" | "xlsx" | "pdf";

export type TahsilatExportColumn = {
  key: string;
  label: string;
  default?: boolean;
};

export const TAHSILAT_EXPORT_COLUMNS: TahsilatExportColumn[] = [
  { key: "tahsilat_tarihi", label: "Tarih", default: true },
  { key: "sozlesme_no", label: "Sözleşme No", default: true },
  { key: "ogrenci_adi", label: "Öğrenci", default: true },
  { key: "ogrenci_tc", label: "Öğrenci TC" },
  { key: "veli_adi", label: "Veli" },
  { key: "veli_tc", label: "Veli TC" },
  { key: "taksit", label: "Taksit", default: true },
  { key: "tutar", label: "Tutar", default: true },
  { key: "odeme_yontemi", label: "Ödeme Yöntemi", default: true },
  { key: "tahsilat_turu", label: "Tür", default: true },
  { key: "durum", label: "Durum", default: true },
  { key: "referans_no", label: "Referans" },
  { key: "islem_yapan", label: "İşlemi Yapan" },
  { key: "aciklama", label: "Açıklama" },
];

export function maxTahsilatVeliCount(rows: TahsilatItem[]): number {
  return rows.reduce((max, row) => Math.max(max, row.veliler?.length || 0), 0);
}

export function allVeliExportColumns(maxCount: number): TahsilatExportColumn[] {
  const cols: TahsilatExportColumn[] = [];
  for (let i = 1; i <= maxCount; i += 1) {
    cols.push({ key: `veli_${i}_ad`, label: `Veli ${i}` });
    cols.push({ key: `veli_${i}_tc`, label: `Veli ${i} TC` });
  }
  return cols;
}

export const DEFAULT_TAHSILAT_EXPORT_KEYS = TAHSILAT_EXPORT_COLUMNS
  .filter((c) => c.default)
  .map((c) => c.key);

function taksitLabel(row: TahsilatItem): string {
  if (row.dagitim && row.dagitim.length > 1) {
    return row.dagitim.map((d) => `#${d.taksit_no}`).join(", ");
  }
  if (row.dagitim?.length === 1) return `#${row.dagitim[0].taksit_no}`;
  if (row.taksit_no) return `#${row.taksit_no}`;
  return "";
}

export function tahsilatExportValue(row: TahsilatItem, key: string): string {
  const veliMatch = key.match(/^veli_(\d+)_(ad|tc)$/);
  if (veliMatch) {
    const veli = row.veliler?.[Number(veliMatch[1]) - 1];
    if (!veli) return "";
    return veliMatch[2] === "tc" ? (veli.tc_kimlik_no || "") : (veli.ad_soyad || "");
  }
  switch (key) {
    case "tahsilat_tarihi": {
      const formatted = formatDate(row.tahsilat_tarihi);
      return formatted === "-" ? "" : formatted;
    }
    case "sozlesme_no":
      return row.sozlesme_no || "";
    case "ogrenci_adi":
      return row.ogrenci_adi || "";
    case "ogrenci_tc":
      return row.ogrenci_tc || "";
    case "veli_adi":
      return row.veli_adi || "";
    case "veli_tc":
      return row.veli_tc || "";
    case "taksit":
      return taksitLabel(row);
    case "tutar":
      return formatCurrency(row.tutar);
    case "odeme_yontemi":
      return row.odeme_yontemi?.ad || "";
    case "tahsilat_turu":
      return tahsilatTuruLabel[row.tahsilat_turu] || row.tahsilat_turu || "";
    case "durum":
      return tahsilatDurumLabel[row.durum]?.label || row.durum || "";
    case "referans_no":
      return row.referans_no || "";
    case "islem_yapan":
      return row.islem_yapan || "";
    case "aciklama":
      return row.aciklama || "";
    default:
      return "";
  }
}

function rowsAsRecords(rows: TahsilatItem[], keys: string[]): Record<string, string>[] {
  return rows.map((row) => {
    const rec: Record<string, string> = {};
    keys.forEach((key) => {
      rec[key] = tahsilatExportValue(row, key);
    });
    return rec;
  });
}

function columnLabel(key: string): string {
  const numbered = key.match(/^veli_(\d+)_(ad|tc)$/);
  if (numbered) return numbered[2] === "tc" ? `Veli ${numbered[1]} TC` : `Veli ${numbered[1]}`;
  return TAHSILAT_EXPORT_COLUMNS.find((c) => c.key === key)?.label || key;
}

function sheetRows(rows: TahsilatItem[], keys: string[]): string[][] {
  const labels = keys.map((k) => columnLabel(k));
  return [labels, ...rows.map((row) => keys.map((key) => tahsilatExportValue(row, key)))];
}

export function exportTahsilatCsv(rows: TahsilatItem[], keys: string[], fileName = "tahsilatlar.csv") {
  const aoa = sheetRows(rows, keys);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, fileName);
}

export function exportTahsilatXlsx(rows: TahsilatItem[], keys: string[], fileName = "tahsilatlar.xlsx") {
  const aoa = sheetRows(rows, keys);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = keys.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tahsilatlar");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    fileName,
  );
}

export async function exportTahsilatPdf(options: {
  rows: TahsilatItem[];
  keys: string[];
  orientation: PdfOrientation;
  kurumAd?: string;
  subeAd?: string;
  temaRengi?: string | null;
  logoUrl?: string | null;
  filterSummary?: string;
  fileName?: string;
}) {
  const {
    rows,
    keys,
    orientation,
    kurumAd = "Kurum",
    subeAd,
    temaRengi,
    logoUrl,
    filterSummary,
    fileName = "tahsilatlar.pdf",
  } = options;

  await exportOgrenciListPdf({
    rows: rowsAsRecords(rows, keys),
    columnKeys: keys,
    columnLabels: keys.map((k) => columnLabel(k)),
    orientation,
    branding: {
      kurumAd,
      subeAd,
      logoUrl: logoUrl || undefined,
      temaRengi: temaRengi || undefined,
    },
    documentTitle: "Tahsilat Listesi",
    filterSummary,
    fileName,
  });
}

export function tahsilatBrandingFromKurum(
  kurum?: Parameters<typeof brandingFromContext>[0],
  sube?: Parameters<typeof brandingFromContext>[1],
) {
  const branding = brandingFromContext(kurum, sube);
  return {
    kurumAd: branding.gorunen_ad || (kurum as { ad?: string } | null)?.ad || "Kurum",
    subeAd: sube?.ad || undefined,
    logoUrl: getPdfHeaderLogo(branding),
    temaRengi: branding.tema_rengi,
  };
}
