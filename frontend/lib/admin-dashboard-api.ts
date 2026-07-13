import { apiGet } from '@/lib/api';

export type ChartPoint = { label: string; value: number };

export type SinifSeviyeDetay = {
  label: string;
  kiz: number;
  erkek: number;
  toplam: number;
  value: number;
};

export type DogumGunuOgrenci = {
  ogrenci_id: number;
  ad_soyad: string;
  sinif: string;
  dogum_gunu: string;
  yas: number;
  kalan_gun: number;
  etiket: string;
};

export type AdminDashboardData = {
  context: {
    kurum_id: number;
    sube_id: number;
    egitim_yili_id: number;
    referans_tarih: string;
  };
  genel: {
    aktif_ogrenci: number;
    aktif_personel: number;
    aktif_sozlesme: number;
    kasa_banka_toplam: number;
  };
  ogrenci: {
    kpis: {
      aktif: number;
      pasif: number;
      aktif_sozlesme: number;
      yeni_kayit_bu_ay: number;
    };
    sinif_seviyesi: ChartPoint[];
    sinif_seviyesi_detay: SinifSeviyeDetay[];
    cinsiyet: ChartPoint[];
    cinsiyet_ozet: { kiz: number; erkek: number; toplam: number };
    kayit_12_ay: ChartPoint[];
    paket_dagilimi: ChartPoint[];
    dogum_gunleri: {
      bugun: DogumGunuOgrenci[];
      yarin: DogumGunuOgrenci[];
      yaklasan: DogumGunuOgrenci[];
      ozet: { bugun: number; yarin: number; otuz_gun_icinde: number };
    };
  };
  personel: {
    kpis: {
      toplam: number;
      ogretmen: number;
      idari: number;
      verilen_ders_saati: number;
    };
    tur_dagilimi: ChartPoint[];
    brans_dagilimi: ChartPoint[];
    ise_giris_12_ay: ChartPoint[];
  };
  finans: {
    kpis: {
      toplam_kayit: number;
      tahsil_edilen: number;
      kalan: number;
      kasa_banka: number;
    };
    tahsilat_durumu: ChartPoint[];
    tahsilat_12_ay: ChartPoint[];
    kasa_dagilimi: ChartPoint[];
  };
};

export async function fetchAdminDashboard(): Promise<AdminDashboardData> {
  const res = await apiGet<AdminDashboardData>('/api/admin/dashboard/');
  if (!res.success || !res.data) {
    throw new Error(res.error || 'Dashboard yüklenemedi');
  }
  return res.data;
}
