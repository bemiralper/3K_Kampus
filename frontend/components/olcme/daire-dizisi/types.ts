export const DAIRE_SURUM = 'daire-dizisi-v1' as const;

export type DaireTur =
  | 'daire_dizisi'
  | 'sayisal_kodlama'
  | 'tek_secim'
  | 'coklu_secim'
  | 'kitapcik_turu'
  | 'ogrenci_numarasi'
  | 'tc_kimlik'
  | 'sinav_numarasi'
  | 'cevap_bloku'
  | 'metin';

export type KodlamaYonu = 'satir_karakter' | 'sutun_karakter';

export interface DaireKalibrasyon {
  ofset_x_mm: number;
  ofset_y_mm: number;
  olcek: number;
  olcek_y: number;
}

export interface SolIz {
  id?: string;
  kenar?: 'sol' | 'sag';
  x_mm: number;
  genislik_mm: number;
  y0_mm: number;
  aralik_mm: number;
  adet: number;
  satirlar_mm?: number[];
}

export type KutuYonu = 'ust' | 'alt' | 'sol' | 'sag';

export interface MetinKutusu {
  aktif: boolean;
  yon: KutuYonu;
  olcu_mm: number;
  bosluk_mm: number;
  punto: number;
  hizalama: 'sol' | 'orta' | 'sag';
  karakter_araligi: number;
  veri_kaynagi: string;
  sabit_deger: string;
}

export interface KutuDilimi {
  x_mm: number;
  y_mm: number;
  genislik_mm: number;
  yukseklik_mm: number;
  metin: string;
}

export interface DaireAlan {
  id: string;
  ad: string;
  tur: DaireTur;
  veri_kaynagi: string;
  sabit_deger: string;
  aktif: boolean;
  x_mm: number;
  y_mm: number;
  satir: number;
  sutun: number;
  cap_mm: number;
  isaret_cap_mm: number;
  aralik_x_mm: number;
  aralik_y_mm: number;
  iz_satir?: number | null;
  iz_id?: string;
  iz_satirlar?: number[];
  sayfa_no?: number;
  cevap_bloku?: {
    bolum_id: string;
    soru_baslangic: number;
    soru_sayisi: number;
    secenekler: string[];
    fiziksel_sira: number[];
    coklu_isaret: boolean;
  } | null;
  kodlama_yonu: KodlamaYonu;
  kod_hizasi: 'sol' | 'sag';
  etiketler: string[];
  punto: number;
  hizalama: 'sol' | 'orta' | 'sag';
  genislik_mm: number;
  yukseklik_mm: number;
  karakter_araligi: number;
  metin_kutusu: MetinKutusu | null;
}

export interface FmtKaydi {
  dosya: string;
  satir: number;
  sutun: number;
  x0_mm: number;
  y0_mm: number;
  aralik_x_mm: number;
  aralik_y_mm: number;
  cap_mm: number;
  bagli?: string;
  metin?: string;
}

export interface FmtSonucu {
  dosya: string;
  satir: number;
  sutun: number;
  fmt: FmtKaydi;
  alanlar: DaireAlan[];
  ozet: Array<{ ad: string; tur: string; satir: number; sutun: number; x_mm: number; y_mm: number }>;
  atlanan: string[];
  uyari: string;
}

export interface DaireBelge {
  surum: typeof DAIRE_SURUM;
  kalibrasyon: DaireKalibrasyon;
  iz: SolIz | null;
  izler?: SolIz[];
  fmt?: FmtKaydi;
  sayfalar?: Array<{
    sayfa_no: number;
    genislik_mm: number;
    yukseklik_mm: number;
    iz: SolIz | null;
    izler: SolIz[];
    alanlar: DaireAlan[];
  }>;
  alanlar: DaireAlan[];
}

export interface DaireSablonOzet {
  id: number;
  ad: string;
  yontem: string;
  kaynak_adi: string;
  kaynak_tur: string;
  sayfa_no: number;
  sayfa_sayisi: number;
  sayfa_genislik_mm: number;
  sayfa_yukseklik_mm: number;
  aktif: boolean;
  yazici_profili_id?: number | null;
  yazici_profili_ad?: string | null;
  alan_sayisi: number;
}

export interface DaireSablonDetay extends DaireSablonOzet {
  belge: DaireBelge;
  uyarilar?: string[];
  uyari?: string;
}

export interface VeriKaynagi {
  kod: string;
  etiket: string;
  kaynak: string;
}

export interface AlgilananDaire {
  x_mm: number;
  y_mm: number;
  cap_mm: number;
}

export interface AlgilananDizi {
  x_mm: number;
  y_mm: number;
  satir: number;
  sutun: number;
  cap_mm: number;
  aralik_x_mm: number;
  aralik_y_mm: number;
}

export interface TaramaKalibrasyonu {
  kalibrasyon: Pick<DaireKalibrasyon, 'olcek' | 'olcek_y' | 'ofset_x_mm' | 'ofset_y_mm'>;
  isaret: number;
  leke: number;
  once_mm: { medyan: number; en_cok: number };
  sonra_mm: { medyan: number; en_cok: number };
  yazici: { olcek_x: number; olcek_y: number; kayma_x_mm: number; kayma_y_mm: number; donus_derece?: number };
  kalite?: number;
  uyari: string;
}

export interface AlgilamaSonucu {
  daireler: AlgilananDaire[];
  diziler: AlgilananDizi[];
  iz: SolIz | null;
  izler?: SolIz[];
  uyari: string;
  kaydedildi: boolean;
}

export interface DaireLayout {
  hazir: boolean;
  hatalar: string[];
  uyarilar: string[];
  belge: DaireBelge;
  alanlar: Array<{
    id: string;
    tur: DaireTur;
    daireler: Array<{
      satir: number;
      sutun: number;
      x_mm: number;
      y_mm: number;
      cap_mm: number;
    }>;
  }>;
  ornek: {
    metinler: Array<Record<string, number | string>>;
    isaretler: Array<{ x_mm: number; y_mm: number; cap_mm: number }>;
  };
}

export interface YaziciProfili {
  id: number;
  ad: string;
  kalibrasyon: DaireKalibrasyon;
  son_kalite: Record<string, unknown>;
  varsayilan: boolean;
  aktif: boolean;
}
