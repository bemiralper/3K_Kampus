// ─── Finans Modülü — Dashboard API Service ─────────────────────
import { finansRequest } from "./finans-http";
import { todayIsoLocal } from "@/lib/date-utils";

// ─── Legacy Dashboard Types ─────────────────────────────────────

export interface OzetKartlar {
  bugunki_kasa: number;
  toplam_alacak: number;
  toplam_borc: number;
  toplam_odenen: number;
  bu_ay_gelir: number;
  bu_ay_gider: number;
  net_kar_zarar: number;
}

export interface Widgetlar {
  bugun_tahsil_edilen: number;
  bugun_odenen_gider: number;
  bu_ay_odenecek_borclar: number;
  geciken_odemeler: number;
  geciken_toplam_tutar: number;
}

export interface VadeTakvimiItem {
  sozlesme_id: number;
  sozlesme_no: string;
  ogrenci_adi: string;
  taksit_no: number;
  vade_tarihi: string;
  tutar: number;
  kalan_tutar: number;
}

export interface SonIslem {
  id: number;
  tip: string;
  durum: string;
  ogrenci_adi: string;
  sozlesme_no: string;
  tutar: number;
  tarih: string | null;
  aciklama: string;
}

export interface TahsilatOrani {
  genel_oran: number;
  bu_ay_oran: number;
  toplam_odenen: number;
  toplam_borc: number;
}

export interface AylikGelirGider {
  ay: string;
  ay_label: string;
  gelir: number;
  gider: number;
}

export interface TahsilatPerformans {
  ay: string;
  ay_label: string;
  toplam_tahsilat: number;
  tahsilat_adedi: number;
  beklenen: number;
  oran: number;
}

export interface GecikenOdeme {
  sozlesme_id: number;
  sozlesme_no: string;
  ogrenci_adi: string;
  taksit_no: number;
  vade_tarihi: string;
  tutar: number;
  kalan_tutar: number;
  gecikme_gun: number;
}

export interface DashboardData {
  ozet_kartlar: OzetKartlar;
  widgetlar: Widgetlar;
  vade_takvimi: VadeTakvimiItem[];
  son_islemler: SonIslem[];
  tahsilat_orani: TahsilatOrani;
  aylik_gelir_gider: AylikGelirGider[];
  tahsilat_performans: TahsilatPerformans[];
  geciken_odemeler_listesi: GecikenOdeme[];
}

// ─── Overview Types (Dashboard v2) ──────────────────────────────

export interface OverviewOzetKartlar {
  bugun_alinan: number;
  bugun_gider: number;
  bugun_net: number;
  bu_ay_alinan: number;
  bu_ay_gider: number;
  bu_ay_net: number;
  kasa_toplam: number;
  banka_toplam: number;
}

export interface OverviewTransaction {
  id: number;
  kaynak: string;
  kaynak_label: string;
  kisi_adi: string;
  tutar: number;
  odeme_yontemi: string | null;
  odeme_yontemi_tipi: string | null;
  tarih: string;
  kayit_zamani: string | null;
  vade_tarihi: string | null;
  aciklama: string;
  sozlesme_id: number | null;
  sozlesme_no: string | null;
  gelir_id: number | null;
  gider_id?: number | null;
  cari_hesap_id: number | null;
  vade_durumu?: string;
}

export interface OverviewGecikenItem {
  taksit_id: number;
  sozlesme_id: number;
  sozlesme_no: string;
  ogrenci_id: number | null;
  ogrenci_adi: string;
  veli_adi: string | null;
  veli_telefon: string | null;
  taksit_no: number;
  vade_tarihi: string;
  kalan_tutar: number;
  gecikme_gun: number;
}

export interface OverviewGecikenOzet {
  toplam_taksit_sayisi: number;
  toplam_kalan_tutar: number;
  ortalama_gecikme_gun: number;
}

export interface OverviewGiderItem {
  id: number;
  gider_kaydi_id: number;
  kayit_tipi?: "kayit" | "odeme";
  cari_hesap_adi: string;
  kategori_adi?: string;
  fatura_no: string;
  tutar: number;
  net_tutar?: number;
  odenen_toplam?: number;
  kalan_tutar?: number;
  odeme_tarihi: string;
  vade_tarihi?: string | null;
  odeme_yontemi_adi: string | null;
  mali_hesap_adi: string | null;
  aciklama: string;
  kayit_zamani: string | null;
  durum?: string;
  durum_label?: string;
}

export interface OverviewMaliHesap {
  id: number;
  mali_hesap_id: number;
  mali_hesap_ad: string;
  mali_hesap_tip: string;
  donem_basi_bakiye: number;
  toplam_gelir: number;
  toplam_gider: number;
  donem_sonu_bakiye: number;
}

export interface OverviewDagilimItem {
  yontem?: string;
  yontem_tipi?: string;
  kategori_id?: number;
  kategori_adi?: string;
  kaynak?: string;
  kaynak_label?: string;
  toplam: number;
  adet: number;
  oran: number;
}

export interface OverviewGunlukSeri {
  tarih: string;
  gelir: number;
  gider: number;
  net: number;
}

export interface DashboardOverview {
  tarih: string;
  ozet_kartlar: OverviewOzetKartlar;
  bugunku_islemler: OverviewTransaction[];
  yaklasan_odemeler: OverviewTransaction[];
  geciken_odemeler: OverviewGecikenItem[];
  geciken_ozet: OverviewGecikenOzet;
  son_tahsilatlar: OverviewTransaction[];
  son_giderler: OverviewGiderItem[];
  kasa_hesaplari: OverviewMaliHesap[];
  banka_hesaplari: OverviewMaliHesap[];
  tahsilat_dagilimi: OverviewDagilimItem[];
  gelir_kaynak_kirilimi: OverviewDagilimItem[];
  gider_kategori_dagilimi: OverviewDagilimItem[];
  gunluk_gelir_gider_net: OverviewGunlukSeri[];
}

// ─── Service ────────────────────────────────────────────────────

function buildParams(params: {
  kurum_id: number;
  sube_id?: number;
  egitim_yili_id?: number;
  referans_tarih?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("kurum_id", String(params.kurum_id));
  if (params.sube_id) qs.set("sube_id", String(params.sube_id));
  if (params.egitim_yili_id) qs.set("egitim_yili_id", String(params.egitim_yili_id));
  qs.set("referans_tarih", params.referans_tarih ?? todayIsoLocal());
  return qs;
}

export const dashboardService = {
  getData(params: { kurum_id: number; sube_id?: number; egitim_yili_id?: number }): Promise<DashboardData> {
    const qs = buildParams(params);
    return finansRequest<DashboardData>(`/dashboard/?${qs}`);
  },

  getOverview(params: { kurum_id: number; sube_id?: number; egitim_yili_id?: number }): Promise<DashboardOverview> {
    const qs = buildParams(params);
    return finansRequest<DashboardOverview>(`/dashboard/overview/?${qs}`);
  },
};
