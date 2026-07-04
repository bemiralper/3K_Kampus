// ─── Gelir Kaydı API Service ────────────────────────────────────
import {
  GelirKaydiListItem, GelirKaydiDetail,
  GelirKaydiCreatePayload, GelirKaydiUpdatePayload, GelirOzet,
} from "../types/gelir-types";
import type { GelirKategorisiTreeResponse } from "../types/gelir-kategori-types";
import { finansRequest } from "./finans-http";

const request = finansRequest;

export const gelirKaydiService = {
  list(params: Record<string, string>): Promise<GelirKaydiListItem[]> {
    const qs = new URLSearchParams(params);
    return request<GelirKaydiListItem[]>(`/gelirler/?${qs}`);
  },

  get(id: number): Promise<GelirKaydiDetail> {
    return request<GelirKaydiDetail>(`/gelirler/${id}/`);
  },

  create(payload: GelirKaydiCreatePayload): Promise<GelirKaydiDetail> {
    return request<GelirKaydiDetail>(`/gelirler/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(id: number, payload: GelirKaydiUpdatePayload): Promise<GelirKaydiDetail> {
    return request<GelirKaydiDetail>(`/gelirler/${id}/`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  delete(id: number): Promise<{ detail: string }> {
    return request<{ detail: string }>(`/gelirler/${id}/`, {
      method: "DELETE",
    });
  },

  onayla(id: number): Promise<{ detail: string; durum: string }> {
    return request(`/gelirler/${id}/onayla/`, { method: "POST" });
  },

  iptal(id: number): Promise<{ detail: string; durum: string }> {
    return request(`/gelirler/${id}/iptal/`, { method: "POST" });
  },

  ozet(params: Record<string, string>): Promise<GelirOzet> {
    const qs = new URLSearchParams(params);
    return request<GelirOzet>(`/gelirler/ozet/?${qs}`);
  },
};

// ═══════════════════════════════════════════════════════════════
// GELİR KATEGORİLERİ
// ═══════════════════════════════════════════════════════════════

export const gelirKategoriService = {
  tree(kurum_id: number, sube_id: number) {
    return request<GelirKategorisiTreeResponse>(
      `/gelir-kategorileri/tree/?kurum_id=${kurum_id}&sube_id=${sube_id}`,
    );
  },

  get(id: number) {
    return request<import("../types/gelir-kategori-types").GelirKategorisi>(`/gelir-kategorileri/${id}/`);
  },

  create(payload: import("../types/gelir-kategori-types").GelirKategorisiCreatePayload) {
    return request<import("../types/gelir-kategori-types").GelirKategorisi>(`/gelir-kategorileri/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(id: number, payload: import("../types/gelir-kategori-types").GelirKategorisiUpdatePayload) {
    return request<import("../types/gelir-kategori-types").GelirKategorisi>(`/gelir-kategorileri/${id}/`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  delete(id: number) {
    return request<{ message: string }>(`/gelir-kategorileri/${id}/`, { method: "DELETE" });
  },

  toggle(id: number) {
    return request<{ message: string; kategori: import("../types/gelir-kategori-types").GelirKategorisi }>(
      `/gelir-kategorileri/${id}/toggle/`,
      { method: "POST" },
    );
  },

  seed(kurum_id: number, sube_id: number) {
    return request<import("../types/gelir-kategori-types").GelirKategorisiSeedResponse>(`/gelir-kategorileri/seed/`, {
      method: "POST",
      body: JSON.stringify({ kurum_id, sube_id }),
    });
  },
};

// ═══════════════════════════════════════════════════════════════
// GELİR TAHSİLAT SERVİSİ
// ═══════════════════════════════════════════════════════════════

export interface GelirTahsilatItem {
  id: number;
  gelir_kaydi_id: number;
  cari_hesap_adi: string;
  fatura_no: string;
  odeme_yontemi_id: number | null;
  odeme_yontemi_adi: string | null;
  mali_hesap_id: number | null;
  mali_hesap_adi: string | null;
  tutar: number;
  tahsilat_tarihi: string;
  aciklama: string;
  durum: string;
  durum_display: string;
  islem_yapan_adi: string | null;
  created_at: string;
}

export interface GelirTahsilatCreatePayload {
  gelir_kaydi_id: number;
  odeme_yontemi_id: number;
  mali_hesap_id: number;
  tutar: number;
  tahsilat_tarihi: string;
  aciklama?: string;
}

export const gelirTahsilatService = {
  list(gelirId: number): Promise<GelirTahsilatItem[]> {
    return request<GelirTahsilatItem[]>(`/gelirler/${gelirId}/tahsilatlar/`);
  },

  create(gelirId: number, payload: GelirTahsilatCreatePayload): Promise<GelirTahsilatItem> {
    return request<GelirTahsilatItem>(`/gelirler/${gelirId}/tahsilatlar/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  iptal(tahsilatId: number): Promise<{ detail: string; durum: string }> {
    return request(`/gelir-tahsilatlar/${tahsilatId}/iptal/`, { method: "POST" });
  },
};
