import type { GiderOdeme, GiderTaksit } from "../types/gider-types";

const money = (n: number) =>
  Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const GECIKEN_EXPORT_COLUMNS = [
  { key: "cari", label: "Tedarikçi / Fatura" },
  { key: "taksit_no", label: "Taksit" },
  { key: "vade_tarihi", label: "Vade Tarihi" },
  { key: "geciken_gun", label: "Geciken Gün" },
  { key: "tutar", label: "Tutar (₺)" },
  { key: "odenen", label: "Ödenen (₺)" },
  { key: "kalan", label: "Kalan (₺)" },
] as const;

export const YAKLASAN_EXPORT_COLUMNS = [
  { key: "cari", label: "Tedarikçi / Fatura" },
  { key: "taksit_no", label: "Taksit" },
  { key: "vade_tarihi", label: "Vade Tarihi" },
  { key: "kalan_gun", label: "Kalan Gün" },
  { key: "tutar", label: "Tutar (₺)" },
  { key: "kalan", label: "Kalan (₺)" },
] as const;

export const SON_ODEME_EXPORT_COLUMNS = [
  { key: "odeme_tarihi", label: "Tarih" },
  { key: "cari", label: "Tedarikçi" },
  { key: "fatura_no", label: "Fatura No" },
  { key: "yontem", label: "Yöntem" },
  { key: "hesap", label: "Hesap" },
  { key: "tutar", label: "Tutar (₺)" },
  { key: "durum", label: "Durum" },
] as const;

export function buildGecikenExportRows(items: GiderTaksit[]): Record<string, unknown>[] {
  const bugun = new Date();
  return items
    .filter((t) => Number(t.kalan_tutar) > 0)
    .map((t) => {
      const vade = new Date(t.vade_tarihi);
      const gecenGun = Math.floor((bugun.getTime() - vade.getTime()) / (1000 * 60 * 60 * 24));
      return {
        cari: `${t.cari_hesap_adi || "—"} / ${t.fatura_no || `Gider #${t.gider_kaydi_id}`}`,
        taksit_no: t.taksit_no,
        vade_tarihi: t.vade_tarihi,
        geciken_gun: gecenGun,
        tutar: money(Number(t.tutar)),
        odenen: money(Number(t.odenen_tutar)),
        kalan: money(Number(t.kalan_tutar)),
      };
    });
}

export function buildYaklasanExportRows(items: GiderTaksit[]): Record<string, unknown>[] {
  const bugun = new Date();
  return items
    .filter((t) => Number(t.kalan_tutar) > 0)
    .map((t) => {
      const vade = new Date(t.vade_tarihi);
      const kalanGun = Math.max(
        0,
        Math.ceil((vade.getTime() - bugun.getTime()) / (1000 * 60 * 60 * 24)),
      );
      return {
        cari: `${t.cari_hesap_adi || "—"} / ${t.fatura_no ? `#${t.fatura_no}` : `GK-${t.gider_kaydi_id}`}`,
        taksit_no: t.taksit_no,
        vade_tarihi: t.vade_tarihi,
        kalan_gun: kalanGun,
        tutar: money(Number(t.tutar)),
        kalan: money(Number(t.kalan_tutar)),
      };
    });
}

export function buildSonOdemeExportRows(items: GiderOdeme[]): Record<string, unknown>[] {
  return items.map((o) => ({
    odeme_tarihi: o.odeme_tarihi,
    cari: o.cari_hesap_adi || "—",
    fatura_no: o.fatura_no || "—",
    yontem: o.odeme_yontemi_adi || "—",
    hesap: o.mali_hesap_adi || "—",
    tutar: money(Number(o.tutar)),
    durum: o.durum_display || o.durum || "—",
  }));
}
