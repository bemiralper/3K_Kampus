import type { CariHesapListItem, CariHesapRaporItem } from "../../types/cari-hesap-types";

export type CariListTotals = {
  toplam_cari: number;
  toplam_borc: number;
  toplam_alacak: number;
  net_bakiye: number;
  toplam_satis: number;
  toplam_alis: number;
  toplam_tahsilat: number;
  toplam_odeme: number;
  toplam_iade: number;
  toplam_mahsup: number;
  borclu_cari: number;
  alacakli_cari: number;
  sifir_bakiye_cari: number;
};

type TotalsRow = Pick<
  CariHesapListItem,
  | "toplam_borc"
  | "toplam_alacak"
  | "bakiye_durumu"
  | "toplam_satis"
  | "toplam_alis"
  | "toplam_tahsilat"
  | "toplam_odeme"
  | "toplam_iade"
  | "toplam_mahsup"
>;

function accumulateTotals(items: TotalsRow[]): CariListTotals {
  const totals: CariListTotals = {
    toplam_cari: items.length,
    toplam_borc: 0,
    toplam_alacak: 0,
    net_bakiye: 0,
    toplam_satis: 0,
    toplam_alis: 0,
    toplam_tahsilat: 0,
    toplam_odeme: 0,
    toplam_iade: 0,
    toplam_mahsup: 0,
    borclu_cari: 0,
    alacakli_cari: 0,
    sifir_bakiye_cari: 0,
  };

  for (const row of items) {
    totals.toplam_borc += Number(row.toplam_borc || 0);
    totals.toplam_alacak += Number(row.toplam_alacak || 0);
    totals.toplam_satis += Number(row.toplam_satis || 0);
    totals.toplam_alis += Number(row.toplam_alis || 0);
    totals.toplam_tahsilat += Number(row.toplam_tahsilat || 0);
    totals.toplam_odeme += Number(row.toplam_odeme || 0);
    totals.toplam_iade += Number(row.toplam_iade || 0);
    totals.toplam_mahsup += Number(row.toplam_mahsup || 0);
    if (row.bakiye_durumu === "borclu") totals.borclu_cari += 1;
    else if (row.bakiye_durumu === "alacakli") totals.alacakli_cari += 1;
    else totals.sifir_bakiye_cari += 1;
  }
  totals.net_bakiye = totals.toplam_borc - totals.toplam_alacak;
  return totals;
}

export function computeListTotalsFromItems(items: CariHesapListItem[]): CariListTotals {
  return accumulateTotals(items);
}

export function computeRaporTotalsExtended(items: CariHesapRaporItem[]): CariListTotals {
  return accumulateTotals(items);
}

export function fmtCariMoney(v: number) {
  return Number(v || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
