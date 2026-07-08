/** Okul API — şube kapsamlı referans veri. */
import { apiDelete, apiGet, apiPost, apiPostForm, apiPut } from "@/lib/api";

export type OkulRecord = {
  id: number;
  sube_id: number;
  kurum_id: number;
  ad: string;
  okul_turu: string;
  il: string;
  ilce: string;
  not_metni: string;
  aktif_mi: boolean;
  created_at: string;
  updated_at: string;
};

export type OkulPagination = {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
};

export type OkulListResponse = {
  success: boolean;
  data: OkulRecord[];
  pagination: OkulPagination;
};

export type OkulAutocompleteItem = {
  id: number;
  ad: string;
  okul_turu: string;
};

export type OkulBulkImportError = {
  satir: number;
  ad: string;
  neden: string;
};

export type OkulBulkImportResult = {
  toplam_satir: number;
  eklenen: number;
  guncellenen: number;
  atlanan: number;
  hatali: number;
  hatalar: OkulBulkImportError[];
};

export type OkulFormData = {
  ad: string;
  okul_turu?: string;
  il?: string;
  ilce?: string;
  not_metni?: string;
  aktif_mi?: boolean;
};

export type OkulListParams = {
  page?: number;
  page_size?: number;
  search?: string;
  okul_turu?: string;
  il?: string;
  ilce?: string;
  aktif_mi?: string;
};

const BASE = "/kurum-yonetimi/api/okullar";

function buildQuery(params: OkulListParams): string {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  if (params.search) qs.set("search", params.search);
  if (params.okul_turu) qs.set("okul_turu", params.okul_turu);
  if (params.il) qs.set("il", params.il);
  if (params.ilce) qs.set("ilce", params.ilce);
  if (params.aktif_mi) qs.set("aktif_mi", params.aktif_mi);
  const q = qs.toString();
  return q ? `?${q}` : "";
}

const DEFAULT_PAGINATION: OkulPagination = {
  page: 1,
  page_size: 25,
  total_count: 0,
  total_pages: 1,
};

export async function fetchOkullar(params: OkulListParams = {}): Promise<OkulListResponse> {
  const res = await apiGet<OkulRecord[]>(`${BASE}${buildQuery(params)}`);
  if (!res.success) {
    throw new Error(res.error || "Okul listesi alınamadı.");
  }
  return {
    success: true,
    data: (res.data as OkulRecord[] | undefined) || [],
    pagination: (res.pagination as OkulPagination | undefined) || DEFAULT_PAGINATION,
  };
}

export async function fetchOkulAutocomplete(q: string, limit = 20): Promise<OkulAutocompleteItem[]> {
  const qs = new URLSearchParams({ q, limit: String(limit), aktif_only: "1" });
  const res = await apiGet<OkulAutocompleteItem[]>(`${BASE}/autocomplete/?${qs.toString()}`);
  if (!res.success) {
    throw new Error(res.error || "Okul listesi alınamadı. Üst menüden şube seçili olduğundan emin olun.");
  }
  return (res.data as OkulAutocompleteItem[] | undefined) || [];
}

export async function createOkul(data: OkulFormData): Promise<OkulRecord> {
  const res = await apiPost<OkulRecord>(`${BASE}/`, data);
  if (!res.data) throw new Error(res.error || "Okul oluşturulamadı.");
  return res.data as OkulRecord;
}

export async function updateOkul(id: number, data: Partial<OkulFormData>): Promise<OkulRecord> {
  const res = await apiPut<OkulRecord>(`${BASE}/${id}/`, data);
  if (!res.data) throw new Error(res.error || "Okul güncellenemedi.");
  return res.data as OkulRecord;
}

export async function deleteOkul(id: number): Promise<void> {
  const res = await apiDelete(`${BASE}/${id}/`);
  if (!res.success) throw new Error(res.error || "Okul silinemedi.");
}

export async function fetchOkulDeleteInfo(id: number): Promise<{
  okul_id: number;
  ogrenci_sayisi: number;
  can_delete: boolean;
}> {
  const res = await apiGet<{ okul_id: number; ogrenci_sayisi: number; can_delete: boolean }>(
    `${BASE}/${id}/delete-info/`
  );
  if (!res.data) throw new Error(res.error || "Silme bilgisi alınamadı.");
  return res.data;
}

export async function downloadOkulTemplate(): Promise<Blob> {
  const { getContextHeaders, ensureCsrfCookie, resolveApiUrl } = await import("@/lib/api");
  await ensureCsrfCookie();
  const res = await fetch(resolveApiUrl(`${BASE}/toplu/sablon/`), {
    credentials: "include",
    headers: getContextHeaders(),
  });
  if (!res.ok) throw new Error("Şablon indirilemedi.");
  return res.blob();
}

export async function bulkImportOkulExcel(file: File): Promise<OkulBulkImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiPostForm<OkulBulkImportResult>(`${BASE}/toplu/excel/`, formData);
  if (!res.success || !res.data) {
    throw new Error(res.error || "Excel içe aktarma başarısız.");
  }
  return res.data as OkulBulkImportResult;
}

export async function bulkImportOkulList(adlar: string[]): Promise<OkulBulkImportResult> {
  const res = await apiPost<OkulBulkImportResult>(`${BASE}/toplu/`, { adlar });
  if (!res.data) throw new Error(res.error || "Toplu ekleme başarısız.");
  return res.data as OkulBulkImportResult;
}
