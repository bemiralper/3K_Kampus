export type AkademikSubId =
  | 'genel'
  | 'ozel-dersler'
  | 'sinif-dersleri'
  | 'sinavlar'
  | 'devamsizlik'
  | 'odevler'
  | 'analiz';

export type OzelDersInnerTab = 'ozet' | 'program' | 'gecmis' | 'paket';

export type AkademikKalem = {
  kalem_turu: string;
  kalem_turu_display: string;
  kalem_adi: string;
  sozlesme_no: string;
  durum: string;
};

export type AkademikEkHizmet = {
  ad: string;
  aktif_mi: boolean;
};

export type AkademikKayit = {
  id: number;
  egitim_yili: string;
  sinif_ad: string;
  sinif_seviyesi: string;
  sube_ad: string;
  okul_no: string;
  kayit_tarihi: string;
  giris_turu_display: string;
  giris_tarihi: string;
  geldigi_okul: string;
  school_id?: number | null;
  school_ad?: string;
  aktif_mi: boolean;
  kalemler: AkademikKalem[];
  ek_hizmetler: AkademikEkHizmet[];
};

export type OzelDersKpis = {
  toplam_ozel_ders: number;
  aktif_ders: number;
  tamamlanan_program: number;
  planlanan_oturum: number;
  islenen_oturum: number;
  iptal_oturum: number;
  telafi_bekleyen: number;
  telafi_yapilan: number;
  ogrenci_devamsizlik: number;
  ogretmen_iptal: number;
  toplam_saat: number;
  devam_orani: number;
  ortalama_haftalik: number;
  son_ders: string | null;
  sonraki_ders: string | null;
  toplam_oturum: number;
};

export type OzelDersKart = {
  ders_id: number;
  ders_ad: string;
  ders_kisa_ad?: string;
  ogretmen_id: number;
  ogretmen_ad: string;
  program_ids: number[];
  baslangic: string | null;
  bitis: string | null;
  planlanan: number;
  islenen: number;
  kalan: number;
  progress_pct: number;
  progress_tone: 'green' | 'yellow' | 'red' | string;
  durum: string;
  durum_counts: Record<string, number>;
};

export type OzelDersDashboard = {
  ogrenci_id: number;
  ogrenci_ad: string;
  has_data: boolean;
  kpis: OzelDersKpis;
  uyarilar: { level: string; code: string; message: string }[];
  dersler: OzelDersKart[];
  ogretmenler: {
    ders_id: number;
    ders_ad: string;
    current: { ogretmen_id: number; ogretmen_ad: string; ders_sayisi: number; son_ders: string | null } | null;
    history: { ogretmen_id: number; ogretmen_ad: string; ders_sayisi: number; son_ders: string | null }[];
    toplam_ders: number;
    son_ders: string | null;
    sonraki_ders: string | null;
    ortalama_devam: number;
  }[];
  paket: {
    satin_alinan: number;
    kullanilan: number;
    kalan: number;
    progress_pct: number;
    label: string | null;
  };
  tarihler: {
    baslangic: string | null;
    planlanan_bitis: string | null;
    tahmini_bitis: string | null;
    kalan_gun: number;
  };
  haftalik_program: {
    slot_id: number;
    program_id: number;
    gun: number;
    gun_label: string;
    baslangic: string;
    bitis: string;
    ders_id: number;
    ders_ad: string;
    ogretmen_id: number;
    ogretmen_ad: string;
  }[];
  timeline: {
    id: number;
    session_date: string;
    start_time: string;
    end_time: string;
    ders_id: number;
    ders_ad: string;
    ogretmen_id: number;
    ogretmen_ad: string;
    durum: string;
    durum_display: string;
    oturum_turu: string;
    notes: string;
    ok: boolean;
  }[];
  son_notlar: OzelDersDashboard['timeline'];
  performans: {
    toplam_devam: number;
    son_30_gun: number;
    son_90_gun: number;
    iptal_egilimi: string;
    iptal_30: number;
    iptal_90: number;
  };
  devamsizlik: {
    ogrenci_gelmedi: number;
    ogretmen_iptal: number;
    telafi_yapildi: number;
    telafi_bekliyor: number;
  };
  programs: {
    id: number;
    durum: string;
    baslangic_tarihi: string | null;
    bitis_tarihi: string | null;
    premium_paket_ad: string | null;
    ozel_ders_paket_ad: string | null;
  }[];
  kazanim: { available: boolean; message: string };
};
