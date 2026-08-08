import { apiDelete, apiGet, apiPatch, apiPost, type ApiResponse } from "@/lib/api";

export type OgrenciNotKategoriCode =
  | "finans"
  | "egitim"
  | "kocluk"
  | "veli_iletisimi"
  | "devamsizlik"
  | "sozlesme"
  | "genel"
  | "diger";

export type OgrenciNotSource = "manual" | "sozlesme";

export interface OgrenciNotKategori {
  code: OgrenciNotKategoriCode | string;
  label: string;
}

export interface OgrenciNotItem {
  id: number | string;
  source: OgrenciNotSource;
  baslik: string;
  icerik: string;
  kategori: OgrenciNotKategoriCode | string;
  kategori_label: string;
  not_zamani: string | null;
  created_by: number | null;
  created_by_name: string;
  created_at: string | null;
  updated_by: number | null;
  updated_by_name: string;
  updated_at: string | null;
  editable: boolean;
  sozlesme_id: number | null;
  sozlesme_no: string | null;
}

export interface OgrenciNotAuditItem {
  id: number;
  action: "created" | "updated" | "deleted" | string;
  action_label: string;
  description: string;
  performed_by: number | null;
  performed_by_name: string;
  performed_at: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  baslik_snapshot: string;
}

export interface OgrenciNotListResponse {
  notlar: OgrenciNotItem[];
  kategoriler: OgrenciNotKategori[];
}

export interface OgrenciNotListParams {
  kategori?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  created_by?: number | string;
}

export interface OgrenciNotPayload {
  baslik: string;
  icerik: string;
  kategori: string;
  not_zamani?: string;
}

function notesBase(ogrenciId: number | string) {
  return `/ogrenciler/api/${ogrenciId}/notlar`;
}

function buildQuery(params?: OgrenciNotListParams): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  if (params.kategori) qs.set("kategori", params.kategori);
  if (params.q) qs.set("q", params.q);
  if (params.date_from) qs.set("date_from", params.date_from);
  if (params.date_to) qs.set("date_to", params.date_to);
  if (params.created_by != null && params.created_by !== "") {
    qs.set("created_by", String(params.created_by));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function fetchOgrenciNotlar(
  ogrenciId: number | string,
  params?: OgrenciNotListParams,
): Promise<ApiResponse<OgrenciNotListResponse>> {
  return apiGet<OgrenciNotListResponse>(`${notesBase(ogrenciId)}/${buildQuery(params)}`);
}

export async function createOgrenciNot(
  ogrenciId: number | string,
  data: OgrenciNotPayload,
): Promise<ApiResponse<{ success: boolean; not: OgrenciNotItem }>> {
  return apiPost(`${notesBase(ogrenciId)}/`, data);
}

export async function updateOgrenciNot(
  ogrenciId: number | string,
  notId: number | string,
  data: Partial<OgrenciNotPayload>,
): Promise<ApiResponse<{ success: boolean; not: OgrenciNotItem }>> {
  return apiPatch(`${notesBase(ogrenciId)}/${notId}/`, data);
}

export async function deleteOgrenciNot(
  ogrenciId: number | string,
  notId: number | string,
): Promise<ApiResponse<{ success: boolean }>> {
  return apiDelete(`${notesBase(ogrenciId)}/${notId}/`);
}

export async function fetchOgrenciNotGecmis(
  ogrenciId: number | string,
  notId: number | string,
): Promise<ApiResponse<{ gecmis: OgrenciNotAuditItem[] }>> {
  return apiGet(`${notesBase(ogrenciId)}/${notId}/gecmis/`);
}

export const NOT_KATEGORI_COLORS: Record<string, string> = {
  finans: "#16a34a",
  egitim: "#2563eb",
  kocluk: "#0891b2",
  veli_iletisimi: "#c026d3",
  devamsizlik: "#ea580c",
  sozlesme: "#7c3aed",
  genel: "#64748b",
  diger: "#78716c",
};

export const DEFAULT_NOT_KATEGORILER: OgrenciNotKategori[] = [
  { code: "finans", label: "Finans" },
  { code: "egitim", label: "Eğitim" },
  { code: "kocluk", label: "Koçluk" },
  { code: "veli_iletisimi", label: "Veli İletişimi" },
  { code: "devamsizlik", label: "Devamsızlık" },
  { code: "sozlesme", label: "Sözleşme" },
  { code: "genel", label: "Genel" },
  { code: "diger", label: "Diğer" },
];
