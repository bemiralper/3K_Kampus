// ─── Gelir & Gider ekran farklılıkları için yapılandırma ────────
import { GGListItem, GGModul } from "./gg-v2-types";

export interface CardDef {
  key: string;
  label: string;
  tone?: "success" | "danger" | "warning" | "neutral";
  tl?: boolean;
}

export interface ModulConfig {
  modul: GGModul;
  baslik: string;
  altBaslik: string;
  renk: string;
  cariLabel: string;
  kategoriLabel: string;
  kategoriFilterKey: "gelir_kategorisi_id" | "gider_kategorisi_id";
  kategoriFormKey: "gelir_kategorisi_id" | "gider_kategorisi_id";
  ikinciTanimLabel: string;
  ikinciTanimFilterKey: "gelir_kaynagi_id" | "maliyet_merkezi_id";
  ikinciTanimFormKey: "gelir_kaynagi_id" | "maliyet_merkezi_id";
  ikinciTanimDropdownKey: "gelir_kaynaklari" | "maliyet_merkezleri";
  durumLabel: string;
  odenenLabel: string;
  odenenField: "tahsil_edilen" | "odenen_toplam";
  durumFilterKey: "tahsil_durumu" | "odeme_durumu";
  kartlar: CardDef[];
  enBuyukBaslik: string;
}

export const GELIR_CONFIG: ModulConfig = {
  modul: "gelir",
  baslik: "Gelir İşlemleri",
  altBaslik: "Gelir kayıtları, tahsilat takibi ve gelir analizi",
  renk: "#059669",
  cariLabel: "Cari Hesap (Müşteri)",
  kategoriLabel: "Gelir Kategorisi",
  kategoriFilterKey: "gelir_kategorisi_id",
  kategoriFormKey: "gelir_kategorisi_id",
  ikinciTanimLabel: "Gelir Kaynağı",
  ikinciTanimFilterKey: "gelir_kaynagi_id",
  ikinciTanimFormKey: "gelir_kaynagi_id",
  ikinciTanimDropdownKey: "gelir_kaynaklari",
  durumLabel: "Tahsil Durumu",
  odenenLabel: "Tahsil Edilen",
  odenenField: "tahsil_edilen",
  durumFilterKey: "tahsil_durumu",
  enBuyukBaslik: "En Büyük Gelir Kalemleri",
  kartlar: [
    { key: "bu_ay_gelir", label: "Bu Ay Gelir", tone: "success", tl: true },
    { key: "bugun_gelir", label: "Bugünkü Gelir", tone: "success", tl: true },
    { key: "bekleyen_tahsilat", label: "Bekleyen Tahsilatlar", tone: "warning", tl: true },
    { key: "tahsil_edilen", label: "Tahsil Edilen", tone: "success", tl: true },
    { key: "ortalama_gelir", label: "Ortalama Gelir", tone: "neutral", tl: true },
    { key: "toplam_gelir", label: "Toplam Gelir", tone: "neutral", tl: true },
  ],
};

export const GIDER_CONFIG: ModulConfig = {
  modul: "gider",
  baslik: "Gider İşlemleri",
  altBaslik: "Gider kayıtları, ödeme takibi ve gider analizi",
  renk: "#dc2626",
  cariLabel: "Cari Hesap (Tedarikçi)",
  kategoriLabel: "Gider Kategorisi",
  kategoriFilterKey: "gider_kategorisi_id",
  kategoriFormKey: "gider_kategorisi_id",
  ikinciTanimLabel: "Maliyet / Gider Merkezi",
  ikinciTanimFilterKey: "maliyet_merkezi_id",
  ikinciTanimFormKey: "maliyet_merkezi_id",
  ikinciTanimDropdownKey: "maliyet_merkezleri",
  durumLabel: "Ödeme Durumu",
  odenenLabel: "Ödenen",
  odenenField: "odenen_toplam",
  durumFilterKey: "odeme_durumu",
  enBuyukBaslik: "En Büyük Gider Kalemleri",
  kartlar: [
    { key: "bu_ay_gider", label: "Bu Ay Gider", tone: "danger", tl: true },
    { key: "bugun_gider", label: "Bugünkü Gider", tone: "danger", tl: true },
    { key: "bekleyen_odeme", label: "Bekleyen Ödemeler", tone: "warning", tl: true },
    { key: "odenen_tutar", label: "Ödenen Tutar", tone: "success", tl: true },
    { key: "ortalama_gider", label: "Ortalama Gider", tone: "neutral", tl: true },
    { key: "toplam_gider", label: "Toplam Gider", tone: "neutral", tl: true },
  ],
};

export function getConfig(modul: GGModul): ModulConfig {
  return modul === "gider" ? GIDER_CONFIG : GELIR_CONFIG;
}

export function kategoriOf(cfg: ModulConfig, row: GGListItem) {
  return cfg.modul === "gider" ? row.gider_kategorisi : row.gelir_kategorisi;
}

export function ikinciTanimOf(cfg: ModulConfig, row: GGListItem) {
  return cfg.modul === "gider" ? row.maliyet_merkezi : row.gelir_kaynagi;
}
