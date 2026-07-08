// ─── Cari Hesap v2 — API Service ────────────────────────────────
import {
  CariEffectivePermissions,
  CariEtiket,
  CariV2Dashboard,
  CariV2Detail,
  CariV2Filters,
  CariV2Gorunum,
  CariV2HareketResponse,
  CariV2ListResponse,
  CariV2Panel,
  CariV2Report,
} from "../types/cari-v2-types";
import { finansDownloadPost, finansFormUpload, finansRequest } from "./finans-http";

const request = finansRequest;

export interface CariV2Dosya {
  id: number;
  dosya_adi: string;
  dosya_turu: string;
  dosya_turu_display: string;
  dosya_url: string | null;
  aciklama: string;
  dosya_boyutu: number;
  dosya_boyutu_fmt: string;
  yukleyen_adi?: string | null;
  created_at: string | null;
}

function buildParams(base: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  return params.toString();
}

export const cariV2Service = {
  list(args: {
    kurum_id: number;
    sube_id?: number | null;
    page?: number;
    page_size?: number;
    sort?: string;
    filters?: CariV2Filters;
  }): Promise<CariV2ListResponse> {
    const params: Record<string, string | number | undefined> = {
      kurum_id: args.kurum_id,
      sube_id: args.sube_id ?? undefined,
      page: args.page ?? 1,
      page_size: args.page_size ?? 25,
      sort: args.sort,
      ...(args.filters ?? {}),
    };
    return request<CariV2ListResponse>(`/cari/v2/hesaplar/?${buildParams(params)}`);
  },

  dashboard(kurum_id: number, sube_id?: number | null): Promise<CariV2Dashboard> {
    return request<CariV2Dashboard>(
      `/cari/v2/dashboard/?${buildParams({ kurum_id, sube_id: sube_id ?? undefined })}`,
    );
  },

  get(id: number): Promise<CariV2Detail> {
    return request<CariV2Detail>(`/cari/v2/hesaplar/${id}/`);
  },

  panel(id: number): Promise<CariV2Panel> {
    return request<CariV2Panel>(`/cari/v2/hesaplar/${id}/panel/`);
  },

  create(payload: Record<string, unknown>, kurum_id: number, sube_id?: number | null): Promise<CariV2Detail> {
    return request<CariV2Detail>(
      `/cari/v2/hesaplar/?${buildParams({ kurum_id, sube_id: sube_id ?? undefined })}`,
      { method: "POST", body: JSON.stringify({ ...payload, kurum_id }) },
    );
  },

  update(id: number, payload: Record<string, unknown>): Promise<CariV2Detail> {
    return request<CariV2Detail>(`/cari/v2/hesaplar/${id}/`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  remove(id: number): Promise<{ detail: string }> {
    return request(`/cari/v2/hesaplar/${id}/`, { method: "DELETE" });
  },

  toggle(id: number): Promise<{ detail: string; aktif_mi: boolean }> {
    return request(`/cari/v2/hesaplar/${id}/toggle/`, { method: "POST" });
  },

  hareketler(id: number, args?: { page?: number; page_size?: number; islem_turu?: string; baslangic?: string; bitis?: string }): Promise<CariV2HareketResponse> {
    return request<CariV2HareketResponse>(
      `/cari/v2/hesaplar/${id}/hareketler/?${buildParams({ ...(args ?? {}) })}`,
    );
  },

  tab(id: number, tab: string): Promise<unknown> {
    return request(`/cari/v2/hesaplar/${id}/tab/${tab}/`);
  },

  report(slug: string, kurum_id: number, sube_id?: number | null, params?: Record<string, string>): Promise<CariV2Report> {
    return request<CariV2Report>(
      `/cari/v2/raporlar/${slug}/?${buildParams({ kurum_id, sube_id: sube_id ?? undefined, ...(params ?? {}) })}`,
    );
  },

  reportExport(slug: string, body: Record<string, unknown>): Promise<{ blob: Blob; filename: string }> {
    return finansDownloadPost(`/cari/v2/raporlar/${slug}/export/`, body);
  },

  etiketler(kurum_id: number, sube_id?: number | null): Promise<CariEtiket[]> {
    return request<CariEtiket[]>(
      `/cari/v2/etiketler/?${buildParams({ kurum_id, sube_id: sube_id ?? undefined })}`,
    );
  },

  etiketCreate(kurum_id: number, ad: string, renk: string): Promise<CariEtiket> {
    return request<CariEtiket>(`/cari/v2/etiketler/?${buildParams({ kurum_id })}`, {
      method: "POST",
      body: JSON.stringify({ kurum_id, ad, renk }),
    });
  },

  etiketDelete(id: number, kurum_id: number): Promise<{ detail: string }> {
    return request(`/cari/v2/etiketler/${id}/?${buildParams({ kurum_id })}`, {
      method: "DELETE",
    });
  },

  gorunumler(kurum_id: number, sube_id?: number | null): Promise<CariV2Gorunum[]> {
    return request<CariV2Gorunum[]>(
      `/cari/v2/gorunumler/?${buildParams({ kurum_id, sube_id: sube_id ?? undefined })}`,
    );
  },

  gorunumCreate(kurum_id: number, ad: string, config: Record<string, unknown>): Promise<CariV2Gorunum> {
    return request<CariV2Gorunum>(`/cari/v2/gorunumler/?${buildParams({ kurum_id })}`, {
      method: "POST",
      body: JSON.stringify({ kurum_id, ad, config }),
    });
  },

  gorunumDelete(id: number, kurum_id: number): Promise<{ detail: string }> {
    return request(`/cari/v2/gorunumler/${id}/?${buildParams({ kurum_id })}`, {
      method: "DELETE",
    });
  },

  yetkiler(): Promise<CariEffectivePermissions> {
    return request<CariEffectivePermissions>(`/cari/v2/yetkiler/`);
  },

  // ─── Dosyalar (mevcut v1 uçları — aynı CariHesap kaydı) ───
  dosyalar(id: number): Promise<CariV2Dosya[]> {
    return request<CariV2Dosya[]>(`/cari-hesaplar/${id}/dosyalar/`);
  },

  dosyaYukle(id: number, formData: FormData): Promise<CariV2Dosya> {
    return finansFormUpload<CariV2Dosya>(`/cari-hesaplar/${id}/dosyalar/`, formData);
  },

  dosyaSil(id: number, dosyaId: number): Promise<{ detail: string }> {
    return request(`/cari-hesaplar/${id}/dosyalar/${dosyaId}/`, { method: "DELETE" });
  },

  // ─── Sekme bazlı export (kurumsal PDF/Excel/CSV şablonu) ───
  tabExport(id: number, body: Record<string, unknown>): Promise<{ blob: Blob; filename: string }> {
    return finansDownloadPost(`/cari-hesaplar/${id}/export/`, body);
  },
};
