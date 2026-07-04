// ─── Finans ⇄ Ödeme Takip Köprüsü ────────────────────────────────
// Para Hareketleri hub'ındaki "Tahsilat Al / İade" hızlı işlemleri
// doğrudan odeme_takip API'lerini kullanır (Sözleşme, Taksit, Tahsilat).
import { API_BASE, postHeaders } from "@/app/odeme-takip/helpers";
import type { Sozlesme, Taksit, OdemeYontemi, TahsilatItem } from "@/app/odeme-takip/types";
import type { VadesiGelenlerDonem, VadesiGelenlerResponse } from "../types/para-hareketi-types";

export interface SozlesmeAramaSonuc {
  id: number;
  sozlesme_no: string;
  ogrenci: { id: number; ad: string; soyad: string; ogrenci_no: string } | null;
  net_tutar: number;
  toplam_odenen: number;
  kalan_borc: number;
  durum: string;
}

async function odemeGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    let msg = "İstek başarısız oldu";
    try {
      const data = await res.json();
      msg = data.error || data.detail || msg;
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }
  return res.json();
}

async function odemePost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: postHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.detail || "İşlem başarısız oldu");
  }
  return data as T;
}

export const odemeTakipBridge = {
  sozlesmeler(): Promise<SozlesmeAramaSonuc[]> {
    return odemeGet<SozlesmeAramaSonuc[]>(`/sozlesmeler/`);
  },

  sozlesmeDetay(id: number): Promise<Sozlesme> {
    return odemeGet<Sozlesme>(`/sozlesmeler/${id}/`);
  },

  taksitler(sozlesmeId: number): Promise<Taksit[]> {
    return odemeGet<Taksit[]>(`/sozlesmeler/${sozlesmeId}/taksitler/`);
  },

  /**
   * mali_hesap_id verilirse SADECE o mali hesaba ait ödeme yöntemleri döner.
   * Cascade akışı: önce Mali Hesap seç -> sonra bu liste ile Ödeme Yöntemi seç.
   */
  odemeSekilleri(mali_hesap_id?: number | null): Promise<OdemeYontemi[]> {
    const qs = mali_hesap_id ? `?mali_hesap_id=${mali_hesap_id}` : "";
    return odemeGet<OdemeYontemi[]>(`/odeme-sekilleri/${qs}`);
  },

  vadesiGelecekler(params: { kurum_id: number; sube_id?: number; egitim_yili_id?: number; donem: VadesiGelenlerDonem; arama?: string }): Promise<VadesiGelenlerResponse> {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    });
    return odemeGet<VadesiGelenlerResponse>(`/taksitler/vadesi-gelecekler/?${qs.toString()}`);
  },

  tahsilatOlustur(payload: {
    sozlesme_id: number;
    taksit_id?: number | null;
    odeme_yontemi_id: number;
    mali_hesap_id?: number | null;
    tutar: number;
    tahsilat_tarihi: string;
    referans_no?: string;
    aciklama?: string;
  }): Promise<TahsilatItem> {
    return odemePost<TahsilatItem>(`/tahsilatlar/create/`, payload);
  },

  tahsilatIade(payload: {
    sozlesme_id: number;
    tutar: number;
    tahsilat_tarihi: string;
    aciklama?: string;
    kaynak_tahsilat_id?: number | null;
    odeme_yontemi_id?: number | null;
    mali_hesap_id?: number | null;
  }): Promise<TahsilatItem> {
    return odemePost<TahsilatItem>(`/tahsilatlar/iade/`, payload);
  },
};
