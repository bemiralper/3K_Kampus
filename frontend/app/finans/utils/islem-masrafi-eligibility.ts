/** İşlem masrafı alanlarının gösterilip gösterilmeyeceğini belirler */

const MASRAF_ODEME_TIPS = new Set(["pos", "havale_eft", "online"]);
const MASRAF_HESAP_TIPS = new Set(["banka", "pos", "sanal_pos"]);

export function islemMasrafiGoster(
  odemeYontemiTip?: string | null,
  maliHesapTip?: string | null
): boolean {
  if (odemeYontemiTip && MASRAF_ODEME_TIPS.has(odemeYontemiTip)) return true;
  if (maliHesapTip && MASRAF_HESAP_TIPS.has(maliHesapTip)) return true;
  return false;
}
