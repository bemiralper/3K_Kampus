import { finansRequest } from "./finans-http";

export interface CekSenetKayit {
  id: number;
  kurum_id?: number;
  sube_id?: number | null;
  yon: string;
  yon_label: string;
  arac_tipi: string;
  arac_tipi_label: string;
  tutar: number;
  vade_tarihi: string | null;
  olusturma_tarihi: string | null;
  durum: string;
  durum_label: string;
  cek_senet_no: string;
  banka_adi: string;
  keside_eden: string;
  ogrenci_adi: string;
  sozlesme_no: string;
  odeme_yontemi_adi: string;
  taksit_id: number | null;
  tahsilat_mali_hesap_id?: number | null;
  allowed_transitions?: { durum: string; label: string }[];
}

export interface CekSenetListResponse {
  count: number;
  page: number;
  page_size: number;
  results: CekSenetKayit[];
}

export const cekSenetService = {
  list(params: Record<string, string | number | undefined>) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    });
    return finansRequest<CekSenetListResponse>(`/cek-senet/?${qs.toString()}`);
  },

  detail(id: number) {
    return finansRequest<CekSenetKayit>(`/cek-senet/${id}/`);
  },

  transition(id: number, body: Record<string, unknown>) {
    return finansRequest<CekSenetKayit>(`/cek-senet/${id}/transition/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  tahsil(id: number, body: { tahsilat_mali_hesap_id: number; tahsilat_tarihi?: string; aciklama?: string }) {
    return finansRequest<CekSenetKayit>(`/cek-senet/${id}/tahsil/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  ode(id: number, body: { odeme_mali_hesap_id: number; odeme_tarihi?: string; aciklama?: string }) {
    return finansRequest<CekSenetKayit>(`/cek-senet/${id}/ode/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  createVerilen(body: {
    kurum_id: number;
    sube_id?: number;
    cari_hesap_id?: number;
    odeme_yontemi_id: number;
    tutar: number;
    vade_tarihi: string;
    cek_senet_no?: string;
    banka_adi?: string;
    aciklama?: string;
  }) {
    return finansRequest<CekSenetKayit>(`/cek-senet/`, {
      method: "POST",
      body: JSON.stringify({ ...body, yon: "verilen" }),
    });
  },
};
