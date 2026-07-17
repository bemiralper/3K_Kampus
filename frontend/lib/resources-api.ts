/**
 * Resources & Assignments API Client
 * Kaynak Kütüphanesi, Öğrenci Kaynak Havuzu ve Ödev modülleri için merkezi API fonksiyonları
 */

import { apiGet, apiPost, apiPostForm, apiPut, apiPatch, apiDelete, ApiResponse, extractApiError } from './api';

// ═══════════════════════════════════════════════════════
// TYPES - Kaynak Kütüphanesi (Resources)
// ═══════════════════════════════════════════════════════

export interface Ders {
  id: number;
  ad: string;
  kod: string;
}

export interface SinifSeviyesi {
  id: number;
  ad: string;
  kod: string;
}

export interface BookType {
  id: number;
  kod: string;
  ad: string;
  renk: string;
  ikon: string;
  sira?: number;
}

export interface BookTypeCreateUpdate {
  kod: string;
  ad: string;
  renk: string;
  ikon: string;
  sira?: number;
}

export interface ResourceContent {
  id: number;
  ad: string;
  content_type: string;
  content_type_display: string;
  sira: number;
  question_count: number | null;
  difficulty: string;
  difficulty_display: string;
  page_start: number | null;
  page_end: number | null;
  page_count: number | null;
  estimated_minutes: number | null;
  video_url: string;
  aktif_mi: boolean;
}

export interface ResourceTopic {
  id: number;
  ad: string;
  kod: string;
  sira: number;
  content_count: number;
  contents: ResourceContent[];
  aktif_mi: boolean;
}

export interface ResourceUnit {
  id: number;
  ad: string;
  kod: string;
  sira: number;
  topic_count: number;
  topics: ResourceTopic[];
  aktif_mi: boolean;
}

export interface ResourceBook {
  id: number;
  ad: string;
  kod: string;
  book_type: number;
  book_type_display: string;
  book_type_renk?: string;
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
  zorluk_min: number | null;
  zorluk_max: number | null;
  zorluk_display: string | null;
  kapak_url: string;
  aciklama: string;
  aktif_mi: boolean;
  isbn: string;
  sira: number;
  unit_count: number;
  topic_count: number;
  content_count: number;
  units?: ResourceUnit[];
}

export interface BookStructure extends ResourceBook {
  units: ResourceUnit[];
}

// ═══════════════════════════════════════════════════════
// TYPES - Öğrenci Kaynak Havuzu (Student Resources)
// ═══════════════════════════════════════════════════════

export interface StudentWithResources {
  id: number;
  ad: string;
  soyad: string;
  ogrenci_no: string;
  profil_foto: string | null;
  total_resources: number;
  completed: number;
  in_progress: number;
  overdue: number;
  avg_progress: number;
  risk_score: number;
  has_resources: boolean;
}

export interface StudentResourceKPI {
  total_students: number;
  with_resources: number;
  without_resources: number;
  with_incomplete: number;
  with_overdue: number;
  avg_completion: number;
}

export interface StudentResourceAssignment {
  id: number;
  resource_book: number;
  resource_name: string;
  resource_type: string;
  resource_type_renk: string;
  resource_yayin_yili: number | null;
  resource_yayinevi: string;
  kapak_url?: string;
  difficulty_level_snapshot: string;
  status: string;
  status_display: string;
  ownership_type: string;
  ownership_type_display: string;
  progress_percent: number;
  assigned_at: string | null;
  due_date: string | null;
  completed_at: string | null;
  notes: string;
  is_overdue: boolean;
  lesson?: number;
  lesson_name?: string;
}

export interface StudentResourceLesson {
  lesson_id: number;
  lesson_name: string;
  resources: StudentResourceAssignment[];
  total: number;
  completed: number;
  completion_percent: number;
}

export interface StudentResourceDetail {
  student: {
    id: number;
    ad: string;
    soyad: string;
    full_name: string;
    profil_foto: string | null;
  };
  summary: {
    total_lessons: number;
    total_resources: number;
    completed: number;
    in_progress: number;
    assigned: number;
    overdue: number;
    avg_progress: number;
  };
  lessons: StudentResourceLesson[];
  active_purchase_lists?: ActivePurchaseList[];
}

export type PurchaseListItemStatus = 'PENDING' | 'RECEIVED' | 'NOT_RECEIVED' | 'CANCELLED';

export interface ActivePurchaseListItem {
  id: number;
  resource_name: string;
  kapak_url?: string;
  item_status: PurchaseListItemStatus;
  item_status_display: string;
}

export interface ActivePurchaseList {
  id: number;
  title: string;
  list_type: 'PURCHASE' | 'INSTITUTION';
  list_type_display: string;
  status: string;
  items: ActivePurchaseListItem[];
}

export interface AvailableResource {
  id: number;
  ad: string;
  kod: string;
  ders_id: number;
  ders_ad: string;
  book_type: string;
  book_type_renk: string;
  yayinevi: string;
  yayin_yili: number | null;
  zorluk_min: number | null;
  zorluk_max: number | null;
  zorluk_display: string | null;
  toplam_sayfa: number | null;
  kapak_url?: string;
  acquisition_status?: string | null;
  acquisition_label?: string | null;
  selectable?: boolean;
  hidden?: boolean;
}

// ═══════════════════════════════════════════════════════
// TYPES - Ödev (Manual Assignments)
// ═══════════════════════════════════════════════════════

export interface AssignmentTask {
  id: number;
  task_type: string;
  title: string;
  description: string;
  content_id: number | null;
  content?: ResourceContent | null;
  question_count: number | null;
  page_count: number | null;
  is_required: boolean;
  status: string;
  completed_at: string | null;
}

export interface AssignmentLesson {
  id: number;
  lesson: number;
  lesson_name: string;
  resource_book: number;
  resource_book_name: string;
  topic_name: string;
  content_mode: string;
  notes: string;
  tasks: AssignmentTask[];
}

export interface ManualAssignment {
  id: number;
  student: number;
  student_name: string;
  coach: number | null;
  coach_name: string | null;
  title: string;
  description: string;
  priority: string;
  priority_display: string;
  status: string;
  status_display: string;
  risk_status: string;
  risk_status_display: string;
  due_date: string | null;
  source_assignment: number | null;
  lessons: AssignmentLesson[];
  total_tasks: number;
  completed_tasks: number;
  progress_percent: number;
  is_control_locked?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignmentPackageItem {
  id?: number;
  book_id: number;
  book_name: string;
  content_id: number;
  content_name: string;
  content_type: string;
  topic_name: string;
  unit_name: string;
  question_count: number | null;
  page_start: number | null;
  page_end: number | null;
  order?: number;
}

export interface AssignmentPackage {
  id: number;
  name: string;
  description: string;
  ders_ad: string;
  sinif_seviyesi: string;
  usage_count: number;
  is_active?: boolean;
  items?: AssignmentPackageItem[];
  item_count?: number;
  created_by?: number | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentPackageCreateUpdate {
  name: string;
  description?: string;
  ders_ad?: string;
  sinif_seviyesi?: string;
  items?: Omit<AssignmentPackageItem, 'id'>[];
}

export interface AssignmentCreatePayload {
  student: number;
  title: string;
  description?: string;
  priority?: string;
  due_date?: string | null;
  status?: 'DRAFT' | 'PUBLISHED' | 'ASSIGNED';
  source_assignment?: number;
  template_id?: number;
  lessons: {
    resource_book: number;
    topic_name: string;
    content_mode: string;
    notes?: string;
    tasks: {
      task_type: string;
      title: string;
      description?: string;
      content_id?: number;
      question_count?: number | null;
      page_count?: number | null;
      is_required?: boolean;
      is_completion_task?: boolean;
      previous_task_completion_percent?: number | null;
      previous_assignment_title?: string;
    }[];
  }[];
}

// ═══════════════════════════════════════════════════════
// API - Metadata (Ders, Sınıf Seviyesi)
// ═══════════════════════════════════════════════════════

/**
 * Ders listesini getir
 */
export async function fetchDersler(): Promise<ApiResponse<Ders[]>> {
  return apiGet<Ders[]>('/egitim-tanimlari/api/ders/');
}

/**
 * Sınıf seviyesi listesini getir
 */
export async function fetchSinifSeviyeleri(): Promise<ApiResponse<SinifSeviyesi[]>> {
  return apiGet<SinifSeviyesi[]>('/egitim-tanimlari/api/sinif-seviyesi/');
}

// ═══════════════════════════════════════════════════════
// API - Book Types
// ═══════════════════════════════════════════════════════

/**
 * Kitap türlerini listele
 */
export async function fetchBookTypes(): Promise<ApiResponse<BookType[]>> {
  return apiGet<BookType[]>('/api/resources/book-types/');
}

/**
 * Kitap türü oluştur
 */
export async function createBookType(data: BookTypeCreateUpdate): Promise<ApiResponse<BookType>> {
  return apiPost<BookType>('/api/resources/book-types/', data);
}

/**
 * Kitap türü güncelle
 */
export async function updateBookType(id: number, data: BookTypeCreateUpdate): Promise<ApiResponse<BookType>> {
  return apiPut<BookType>(`/api/resources/book-types/${id}/`, data);
}

/**
 * Kitap türü sil
 */
export async function deleteBookType(id: number): Promise<ApiResponse<void>> {
  return apiDelete<void>(`/api/resources/book-types/${id}/`);
}

// ═══════════════════════════════════════════════════════
// API - Books
// ═══════════════════════════════════════════════════════

/**
 * Kitap listesini getir
 */
export async function fetchBooks(params?: {
  ders?: string;
  sinif_seviyesi?: string;
  book_type?: string;
  yayin_yili?: string;
  search?: string;
}): Promise<ApiResponse<ResourceBook[]>> {
  const searchParams = new URLSearchParams();
  if (params?.ders) searchParams.append('ders', params.ders);
  if (params?.sinif_seviyesi) searchParams.append('sinif_seviyesi', params.sinif_seviyesi);
  if (params?.book_type) searchParams.append('book_type', params.book_type);
  if (params?.yayin_yili) searchParams.append('yayin_yili', params.yayin_yili);
  if (params?.search) searchParams.append('search', params.search);

  const qs = searchParams.toString();
  return apiGet<ResourceBook[]>(`/api/resources/books/${qs ? `?${qs}` : ''}`);
}

export async function suggestBookKod(params: {
  book_type: string;
  ders: string;
  exclude_id?: number;
}): Promise<ApiResponse<{ kod: string }>> {
  const searchParams = new URLSearchParams({
    book_type: params.book_type,
    ders: params.ders,
  });
  if (params.exclude_id) searchParams.append('exclude_id', String(params.exclude_id));
  return apiGet<{ kod: string }>(`/api/resources/books/suggest-kod/?${searchParams.toString()}`);
}

export async function suggestUnitKod(params: {
  book: number;
  exclude_id?: number;
}): Promise<ApiResponse<{ kod: string }>> {
  const searchParams = new URLSearchParams({ book: String(params.book) });
  if (params.exclude_id) searchParams.append('exclude_id', String(params.exclude_id));
  return apiGet<{ kod: string }>(`/api/resources/units/suggest-kod/?${searchParams.toString()}`);
}

export async function suggestTopicKod(params: {
  unit: number;
  exclude_id?: number;
}): Promise<ApiResponse<{ kod: string }>> {
  const searchParams = new URLSearchParams({ unit: String(params.unit) });
  if (params.exclude_id) searchParams.append('exclude_id', String(params.exclude_id));
  return apiGet<{ kod: string }>(`/api/resources/topics/suggest-kod/?${searchParams.toString()}`);
}

export interface TestBatchPreview {
  mode: string;
  prefix: string;
  start: number;
  start_mode: string;
  count: number;
  next_sira: number;
  names: string[];
}

export async function fetchNextTestBatch(params: {
  topic: number;
  count: number;
  mode: 'numbered' | 'series';
  prefix?: string;
  start?: 'auto' | number;
}): Promise<ApiResponse<TestBatchPreview>> {
  const searchParams = new URLSearchParams({
    topic: String(params.topic),
    count: String(params.count),
    mode: params.mode,
  });
  if (params.mode === 'series' && params.prefix) {
    searchParams.append('prefix', params.prefix);
  }
  if (params.start !== undefined && params.start !== 'auto') {
    searchParams.append('start', String(params.start));
  } else {
    searchParams.append('start', 'auto');
  }
  return apiGet<TestBatchPreview>(`/api/resources/contents/next-test-batch/?${searchParams.toString()}`);
}

/**
 * Kitap detayını (yapısıyla birlikte) getir
 */
export async function fetchBookStructure(bookId: number): Promise<ApiResponse<BookStructure>> {
  return apiGet<BookStructure>(`/api/resources/books/${bookId}/structure/`);
}

/**
 * Kitap oluştur
 */
export async function createBook(data: Partial<ResourceBook>): Promise<ApiResponse<ResourceBook>> {
  return apiPost<ResourceBook>('/api/resources/books/', data);
}

/**
 * Kitap güncelle
 */
export async function updateBook(id: number, data: Partial<ResourceBook>): Promise<ApiResponse<ResourceBook>> {
  return apiPut<ResourceBook>(`/api/resources/books/${id}/`, data);
}

/**
 * Kitap sil
 */
export async function deleteBook(id: number): Promise<ApiResponse<void>> {
  return apiDelete<void>(`/api/resources/books/${id}/`);
}

/**
 * Kitabı tüm yapısıyla kopyala
 */
export async function duplicateBook(
  id: number,
  data: { ad: string; kod: string }
): Promise<ApiResponse<ResourceBook>> {
  return apiPost<ResourceBook>(`/api/resources/books/${id}/duplicate/`, data);
}

export type BookBulkImportResult = {
  toplam_satir: number;
  eklenen: number;
  guncellenen: number;
  atlanan: number;
  hatali: number;
  hatalar: { satir: number; ad: string; neden: string }[];
};

export async function downloadBookImportTemplate(): Promise<Blob> {
  const { getContextHeaders } = await import('@/lib/api');
  const res = await fetch('/api/resources/books/import-template/', {
    credentials: 'include',
    headers: getContextHeaders(),
  });
  if (!res.ok) throw new Error('Şablon indirilemedi');
  return res.blob();
}

export async function bulkImportBooksExcel(file: File): Promise<ApiResponse<BookBulkImportResult>> {
  const { getContextHeaders } = await import('@/lib/api');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/resources/books/bulk-import/', {
    method: 'POST',
    credentials: 'include',
    headers: getContextHeaders(),
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    return { success: false, error: data.error || 'Toplu yükleme başarısız' };
  }
  return { success: true, data: data.data as BookBulkImportResult, message: data.message };
}

export async function uploadBookKapak(
  bookId: number,
  file: File,
): Promise<ApiResponse<{ kapak_url: string }>> {
  const form = new FormData();
  form.append('kapak', file);
  return apiPostForm<{ kapak_url: string }>(`/api/resources/books/${bookId}/upload-kapak/`, form);
}

export async function deleteBookKapak(
  bookId: number,
): Promise<ApiResponse<{ kapak_url: string }>> {
  return apiDelete<{ kapak_url: string }>(`/api/resources/books/${bookId}/delete-kapak/`);
}

export const BOOK_EXPORT_COLUMNS = [
  { key: 'ad', label: 'Kitap Adı' },
  { key: 'kod', label: 'Kod' },
  { key: 'book_type', label: 'Kitap Türü' },
  { key: 'ders', label: 'Ders' },
  { key: 'sinif', label: 'Sınıf' },
  { key: 'yayinevi', label: 'Yayınevi' },
  { key: 'yazar', label: 'Yazar' },
  { key: 'yayin_yili', label: 'Yayın Yılı' },
  { key: 'isbn', label: 'ISBN' },
  { key: 'zorluk', label: 'Zorluk' },
  { key: 'unit_count', label: 'Ünite' },
  { key: 'topic_count', label: 'Konu' },
  { key: 'content_count', label: 'İçerik' },
  { key: 'aktif', label: 'Aktif' },
  { key: 'aciklama', label: 'Açıklama' },
] as const;

export const DEFAULT_BOOK_EXPORT_KEYS = [
  'ad', 'kod', 'book_type', 'ders', 'sinif', 'yayinevi', 'yazar', 'yayin_yili',
];

export type BookExportFilters = {
  ders?: string;
  sinif_seviyesi?: string;
  book_type?: string;
  yayin_yili?: string;
  search?: string;
};

export async function fetchBookExportRows(
  filters: BookExportFilters,
  columnKeys: string[],
): Promise<{ rows: Record<string, string>[]; columns: string[]; total: number }> {
  const { getContextHeaders } = await import('@/lib/api');
  const params = new URLSearchParams();
  params.set('columns', columnKeys.join(','));
  params.set('format', 'json');
  if (filters.ders) params.set('ders', filters.ders);
  if (filters.sinif_seviyesi) params.set('sinif_seviyesi', filters.sinif_seviyesi);
  if (filters.book_type) params.set('book_type', filters.book_type);
  if (filters.yayin_yili) params.set('yayin_yili', filters.yayin_yili);
  if (filters.search) params.set('search', filters.search);

  const res = await fetch(`/api/resources/books/export/?${params}`, {
    credentials: 'include',
    headers: getContextHeaders(),
  });
  if (!res.ok) throw new Error('Dışa aktarma verisi alınamadı');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Dışa aktarma başarısız');
  return {
    rows: data.rows || [],
    columns: data.columns || columnKeys,
    total: data.total ?? (data.rows?.length || 0),
  };
}

export async function downloadBookExportCsv(
  filters: BookExportFilters,
  columnKeys: string[],
): Promise<Blob> {
  const { getContextHeaders } = await import('@/lib/api');
  const params = new URLSearchParams();
  params.set('columns', columnKeys.join(','));
  params.set('format', 'csv');
  if (filters.ders) params.set('ders', filters.ders);
  if (filters.sinif_seviyesi) params.set('sinif_seviyesi', filters.sinif_seviyesi);
  if (filters.book_type) params.set('book_type', filters.book_type);
  if (filters.yayin_yili) params.set('yayin_yili', filters.yayin_yili);
  if (filters.search) params.set('search', filters.search);

  const res = await fetch(`/api/resources/books/export/?${params}`, {
    credentials: 'include',
    headers: getContextHeaders(),
  });
  if (!res.ok) throw new Error('CSV dışa aktarma başarısız');
  return res.blob();
}

/**
 * Ünite sıralamasını güncelle
 */
export async function reorderUnits(orderedIds: number[]): Promise<ApiResponse<void>> {
  return apiPost<void>('/api/resources/units/reorder/', { ordered_ids: orderedIds });
}

/**
 * Konu sıralamasını güncelle
 */
export async function reorderTopics(orderedIds: number[]): Promise<ApiResponse<void>> {
  return apiPost<void>('/api/resources/topics/reorder/', { ordered_ids: orderedIds });
}

/**
 * İçerik sıralamasını güncelle
 */
export async function reorderContents(orderedIds: number[]): Promise<ApiResponse<void>> {
  return apiPost<void>('/api/resources/contents/reorder/', { ordered_ids: orderedIds });
}

// ═══════════════════════════════════════════════════════
// API - Units
// ═══════════════════════════════════════════════════════

/**
 * Ünite oluştur
 */
export async function createUnit(data: {
  book: number;
  ad: string;
  kod?: string;
  sira: number;
  aktif_mi?: boolean;
}): Promise<ApiResponse<ResourceUnit>> {
  return apiPost<ResourceUnit>('/api/resources/units/', data);
}

/**
 * Ünite güncelle
 */
export async function updateUnit(id: number, data: Partial<ResourceUnit>): Promise<ApiResponse<ResourceUnit>> {
  return apiPut<ResourceUnit>(`/api/resources/units/${id}/`, data);
}

/**
 * Ünite sil
 */
export async function deleteUnit(id: number): Promise<ApiResponse<void>> {
  return apiDelete<void>(`/api/resources/units/${id}/`);
}

/**
 * Toplu ünite oluştur
 */
export async function bulkCreateUnits(
  bookId: number,
  units: { ad: string; kod: string }[],
  startSira: number = 1
): Promise<ApiResponse<ResourceUnit>[]> {
  const promises = units.map((unit, index) => {
    const sira = startSira + index;
    const kod = unit.kod.trim() || `UNITE_${sira}`;
    return createUnit({
      book: bookId,
      ad: unit.ad.trim(),
      kod: kod.toUpperCase().replace(/\s/g, '_'),
      sira,
      aktif_mi: true,
    });
  });
  return Promise.all(promises);
}

// ═══════════════════════════════════════════════════════
// API - Topics
// ═══════════════════════════════════════════════════════

/**
 * Konu oluştur
 */
export async function createTopic(data: {
  unit: number;
  ad: string;
  kod?: string;
  sira: number;
  aktif_mi?: boolean;
}): Promise<ApiResponse<ResourceTopic>> {
  return apiPost<ResourceTopic>('/api/resources/topics/', data);
}

/**
 * Konu güncelle
 */
export async function updateTopic(id: number, data: Partial<ResourceTopic>): Promise<ApiResponse<ResourceTopic>> {
  return apiPut<ResourceTopic>(`/api/resources/topics/${id}/`, data);
}

/**
 * Konu sil
 */
export async function deleteTopic(id: number): Promise<ApiResponse<void>> {
  return apiDelete<void>(`/api/resources/topics/${id}/`);
}

/**
 * Toplu konu oluştur
 */
export async function bulkCreateTopics(
  unitId: number,
  topics: { ad: string; kod: string }[],
  startSira: number = 1
): Promise<ApiResponse<ResourceTopic>[]> {
  const promises = topics.map((topic, index) => {
    const sira = startSira + index;
    const kod = topic.kod.trim() || `KONU_${sira}`;
    return createTopic({
      unit: unitId,
      ad: topic.ad.trim(),
      kod: kod.toUpperCase().replace(/\s/g, '_'),
      sira,
      aktif_mi: true,
    });
  });
  return Promise.all(promises);
}

// ═══════════════════════════════════════════════════════
// API - Contents
// ═══════════════════════════════════════════════════════

/**
 * İçerik listesini getir (konu bazlı)
 */
export async function fetchContents(topicId: number): Promise<ApiResponse<ResourceContent[]>> {
  return apiGet<ResourceContent[]>(`/api/resources/contents/?topic=${topicId}`);
}

/**
 * İçerik oluştur
 */
export async function createContent(data: {
  topic: number;
  ad: string;
  content_type: string;
  sira: number;
  question_count?: number | null;
  difficulty?: string;
  page_start?: number | null;
  page_end?: number | null;
  estimated_minutes?: number | null;
  video_url?: string;
  aktif_mi?: boolean;
}): Promise<ApiResponse<ResourceContent>> {
  return apiPost<ResourceContent>('/api/resources/contents/', data);
}

/**
 * İçerik güncelle
 */
export async function updateContent(id: number, data: Partial<ResourceContent>): Promise<ApiResponse<ResourceContent>> {
  return apiPut<ResourceContent>(`/api/resources/contents/${id}/`, data);
}

/**
 * İçerik sil
 */
export async function deleteContent(id: number): Promise<ApiResponse<void>> {
  return apiDelete<void>(`/api/resources/contents/${id}/`);
}

/**
 * Toplu test oluştur
 */
export async function bulkCreateTests(
  topicId: number,
  tests: { question_count: number; difficulty: string }[],
  startSira: number = 1
): Promise<ApiResponse<ResourceContent>[]> {
  const promises = tests.map((test, index) => {
    const testNumber = startSira + index;
    return createContent({
      topic: topicId,
      ad: `Test ${testNumber}`,
      content_type: 'TEST_SET',
      sira: testNumber,
      question_count: test.question_count,
      difficulty: test.difficulty,
      aktif_mi: true,
    });
  });
  return Promise.all(promises);
}

// ═══════════════════════════════════════════════════════
// API - Öğrenci Kaynak Havuzu (Student Resources)
// ═══════════════════════════════════════════════════════

/**
 * Öğrenci listesini getir (kaynak istatistikleriyle)
 */
export async function fetchStudentResourceList(): Promise<ApiResponse<StudentWithResources[]> & { kpi?: StudentResourceKPI }> {
  const response = await apiGet<StudentWithResources[]>('/api/student-resources/assignments/student_list/');
  return {
    ...response,
    kpi: response.kpi as StudentResourceKPI | undefined,
  };
}

/**
 * Öğrenci kaynak detayı (derse göre gruplu)
 */
export async function fetchStudentResourceDetail(studentId: number | string): Promise<ApiResponse<StudentResourceDetail>> {
  return apiGet<StudentResourceDetail>(`/api/student-resources/assignments/student_detail/?student_id=${studentId}`);
}

/**
 * Öğrenci kaynak atamasını güncelle (PUT)
 */
export async function updateStudentResourceAssignment(
  id: number,
  data: {
    status?: string;
    ownership_type?: string;
    due_date?: string | null;
    notes?: string;
  }
): Promise<ApiResponse<StudentResourceAssignment>> {
  return apiPut<StudentResourceAssignment>(`/api/student-resources/assignments/${id}/`, data);
}

/**
 * Öğrenci kaynak atamasını kısmi güncelle (PATCH)
 */
export async function patchStudentResourceAssignment(
  id: number,
  data: {
    status?: string;
    ownership_type?: string;
    due_date?: string | null;
    progress_percent?: number;
    notes?: string;
  }
): Promise<ApiResponse<StudentResourceAssignment>> {
  return apiPatch<StudentResourceAssignment>(`/api/student-resources/assignments/${id}/`, data);
}

/**
 * Atama için uygun kaynakları getir
 */
export async function fetchAvailableResources(params: {
  lesson_ids?: number | number[];
  student_ids: number | number[];
  exclude_assigned?: boolean;
  acquisition_info?: boolean;
}): Promise<ApiResponse<AvailableResource[]>> {
  const searchParams = new URLSearchParams();
  if (params.lesson_ids !== undefined) {
    const lessonIds = Array.isArray(params.lesson_ids)
      ? params.lesson_ids.join(',')
      : String(params.lesson_ids);
    if (lessonIds) searchParams.set('lesson_ids', lessonIds);
  }
  const studentIds = Array.isArray(params.student_ids) ? params.student_ids.join(',') : String(params.student_ids);
  searchParams.set('student_ids', studentIds);
  if (params.exclude_assigned) {
    searchParams.set('exclude_assigned', 'true');
  }
  if (params.acquisition_info) {
    searchParams.set('acquisition_info', 'true');
  }
  return apiGet<AvailableResource[]>(`/api/student-resources/assignments/available_resources/?${searchParams}`);
}

/**
 * Öğrenci kaynak atamasını sil
 */
export async function deleteStudentResourceAssignment(id: number): Promise<ApiResponse<void>> {
  return apiDelete<void>(`/api/student-resources/assignments/${id}/`);
}

/**
 * Toplu kaynak atama
 */
export async function bulkAssignResources(data: {
  student_ids: number[];
  resource_book_ids: number[];
  ownership_type?: string;
  due_date?: string | null;
  notes?: string;
}): Promise<ApiResponse<{ assigned_count: number }>> {
  return apiPost<{ assigned_count: number }>('/api/student-resources/assignments/bulk_assign/', data);
}

/**
 * Öğrenci satın alma listesi oluştur
 */
export async function createPurchaseList(data: {
  student_id: number;
  ownership_type?: string;
  title?: string;
}): Promise<ApiResponse<{ id: number; items: unknown[] }>> {
  return apiPost<{ id: number; items: unknown[] }>('/api/student-resources/purchase-lists/create_for_student/', data);
}

export async function createPurchaseListFromLibrary(data: {
  student_id: number;
  list_type: 'PURCHASE' | 'INSTITUTION';
  title?: string;
  notes?: string;
  stationery_name?: string;
  stationery_address?: string;
  default_source_note?: string;
  items: { resource_book_id: number; quantity?: number; source_note?: string }[];
}): Promise<ApiResponse<{ id: number }>> {
  return apiPost<{ id: number }>('/api/student-resources/purchase-lists/create_from_library/', data);
}

export async function updatePurchaseListItemStatus(
  itemId: number,
  itemStatus: 'RECEIVED' | 'NOT_RECEIVED' | 'CANCELLED',
): Promise<ApiResponse<{ id: number; item_status: string }>> {
  return apiPost<{ id: number; item_status: string }>(
    `/api/student-resources/purchase-lists/items/${itemId}/set_status/`,
    { item_status: itemStatus },
  );
}

// ═══════════════════════════════════════════════════════
// API - Manuel Ödev Atama (Manual Assignments)
// ═══════════════════════════════════════════════════════

const PACKAGES_URL = '/api/coaching/manual-assignments/packages/';

/**
 * Ödev paketi listesini getir
 */
export async function fetchAssignmentPackages(): Promise<ApiResponse<AssignmentPackage[]>> {
  return apiGet<AssignmentPackage[]>(PACKAGES_URL);
}

/**
 * Ödev paketi detayını getir
 */
export async function fetchAssignmentPackage(id: number): Promise<ApiResponse<AssignmentPackage>> {
  return apiGet<AssignmentPackage>(`${PACKAGES_URL}${id}/`);
}

/**
 * Ödev paketi oluştur
 */
export async function createAssignmentPackage(
  data: AssignmentPackageCreateUpdate
): Promise<ApiResponse<AssignmentPackage>> {
  return apiPost<AssignmentPackage>(PACKAGES_URL, data);
}

/**
 * Ödev paketi güncelle
 */
export async function updateAssignmentPackage(
  id: number,
  data: AssignmentPackageCreateUpdate
): Promise<ApiResponse<AssignmentPackage>> {
  return apiPut<AssignmentPackage>(`${PACKAGES_URL}${id}/`, data);
}

/**
 * Ödev paketi sil (soft delete)
 */
export async function deleteAssignmentPackage(id: number): Promise<ApiResponse<void>> {
  return apiDelete<void>(`${PACKAGES_URL}${id}/`);
}

/**
 * Ödev paketini kopyala
 */
export async function duplicateAssignmentPackage(id: number): Promise<ApiResponse<AssignmentPackage>> {
  return apiPost<AssignmentPackage>(`${PACKAGES_URL}${id}/duplicate/`, {});
}

/**
 * Ödev paketi kullanım sayısını artır
 */
export async function incrementPackageUsage(id: number): Promise<ApiResponse<AssignmentPackage>> {
  return apiPost<AssignmentPackage>(`${PACKAGES_URL}${id}/increment_usage/`, {});
}

/**
 * Ödev listesini getir
 */
export async function fetchAssignments(params?: {
  student_id?: number;
  coach_id?: number;
  status?: string;
  risk_status?: string;
}): Promise<ApiResponse<ManualAssignment[]>> {
  const searchParams = new URLSearchParams();
  if (params?.student_id) searchParams.append('student_id', String(params.student_id));
  if (params?.coach_id) searchParams.append('coach_id', String(params.coach_id));
  if (params?.status) searchParams.append('status', params.status);
  if (params?.risk_status) searchParams.append('risk_status', params.risk_status);

  const qs = searchParams.toString();
  const path = qs
    ? `/api/coaching/manual-assignments/assignments/?${qs}`
    : '/api/coaching/manual-assignments/assignments/';
  return apiGet<ManualAssignment[]>(path);
}

export interface KontrolBadgeData {
  count: number;
  overdue: number;
  pending: number;
}

/**
 * Ödev Kontrol sidebar badge sayıları (geciken + bekleyen)
 */
export async function fetchKontrolBadge(): Promise<ApiResponse<KontrolBadgeData>> {
  return apiGet<KontrolBadgeData>(
    '/api/coaching/manual-assignments/assignments/kontrol_badge/'
  );
}

/**
 * Ödev detayını getir
 */
export async function fetchAssignmentDetail(
  id: number,
  options?: { printToken?: string },
): Promise<ApiResponse<ManualAssignment>> {
  const headers: Record<string, string> = {};
  if (options?.printToken) {
    headers["X-Print-Token"] = options.printToken;
  }
  return apiGet<ManualAssignment>(
    `/api/coaching/manual-assignments/assignments/${id}/`,
    Object.keys(headers).length ? { headers } : {},
  );
}

/**
 * Ödev oluştur
 */
export async function createAssignment(data: AssignmentCreatePayload): Promise<ApiResponse<ManualAssignment>> {
  return apiPost<ManualAssignment>('/api/coaching/manual-assignments/assignments/', data);
}

/**
 * Ödev güncelle
 */
export async function updateAssignment(id: number, data: Partial<AssignmentCreatePayload>): Promise<ApiResponse<ManualAssignment>> {
  return apiPut<ManualAssignment>(`/api/coaching/manual-assignments/assignments/${id}/`, data);
}

/**
 * Ödev sil (soft delete — silme sebebi zorunlu)
 */
export async function deleteAssignment(
  id: number,
  data: { deletion_reason: string }
): Promise<ApiResponse<void>> {
  return apiDelete<void>(`/api/coaching/manual-assignments/assignments/${id}/`, {
    body: JSON.stringify(data),
  });
}

/**
 * Silinmiş ödev arşivi (admin)
 */
export interface DeletedAssignmentRow {
  id: number;
  student: number;
  student_name: string;
  title: string;
  coach: number | null;
  coach_name: string | null;
  deleted_by: number | null;
  deleted_by_name: string | null;
  deleted_at: string | null;
  deletion_reason: string;
}

export async function fetchDeletedAssignments(): Promise<ApiResponse<DeletedAssignmentRow[]>> {
  return apiGet<DeletedAssignmentRow[]>(
    '/api/coaching/manual-assignments/assignments/deleted_assignments/'
  );
}

/**
 * Öğrenciye ait ödevleri getir
 */
export async function fetchStudentAssignments(studentId: number): Promise<ApiResponse<ManualAssignment[]>> {
  return apiGet<ManualAssignment[]>(`/api/coaching/manual-assignments/assignments/student_assignments/?student_id=${studentId}`);
}

/**
 * Ödev durumunu güncelle (task seviyesinde)
 */
export async function updateTaskStatus(
  taskId: number,
  data: {
    status?: string;
    completed_at?: string | null;
  }
): Promise<ApiResponse<AssignmentTask>> {
  return apiPut<AssignmentTask>(`/api/coaching/manual-assignments/tasks/${taskId}/`, data);
}

/**
 * Ödev risk durumunu güncelle
 */
export async function updateAssignmentRiskStatus(
  assignmentId: number,
  riskStatus: string
): Promise<ApiResponse<ManualAssignment>> {
  return apiPost<ManualAssignment>(
    `/api/coaching/manual-assignments/assignments/${assignmentId}/update_risk_status/`,
    { risk_status: riskStatus }
  );
}

/**
 * Taslak ödevi öğrenciye ata
 */
export async function assignAssignment(assignmentId: number): Promise<ApiResponse<ManualAssignment>> {
  return apiPost<ManualAssignment>(
    `/api/coaching/manual-assignments/assignments/${assignmentId}/assign/`,
    {}
  );
}

/**
 * Ödev teslim tarihini ertele
 */
export async function postponeAssignment(
  assignmentId: number,
  data: { new_due_date: string; reason?: string }
): Promise<ApiResponse<ManualAssignment>> {
  return apiPost<ManualAssignment>(
    `/api/coaching/manual-assignments/assignments/${assignmentId}/postpone/`,
    data
  );
}

/**
 * Geç teslim notunu güncelle
 */
export async function updateLateNote(
  assignmentId: number,
  lateSubmissionNote: string
): Promise<ApiResponse<ManualAssignment>> {
  return apiPost<ManualAssignment>(
    `/api/coaching/manual-assignments/assignments/${assignmentId}/update_late_note/`,
    { late_submission_note: lateSubmissionNote }
  );
}

/**
 * Tüm görevleri yapmadı olarak işaretle
 */
export async function markAllNotDone(
  assignmentId: number,
  data: { reason: string; note?: string }
): Promise<ApiResponse<ManualAssignment>> {
  return apiPost<ManualAssignment>(
    `/api/coaching/manual-assignments/assignments/${assignmentId}/mark_all_not_done/`,
    data
  );
}

/**
 * Görev tamamlanma durumunu güncelle (Yaptı/Yapmadı/Eksik)
 */
export async function updateTaskCompletionStatus(
  taskId: number,
  data: {
    completion_status: string;
    task_completion_percent?: number;
    coach_evaluation_note?: string;
  }
): Promise<ApiResponse<AssignmentTask>> {
  return apiPost<AssignmentTask>(
    `/api/coaching/manual-assignments/tasks/${taskId}/update_task_status/`,
    data
  );
}

/**
 * Görev değerlendirmesini sıfırla
 */
export async function resetTaskCompletionStatus(
  taskId: number
): Promise<ApiResponse<AssignmentTask>> {
  return apiPost<AssignmentTask>(
    `/api/coaching/manual-assignments/tasks/${taskId}/reset_task_status/`,
    {}
  );
}

/**
 * Tüm değerlendirilmiş görevleri sıfırla
 */
export async function resetAllTaskCompletionStatuses(
  assignmentId: number
): Promise<ApiResponse<ManualAssignment> & { reset_count?: number }> {
  return apiPost<ManualAssignment>(
    `/api/coaching/manual-assignments/assignments/${assignmentId}/reset_all_tasks/`,
    {}
  );
}

/**
 * Görev değerlendirme notunu güncelle (durum değiştirmeden)
 */
export async function updateTaskEvaluationNote(
  taskId: number,
  note: string
): Promise<ApiResponse<AssignmentTask>> {
  return apiPost<AssignmentTask>(
    `/api/coaching/manual-assignments/tasks/${taskId}/evaluation_note/`,
    { coach_evaluation_note: note }
  );
}

export interface ContentTaskHistoryItem {
  content_id: number;
  completion_status: string;
  task_completion_percent: number;
  completed_question_count: number;
  question_count: number;
  assignment_id: number;
  assignment_title: string;
  assignment_status: string;
  evaluated_at: string | null;
}

export type ContentTaskHistory = Record<number, ContentTaskHistoryItem>;

/**
 * Öğrencinin content bazlı görev geçmişi
 */
export async function fetchContentTaskHistory(
  studentId: number
): Promise<ApiResponse<ContentTaskHistory>> {
  return apiGet<ContentTaskHistory>(
    `/api/coaching/manual-assignments/assignments/content_task_history/?student_id=${studentId}`
  );
}

export interface OgrenciBrief {
  id: number;
  ad: string;
  soyad: string;
  profil_foto?: string | null;
  sinif_ad?: string;
  ogrenci_no?: string;
  numara?: string;
}

/**
 * Öğrenci listesini getir (ödev verme ekranı)
 */
export async function fetchOgrenciList(): Promise<ApiResponse<OgrenciBrief[]>> {
  const response = await apiGet<OgrenciBrief[] | Record<string, unknown>>('/ogrenciler/api/list/');
  if (!response.success) return { ...response, data: [] };

  const extra = response as ApiResponse<OgrenciBrief[]> & { ogrenciler?: OgrenciBrief[] };
  if (Array.isArray(extra.ogrenciler)) {
    return { success: true, data: extra.ogrenciler };
  }
  if (Array.isArray(response.data)) {
    return { success: true, data: response.data };
  }
  if (response.data && typeof response.data === 'object') {
    const obj = response.data as Record<string, unknown>;
    const list = obj.ogrenciler ?? obj.results;
    if (Array.isArray(list)) {
      return { success: true, data: list as OgrenciBrief[] };
    }
  }
  return { success: true, data: [] };
}

/**
 * Öğrenciye atanmış kaynakları getir
 */
export async function fetchStudentResourcesByStudent(
  studentId: number
): Promise<ApiResponse<StudentResourceAssignment[]>> {
  return apiGet<StudentResourceAssignment[]>(
    `/api/student-resources/assignments/?student=${studentId}`
  );
}

/** @alias fetchDersler */
export const fetchLessons = fetchDersler;

export interface AssignmentReportData extends ManualAssignment {
  report_summary?: Record<string, unknown>;
  student_info?: { id: number; ad: string; soyad: string; profil_foto?: string | null };
}

export interface AssignmentReportOverallStats {
  total_assignments: number;
  completed_assignments: number;
  in_progress_assignments: number;
  overdue_assignments: number;
  full_assignments: number;
  partial_assignments: number;
  not_brought_assignments: number;
  not_done_assignments: number;
  other_non_submission_assignments: number;
  pending_evaluations: number;
  evaluated_assignments: number;
  assignment_success_percent: number;
  total_tasks_all: number;
  done_tasks_all: number;
  partial_tasks_all: number;
  not_done_tasks_all: number;
  pending_tasks_all: number;
  total_questions_all: number;
  completed_questions_all: number;
  total_pages_all: number;
  completed_pages_all: number;
  overall_completion_percent: number;
  assignment_completion_percent: number;
  question_completion_percent_all: number;
}

export interface AssignmentReportResponse {
  data: AssignmentReportData;
  overall_stats: AssignmentReportOverallStats;
  topic_cumulative: Record<string, unknown>[];
  lesson_cumulative: Record<string, unknown>[];
  recent_trend: Record<string, unknown>[];
}

/**
 * Ödev sonuç raporu verilerini getir
 */
export async function fetchAssignmentReport(
  assignmentId: number | string,
  options?: { printToken?: string },
): Promise<ApiResponse<AssignmentReportData> & Partial<Omit<AssignmentReportResponse, 'data'>>> {
  const headers: Record<string, string> = {};
  if (options?.printToken) {
    headers["X-Print-Token"] = options.printToken;
  }
  const response = await apiGet<AssignmentReportData>(
    `/api/coaching/manual-assignments/assignments/${assignmentId}/report/`,
    Object.keys(headers).length ? { headers } : {},
  );
  return response as ApiResponse<AssignmentReportData> & Partial<Omit<AssignmentReportResponse, 'data'>>;
}

export type AssignmentNotifyType = 'plan' | 'report';

export interface AssignmentNotifySendHistory {
  sent_at: string;
  status: string;
}

export interface AssignmentNotifyRecipient {
  recipient_type: 'veli' | 'ogrenci';
  ogrenci_id: number;
  veli_id: number | null;
  display_name: string;
  telefon: string;
  body: string;
  skip_reason?: string;
  send_count?: number;
  last_sent_at?: string | null;
  send_history?: AssignmentNotifySendHistory[];
}

export interface AssignmentNotifyPreviewData {
  notify_type: AssignmentNotifyType;
  assignment_id: number;
  assignment_title: string;
  student_name: string;
  pdf_title: string;
  recipients: AssignmentNotifyRecipient[];
}

export async function previewAssignmentNotify(
  assignmentId: number,
  notifyType: AssignmentNotifyType,
): Promise<ApiResponse<AssignmentNotifyPreviewData>> {
  return apiGet<AssignmentNotifyPreviewData>(
    `/api/coaching/manual-assignments/assignments/${assignmentId}/notify-preview/?type=${notifyType}`,
  );
}

export async function renderAssignmentReportPdf(
  assignmentId: number,
  reportHtml: string,
  notifyType: AssignmentNotifyType,
): Promise<Blob> {
  const endpoint = `/api/coaching/manual-assignments/assignments/${assignmentId}/render-report-pdf/`;
  const url = typeof window !== "undefined" && endpoint.startsWith("/api/")
    ? endpoint
    : `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}${endpoint}`;

  const contextHeaders: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const kurumId = localStorage.getItem("3k_active_kurum");
    if (kurumId) {
      try {
        const parsed = JSON.parse(kurumId);
        contextHeaders["X-Kurum-ID"] = String(parsed?.id ?? parsed);
      } catch {
        contextHeaders["X-Kurum-ID"] = kurumId;
      }
    }
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "lms_csrftoken") contextHeaders["X-CSRFToken"] = value;
    }
  }

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...contextHeaders,
    },
    body: JSON.stringify({ report_html: reportHtml, notify_type: notifyType }),
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      throw new Error(extractApiError(data, res, "PDF oluşturulamadı"));
    }
    throw new Error(`PDF oluşturulamadı (${res.status})`);
  }
  return res.blob();
}

export async function sendAssignmentNotify(
  assignmentId: number,
  payload: {
    notify_type: AssignmentNotifyType;
    veli_ids?: number[];
    include_student?: boolean;
    force_resend?: boolean;
    /** Ekrandaki rapor/plan HTML'i — sunucuda vektörel PDF'e çevrilir (legacy) */
    report_html?: string;
    /** Hazır PDF — ödev planı için */
    pdf_blob?: Blob;
    pdf_filename?: string;
    orientation?: "portrait" | "landscape";
  },
): Promise<ApiResponse<{ sent: number; skipped: number; errors: string[]; sent_details?: { recipient_type: string; display_name: string; telefon: string; message_status: string }[] }>> {
  if (payload.pdf_blob) {
    const form = new FormData();
    form.append("notify_type", payload.notify_type);
    form.append("veli_ids", JSON.stringify(payload.veli_ids ?? []));
    form.append("include_student", payload.include_student ? "true" : "false");
    const filename = payload.pdf_filename ?? (
      payload.notify_type === "report"
        ? `odev-rapor-${assignmentId}.pdf`
        : `odev-plani-${assignmentId}.pdf`
    );
    form.append("pdf", payload.pdf_blob, filename);
    return apiPostForm(
      `/api/coaching/manual-assignments/assignments/${assignmentId}/notify-send/`,
      form,
    );
  }

  return apiPost(
    `/api/coaching/manual-assignments/assignments/${assignmentId}/notify-send/`,
    {
      notify_type: payload.notify_type,
      veli_ids: payload.veli_ids,
      include_student: payload.include_student,
      force_resend: payload.force_resend ?? true,
      report_html: payload.report_html,
      orientation: payload.orientation,
    },
  );
}
