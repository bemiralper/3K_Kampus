/** 3K Kampüs ticari / yasal şirket bilgileri (footer + iletişim). */
export const DEFAULT_COMPANY_INFO = {
  ticari_unvan: 'ÖZGÜN SINAV ÖĞRETİM EĞİTİM ANONİM ŞİRKETİ',
  mersis_no: '0692037476300018',
  vergi_no: '6920374763',
  ticaret_sicil_no: '14305',
  adres: 'LALAPAŞA MAH. MENDERES CAD. ERTURAN İNŞAAT NO: 23 YAKUTİYE/ ERZURUM',
  telefon: '0442 233 1234',
} as const;

export type CompanyInfoSource = {
  ticari_unvan?: string | null;
  mersis_no?: string | null;
  vergi_no?: string | null;
  ticaret_sicil_no?: string | null;
  adres?: string | null;
  telefon?: string | null;
};

export function resolveCompanyInfo(source?: CompanyInfoSource | null) {
  return {
    ticari_unvan: source?.ticari_unvan?.trim() || DEFAULT_COMPANY_INFO.ticari_unvan,
    mersis_no: source?.mersis_no?.trim() || DEFAULT_COMPANY_INFO.mersis_no,
    vergi_no: source?.vergi_no?.trim() || DEFAULT_COMPANY_INFO.vergi_no,
    ticaret_sicil_no: source?.ticaret_sicil_no?.trim() || DEFAULT_COMPANY_INFO.ticaret_sicil_no,
    adres: source?.adres?.trim() || DEFAULT_COMPANY_INFO.adres,
    telefon: source?.telefon?.trim() || DEFAULT_COMPANY_INFO.telefon,
  };
}
