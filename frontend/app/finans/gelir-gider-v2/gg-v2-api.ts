// ─── Gelir & Gider v2 — API Service ─────────────────────────────
import { finansDownload, finansFormUpload, finansRequest } from "../services/finans-http";
import {
  GGDashboard,
  GGDropdown,
  GGEkliBelge,
  GGFilters,
  GGGiderDetay,
  GGListItem,
  GGListResponse,
  GGLogItem,
  GGModul,
  GGOdeme,
  GGOdemeTakibiResponse,
  GGTahsilat,
  GGTaksit,
  GGReport,
  GGTanim,
  GGYetkiler,
} from "./gg-v2-types";

const request = finansRequest;

function buildParams(base: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  return params.toString();
}

// ─── Gelir / Gider kayıt CRUD (modul parametreli) ───────────────
export const ggService = {
  list(
    modul: GGModul,
    args: {
      kurum_id: number;
      sube_id?: number | null;
      page?: number;
      page_size?: number;
      sort?: string;
      filters?: GGFilters;
    },
  ): Promise<GGListResponse> {
    const qs = buildParams({
      kurum_id: args.kurum_id,
      sube_id: args.sube_id ?? undefined,
      page: args.page ?? 1,
      page_size: args.page_size ?? 25,
      sort: args.sort,
      ...(args.filters ?? {}),
    });
    return request<GGListResponse>(`/${modul}/v2/kayitlar/?${qs}`);
  },

  dashboard(modul: GGModul, kurum_id: number, sube_id?: number | null): Promise<GGDashboard> {
    return request<GGDashboard>(
      `/${modul}/v2/dashboard/?${buildParams({ kurum_id, sube_id: sube_id ?? undefined })}`,
    );
  },

  get(modul: GGModul, id: number): Promise<GGListItem> {
    return request<GGListItem>(`/${modul}/v2/kayitlar/${id}/`);
  },

  create(
    modul: GGModul,
    payload: Record<string, unknown>,
    kurum_id: number,
    sube_id?: number | null,
  ): Promise<GGListItem> {
    return request<GGListItem>(
      `/${modul}/v2/kayitlar/?${buildParams({ kurum_id, sube_id: sube_id ?? undefined })}`,
      { method: "POST", body: JSON.stringify({ ...payload, kurum_id }) },
    );
  },

  update(modul: GGModul, id: number, payload: Record<string, unknown>): Promise<GGListItem> {
    return request<GGListItem>(`/${modul}/v2/kayitlar/${id}/`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  remove(modul: GGModul, id: number): Promise<void> {
    return request(`/${modul}/v2/kayitlar/${id}/`, { method: "DELETE" });
  },

  onayla(modul: GGModul, id: number): Promise<GGListItem> {
    return request<GGListItem>(`/${modul}/v2/kayitlar/${id}/onayla/`, { method: "POST" });
  },

  onayKaldir(modul: GGModul, id: number): Promise<GGListItem> {
    return request<GGListItem>(`/${modul}/v2/kayitlar/${id}/onay-kaldir/`, { method: "POST" });
  },

  iptal(modul: GGModul, id: number): Promise<GGListItem> {
    return request<GGListItem>(`/${modul}/v2/kayitlar/${id}/iptal/`, { method: "POST" });
  },

  // ─── Gider ödeme (mevcut v1 uçları) ───────────────────────────
  giderOdemeler(giderId: number): Promise<GGOdeme[]> {
    return request<GGOdeme[]>(`/giderler/${giderId}/odemeler/`);
  },

  giderOdemeYap(giderId: number, body: Record<string, unknown>): Promise<GGOdeme> {
    return request<GGOdeme>(`/giderler/${giderId}/odemeler/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  giderOdemeIptal(odemeId: number): Promise<{ detail: string; durum: string }> {
    return request(`/gider-odemeler/${odemeId}/iptal/`, { method: "POST" });
  },

  giderTaksitler(giderId: number): Promise<GGTaksit[]> {
    return request<GGTaksit[]>(`/giderler/${giderId}/taksitler/`);
  },

  odemeTakibi(args: {
    kurum_id: number;
    sube_id?: number | null;
    page?: number;
    page_size?: number;
    arama?: string;
    durum?: string;
    include_odenen?: boolean;
    donem?: string;
    odeme_tipi?: string;
    filtre_sube_id?: string | number;
    baslangic?: string;
    bitis?: string;
    cari_hesap_id?: number | string;
    gider_kategorisi_id?: number | string;
  }): Promise<GGOdemeTakibiResponse> {
    const qs = buildParams({
      kurum_id: args.kurum_id,
      sube_id: args.sube_id ?? undefined,
      page: args.page ?? 1,
      page_size: args.page_size ?? 25,
      arama: args.arama,
      durum: args.durum,
      include_odenen: args.include_odenen ? "true" : undefined,
      donem: args.donem,
      odeme_tipi: args.odeme_tipi,
      filtre_sube_id: args.filtre_sube_id,
      baslangic: args.baslangic,
      bitis: args.bitis,
      cari_hesap_id: args.cari_hesap_id,
      gider_kategorisi_id: args.gider_kategorisi_id,
    });
    return request<GGOdemeTakibiResponse>(`/gider/v2/odeme-takibi/?${qs}`);
  },

  giderDetay(giderId: number): Promise<GGGiderDetay> {
    return request<GGGiderDetay>(`/gider/v2/kayitlar/${giderId}/detay/`);
  },

  giderBelge(
    giderId: number,
    tip: "gider" | "odeme-plani",
    fmt: "pdf" | "html" = "pdf",
  ): Promise<{ blob: Blob; filename: string }> {
    return finansDownload(`/gider/v2/kayitlar/${giderId}/belgeler/${tip}/?fmt=${fmt}`);
  },

  odemeBelge(
    giderId: number,
    odemeId: number,
    fmt: "pdf" | "html" = "pdf",
  ): Promise<{ blob: Blob; filename: string }> {
    return finansDownload(`/gider/v2/kayitlar/${giderId}/belgeler/odeme/${odemeId}/?fmt=${fmt}`);
  },

  giderEkYukle(giderId: number, file: File, aciklama = ""): Promise<GGEkliBelge> {
    const fd = new FormData();
    fd.append("dosya", file);
    fd.append("dosya_turu", "fatura_fis");
    if (aciklama) fd.append("aciklama", aciklama);
    return finansFormUpload<GGEkliBelge>(`/gider/v2/kayitlar/${giderId}/ekler/`, fd);
  },

  giderEkSil(giderId: number, ekId: number): Promise<{ detail: string }> {
    return request(`/gider/v2/kayitlar/${giderId}/ekler/${ekId}/`, { method: "DELETE" });
  },

  // ─── Gelir tahsilat (mevcut v1 uçları) ────────────────────────
  gelirTahsilatlar(gelirId: number): Promise<GGTahsilat[]> {
    return request<GGTahsilat[]>(`/gelirler/${gelirId}/tahsilatlar/`);
  },

  gelirTahsilatYap(gelirId: number, body: Record<string, unknown>): Promise<GGTahsilat> {
    return request<GGTahsilat>(`/gelirler/${gelirId}/tahsilatlar/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  gelirTahsilatIptal(tahsilatId: number): Promise<{ detail: string; durum: string }> {
    return request(`/gelir-tahsilatlar/${tahsilatId}/iptal/`, { method: "POST" });
  },

  // ─── Ortak ────────────────────────────────────────────────────
  dropdown(modul: GGModul, kurum_id: number, sube_id?: number | null): Promise<GGDropdown> {
    return request<GGDropdown>(
      `/gelir-gider/v2/dropdown/?${buildParams({ modul, kurum_id, sube_id: sube_id ?? undefined })}`,
    );
  },

  yetkiler(): Promise<GGYetkiler> {
    return request<GGYetkiler>(`/gelir-gider/v2/yetkiler/`);
  },

  loglar(args: {
    kurum_id: number;
    sube_id?: number | null;
    modul?: string;
    kayit_id?: number;
    limit?: number;
  }): Promise<{ results: GGLogItem[]; count: number }> {
    return request(`/gelir-gider/v2/loglar/?${buildParams({ ...args, sube_id: args.sube_id ?? undefined })}`);
  },

  report(
    slug: string,
    kurum_id: number,
    sube_id?: number | null,
    params?: Record<string, string>,
  ): Promise<GGReport> {
    return request<GGReport>(
      `/gelir-gider/v2/raporlar/${slug}/?${buildParams({
        kurum_id,
        sube_id: sube_id ?? undefined,
        ...(params ?? {}),
      })}`,
    );
  },

  reportExport(
    slug: string,
    fmt: "pdf" | "xlsx" | "csv",
    kurum_id: number,
    sube_id?: number | null,
    params?: Record<string, string>,
  ): Promise<{ blob: Blob; filename: string }> {
    return finansDownload(
      `/gelir-gider/v2/raporlar/${slug}/export/?${buildParams({
        fmt,
        kurum_id,
        sube_id: sube_id ?? undefined,
        ...(params ?? {}),
      })}`,
    );
  },

  // Liste (kayıtlar) — aktif filtrelerle kurumsal PDF/Excel/CSV export
  listeExport(
    modul: GGModul,
    fmt: "pdf" | "xlsx" | "csv",
    kurum_id: number,
    sube_id?: number | null,
    filters?: GGFilters,
    sort?: string,
  ): Promise<{ blob: Blob; filename: string }> {
    return finansDownload(
      `/gelir-gider/v2/liste-export/?${buildParams({
        modul,
        fmt,
        kurum_id,
        sube_id: sube_id ?? undefined,
        sort,
        ...((filters ?? {}) as Record<string, unknown>),
      })}`,
    );
  },
};

// ─── Finansman Tanımları (ortak master data) ────────────────────
const TANIM_PATHS: Record<string, string> = {
  gelir_kaynagi: "tanimlar/gelir-kaynaklari",
  maliyet_merkezi: "tanimlar/maliyet-merkezleri",
  proje: "tanimlar/projeler",
  aciklama_sablonu: "tanimlar/aciklama-sablonlari",
  masraf_turu: "tanimlar/masraf-turleri",
};

export type TanimTipi = keyof typeof TANIM_PATHS;

export const tanimService = {
  async list(tip: TanimTipi, kurum_id: number, sube_id?: number | null, aktif?: boolean): Promise<GGTanim[]> {
    const qs = buildParams({
      kurum_id,
      sube_id: sube_id ?? undefined,
      aktif_mi: aktif === undefined ? undefined : aktif ? "1" : "0",
    });
    const res = await request<{ results: GGTanim[]; count: number }>(`/${TANIM_PATHS[tip]}/?${qs}`);
    return res.results ?? [];
  },

  create(tip: TanimTipi, kurum_id: number, payload: Record<string, unknown>, sube_id?: number | null): Promise<GGTanim> {
    return request<GGTanim>(`/${TANIM_PATHS[tip]}/?${buildParams({ kurum_id })}`, {
      method: "POST",
      body: JSON.stringify({ ...payload, kurum_id, sube_id: sube_id ?? undefined }),
    });
  },

  update(tip: TanimTipi, id: number, payload: Record<string, unknown>): Promise<GGTanim> {
    const kurum_id = Number(payload.kurum_id);
    const qs = Number.isFinite(kurum_id) && kurum_id > 0 ? `?${buildParams({ kurum_id })}` : "";
    return request<GGTanim>(`/${TANIM_PATHS[tip]}/${id}/${qs}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  remove(tip: TanimTipi, id: number, kurum_id: number): Promise<void> {
    return request(`/${TANIM_PATHS[tip]}/${id}/?${buildParams({ kurum_id })}`, { method: "DELETE" });
  },

  toggle(tip: TanimTipi, id: number, kurum_id: number): Promise<GGTanim> {
    return request<GGTanim>(`/${TANIM_PATHS[tip]}/${id}/toggle/?${buildParams({ kurum_id })}`, {
      method: "POST",
    });
  },
};
