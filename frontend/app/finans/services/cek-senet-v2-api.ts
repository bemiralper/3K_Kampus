import { finansFormUpload, finansRequest } from "./finans-http";
import type {
  CekSenetV2Dashboard,
  CekSenetV2Dosya,
  CekSenetV2Kayit,
  CekSenetV2ListResponse,
  CekSenetV2Log,
} from "../types/cek-senet-v2-types";

function buildParams(params: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  return qs.toString();
}

export interface CekSenetV2ListParams {
  kurum_id: number;
  sube_id?: number | null;
  sekme?: string;
  yon?: string;
  arac_tipi?: string;
  durum?: string;
  vade_baslangic?: string;
  vade_bitis?: string;
  arama?: string;
  sort?: string;
  page?: number;
  page_size?: number;
}

export interface CreateCekSenetBody {
  kurum_id: number;
  sube_id?: number;
  yon: "alinan" | "verilen";
  cari_hesap_id?: number;
  odeme_yontemi_id: number;
  tutar: number;
  vade_tarihi: string;
  cek_senet_no?: string;
  seri_no?: string;
  banka_adi?: string;
  sube_adi?: string;
  hesap_no?: string;
  keside_eden?: string;
  keside_tarihi?: string;
  aciklama?: string;
}

export const cekSenetV2Service = {
  list(params: CekSenetV2ListParams) {
    return finansRequest<CekSenetV2ListResponse>(
      `/cek-senet/?${buildParams(params as unknown as Record<string, string | number | undefined>)}`,
    );
  },

  dashboard(kurum_id: number, sube_id?: number | null) {
    return finansRequest<CekSenetV2Dashboard>(`/cek-senet/dashboard/?${buildParams({ kurum_id, sube_id })}`);
  },

  detail(id: number) {
    return finansRequest<CekSenetV2Kayit>(`/cek-senet/${id}/`);
  },

  create(body: CreateCekSenetBody) {
    return finansRequest<CekSenetV2Kayit>(`/cek-senet/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  update(id: number, body: Partial<CreateCekSenetBody> & Record<string, unknown>) {
    return finansRequest<CekSenetV2Kayit>(`/cek-senet/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  transition(id: number, body: Record<string, unknown>) {
    return finansRequest<CekSenetV2Kayit>(`/cek-senet/${id}/transition/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  tahsil(id: number, body: { tahsilat_mali_hesap_id: number; tahsilat_tarihi?: string; aciklama?: string }) {
    return finansRequest<CekSenetV2Kayit>(`/cek-senet/${id}/tahsil/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  ode(id: number, body: { odeme_mali_hesap_id: number; odeme_tarihi?: string; aciklama?: string }) {
    return finansRequest<CekSenetV2Kayit>(`/cek-senet/${id}/ode/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  ciro(id: number, body: { ciro_edilen_cari_id: number; ciro_tarihi?: string; aciklama?: string }) {
    return finansRequest<CekSenetV2Kayit>(`/cek-senet/${id}/ciro/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  protesto(id: number, body: { protesto_tarihi?: string; aciklama?: string }) {
    return finansRequest<CekSenetV2Kayit>(`/cek-senet/${id}/protesto/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  iade(id: number, body: { iade_tarihi?: string; aciklama?: string }) {
    return finansRequest<CekSenetV2Kayit>(`/cek-senet/${id}/iade/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  iptal(id: number, body: { aciklama?: string }) {
    return finansRequest<CekSenetV2Kayit>(`/cek-senet/${id}/iptal/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  timeline(id: number) {
    return finansRequest<{ results: CekSenetV2Log[] }>(`/cek-senet/${id}/timeline/`);
  },

  dosyalar(id: number) {
    return finansRequest<{ results: CekSenetV2Dosya[] }>(`/cek-senet/${id}/dosyalar/`);
  },

  dosyaYukle(id: number, formData: FormData) {
    return finansFormUpload<CekSenetV2Dosya>(`/cek-senet/${id}/dosyalar/`, formData);
  },

  dosyaSil(id: number, dosyaId: number) {
    return finansRequest<{ success: boolean }>(`/cek-senet/${id}/dosyalar/${dosyaId}/`, {
      method: "DELETE",
    });
  },
};
