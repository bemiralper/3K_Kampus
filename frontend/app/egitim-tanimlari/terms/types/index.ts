/**
 * Term (Eğitim Dönemi) Types
 */

export interface EgitimYili {
  id: number;
  baslangic_yil: number;
  bitis_yil: number;
  aktif_mi: boolean;
  display: string;
}

export type TermType = 'regular' | 'summer' | 'camp' | 'exam' | 'coaching';

export const TERM_TYPE_OPTIONS: { value: TermType; label: string }[] = [
  { value: 'regular', label: 'Normal Dönem' },
  { value: 'summer', label: 'Yaz Okulu' },
  { value: 'camp', label: 'Kamp' },
  { value: 'exam', label: 'Sınav Dönemi' },
  { value: 'coaching', label: 'Koçluk Dönemi' },
];

export const TERM_TYPE_LABELS: Record<TermType, string> = {
  regular: 'Normal Dönem',
  summer: 'Yaz Okulu',
  camp: 'Kamp',
  exam: 'Sınav Dönemi',
  coaching: 'Koçluk Dönemi',
};

export interface Term {
  id: number;
  name: string;
  code: string;
  term_type: TermType;
  term_type_display: string;
  start_date: string;
  end_date: string;
  order_no: number;
  is_active: boolean;
  
  // Operasyon ayarları
  program_olusturulabilir: boolean;
  yoklama_acik: boolean;
  not_girisi_acik: boolean;
  ogrenci_kayit_acik: boolean;
  
  // Planlama motoru ayarları
  schedule_locked: boolean;
  auto_generate_enabled: boolean;
  allow_conflict_override: boolean;
  
  egitim_yili: {
    id: number;
    display: string;
  };
}

export interface TermFormData {
  name: string;
  code: string;
  term_type: TermType;
  start_date: string;
  end_date: string;
  order_no: number;
  is_active: boolean;
  
  // Operasyon ayarları
  program_olusturulabilir: boolean;
  yoklama_acik: boolean;
  not_girisi_acik: boolean;
  ogrenci_kayit_acik: boolean;
  
  // Planlama motoru ayarları
  schedule_locked: boolean;
  auto_generate_enabled: boolean;
  allow_conflict_override: boolean;
}

export const DEFAULT_TERM_FORM_DATA: TermFormData = {
  name: '',
  code: '',
  term_type: 'regular',
  start_date: '',
  end_date: '',
  order_no: 1,
  is_active: true,
  program_olusturulabilir: true,
  yoklama_acik: true,
  not_girisi_acik: false,
  ogrenci_kayit_acik: true,
  schedule_locked: false,
  auto_generate_enabled: true,
  allow_conflict_override: false,
};
