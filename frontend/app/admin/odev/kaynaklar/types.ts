// ========== Kaynak Kütüphanesi Tip Tanımları ==========

export interface Ders {
  id: number;
  ad: string;
}

export interface SinifSeviyesi {
  id: number;
  ad: string;
}

export interface BookType {
  id: number;
  kod: string;
  ad: string;
  renk: string;
  ikon: string;
}

export interface ResourceContent {
  id: number;
  ad: string;
  content_type: string;
  content_type_display: string;
  sira: number;
  question_count: number | null;
  difficulty: string | null;
  difficulty_display: string | null;
  page_start: number | null;
  page_end: number | null;
  estimated_minutes: number | null;
  video_url: string;
  video_duration: number | null;
  aciklama: string;
  aktif_mi: boolean;
}

export interface ResourceTopic {
  id: number;
  ad: string;
  kod: string;
  sira: number;
  aciklama: string;
  aktif_mi: boolean;
  content_count: number;
  contents?: ResourceContent[];
}

export interface ResourceUnit {
  id: number;
  ad: string;
  kod: string;
  sira: number;
  aciklama: string;
  aktif_mi: boolean;
  topic_count: number;
  topics?: ResourceTopic[];
}

export interface ResourceBook {
  id: number;
  ad: string;
  kod: string;
  book_type: number;
  book_type_display: string;
  book_type_renk: string;
  ders: number;
  ders_ad: string;
  sinif_seviyesi: number;
  sinif_seviyesi_ad: string;
  sinif_seviyeleri?: number[];
  sinif_seviyeleri_ad?: string;
  yayinevi: string;
  yazar: string;
  yayin_yili: number | null;
  toplam_sayfa: number | null;
  isbn: string;
  zorluk_min: number | null;
  zorluk_max: number | null;
  zorluk_display: string | null;
  kapak_url: string;
  aciklama: string;
  aktif_mi: boolean;
  sira: number;
  unit_count: number;
  topic_count: number;
  content_count: number;
  units?: ResourceUnit[];
}

export type DrawerMode = "book" | "unit" | "topic" | "content";
export type DrawerAction = "create" | "edit";

export interface BookFormData {
  ad: string;
  kod: string;
  book_type: string;
  ders: string;
  sinif_seviyeleri: number[];
  yayinevi: string;
  yazar: string;
  yayin_yili: string;
  toplam_sayfa: string;
  zorluk_min: string;
  zorluk_max: string;
  isbn: string;
  kapak_url: string;
  aciklama: string;
  aktif_mi: boolean;
  sira: number;
}

export interface UnitFormData {
  id: number | null;
  book: number | null;
  ad: string;
  kod: string;
  sira: number;
  aciklama: string;
  aktif_mi: boolean;
}

export interface TopicFormData {
  id: number | null;
  unit: number | null;
  ad: string;
  kod: string;
  sira: number;
  aciklama: string;
  aktif_mi: boolean;
}

export interface ContentFormData {
  id: number | null;
  topic: number | null;
  ad: string;
  content_type: string;
  sira: number;
  question_count: string;
  difficulty: string;
  page_start: string;
  page_end: string;
  estimated_minutes: string;
  video_url: string;
  video_duration: string;
  aciklama: string;
  aktif_mi: boolean;
}

export interface BookTypeFormData {
  id: number | null;
  kod: string;
  ad: string;
  renk: string;
  ikon: string;
  sira: number;
}

export interface BulkTestRow {
  id: string;
  question_count: string;
  difficulty: string;
}

/** Toplu test — önizleme adı + test başına soru/zorluk */
export interface BulkTestItemRow {
  name: string;
  question_count: string;
  difficulty: string;
}

export type BulkTestNamingMode = 'numbered' | 'series';
export type BulkTestStartMode = 'auto' | 'manual';

export interface BulkTestFormState {
  namingMode: BulkTestNamingMode;
  templatePrefix: string;
  startMode: BulkTestStartMode;
  startNumber: string;
  count: string;
  defaultQuestionCount: string;
  defaultDifficulty: string;
}

export interface BulkUnitRow {
  id: string;
  ad: string;
  kod: string;
}

export interface BulkTopicRow {
  id: string;
  ad: string;
  kod: string;
}

export interface Toast {
  message: string;
  type: "success" | "error" | "info";
}

// Drag-drop
export interface DragItem {
  id: number;
  index: number;
}
