// ─── Para Hareketleri / Gün Sonu / Hesap Transferi — API Service ─
import { finansRequest } from "./finans-http";
import type {
  ParaHareketleriParams,
  ParaHareketleriResponse,
  HesapTransferi,
  HesapTransferiCreatePayload,
  GunSonuOzet,
  GunSonuDetayResponse,
  GunSonuWhatsappPreviewResponse,
  GunSonuWhatsappSendResponse,
} from "../types/para-hareketi-types";

function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  return qs.toString();
}

export const paraHareketiService = {
  list(params: ParaHareketleriParams): Promise<ParaHareketleriResponse> {
    return finansRequest(`/para-hareketleri/?${buildQuery(params as unknown as Record<string, unknown>)}`);
  },
};

export const gunSonuService = {
  ozet(params: { kurum_id: number; gun?: string; sube_id?: number }): Promise<GunSonuOzet> {
    return finansRequest(`/gun-sonu/?${buildQuery(params)}`);
  },

  ozetRapor(params: {
    kurum_id: number;
    gun?: string;
    sube_id?: number;
    notlar?: string;
  }): Promise<GunSonuOzet> {
    return finansRequest(`/gun-sonu/?${buildQuery({ ...params, rapor: "ozet" })}`);
  },

  detayRapor(params: {
    kurum_id: number;
    gun?: string;
    sube_id?: number;
    notlar?: string;
  }): Promise<GunSonuDetayResponse> {
    return finansRequest(`/gun-sonu/?${buildQuery({ ...params, rapor: "detay" })}`);
  },

  exportPath(params: {
    kurum_id: number;
    gun?: string;
    sube_id?: number;
    notlar?: string;
    format: "csv" | "xlsx" | "pdf";
    orientation?: "portrait" | "landscape";
    rapor?: "ozet" | "detay";
  }): string {
    const { rapor = "ozet", ...rest } = params;
    return `/gun-sonu/?${buildQuery({ ...rest, rapor })}`;
  },

  whatsappPreview(body: { kurum_id: number }): Promise<GunSonuWhatsappPreviewResponse> {
    return finansRequest("/gun-sonu/whatsapp/preview/", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  whatsappSend(body: {
    kurum_id: number;
    gun?: string;
    notlar?: string;
    message?: string;
    recipient_ids?: number[];
  }): Promise<GunSonuWhatsappSendResponse> {
    return finansRequest("/gun-sonu/whatsapp/send/", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};

export const hesapTransferiService = {
  list(params: Record<string, unknown>): Promise<HesapTransferi[]> {
    return finansRequest(`/hesap-transferi/?${buildQuery(params)}`);
  },

  create(payload: HesapTransferiCreatePayload): Promise<HesapTransferi> {
    return finansRequest(`/hesap-transferi/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
