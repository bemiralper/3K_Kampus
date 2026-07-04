// ─── Finans Modülü — Gider Kategorisi API Service ─────────────
import {
  GiderKategorisi,
  GiderKategorisiTreeResponse,
  GiderKategorisiCreatePayload,
  GiderKategorisiUpdatePayload,
  GiderKategorisiSeedResponse,
} from "../types/gider-kategori-types";
import { finansRequest } from "./finans-http";

const request = finansRequest;

// ═══════════════════════════════════════════════════════════════
// GİDER KATEGORİLERİ
// ═══════════════════════════════════════════════════════════════

export const giderKategoriService = {
  /** Ağaç yapısında tüm kategoriler (ana + alt) — şube bazlı */
  tree(kurum_id: number, sube_id: number): Promise<GiderKategorisiTreeResponse> {
    return request(`/gider-kategorileri/tree/?kurum_id=${kurum_id}&sube_id=${sube_id}`);
  },

  /** Tek bir kategori detayı */
  get(id: number): Promise<GiderKategorisi> {
    return request(`/gider-kategorileri/${id}/`);
  },

  /** Yeni kategori oluştur */
  create(payload: GiderKategorisiCreatePayload): Promise<GiderKategorisi> {
    return request(`/gider-kategorileri/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Kategori güncelle */
  update(id: number, payload: GiderKategorisiUpdatePayload): Promise<GiderKategorisi> {
    return request(`/gider-kategorileri/${id}/`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  /** Kategori sil (soft delete) */
  delete(id: number): Promise<{ message: string }> {
    return request(`/gider-kategorileri/${id}/`, { method: "DELETE" });
  },

  /** Aktif/pasif toggle */
  toggle(id: number): Promise<{ message: string; kategori: GiderKategorisi }> {
    return request(`/gider-kategorileri/${id}/toggle/`, { method: "POST" });
  },

  /** Varsayılan kategorileri oluştur (şube bazlı) */
  seed(kurum_id: number, sube_id: number): Promise<GiderKategorisiSeedResponse> {
    return request(`/gider-kategorileri/seed/`, {
      method: "POST",
      body: JSON.stringify({ kurum_id, sube_id }),
    });
  },
};
