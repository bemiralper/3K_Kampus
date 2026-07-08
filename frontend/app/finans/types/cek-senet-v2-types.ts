export type CekSenetYon = "alinan" | "verilen";
export type CekSenetArac = "cek" | "senet";

export interface CekSenetV2Kayit {
  id: number;
  kurum_id?: number;
  sube_id?: number | null;
  yon: CekSenetYon;
  yon_label: string;
  arac_tipi: CekSenetArac;
  arac_tipi_label: string;
  cari_hesap_id?: number | null;
  cari_label: string;
  odeme_yontemi_id?: number | null;
  odeme_yontemi_adi: string;
  tutar: number;
  aciklama: string;
  olusturma_tarihi: string | null;
  cek_senet_no: string;
  seri_no: string;
  banka_adi: string;
  sube_adi: string;
  hesap_no: string;
  keside_eden: string;
  keside_tarihi: string | null;
  vade_tarihi: string | null;
  durum: string;
  durum_label: string;
  aktif_mi: boolean;
  gecikme_gun: number;
  gun_kalan: number | null;
  ciro_edilen_cari_id?: number | null;
  ciro_edilen_cari_label: string;
  ciro_tarihi: string | null;
  protesto_tarihi: string | null;
  iade_tarihi: string | null;
  tahsil_tarihi: string | null;
  durum_aciklamasi: string;
  taksit_id: number | null;
  gider_taksit_id: number | null;
  tahsilat_id: number | null;
  tahsilat_mali_hesap_id?: number | null;
  sozlesme_no: string;
  ogrenci_adi: string;
  kaynak: string;
  created_at: string | null;
  updated_at: string | null;
  allowed_transitions?: { durum: string; label: string }[];
  timeline?: CekSenetV2Log[];
  dosyalar?: CekSenetV2Dosya[];
}

export interface CekSenetV2Log {
  id: number;
  eylem: string;
  onceki_durum: string;
  onceki_durum_label: string;
  yeni_durum: string;
  yeni_durum_label: string;
  tutar: number | null;
  aciklama: string;
  kullanici_adi: string;
  created_at: string | null;
}

export interface CekSenetV2Dosya {
  id: number;
  dosya_adi: string;
  dosya_turu: string;
  dosya_turu_label: string;
  dosya_url: string | null;
  dosya_boyutu: number;
  dosya_boyutu_fmt: string;
  aciklama: string;
  yukleyen_adi: string;
  created_at: string | null;
}

export interface CekSenetV2ListResponse {
  count: number;
  page: number;
  page_size: number;
  results: CekSenetV2Kayit[];
}

export interface CekSenetV2KpiDeger {
  adet: number;
  tutar: number;
}

export interface CekSenetV2Dashboard {
  kpi: {
    toplam_cek: CekSenetV2KpiDeger;
    toplam_senet: CekSenetV2KpiDeger;
    tahsil_bekleyen: CekSenetV2KpiDeger;
    odeme_bekleyen: CekSenetV2KpiDeger;
    yaklasan_vadeler: CekSenetV2KpiDeger;
    gecikenler: CekSenetV2KpiDeger;
    toplam_risk: CekSenetV2KpiDeger;
    toplam_portfoy: CekSenetV2KpiDeger;
  };
  durum_dagilim: { durum: string; durum_label: string; adet: number; tutar: number }[];
  aylik_vade: { ay: string; ay_label: string; alinan: number; verilen: number }[];
}

/** Durum -> renk / etiket meta (tüm modülde tutarlı). */
export interface DurumMeta {
  label: string;
  renk: string;
  bg: string;
  nokta: string;
}

export const DURUM_META: Record<string, DurumMeta> = {
  bekliyor: { label: "Bekliyor", renk: "#6b7280", bg: "#f3f4f6", nokta: "⚪" },
  portfoyde: { label: "Portföyde", renk: "#047857", bg: "#d1fae5", nokta: "🟢" },
  tahsilde: { label: "Tahsilde", renk: "#b45309", bg: "#fef3c7", nokta: "🟡" },
  hazirlandi: { label: "Hazırlandı", renk: "#6b7280", bg: "#f3f4f6", nokta: "⚪" },
  verildi: { label: "Bankada / Verildi", renk: "#1d4ed8", bg: "#dbeafe", nokta: "🔵" },
  tahsil_edildi: { label: "Tahsil Edildi", renk: "#047857", bg: "#d1fae5", nokta: "🟢" },
  odendi: { label: "Ödendi", renk: "#047857", bg: "#d1fae5", nokta: "🟢" },
  ciro: { label: "Ciro Edildi", renk: "#7c3aed", bg: "#ede9fe", nokta: "🟣" },
  iade: { label: "İade", renk: "#c2410c", bg: "#ffedd5", nokta: "🟠" },
  protesto: { label: "Protestolu", renk: "#b91c1c", bg: "#fee2e2", nokta: "🔴" },
  karsiliksiz: { label: "Karşılıksız", renk: "#b91c1c", bg: "#fee2e2", nokta: "🔴" },
  iptal: { label: "İptal", renk: "#374151", bg: "#e5e7eb", nokta: "⚫" },
  tahsil: { label: "Tahsil Edildi", renk: "#047857", bg: "#d1fae5", nokta: "🟢" },
};

export function durumMeta(durum: string): DurumMeta {
  return DURUM_META[durum] || { label: durum, renk: "#6b7280", bg: "#f3f4f6", nokta: "⚪" };
}

export interface SekmeTanim {
  key: string;
  label: string;
  aciklama: string;
}

export const SEKMELER: SekmeTanim[] = [
  { key: "gelen-cekler", label: "Gelen Çekler", aciklama: "Müşteri/öğrenciden alınan çekler" },
  { key: "verilen-cekler", label: "Verilen Çekler", aciklama: "Tedarikçilere verilen çekler" },
  { key: "gelen-senetler", label: "Gelen Senetler", aciklama: "Alınan senetler" },
  { key: "verilen-senetler", label: "Verilen Senetler", aciklama: "Verilen senetler" },
  { key: "portfoy", label: "Portföy", aciklama: "Elde bulunan tüm aktif çek/senetler" },
  { key: "tahsil-edilenler", label: "Tahsil Edilenler", aciklama: "Tahsil edilmiş çek/senetler" },
  { key: "odenenler", label: "Ödenenler", aciklama: "Ödenmiş verilen çek/senetler" },
  { key: "ciro-edilenler", label: "Ciro Edilenler", aciklama: "Başka cariye devredilenler" },
  { key: "iade-edilenler", label: "İade Edilenler", aciklama: "Kaynağına iade edilenler" },
  { key: "protestolular", label: "Protestolular", aciklama: "Protestolu / karşılıksız" },
  { key: "iptaller", label: "İptaller", aciklama: "İptal edilen kayıtlar" },
];
