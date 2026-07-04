// ─── Gider Kaydı & Ödeme API Service ───────────────────────────
import {
  GiderKaydiListItem, GiderKaydiDetail, GiderKaydiCreatePayload, GiderKaydiUpdatePayload,
  GiderOdeme, GiderOdemeCreatePayload, GiderOzet, GiderTaksit,
} from "../types/gider-types";
import { finansRequest } from "./finans-http";

const request = finansRequest;

// ═══ Gider Kayıtları ═══════════════════════════════════════════
export const giderKaydiService = {
  list(params: Record<string, string>): Promise<GiderKaydiListItem[]> {
    const qs = new URLSearchParams(params);
    return request<GiderKaydiListItem[]>(`/giderler/?${qs}`);
  },

  get(id: number): Promise<GiderKaydiDetail> {
    return request<GiderKaydiDetail>(`/giderler/${id}/`);
  },

  create(payload: GiderKaydiCreatePayload): Promise<GiderKaydiDetail> {
    return request<GiderKaydiDetail>(`/giderler/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(id: number, payload: GiderKaydiUpdatePayload): Promise<GiderKaydiDetail> {
    return request<GiderKaydiDetail>(`/giderler/${id}/`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  delete(id: number): Promise<{ detail: string }> {
    return request<{ detail: string }>(`/giderler/${id}/`, {
      method: "DELETE",
    });
  },

  onayaGonder(id: number): Promise<{ detail: string; durum: string }> {
    return request(`/giderler/${id}/onaya-gonder/`, { method: "POST" });
  },

  onayla(id: number): Promise<{ detail: string; durum: string; taksit_sayisi: number }> {
    return request(`/giderler/${id}/onayla/`, { method: "POST" });
  },

  iptal(id: number): Promise<{ detail: string; durum: string }> {
    return request(`/giderler/${id}/iptal/`, { method: "POST" });
  },

  taksitler(giderId: number): Promise<GiderTaksit[]> {
    return request<GiderTaksit[]>(`/giderler/${giderId}/taksitler/`);
  },

  ozet(params: Record<string, string>): Promise<GiderOzet> {
    const qs = new URLSearchParams(params);
    return request<GiderOzet>(`/giderler/ozet/?${qs}`);
  },

  gecikenTaksitler(kurumId: number, subeId?: number): Promise<GiderTaksit[]> {
    const params = new URLSearchParams({ kurum_id: String(kurumId) });
    if (subeId) params.set("sube_id", String(subeId));
    return request<GiderTaksit[]>(`/giderler/geciken-taksitler/?${params}`);
  },

  yaklasanVadeler(
    kurumId: number,
    gun = 7,
    options?: { subeId?: number; odemeYontemiTipi?: string },
  ): Promise<GiderTaksit[]> {
    const params = new URLSearchParams({
      kurum_id: String(kurumId),
      gun: String(gun),
    });
    if (options?.subeId) params.set("sube_id", String(options.subeId));
    if (options?.odemeYontemiTipi) params.set("odeme_yontemi_tipi", options.odemeYontemiTipi);
    return request<GiderTaksit[]>(`/giderler/yaklasan-vadeler/?${params}`);
  },
};

// ═══ Gider Ödemeleri ═══════════════════════════════════════════
export const giderOdemeService = {
  list(giderId: number): Promise<GiderOdeme[]> {
    return request<GiderOdeme[]>(`/giderler/${giderId}/odemeler/`);
  },

  create(giderId: number, payload: GiderOdemeCreatePayload): Promise<GiderOdeme> {
    return request<GiderOdeme>(`/giderler/${giderId}/odemeler/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  iptal(odemeId: number): Promise<{ detail: string; durum: string }> {
    return request(`/gider-odemeler/${odemeId}/iptal/`, { method: "POST" });
  },

  sonOdemeler(params: Record<string, string>): Promise<GiderOdeme[]> {
    const qs = new URLSearchParams(params);
    return request<GiderOdeme[]>(`/gider-odemeler/son/?${qs}`);
  },
};
