import { tipLabel } from "@/app/finans/types/payment-method-types";

export type OdemeYontemiOption = {
  id: number;
  ad: string;
  tip?: string;
  mali_hesap_id?: number | null;
  mali_hesap_ad?: string | null;
};

/** Ödeme yöntemi seçenek metni — aynı isimli POS vb. için mali hesap (banka) adını ekler. */
export function formatOdemeYontemiLabel(
  o: OdemeYontemiOption,
  opts?: { hideMaliHesap?: boolean },
): string {
  const name = (o.ad || "").trim() || tipLabel(o.tip || "");
  if (!opts?.hideMaliHesap && o.mali_hesap_ad) {
    return `${name} (${o.mali_hesap_ad})`;
  }
  return name;
}
