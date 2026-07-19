// ─── Cari Hesap & Cari Hareket API Service ─────────────────────
import {
  CariHesap, CariHesapListItem, CariHesapCreatePayload,
  CariHesapUpdatePayload, CariHesapDropdownItem, CariHesapCariOzet,
  CariHesapRaporItem, CariHareket, CariDosya,
} from "../types/cari-hesap-types";
import { finansApiUrl, finansFormUpload, finansRequest, getCsrfToken } from "./finans-http";

const request = finansRequest;

// ═══ Cari Hesaplar ═════════════════════════════════════════════
export const cariHesapService = {
  list(params: Record<string, string>): Promise<CariHesapListItem[]> {
    const qs = new URLSearchParams(params);
    return request<CariHesapListItem[]>(`/cari-hesaplar/?${qs}`);
  },

  get(id: number): Promise<CariHesap> {
    return request<CariHesap>(`/cari-hesaplar/${id}/`);
  },

  create(payload: CariHesapCreatePayload): Promise<CariHesap> {
    return request<CariHesap>(`/cari-hesaplar/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(id: number, payload: CariHesapUpdatePayload): Promise<CariHesap> {
    return request<CariHesap>(`/cari-hesaplar/${id}/`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  delete(id: number): Promise<{ detail: string }> {
    return request<{ detail: string }>(`/cari-hesaplar/${id}/`, {
      method: "DELETE",
    });
  },

  toggle(id: number): Promise<{ aktif_mi: boolean; detail: string }> {
    return request(`/cari-hesaplar/${id}/toggle/`, {
      method: "POST",
    });
  },

  dropdown(params: Record<string, string>): Promise<CariHesapDropdownItem[]> {
    const qs = new URLSearchParams(params);
    return request<CariHesapDropdownItem[]>(`/cari-hesaplar/dropdown/?${qs}`);
  },

  cariOzet(id: number): Promise<CariHesapCariOzet> {
    return request<CariHesapCariOzet>(`/cari-hesaplar/${id}/ozet/`);
  },

  raporList(params: Record<string, string>): Promise<CariHesapRaporItem[]> {
    const qs = new URLSearchParams(params);
    return request<CariHesapRaporItem[]>(`/cari-hesaplar/rapor/?${qs}`);
  },

  hareketler(id: number, params?: Record<string, string>): Promise<CariHareket[]> {
    const qs = params ? new URLSearchParams(params) : "";
    return request<CariHareket[]>(`/cari-hesaplar/${id}/hareketler/?${qs}`);
  },

  /** Serbest ödeme — gider kaydına bağlı olmadan direkt cari hesaba ödeme */
  serbestOdeme(payload: {
    cari_hesap_id: number;
    kurum_id: number;
    tutar: number;
    odeme_tarihi: string;
    mali_hesap_id?: number;
    odeme_yontemi_id?: number;
    aciklama?: string;
    vade_tarihi?: string;
    cek_senet_no?: string;
    banka_adi?: string;
    seri_no?: string;
    keside_tarihi?: string;
  }): Promise<{
    detail: string;
    tutar: string;
    yeni_bakiye: string;
    cek_senet_id?: number;
    cari_hareket_id?: number;
  }> {
    return request(`/cari-odemeler/serbest/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Serbest ödeme iptali — cari hareket ID üzerinden */
  serbestOdemeIptal(cariHareketId: number): Promise<{ detail: string; tutar: string; yeni_bakiye: string }> {
    return request(`/cari-odemeler/${cariHareketId}/iptal/`, {
      method: "POST",
    });
  },

  /** Gider ödemesi iptali — gider ödeme ID üzerinden */
  giderOdemeIptal(odemeId: number): Promise<{ detail: string; durum: string }> {
    return request(`/gider-odemeler/${odemeId}/iptal/`, {
      method: "POST",
    });
  },

  // ═══ Dosyalar ═══════════════════════════════════
  dosyalar(id: number): Promise<CariDosya[]> {
    return request<CariDosya[]>(`/cari-hesaplar/${id}/dosyalar/`);
  },

  dosyaYukle(id: number, formData: FormData): Promise<CariDosya> {
    return finansFormUpload<CariDosya>(`/cari-hesaplar/${id}/dosyalar/`, formData);
  },

  dosyaSil(cariHesapId: number, dosyaId: number): Promise<{ detail: string }> {
    const csrf = getCsrfToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (csrf) headers["X-CSRFToken"] = csrf;
    return fetch(finansApiUrl(`/cari-hesaplar/${cariHesapId}/dosyalar/${dosyaId}/`), {
      method: "DELETE",
      headers,
      credentials: "include",
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dosya silinemedi.");
      return data;
    });
  },
};
