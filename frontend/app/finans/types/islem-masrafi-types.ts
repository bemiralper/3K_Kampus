/** İşlem masrafı (banka kesintisi) türleri — backend KesintiTuru ile eşleşir */

export type KesintiTuru =
  | "havale_masrafi"
  | "eft_masrafi"
  | "fast_ucreti"
  | "pos_komisyonu"
  | "sanal_pos_komisyonu"
  | "online_odeme_komisyonu"
  | "hesap_isletim_ucreti"
  | "doviz_cevrim_masrafi"
  | "diger_banka_masraflari";

export const KESINTI_TURLERI: { value: KesintiTuru; label: string }[] = [
  { value: "havale_masrafi", label: "Havale Masrafı" },
  { value: "eft_masrafi", label: "EFT Masrafı" },
  { value: "fast_ucreti", label: "FAST Ücreti" },
  { value: "pos_komisyonu", label: "POS Komisyonu" },
  { value: "sanal_pos_komisyonu", label: "Sanal POS Komisyonu" },
  { value: "online_odeme_komisyonu", label: "Online Ödeme Komisyonu" },
  { value: "hesap_isletim_ucreti", label: "Hesap İşletim Ücreti" },
  { value: "doviz_cevrim_masrafi", label: "Döviz Çevrim Masrafı" },
  { value: "diger_banka_masraflari", label: "Diğer Banka Masrafları" },
];

export interface IslemMasrafiFormState {
  kesinti_turu: KesintiTuru | "";
  kesinti_tutar: string;
  kesinti_aciklama: string;
}

export const EMPTY_ISLEM_MASRAFI: IslemMasrafiFormState = {
  kesinti_turu: "",
  kesinti_tutar: "",
  kesinti_aciklama: "",
};

export interface IslemMasrafiPayload {
  kesinti_turu?: KesintiTuru;
  kesinti_tutar?: number;
  kesinti_aciklama?: string;
}

/** Form state'ten API payload'ına dönüştürür; boşsa undefined döner */
export function buildIslemMasrafiPayload(
  form: IslemMasrafiFormState
): IslemMasrafiPayload | undefined {
  const tutar = Number(form.kesinti_tutar);
  if (!form.kesinti_turu || !tutar || tutar <= 0) return undefined;
  return {
    kesinti_turu: form.kesinti_turu,
    kesinti_tutar: tutar,
    kesinti_aciklama: form.kesinti_aciklama.trim() || undefined,
  };
}
