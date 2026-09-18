import { apiGet, apiPost, type ApiResponse } from './api';

export type StudyScenario =
  | 'STANDART'
  | 'YOGUN'
  | 'SINAV_HAFTASI'
  | 'ZAYIF_KONU'
  | 'TYT_GUNLUK'
  | 'OZEL';

export type DistributionStrategy = 'BY_TEST' | 'BY_QUESTION' | 'EQUAL' | 'WEIGHTED';
export type LoadLevel = 'IDEAL' | 'YOGUN' | 'TASTI';
export type DayState = 'empty' | 'partial' | 'done' | 'locked' | 'over';

export interface StudyTemplate {
  id: number;
  name: string;
  scenario: StudyScenario;
  scenario_display: string;
  strategy: DistributionStrategy;
  strategy_display: string;
  active_weekdays: number[];
  max_questions_per_day: number;
  max_tests_per_day: number;
  max_minutes_per_day: number;
  max_slots_per_day: number;
  is_builtin: boolean;
  is_active: boolean;
  usage_count?: number;
}

export interface StudySlot {
  id: number;
  source_assignment: number | null;
  source_kind: string;
  lesson_name: string;
  title: string;
  topic_name: string;
  resource_name: string;
  planned_tests: number;
  planned_questions: number;
  planned_minutes: number;
  is_done: boolean;
  is_locked: boolean;
  assignment_title: string;
}

export interface StudyDay {
  id: number;
  day_date: string;
  weekday: number;
  label: string;
  chip: string;
  is_locked: boolean;
  planned_tests: number;
  planned_questions: number;
  planned_minutes: number;
  planned_slots: number;
  completed_slots: number;
  completed_minutes: number;
  load_level: LoadLevel;
  cap_tests: number;
  cap_questions: number;
  cap_minutes: number;
  slots: StudySlot[];
}

export interface StudyLeftover {
  id: number;
  title: string;
  lesson_name: string;
  remaining_tests: number;
  remaining_questions: number;
  remaining_minutes: number;
  reason: string;
  reason_display: string;
}

export interface StudySummary {
  tasks: { done: number; total: number };
  questions: { done: number; total: number; planned: number };
  tests: { done: number; total: number; planned: number };
  minutes: {
    done: number;
    total: number;
    planned: number;
    done_label: string;
    total_label: string;
  };
  completion_percent: number;
  missing: string[];
  subjects: { lesson: string; percent: number; minutes: number }[];
  days: {
    date: string;
    label: string;
    tasks: string;
    minutes: string;
    chip: string;
    state: DayState;
    load_level: LoadLevel;
    is_locked: boolean;
  }[];
  leftover_count: number;
  leftover_tests: number;
  leftover_questions: number;
}

export interface StudyProgram {
  id: number;
  student: number;
  student_name: string;
  coach_name: string;
  template: number | null;
  template_name: string;
  week_start: string;
  week_end: string;
  generation_version: number;
  status: string;
  is_readonly: boolean;
  days: StudyDay[];
  leftovers: StudyLeftover[];
  summary: StudySummary;
}

export interface StudyProgramListItem {
  id: number;
  student: number;
  student_name: string;
  coach_name: string;
  template_name: string;
  week_start: string;
  week_end: string;
  status: string;
  is_readonly: boolean;
}

export interface GeneratePreview {
  week_start: string;
  week_end: string;
  days: number;
  avg_minutes: number;
  pool_tests: number;
  pool_questions: number;
  overflow_sources: number;
  label: string;
  warnings: string[];
  leftovers: { remaining_tests: number; remaining_questions: number; title: string }[];
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as { results?: T[] }).results)) {
    return (data as { results: T[] }).results;
  }
  return [];
}

export async function fetchStudyTemplates(): Promise<ApiResponse<StudyTemplate[]>> {
  const res = await apiGet<StudyTemplate[] | { results: StudyTemplate[] }>(
    '/api/coaching/study-plans/templates/'
  );
  if (!res.success) return { success: false, error: res.error };
  return { success: true, data: unwrapList<StudyTemplate>(res.data) };
}

export async function previewStudyTemplate(
  templateId: number,
  payload: { student_id: number; week_start: string; include_homework?: boolean }
): Promise<ApiResponse<GeneratePreview>> {
  return apiPost<GeneratePreview>(
    `/api/coaching/study-plans/templates/${templateId}/preview/`,
    payload
  );
}

export async function fetchStudyPrograms(params: {
  student_id?: number;
  week_start?: string;
}): Promise<ApiResponse<StudyProgramListItem[]>> {
  const qs = new URLSearchParams();
  if (params.student_id) qs.set('student_id', String(params.student_id));
  if (params.week_start) qs.set('week_start', params.week_start);
  const res = await apiGet<StudyProgramListItem[] | { results: StudyProgramListItem[] }>(
    `/api/coaching/study-plans/programs/?${qs.toString()}`
  );
  if (!res.success) return { success: false, error: res.error };
  return { success: true, data: unwrapList<StudyProgramListItem>(res.data) };
}

export async function fetchStudyProgram(id: number): Promise<ApiResponse<StudyProgram>> {
  return apiGet<StudyProgram>(`/api/coaching/study-plans/programs/${id}/`);
}

export async function generateStudyProgram(payload: {
  student_id: number;
  week_start: string;
  template_id: number;
  include_homework?: boolean;
}): Promise<ApiResponse<StudyProgram> & { already_exists?: boolean; program_id?: number }> {
  const res = await apiPost<StudyProgram & { already_exists?: boolean; program_id?: number; program?: StudyProgram }>(
    '/api/coaching/study-plans/programs/generate/',
    payload
  );
  if (!res.success && res.data?.already_exists && res.data.program) {
    return {
      success: true,
      data: res.data.program,
      already_exists: true,
      program_id: res.data.program_id,
      error: res.data.error,
    };
  }
  return res;
}

export async function regenerateStudyProgram(
  id: number,
  payload: { lock_past?: boolean; template_id?: number } = {}
): Promise<ApiResponse<StudyProgram>> {
  return apiPost<StudyProgram>(`/api/coaching/study-plans/programs/${id}/regenerate/`, payload);
}
