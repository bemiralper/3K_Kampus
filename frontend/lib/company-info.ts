/** 3K Kampüs ticari / yasal şirket bilgileri (footer + iletişim + yasal metinler). */
export const DEFAULT_COMPANY_INFO = {
  ticari_unvan: 'ÖZGÜN SINAV ÖĞRETİM EĞİTİM ANONİM ŞİRKETİ',
  mersis_no: '0692037476300018',
  vergi_no: '6920374763',
  ticaret_sicil_no: '14305',
  adres: 'LALAPAŞA MAH. MENDERES CAD. ERTURAN İNŞAAT NO: 23 YAKUTİYE/ ERZURUM',
  telefon: '0442 233 1234',
  eposta: 'info@3kkampus.com',
  marka: '3K Kampüs',
} as const;

export type CompanyInfoSource = {
  ticari_unvan?: string | null;
  mersis_no?: string | null;
  vergi_no?: string | null;
  ticaret_sicil_no?: string | null;
  adres?: string | null;
  telefon?: string | null;
  eposta?: string | null;
};

export function resolveCompanyInfo(source?: CompanyInfoSource | null) {
  return {
    ticari_unvan: source?.ticari_unvan?.trim() || DEFAULT_COMPANY_INFO.ticari_unvan,
    mersis_no: source?.mersis_no?.trim() || DEFAULT_COMPANY_INFO.mersis_no,
    vergi_no: source?.vergi_no?.trim() || DEFAULT_COMPANY_INFO.vergi_no,
    ticaret_sicil_no: source?.ticaret_sicil_no?.trim() || DEFAULT_COMPANY_INFO.ticaret_sicil_no,
    adres: source?.adres?.trim() || DEFAULT_COMPANY_INFO.adres,
    telefon: source?.telefon?.trim() || DEFAULT_COMPANY_INFO.telefon,
    eposta: source?.eposta?.trim() || DEFAULT_COMPANY_INFO.eposta,
    marka: DEFAULT_COMPANY_INFO.marka,
  };
}

/** KVKK / gizlilik metinlerinde ortak veri sorumlusu blokları */
export function companyVeriSorumlusuParagraphs(): string[] {
  const c = DEFAULT_COMPANY_INFO;
  return [
    `6698 sayılı KVKK kapsamında kişisel verileriniz, veri sorumlusu sıfatıyla ${c.ticari_unvan} ("${c.marka}") tarafından işlenmektedir.`,
    `${c.marka}, ${c.ticari_unvan} markasıdır.`,
    `Ticari unvan: ${c.ticari_unvan}`,
    `MERSİS No: ${c.mersis_no} · Vergi No: ${c.vergi_no} · Ticaret Sicil No: ${c.ticaret_sicil_no}`,
    `Açık adres: ${c.adres}`,
    `Telefon: ${c.telefon} · E-posta: ${c.eposta}`,
    'Güncel iletişim kanalları internet sitemizdeki İletişim sayfasında da yayımlanmaktadır.',
  ];
}

export function companyIletisimParagraphs(purpose: string): string[] {
  const c = DEFAULT_COMPANY_INFO;
  return [
    `${purpose} ${c.ticari_unvan} (${c.marka}) ile aşağıdaki kanallardan iletişime geçebilirsiniz.`,
    `Adres: ${c.adres}`,
    `Telefon: ${c.telefon}`,
    `E-posta: ${c.eposta}`,
    'Veri silme ve KVKK başvuruları için ayrıca https://www.3kkampus.com/sayfa/veri-silme adresindeki başvuru sürecini kullanabilirsiniz.',
  ];
}
