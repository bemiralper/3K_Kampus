/**
 * Study Program API Client
 * Çalışma Programı modülü için API fonksiyonları
 */

import { apiGet, apiPost, apiFetch, apiDelete, ApiResponse } from './api';

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

export type BlockType =
  | 'KONU_OGRENME'
  | 'TEKRAR'
  | 'SORU_COZUMU'
  | 'BRANS_DENEMESI'
  | 'MINI_TEST'
  | 'ANALIZ'
  | 'ZAYIF_KONU'
  | 'DENEME';

export type GoalType =
  | 'NET_ARTIRMA'
  | 'KONU_TAMAMLAMA'
  | 'DENEME_HAZIRLIK'
  | 'EKSIK_KAPATMA'
  | 'SURE_HIZLANDIRMA';

export type LoadLevel = 'IDEAL' | 'YOGUN' | 'ASIRI';
export type EnergyLevel = 'YUKSEK' | 'NORMAL' | 'DUSUK';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export const BLOCK_TYPE_META: Record<BlockType, { label: string; icon: string; color: string }> = {
  KONU_OGRENME:   { label: 'Konu Öğrenme',          icon: '📖', color: '#3b82f6' },
  TEKRAR:         { label: 'Tekrar',                 icon: '🔁', color: '#8b5cf6' },
  SORU_COZUMU:    { label: 'Soru Çözümü',            icon: '📝', color: '#22c55e' },
  BRANS_DENEMESI: { label: 'Branş Denemesi',         icon: '🎯', color: '#f97316' },
  MINI_TEST:      { label: 'Mini Test',              icon: '⚡', color: '#eab308' },
  ANALIZ:         { label: 'Analiz',                 icon: '📊', color: '#06b6d4' },
  ZAYIF_KONU:     { label: 'Zayıf Konu Çalışması',  icon: '🧠', color: '#ef4444' },
  DENEME:         { label: 'Deneme',                 icon: '📋', color: '#0d9488' },
};

export const GOAL_TYPE_META: Record<GoalType, { label: string; icon: string }> = {
  NET_ARTIRMA:      { label: 'Net Artırma',       icon: '📈' },
  KONU_TAMAMLAMA:   { label: 'Konu Tamamlama',    icon: '📚' },
  DENEME_HAZIRLIK:  { label: 'Deneme Hazırlık',   icon: '🎯' },
  EKSIK_KAPATMA:    { label: 'Eksik Kapatma',     icon: '🔧' },
  SURE_HIZLANDIRMA: { label: 'Süre Hızlandırma',  icon: '⏱️' },
};

export const PRIORITY_META: Record<Priority, { label: string; color: string; icon: string }> = {
  LOW:    { label: 'Düşük',  color: '#22c55e', icon: '🟢' },
  MEDIUM: { label: 'Orta',   color: '#eab308', icon: '🟡' },
  HIGH:   { label: 'Yüksek', color: '#ef4444', icon: '🔴' },
  URGENT: { label: 'Acil',   color: '#dc2626', icon: '🔴' },
};

export const LOAD_LEVEL_META: Record<LoadLevel, { label: string; color: string }> = {
  IDEAL: { label: 'İdeal', color: '#22c55e' },
  YOGUN: { label: 'Yoğun', color: '#f97316' },
  ASIRI: { label: 'Aşırı', color: '#ef4444' },
};

export const WEEKDAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];
export const WEEKDAY_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

// ─── Interfaces ───

export interface ProgramBlock {
  id: number;
  day: number;
  source_assignment: number | null;
  source_task: number | null;
  source_lesson: number | null;
  lesson: number | null;
  lesson_name: string | null;
  title: string;
  topic_name: string;
  resource_name: string;
  block_type: BlockType;
  block_type_display: string;
  goal_type: GoalType | '';
  goal_type_display: string;
  question_count: number;
  estimated_duration_minutes: number | null;
  priority: Priority;
  priority_display: string;
  order: number;
  is_completed: boolean;
  completed_at: string | null;
  actual_duration: number | null;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface DailyFeedback {
  id: number;
  day: number;
  struggled: boolean | null;
  time_enough: boolean | null;
  unclear_topic: string;
  comment: string;
  energy_level: EnergyLevel;
  energy_level_display: string;
  created_at: string;
  updated_at: string;
}

export interface ProgramDay {
  id: number;
  program: number;
  day_date: string;
  weekday: number;
  weekday_display: string;
  total_question_count: number;
  total_block_count: number;
  completion_percent: number;
  load_level: LoadLevel;
  load_level_display: string;
  coach_note: string;
  blocks: ProgramBlock[];
  feedback: DailyFeedback | null;
  created_at: string;
  updated_at: string;
}

export interface Badge {
  id: number;
  student: number;
  program: number;
  code: string;
  code_display: string;
  title: string;
  description: string;
  icon: string;
  earned_date: string;
  created_at: string;
}

export interface WeeklyProgram {
  id: number;
  student: number;
  student_name: string;
  student_photo: string | null;
  student_class: string | null;
  coach: number | null;
  coach_name: string | null;
  week_start: string;
  week_end: string;
  total_question_count: number;
  total_block_count: number;
  completion_percent: number;
  is_template: boolean;
  template_name: string;
  coach_note: string;
  days: ProgramDay[];
  badges: Badge[];
  created_at: string;
  updated_at: string;
}

export interface WeeklyProgramListItem {
  id: number;
  student: number;
  student_name: string;
  student_photo: string | null;
  student_class: string | null;
  coach: number | null;
  coach_name: string | null;
  week_start: string;
  week_end: string;
  total_question_count: number;
  total_block_count: number;
  completion_percent: number;
  load_level?: LoadLevel;
  load_level_display?: string;
  is_template: boolean;
  template_name: string;
  badge_count: number;
  created_at: string;
  updated_at: string;
}

export interface HomeworkPoolItem {
  id: number;
  title: string;
  status: string;
  status_display: string;
  priority: string;
  priority_display: string;
  lesson_name: string | null;
  topic_name: string;
  resource_name: string;
  question_count: number;
  due_date: string;
  coach_name?: string | null;
  is_planned: boolean;
  lesson_id: number | null;
}

export interface WeeklySummary {
  program_id: number;
  student_id: number;
  week_start: string;
  week_end: string;
  total_questions: number;
  total_blocks: number;
  completion_percent: number;
  max_streak: number;
  best_day: { weekday: string; completion: number; questions: number } | null;
  worst_day: { weekday: string; completion: number; questions: number } | null;
  days: Array<{
    weekday: string;
    date: string;
    questions: number;
    blocks: number;
    completion: number;
    load: LoadLevel;
    energy: EnergyLevel | null;
  }>;
  badges: Array<{ code: string; title: string; icon: string; earned_date: string }>;
}

// ═══════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════

const BASE = '/api/coaching/study-program';

/**
 * Haftalık program listesi
 */
export async function fetchPrograms(params?: {
  student_id?: number;
  is_template?: boolean;
  week_start?: string;
  for_date?: string;
  incomplete?: boolean;
}): Promise<ApiResponse<WeeklyProgramListItem[]>> {
  const sp = new URLSearchParams();
  if (params?.student_id) sp.append('student_id', String(params.student_id));
  if (params?.is_template !== undefined) sp.append('is_template', String(params.is_template));
  if (params?.week_start) sp.append('week_start', params.week_start);
  if (params?.for_date) sp.append('for_date', params.for_date);
  if (params?.incomplete) sp.append('incomplete', 'true');
  const qs = sp.toString();
  return apiGet(`${BASE}/programs/${qs ? `?${qs}` : ''}`);
}

/**
 * Program detayı (günler, bloklar, feedback, rozetler dahil)
 */
export async function fetchProgram(id: number): Promise<ApiResponse<WeeklyProgram>> {
  return apiGet(`${BASE}/programs/${id}/`);
}

/**
 * Yeni program oluştur (tarih aralığındaki günler otomatik oluşur)
 */
export async function createProgram(data: {
  student: number;
  week_start: string;
  week_end?: string;
  coach_note?: string;
}): Promise<ApiResponse<WeeklyProgram>> {
  return apiPost(`${BASE}/programs/`, data);
}

/**
 * Program güncelle
 */
export async function updateProgram(id: number, data: {
  coach_note?: string;
}): Promise<ApiResponse<WeeklyProgram>> {
  return apiFetch(`${BASE}/programs/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Program sil
 */
export async function deleteProgram(id: number): Promise<ApiResponse<void>> {
  return apiDelete(`${BASE}/programs/${id}/`);
}

/**
 * Dengeli dağıt
 */
export async function autoDistribute(programId: number, assignmentIds?: number[]): Promise<ApiResponse<{ distributed: number }>> {
  return apiPost(`${BASE}/programs/${programId}/auto-distribute/`, {
    assignment_ids: assignmentIds || [],
  });
}

/**
 * Haftalık özet
 */
export async function fetchSummary(programId: number): Promise<ApiResponse<WeeklySummary>> {
  return apiGet(`${BASE}/programs/${programId}/summary/`);
}

/**
 * Rozet hesapla
 */
export async function calculateBadges(programId: number): Promise<ApiResponse<{ new_badges: string[] }>> {
  return apiPost(`${BASE}/programs/${programId}/calculate-badges/`, {});
}

/**
 * Şablon olarak kaydet
 */
export async function saveAsTemplate(programId: number, name: string): Promise<ApiResponse<{ id: number; template_name: string }>> {
  return apiPost(`${BASE}/programs/${programId}/save-as-template/`, { name });
}

/**
 * Şablonu uygula
 */
export async function applyTemplate(programId: number, templateId: number): Promise<ApiResponse<WeeklyProgram>> {
  return apiPost(`${BASE}/programs/${programId}/apply-template/`, { template_id: templateId });
}

/**
 * Program sıfırla — tüm blokları sil, boş takvim ile en başa dön
 */
export async function resetProgram(programId: number): Promise<ApiResponse<{ deleted: number; program: WeeklyProgram }>> {
  return apiPost(`${BASE}/programs/${programId}/reset/`);
}

/**
 * Mevcut blokları dengeli şekilde yeniden dağıt
 */
export async function redistributeBlocks(programId: number): Promise<ApiResponse<{ redistributed: number; program: WeeklyProgram }>> {
  return apiPost(`${BASE}/programs/${programId}/redistribute/`);
}

/**
 * Ödev havuzu (sol panel)
 */
export async function fetchHomeworkPool(params: {
  student_id: number;
  program_id?: number;
  lesson_id?: number;
  status?: string;
}): Promise<ApiResponse<HomeworkPoolItem[]>> {
  const sp = new URLSearchParams();
  sp.append('student_id', String(params.student_id));
  if (params.program_id) sp.append('program_id', String(params.program_id));
  if (params.lesson_id) sp.append('lesson_id', String(params.lesson_id));
  if (params.status) sp.append('status', params.status);
  return apiGet(`${BASE}/programs/homework-pool/?${sp.toString()}`);
}

// ─── Day API ───

/**
 * Gün güncelle (koç notu vs.)
 */
export async function updateDay(dayId: number, data: {
  coach_note?: string;
}): Promise<ApiResponse<ProgramDay>> {
  return apiFetch(`${BASE}/days/${dayId}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ─── Block API ───

/**
 * Blok oluştur
 */
export async function createBlock(data: {
  day: number;
  source_assignment?: number;
  source_lesson?: number | null;
  lesson?: number;
  title: string;
  topic_name?: string;
  resource_name?: string;
  block_type: BlockType;
  goal_type?: GoalType;
  question_count?: number;
  estimated_duration_minutes?: number;
  priority?: Priority;
  order?: number;
  color?: string;
}): Promise<ApiResponse<ProgramBlock>> {
  return apiPost(`${BASE}/blocks/`, data);
}

/**
 * Blok güncelle
 */
export async function updateBlock(id: number, data: Partial<ProgramBlock>): Promise<ApiResponse<ProgramBlock>> {
  return apiFetch(`${BASE}/blocks/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Blok sil
 */
export async function deleteBlock(id: number): Promise<ApiResponse<void>> {
  return apiDelete(`${BASE}/blocks/${id}/`);
}

/**
 * Blok tamamla/geri al
 */
export async function toggleBlockComplete(id: number, actualDuration?: number): Promise<ApiResponse<ProgramBlock>> {
  return apiPost(`${BASE}/blocks/${id}/toggle-complete/`, {
    actual_duration: actualDuration,
  });
}

/**
 * Blok sıralama (drag-drop sonrası)
 */
export async function reorderBlocks(items: Array<{
  block_id: number;
  day_id: number;
  order: number;
}>): Promise<ApiResponse<{ updated: number }>> {
  return apiPost(`${BASE}/blocks/reorder/`, { items });
}

/**
 * Bloğu başka güne taşı
 */
export async function moveBlock(blockId: number, dayId: number): Promise<ApiResponse<ProgramBlock>> {
  return apiPost(`${BASE}/blocks/${blockId}/move/`, { day_id: dayId });
}

/**
 * Bloğu birden fazla güne böl
 * Orijinal blok silinir, her güne yeni parça oluşturulur.
 */
export async function splitBlockToDays(
  blockId: number,
  data: {
    day_ids: number[];
    question_counts?: number[];
    titles?: string[];
  }
): Promise<ApiResponse<{ split_count: number; blocks: ProgramBlock[] }>> {
  return apiPost(`${BASE}/blocks/${blockId}/split-to-days/`, data);
}

/**
 * Ödev havuzundaki bir ödevi doğrudan birden fazla güne bölerek ekle.
 * Frontend-only yardımcı — her gün için ayrı createBlock çağırır.
 */
export async function splitHomeworkToDays(
  item: HomeworkPoolItem,
  dayIds: number[],
  questionCounts: number[],
): Promise<ApiResponse<ProgramBlock[]>> {
  const n = dayIds.length;
  const totalDur = 0; // havuzda süre bilgisi yok
  const blocks: ProgramBlock[] = [];

  for (let i = 0; i < n; i++) {
    const res = await createBlock({
      day: dayIds[i],
      source_assignment: item.id,
      source_lesson: item.lesson_id,
      title: `${item.title} (${i + 1}/${n})`,
      topic_name: item.topic_name || '',
      resource_name: item.resource_name || '',
      block_type: 'SORU_COZUMU' as BlockType,
      question_count: questionCounts[i],
      priority: (item.priority as Priority) || 'MEDIUM',
    });
    if (res.success && res.data) blocks.push(res.data);
  }

  return { success: blocks.length === n, data: blocks };
}

// ─── Feedback API ───

/**
 * Günlük feedback oluştur/güncelle
 */
export async function saveFeedback(data: {
  day: number;
  struggled?: boolean;
  time_enough?: boolean;
  unclear_topic?: string;
  comment?: string;
}): Promise<ApiResponse<DailyFeedback>> {
  return apiPost(`${BASE}/feedbacks/`, data);
}

/**
 * Feedback güncelle
 */
export async function updateFeedback(id: number, data: Partial<DailyFeedback>): Promise<ApiResponse<DailyFeedback>> {
  return apiFetch(`${BASE}/feedbacks/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ─── Badge API ───

/**
 * Rozetleri getir
 */
export async function fetchBadges(params?: {
  student_id?: number;
  program_id?: number;
}): Promise<ApiResponse<Badge[]>> {
  const sp = new URLSearchParams();
  if (params?.student_id) sp.append('student_id', String(params.student_id));
  if (params?.program_id) sp.append('program_id', String(params.program_id));
  const qs = sp.toString();
  return apiGet(`${BASE}/badges/${qs ? `?${qs}` : ''}`);
}
