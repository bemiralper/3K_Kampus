/**
 * Sınıf öğrenci listesi dışa aktarma — API + PDF.
 */
import { downloadBlob } from '@/lib/download-file';
import {
  exportGroupedOgrenciListPdf,
  exportOgrenciListPdf,
  type OgrenciListPdfBranding,
} from '@/app/ogrenciler/lib/ogrenciListPdfExport';
import {
  EXPORT_COLUMNS,
  EXPORT_COLUMN_GROUPS,
  type ExportColumnDef,
} from '@/app/ogrenciler/lib/ogrenci-list-utils';

export type SinifRosterScope = 'sinif' | 'seviye' | 'all' | 'custom';

export type SinifRosterExportFilters = {
  scope: SinifRosterScope;
  term_id?: number;
  sinif_id?: number;
  sinif_seviyesi_id?: number;
  sinif_ids?: number[];
  columns?: string[];
};

export type SinifRosterGroup = {
  sinif_id: number;
  sinif_ad: string;
  sinif_seviyesi: string;
  ogrenci_sayisi: number;
  rows: Record<string, string | number>[];
};

export type SinifRosterJsonResponse = {
  success: boolean;
  scope: string;
  scope_label: string;
  aktif_donem?: { id: number; name: string };
  columns: string[];
  column_labels: string[];
  groups: SinifRosterGroup[];
  total_students: number;
};

/** Öğrenci listesi export sütunları + sınıf listesine özel alanlar. */
export const ROSTER_EXPORT_COLUMN_OPTIONS: ExportColumnDef[] = [
  { key: 'sira', label: 'Sıra', default: true, group: EXPORT_COLUMN_GROUPS.ogrenci },
  ...EXPORT_COLUMNS,
  { key: 'alan', label: 'Alan', default: true, group: EXPORT_COLUMN_GROUPS.egitim },
];

export const ROSTER_EXPORT_COLUMNS: Record<string, string> = Object.fromEntries(
  ROSTER_EXPORT_COLUMN_OPTIONS.map((c) => [c.key, c.label]),
);

export const DEFAULT_ROSTER_EXPORT_KEYS = [
  'sira',
  ...EXPORT_COLUMNS.filter((c) => c.default).map((c) => c.key),
  'alan',
];

const GROUP_TITLE_COLUMN_KEYS = new Set(['sinif_ad', 'sinif_seviyesi']);

const DEFAULT_PER_CLASS_COLUMNS = DEFAULT_ROSTER_EXPORT_KEYS.filter(
  (k) => !GROUP_TITLE_COLUMN_KEYS.has(k),
);

function perClassColumnKeys(keys: string[]): string[] {
  const allowed = new Set(ROSTER_EXPORT_COLUMN_OPTIONS.map((c) => c.key));
  const filtered = keys.filter((k) => allowed.has(k) && !GROUP_TITLE_COLUMN_KEYS.has(k));
  return filtered.length ? filtered : DEFAULT_PER_CLASS_COLUMNS;
}

function groupSectionTitle(group: SinifRosterGroup): string {
  const count = group.ogrenci_sayisi ?? group.rows.length;
  if (group.sinif_seviyesi) {
    return `${group.sinif_ad} — ${group.sinif_seviyesi} (${count} öğrenci)`;
  }
  return `${group.sinif_ad} (${count} öğrenci)`;
}

function readContextId(storageKey: string): string | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'number') return String(parsed);
    if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    if (parsed && typeof parsed === 'object' && 'id' in parsed && parsed.id != null) {
      return String(parsed.id);
    }
  } catch {
    if (raw.trim()) return raw.trim();
  }
  return null;
}

function getContextHeaders(): HeadersInit {
  const headers: HeadersInit = {};
  if (typeof window !== 'undefined') {
    const kurumId = readContextId('3k_active_kurum');
    const subeId = readContextId('3k_active_sube');
    const egitimYiliId = readContextId('3k_active_egitim_yili');
    if (kurumId) headers['X-Kurum-ID'] = kurumId;
    if (subeId) headers['X-Sube-ID'] = subeId;
    if (egitimYiliId) headers['X-EgitimYili-ID'] = egitimYiliId;
  }
  return headers;
}

function buildRosterParams(filters: SinifRosterExportFilters, format: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set('format', format);
  params.set('scope', filters.scope);
  if (filters.term_id) params.set('term_id', String(filters.term_id));
  if (filters.sinif_id) params.set('sinif_id', String(filters.sinif_id));
  if (filters.sinif_seviyesi_id) params.set('sinif_seviyesi_id', String(filters.sinif_seviyesi_id));
  if (filters.sinif_ids?.length) params.set('sinif_ids', filters.sinif_ids.join(','));
  if (filters.columns?.length) params.set('columns', filters.columns.join(','));
  return params;
}

export async function fetchSinifRosterJson(
  filters: SinifRosterExportFilters,
): Promise<SinifRosterJsonResponse> {
  const params = buildRosterParams(filters, 'json');
  const res = await fetch(`/api/siniflar/api/roster-export/?${params.toString()}`, {
    credentials: 'include',
    headers: getContextHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Sınıf listesi yüklenemedi');
  }
  return res.json();
}

export async function downloadSinifRosterExport(
  filters: SinifRosterExportFilters,
  format: 'csv' | 'xlsx',
): Promise<Blob> {
  const params = buildRosterParams(filters, format);
  const res = await fetch(`/api/siniflar/api/roster-export/?${params.toString()}`, {
    credentials: 'include',
    headers: getContextHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Dışa aktarma başarısız');
  }
  return res.blob();
}

export async function exportSinifRosterPdf(
  filters: SinifRosterExportFilters,
  branding: OgrenciListPdfBranding,
  fileName = 'sinif_ogrenci_listesi',
): Promise<void> {
  const data = await fetchSinifRosterJson(filters);
  const columnKeys = perClassColumnKeys(
    data.columns?.length ? data.columns : DEFAULT_ROSTER_EXPORT_KEYS,
  );
  const columnLabels = columnKeys.map((k) => ROSTER_EXPORT_COLUMNS[k] || k);
  const filterSummary = [data.scope_label, data.aktif_donem?.name].filter(Boolean).join(' · ');

  if (data.groups.length === 1) {
    const group = data.groups[0];
    await exportOgrenciListPdf({
      rows: group.rows.map((r) =>
        Object.fromEntries(columnKeys.map((k) => [k, String(r[k] ?? '')])),
      ),
      columnKeys,
      columnLabels,
      branding,
      documentTitle: `${group.sinif_ad} — Öğrenci Listesi`,
      filterSummary,
      fileName: `${fileName}_${group.sinif_ad.replace(/\s+/g, '_')}`,
      orientation: columnKeys.length > 5 ? 'landscape' : 'portrait',
    });
    return;
  }

  await exportGroupedOgrenciListPdf({
    sections: data.groups.map((group) => ({
      title: groupSectionTitle(group),
      rows: group.rows.map((r) =>
        Object.fromEntries(columnKeys.map((k) => [k, String(r[k] ?? '')])),
      ),
    })),
    columnKeys,
    columnLabels,
    branding,
    documentTitle: 'Sınıf Öğrenci Listeleri',
    filterSummary,
    fileName,
    totalRecordsLabel: `${data.total_students} öğrenci · ${data.groups.length} sınıf`,
    orientation: 'landscape',
  });
}

export async function runSinifRosterExport(
  filters: SinifRosterExportFilters,
  format: 'csv' | 'xlsx' | 'pdf',
  branding?: OgrenciListPdfBranding,
): Promise<void> {
  if (format === 'pdf') {
    if (!branding) throw new Error('PDF için kurum bilgisi gerekli');
    await exportSinifRosterPdf(filters, branding);
    return;
  }
  const blob = await downloadSinifRosterExport(filters, format);
  const ext = format === 'xlsx' ? 'xlsx' : 'csv';
  downloadBlob(blob, `sinif_ogrenci_listesi.${ext}`);
}
