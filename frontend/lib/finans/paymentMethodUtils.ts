/**
 * Ödeme yöntemi seçim kuralları (şube finans modeli)
 * ─────────────────────────────────────────────────
 * İki ayrı kullanım vardır; karıştırılmamalı:
 *
 * 1) PLAN (sözleşme / taksit kanalı / form «Ödeme Şekli» etiketi / filtre)
 *    → Tip başına tek kayıt (Nakit, Havale, POS, Online + çek/senet).
 *    → API: GET /odeme-yontemleri/dropdown/?kurum_id=&sube_id=  (mali_hesap_id YOK)
 *    → Backend: dedupe_odeme_yontemleri_for_plan
 *
 * 2) OPERASYON (tahsilat, gelir tahsilat, gider ödeme, virman, kasa hareketi)
 *    → Önce mali hesap seçilir; liste SADECE o hesaba bağlı yöntemler (+ kurum çek/senet).
 *    → API: GET /odeme-yontemleri/dropdown/?kurum_id=&mali_hesap_id=&sube_id=
 *    → Backend: filter_odeme_yontemleri_for_mali_hesap
 *    → Hook: useOdemeYontemleriForMaliHesap
 *
 * Tanımlar ekranı (CRUD) ham liste kullanır; buraya dokunulmaz.
 */

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
