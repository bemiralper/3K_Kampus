/** Ödeme yöntemi tip kodu — API bazen `kod`, bazen `tip` döner. */
export function odemeYontemiTip(y?: { tip?: string; kod?: string } | null): string {
  if (!y) return "";
  return y.tip || y.kod || "";
}

export function isCekSenetYontem(y?: { tip?: string; kod?: string } | null): boolean {
  const t = odemeYontemiTip(y);
  return t === "cek" || t === "senet";
}

export function isCekSenetTip(tip?: string | null): boolean {
  return tip === "cek" || tip === "senet";
}

/** Taksit plan satırlarından backend `taksit_odeme_yontemleri` listesi üretir. */
export function buildTaksitOdemeYontemleri(
  rows: { odeme_yontemi_id?: number | "" }[],
): { taksit_no: number; odeme_yontemi_id: number }[] {
  return rows
    .map((r, idx) => ({
      taksit_no: idx + 1,
      odeme_yontemi_id: r.odeme_yontemi_id ? Number(r.odeme_yontemi_id) : 0,
    }))
    .filter((x) => x.odeme_yontemi_id > 0);
}
