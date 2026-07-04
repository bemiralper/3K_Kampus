// ─────────────────────────────────────────────────────────────────────────────
//  Ölçme & Değerlendirme — TypeScript Tip Tanımları
//  frontend/components/olcme/types.ts
// ─────────────────────────────────────────────────────────────────────────────

// ── Sabitler ─────────────────────────────────────────────────────────────────

export const EXAM_TYPES = [
  { value: 'YKS_TYT',     label: 'YKS – TYT (Temel Yeterlilik)' },
  { value: 'YKS_AYT',     label: 'YKS – AYT (Alan Yeterlilik)' },
  { value: 'LGS',         label: 'LGS (Liselere Geçiş)' },
  { value: 'DENEME',      label: 'Deneme Sınavı' },
  { value: 'KURUM_ICI',   label: 'Kurum İçi Sınav' },
  { value: 'KONU_TARAMA', label: 'Konu Tarama' },
  { value: 'KAZANIM',     label: 'Kazanım Sınavı' },
  { value: 'OZEL',        label: 'Özel Sınav' },
] as const;

export type ExamTypeValue = typeof EXAM_TYPES[number]['value'];

export const EXAM_STATUS = [
  { value: 'DRAFT',            label: 'Taslak',                color: 'gray'   },
  { value: 'ANSWER_KEY_READY', label: 'Cevap Anahtarı Hazır', color: 'blue'   },
  { value: 'RESULTS_UPLOADED', label: 'Sonuçlar Yüklendi',    color: 'orange' },
  { value: 'COMPLETED',        label: 'Tamamlandı',            color: 'green'  },
] as const;

export type ExamStatusValue = typeof EXAM_STATUS[number]['value'];

export const BOOKLET_TYPES = [
  { value: 'NONE', label: 'Kitapçık Yok' },
  { value: 'AB',   label: 'A-B Kitapçığı' },
  { value: 'ABCD', label: 'A-B-C-D Kitapçığı' },
] as const;

export const SCHEDULE_PREFERENCES = [
  { value: 'HAFTA_ICI',  label: 'Hafta İçi' },
  { value: 'HAFTA_SONU', label: 'Hafta Sonu' },
  { value: 'FARKETMEZ',  label: 'Farketmez' },
] as const;

export type SchedulePreference = typeof SCHEDULE_PREFERENCES[number]['value'];

// ── Arayüzler ────────────────────────────────────────────────────────────────

export interface ExamSection {
  id: number;
  name: string;
  order: number;
  question_start: number;
  question_end: number;
  question_count: number;
  is_sub_section: boolean;
  parent_section: number | null;
  subject: number | null;
  sub_sections: ExamSection[];
}

export interface ExamSessionItem {
  id: number;
  name: string;
  order: number;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  schedule_preference: SchedulePreference;
  schedule_preference_display: string;
  description: string;
  question_count: number;
  sections_detail: ExamSection[];
}

export interface LookupItem {
  id: number;
  ad: string;
  kod?: string;
  seviye_id?: number;
  seviye_ad?: string;
  deneme_sayisi?: number;
}

export interface ExamListItem {
  id: number;
  name: string;
  exam_type: ExamTypeValue;
  exam_type_display: string;
  status: ExamStatusValue;
  status_display: string;
  exam_date: string | null;
  duration_minutes: number | null;
  is_active: boolean;
  is_locked: boolean;
  is_template: boolean;
  section_count: number;
  total_questions: number;
  session_count: number;
  sinif_display: string;
  linked_tyt_exam: number | null;
  linked_tyt_exam_name: string | null;
  linked_ayt_exam_name: string | null;
  answer_count: number;
  matched_count: number;
  unmatched_count: number;
  kurum_adi: string;
  sube_adi: string;
  egitim_yili_str: string;
  created_at: string;
}

export interface ExamDetail extends ExamListItem {
  description: string;
  result_publish_date: string | null;
  answer_key_publish_date: string | null;
  wrong_answer_count: number;
  per_section_penalty: boolean;
  score_coefficients: Record<string, unknown>;
  booklet_type: string;
  booklet_type_display: string;
  booklet_auto_detect: boolean;
  linked_tyt_exam: number | null;
  linked_tyt_exam_name: string | null;
  kurum: number | null;
  sube: number | null;
  egitim_yili: number | null;
  sinif_ids: number[];
  deneme_hizmeti: number | null;
  deneme_paketi: number | null;
  sections: ExamSection[];
  exam_sessions: ExamSessionItem[];
  updated_at: string;
}

// ── Form Tipleri ─────────────────────────────────────────────────────────────

export interface ExamCreateForm {
  name: string;
  exam_type: ExamTypeValue | '';
  description: string;
  exam_date: string;
  result_publish_date: string;
  answer_key_publish_date: string;
  duration_minutes: string;
  sinif_ids: number[];
  deneme_hizmeti: number | null;
  deneme_paketi: number | null;
  wrong_answer_count: string;
  per_section_penalty: boolean;
  booklet_type: string;
  booklet_auto_detect: boolean;
  apply_template: boolean;
}

export const EXAM_CREATE_FORM_DEFAULT: ExamCreateForm = {
  name:                        '',
  exam_type:                   '',
  description:                 '',
  exam_date:                   '',
  result_publish_date:         '',
  answer_key_publish_date:     '',
  duration_minutes:            '',
  sinif_ids:            [],
  deneme_hizmeti:       null,
  deneme_paketi:        null,
  wrong_answer_count:   '4',
  per_section_penalty:  true,
  booklet_type:         'NONE',
  booklet_auto_detect:  true,
  apply_template:       true,
};

export interface SessionCreateForm {
  name: string;
  order: number;
  session_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: string;
  schedule_preference: SchedulePreference;
  description: string;
  section_ids: number[];
}

// ── Cevap Anahtarı ───────────────────────────────────────────────────────────

export const ANSWER_CHOICES = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
  { value: 'D', label: 'D' },
  { value: 'E', label: 'E' },
  { value: 'EMPTY', label: 'Boş' },
  { value: 'INVALID', label: 'İptal' },
] as const;

export type AnswerChoice = typeof ANSWER_CHOICES[number]['value'];

export interface AnswerKeyItem {
  id: number;
  question_number: number;
  correct_answer: AnswerChoice;
  is_cancelled: boolean;
  section: number;
  section_name: string;
  outcome: number | null;
  outcome_code: string;
  outcome_text: string;
  imported_outcome_text: string;
  b_question_number: number | null;
}

export interface AnswerKey {
  id: number;
  exam: number;
  booklet: string;
  booklet_display: string;
  is_primary: boolean;
  items: AnswerKeyItem[];
  created_at: string;
  updated_at: string;
}

export interface BulkAnswerKeyRow {
  question_number: number;
  correct_answer: AnswerChoice;
  is_cancelled?: boolean;
  outcome_id?: number | null;
  imported_outcome_text?: string;
  b_question_number?: number | null;
}

export interface BulkAnswerKeyPayload {
  booklet: string;
  items: BulkAnswerKeyRow[];
}

export interface SubOutcomeItem {
  id: number;
  code: string;
  text: string;
  order: number;
  is_active: boolean;
}

export interface OutcomeItem {
  id: number;
  code: string;
  text: string;
  order?: number;
  is_active?: boolean;
  sub_outcomes?: SubOutcomeItem[];
  sub_outcome_count?: number;
}

export interface TopicItem {
  id: number;
  code?: string;
  name: string;
  outcomes: OutcomeItem[];
  outcome_count?: number;
}

export interface UnitItem {
  id: number;
  name: string;
  topics: TopicItem[];
}

export interface SubjectItem {
  id: number;
  code: string;
  name: string;
  display_name?: string;
  exam_type_filter?: string;
  order?: number;
  units?: UnitItem[];
  topics?: TopicItem[];
  topic_count?: number;
  outcome_count?: number;
  total_outcomes?: number;
  total_sub_outcomes?: number;
  linked_sections?: { id: number; exam_name: string; section_name: string }[];
}

/** Backend akıllı eşleştirme sonucu */
export interface MatchResult {
  input_text: string;
  outcome_id: number | null;
  outcome_code: string | null;
  outcome_text: string | null;
  topic_name: string | null;
  match_score: number;
  match_type: 'topic' | 'outcome' | 'sub_outcome' | null;
}

// ── Sonuç Yükleme (DAT Upload) ──────────────────────────────────────────────

export interface FieldMapping {
  field: string; // 'ogrenci_no' | 'tc_kimlik' | 'ad_soyad' | 'cevaplar' | 'ders_{section_id}'
  start: number;
  end: number;
  label: string;
}

export const FIELD_LABELS: Record<string, string> = {
  ogrenci_no: 'Öğrenci No',
  tc_kimlik: 'TC Kimlik',
  ad_soyad: 'Ad Soyad',
  cevaplar: 'Cevaplar',
};

export interface MappingTemplate {
  id: number;
  name: string;
  exam_type: string;
  mappings: FieldMapping[];
  first_line_is_header: boolean;
  student_id_field: string;
  created_at: string;
  updated_at: string;
}

export interface DATUploadResponse {
  session_id: number;
  filename: string;
  total_lines: number;
  preview_lines: string[];
}

export interface DATParsePayload {
  field_mappings: FieldMapping[];
  first_line_is_header: boolean;
  student_id_field: string;
}

export interface SectionNet {
  [sectionName: string]: number;
}

export interface DATParseResultRow {
  id: number;
  row: number;
  ogrenci_no: string;
  tc_kimlik: string;
  student_id: string;
  student_name: string;
  booklet: string;
  booklet_auto_detected: boolean;
  matched_student_id: number | null;
  matched_student_name: string | null;
  match_score: number;
  match_method: string;
  total_correct: number;
  total_wrong: number;
  total_empty: number;
  total_net: number;
  section_nets: SectionNet;
}

export interface DATParseResponse {
  success: boolean;
  total_rows: number;
  matched_count: number;
  unmatched_count: number;
  results: DATParseResultRow[];
  session: DATSessionItem;
}

export interface DATSessionItem {
  id: number;
  exam: number;
  original_filename: string;
  status: string;
  status_display: string;
  total_rows: number;
  matched_count: number;
  unmatched_count: number;
  error_count: number;
  field_mappings: FieldMapping[];
  student_id_field: string;
  created_at: string;
  updated_at: string;
}

export interface StudentSectionScoreItem {
  id: number;
  section: number;
  section_name: string;
  correct: number;
  wrong: number;
  empty: number;
  net: number;
}

export interface StudentAnswerItem {
  id: number;
  session: number;
  student: number | null;
  student_name: string;
  raw_student_id: string;
  raw_student_name: string;
  booklet: string;
  booklet_auto_detected: boolean;
  answers: Record<string, string>;
  comparison: Record<string, { given: string; correct: string; result: string }>;
  total_correct: number;
  total_wrong: number;
  total_empty: number;
  total_net: number;
  is_processed: boolean;
  section_scores: StudentSectionScoreItem[];
}

export interface StudentSearchResult {
  id: number;
  ad: string;
  soyad: string;
  tc_kimlik_no: string;
  full_name: string;
}

// ── Analiz Tipleri ───────────────────────────────────────────────────────────

export interface AnalysisTrend {
  prev_exam_name: string;
  prev_avg_net: number;
  diff: number;
  direction: 'up' | 'down' | 'same';
}

export interface AnalysisSummary {
  exam_name: string;
  exam_type: string;
  exam_type_display: string;
  exam_date: string | null;
  total_questions: number;
  katilim: number;
  ortalama_net: number;
  medyan_net: number;
  max_net: number;
  min_net: number;
  std_sapma_net: number;
  ortalama_puan: number;
  max_puan: number;
  min_puan: number;
  std_sapma_puan: number;
  basari_yuzdesi: number;
  basari_esik: number;
  puan_turleri: {
    SAY: { ortalama: number; max: number; min: number; std_sapma: number };
    EA: { ortalama: number; max: number; min: number; std_sapma: number };
    SOZ: { ortalama: number; max: number; min: number; std_sapma: number };
  } | null;
  linked_tyt_exam: { id: number; name: string } | null;
  trend: AnalysisTrend | null;
  sessions: { id: number; original_filename: string; total_rows: number; created_at: string }[];
  message?: string;
}

export interface DistributionRange {
  label: string;
  min: number;
  max: number;
  count: number;
}

export interface AnalysisSectionItem {
  section_id: number;
  section_name: string;
  question_count: number;
  is_sub_section: boolean;
  parent_id: number | null;
  student_count: number;
  ortalama_net: number;
  ortalama_dogru: number;
  ortalama_yanlis: number;
  ortalama_bos: number;
  bos_orani: number;
  max_net: number;
  min_net: number;
  std_sapma: number;
  medyan_net: number;
  dagilim: DistributionRange[];
}

export interface StudentAnalysis {
  answer_id: number;
  student_id: number | null;
  student_name: string;
  raw_student_id: string;
  sinif: string;
  alan?: string | null;  // SAYISAL | SOZEL | ESIT_AGIRLIK | null
  toplam_net: number;
  total_correct: number;
  total_wrong: number;
  total_empty: number;
  puan: number;
  ham_puan: number;
  puan_turleri: {
    SAY: { puan: number; ham_puan: number; ayt_net: number; tyt_net: number };
    EA: { puan: number; ham_puan: number; ayt_net: number; tyt_net: number };
    SOZ: { puan: number; ham_puan: number; ayt_net: number; tyt_net: number };
  } | null;
  tahmini_siralama: number | null;
  yuzdelik_dilim: number | null;
  kurum_ici_yuzdelik: number;
  kurum_ici_sira: number;
  toplam_ogrenci: number;
  section_details: {
    section_id: number;
    section_name: string;
    correct: number;
    wrong: number;
    empty: number;
    net: number;
    question_count: number;
  }[];
  strong_areas: { name: string; net: number }[];
  weak_areas: { name: string; net: number }[];
  net_trend?: { exam_id: number; exam_name: string; exam_date: string | null; toplam_net: number }[];
}

export interface StudentDetailSectionItem {
  section_id: number;
  section_name: string;
  is_sub_section: boolean;
  parent_id: number | null;
  correct: number;
  wrong: number;
  empty: number;
  net: number;
  question_count: number;
  verimlilik: number;
  kurum_avg_net: number;
  sinif_avg_net: number;
  kurum_verimlilik: number;
  sinif_verimlilik: number;
  diff_kurum: number;
  diff_sinif: number;
  bos_potansiyel: number;
  hata_orani: number;
}

export interface StudentDetailResponse {
  answer_id: number;
  student_id: number | null;
  student_name: string;
  raw_student_id: string;
  sinif: string;
  sinif_student_count: number;
  sinif_rank: number;
  toplam_net: number;
  total_correct: number;
  total_wrong: number;
  total_empty: number;
  total_questions: number;
  puan: number;
  ham_puan: number;
  puan_turleri: {
    SAY: { puan: number; ham_puan: number; ayt_net: number; tyt_net: number };
    EA: { puan: number; ham_puan: number; ayt_net: number; tyt_net: number };
    SOZ: { puan: number; ham_puan: number; ayt_net: number; tyt_net: number };
  } | null;
  tahmini_siralama: number | null;
  yuzdelik_dilim: number | null;
  kurum_ici_yuzdelik: number;
  kurum_ici_sira: number;
  toplam_ogrenci: number;
  kurum_avg_net: number;
  sinif_avg_net: number;
  section_details: StudentDetailSectionItem[];
  strong_areas: { name: string; net: number }[];
  weak_areas: { name: string; net: number }[];
  net_trend: { exam_id: number; exam_name: string; exam_date: string | null; toplam_net: number; section_nets: Record<string, number> }[];
  dogruluk_orani: number;
  toplam_bos_potansiyel: number;
  referans_yil: number;
}

export interface ClassAnalysis {
  sinif_id: number;
  sinif_name: string;
  student_count: number;
  ortalama_net: number;
  max_net: number;
  min_net: number;
  medyan_net: number;
  std_sapma: number;
  basari_yuzdesi: number;
  section_avgs: Record<string, number>;
}

export interface RankingSectionInfo {
  id: number;
  name: string;
  is_sub_section: boolean;
  parent_id: number | null;
  question_count: number;
}

export interface RankingPuanTuruInfo {
  puan: number;
  tahmini_siralama: number | null;
  yuzdelik_dilim: number | null;
}

export interface RankingItem {
  answer_id: number;
  student_id: number | null;
  student_name: string;
  raw_student_id: string;
  toplam_net: number;
  puan: number;
  puan_turleri: Record<string, RankingPuanTuruInfo> | null;
  tahmini_siralama: number | null;
  yuzdelik_dilim: number | null;
  kurum_ici_sira: number;
  toplam_ogrenci: number;
  kurum_ici_yuzdelik: number;
  section_nets: Record<string, { net: number; correct: number; wrong: number; empty: number }>;
  sinif?: string;
  alan?: string | null;  // SAYISAL | SOZEL | ESIT_AGIRLIK | null
}

export interface QuestionAnalysis {
  question_number: number;
  correct_answer: string;
  is_cancelled: boolean;
  section_id: number;
  section_name: string;
  outcome_id: number | null;
  outcome_code: string;
  outcome_text: string;
  correct_pct: number;
  wrong_pct: number;
  empty_pct: number;
  difficulty: 'Kolay' | 'Orta' | 'Zor';
  discrimination: number;
  choices: Record<string, number>;
  top_distractor: string | null;
  top_distractor_pct: number;
}

export interface StrategyItem {
  type: 'warning' | 'info' | 'success';
  icon: string;
  title: string;
  message: string;
  priority: number;
}

export interface ComparisonItem {
  exam_id: number;
  exam_name: string;
  exam_date: string | null;
  is_current: boolean;
  katilim: number;
  ortalama_net: number;
  max_net: number;
  min_net: number;
  section_avgs: Record<string, number>;
}

// ── Öğrenci Sınav Sekmesi Tipleri ────────────────────────────────────────────

export interface StudentExamSectionDetail {
  section_id: number;
  section_name: string;
  correct: number;
  wrong: number;
  empty: number;
  net: number;
  question_count: number;
  is_sub_section: boolean;
}

export interface StudentExamResult {
  exam_id: number;
  exam_name: string;
  exam_type: string;
  exam_type_display: string;
  exam_date: string | null;
  status: string;
  total_correct: number;
  total_wrong: number;
  total_empty: number;
  total_net: number;
  puan: number;
  ham_puan: number;
  tahmini_siralama: number | null;
  yuzdelik_dilim: number | null;
  kurum_ici_sira: number;
  toplam_ogrenci: number;
  section_details: StudentExamSectionDetail[];
}

export interface StudentExamKPI {
  toplam_sinav: number;
  ortalama_net: number;
  max_net: number;
  min_net: number;
  ortalama_puan: number;
  max_puan: number;
  min_puan: number;
  son_sinav_net: number;
  son_sinav_puan: number;
  net_degisim: number | null;
  puan_degisim: number | null;
  en_iyi_ders: string | null;
  en_zayif_ders: string | null;
}

export interface StudentExamTrend {
  exam_id: number;
  exam_name: string;
  exam_date: string | null;
  toplam_net: number;
  puan: number;
  section_nets: Record<string, number>;
}

export interface StudentExamResponse {
  student_name: string;
  exams: StudentExamResult[];
  kpi: StudentExamKPI | null;
  net_trend: StudentExamTrend[];
}
