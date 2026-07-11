// ─── Finans Modülü — API Service Layer ─────────────────────────
import { OdemeYontemi, OdemeYontemiCreatePayload, OdemeYontemiUpdatePayload, OdemeYontemiListResponse } from "../types/payment-method-types";
import {
  MaliHesap,
  MaliHesapCreatePayload,
  MaliHesapUpdatePayload,
  MaliHesapListResponse,
  MaliHesapDetay,
  MaliHesapAgacResponse,
  MaliHesapYetkilisi,
  MaliHesapYetkilisiPayload,
} from "../types/financial-account-types";
import { finansRequest } from "./finans-http";

const request = finansRequest;

// ═══════════════════════════════════════════════════════════════
// ÖDEME YÖNTEMLERİ
// ═══════════════════════════════════════════════════════════════

export const paymentMethodService = {
  list(params: Record<string, string>): Promise<OdemeYontemiListResponse> {
    const qs = new URLSearchParams(params);
    return request(`/odeme-yontemleri/?${qs}`);
  },

  get(id: number): Promise<OdemeYontemi> {
    return request(`/odeme-yontemleri/${id}/`);
  },

  create(payload: OdemeYontemiCreatePayload): Promise<OdemeYontemi> {
    return request(`/odeme-yontemleri/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(id: number, payload: OdemeYontemiUpdatePayload): Promise<OdemeYontemi> {
    return request(`/odeme-yontemleri/${id}/`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  delete(id: number): Promise<{ message: string }> {
    return request(`/odeme-yontemleri/${id}/`, { method: "DELETE" });
  },

  toggle(id: number): Promise<{ message: string; odeme_yontemi: OdemeYontemi }> {
    return request(`/odeme-yontemleri/${id}/toggle/`, { method: "POST" });
  },

  /**
   * Dropdown.
   * - mali_hesap_id YOK → PLAN (tip başına tek; sözleşme/filtre/Ödeme Şekli)
   * - mali_hesap_id VAR → OPERASYON (sadece o hesaba bağlı + çek/senet)
   */
  dropdown(
    kurum_id: number,
    mali_hesap_id?: number | null,
    sube_id?: number | null,
  ): Promise<{ odeme_yontemleri: { id: number; ad: string; tip: string; mali_hesap_id: number }[] }> {
    const qs = new URLSearchParams({ kurum_id: String(kurum_id) });
    if (mali_hesap_id) qs.set("mali_hesap_id", String(mali_hesap_id));
    if (sube_id) qs.set("sube_id", String(sube_id));
    return request(`/odeme-yontemleri/dropdown/?${qs}`);
  },
};

// ═══════════════════════════════════════════════════════════════
// MALİ HESAPLAR
// ═══════════════════════════════════════════════════════════════

export const financialAccountService = {
  list(params: Record<string, string>): Promise<MaliHesapListResponse> {
    const qs = new URLSearchParams(params);
    return request(`/mali-hesaplar/?${qs}`);
  },

  get(id: number): Promise<MaliHesap> {
    return request(`/mali-hesaplar/${id}/`);
  },

  create(payload: MaliHesapCreatePayload): Promise<MaliHesap> {
    return request(`/mali-hesaplar/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(id: number, payload: MaliHesapUpdatePayload): Promise<MaliHesap> {
    return request(`/mali-hesaplar/${id}/`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  delete(id: number): Promise<{ message: string }> {
    return request(`/mali-hesaplar/${id}/`, { method: "DELETE" });
  },

  toggle(id: number): Promise<{ message: string; mali_hesap: MaliHesap }> {
    return request(`/mali-hesaplar/${id}/toggle/`, { method: "POST" });
  },

  dropdown(sube_id: number, kurum_id?: number): Promise<{ mali_hesaplar: { id: number; ad: string; tip: string }[] }> {
    const qs = new URLSearchParams({ sube_id: String(sube_id) });
    if (kurum_id) qs.set("kurum_id", String(kurum_id));
    return request(`/mali-hesaplar/dropdown/?${qs}`);
  },

  /** Aktif şube bağlamı ile dropdown — kurum_id + sube_id (header yedek). */
  dropdownByKurum(
    kurum_id: number,
    sube_id?: number | null,
  ): Promise<{ mali_hesaplar: { id: number; ad: string; tip: string; sube_ad?: string }[] }> {
    const qs = new URLSearchParams({ kurum_id: String(kurum_id) });
    if (sube_id) qs.set("sube_id", String(sube_id));
    return request(`/mali-hesaplar/dropdown/?${qs}`);
  },

  /** Mali Hesaplar ekranı sol panel TreeView'ı — Şube bazlı gruplanmış ağaç. */
  agac(kurum_id: number, sube_id?: number | null): Promise<MaliHesapAgacResponse> {
    const qs = new URLSearchParams({ kurum_id: String(kurum_id) });
    if (sube_id) qs.set("sube_id", String(sube_id));
    return request(`/mali-hesaplar/agac/?${qs}`);
  },

  /** Sağ panel detay — bakiye, son işlem tarihi, ödeme yöntemi sayısı dahil. */
  detay(id: number): Promise<MaliHesapDetay> {
    return request(`/mali-hesaplar/${id}/detay/`);
  },
};

// ═══════════════════════════════════════════════════════════════
// MALİ HESAP YETKİLİLERİ (bilgilendirme amaçlı — erişim kısıtlaması YOK)
// ═══════════════════════════════════════════════════════════════

export const maliHesapYetkilisiService = {
  list(maliHesapId: number): Promise<{ yetkililer: MaliHesapYetkilisi[]; toplam: number }> {
    return request(`/mali-hesaplar/${maliHesapId}/yetkililer/`);
  },

  create(maliHesapId: number, payload: MaliHesapYetkilisiPayload): Promise<MaliHesapYetkilisi> {
    return request(`/mali-hesaplar/${maliHesapId}/yetkililer/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(id: number, payload: MaliHesapYetkilisiPayload): Promise<MaliHesapYetkilisi> {
    return request(`/yetkililer/${id}/`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  delete(id: number): Promise<{ message: string }> {
    return request(`/yetkililer/${id}/`, { method: "DELETE" });
  },
};
