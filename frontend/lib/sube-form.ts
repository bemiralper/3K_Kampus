export type SubeFormState = {
  kurum_id: string;
  ad: string;
  kod: string;
  resmi_ad: string;
  web_adresi: string;
  eposta: string;
  adres: string;
  telefon: string;
  ticari_unvan: string;
  vergi_dairesi: string;
  vergi_no: string;
  ticaret_sicil_no: string;
  kurs_muduru: string;
  kurs_muduru_telefon: string;
  aktif_mi: boolean;
};

export const DEFAULT_SUBE_FORM: SubeFormState = {
  kurum_id: '',
  ad: '',
  kod: '',
  resmi_ad: '',
  web_adresi: '',
  eposta: '',
  adres: '',
  telefon: '',
  ticari_unvan: 'Özgün Sınav Öğretim Eğitim A.Ş.',
  vergi_dairesi: '',
  vergi_no: '',
  ticaret_sicil_no: '',
  kurs_muduru: '',
  kurs_muduru_telefon: '',
  aktif_mi: true,
};

export type SubeProfile = SubeFormState & {
  id?: number;
  kurum?: { id: number; ad: string };
};

export function subeFormFromApi(item: Partial<SubeProfile>): SubeFormState {
  return {
    kurum_id: String(item.kurum_id ?? item.kurum?.id ?? ''),
    ad: item.ad || '',
    kod: item.kod || '',
    resmi_ad: item.resmi_ad || '',
    web_adresi: item.web_adresi || '',
    eposta: item.eposta || '',
    adres: item.adres || '',
    telefon: item.telefon || '',
    ticari_unvan: item.ticari_unvan || DEFAULT_SUBE_FORM.ticari_unvan,
    vergi_dairesi: item.vergi_dairesi || '',
    vergi_no: item.vergi_no || '',
    ticaret_sicil_no: item.ticaret_sicil_no || '',
    kurs_muduru: item.kurs_muduru || '',
    kurs_muduru_telefon: item.kurs_muduru_telefon || '',
    aktif_mi: item.aktif_mi ?? true,
  };
}

export function subeFormToPayload(form: SubeFormState) {
  return {
    ...form,
    kurum_id: parseInt(form.kurum_id, 10) || null,
  };
}
