/**
 * Schedule View API
 * 
 * Program görüntüleme ve versiyon yönetimi API çağrıları
 */

import { apiGet, apiPost, apiPut, apiDelete, ApiResponse } from "./api";

// ==================== INTERFACES ====================

export interface ScheduleVersion {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  is_locked: boolean;
  term: { id: number; name: string } | null;
  schedule_template: { id: number; name: string } | null;
  weekly_cycle: { id: number; name: string } | null;
  egitim_yili: { id: number; display: string } | null;
  created_by: { id: number; username: string } | null;
  cell_count: number;
  filled_cell_count: number;
  completion_rate: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleDay {
  id: number;
  name: string;
  short_name: string;
  order: number;
}

export interface ScheduleSlot {
  id: number;
  slot_number: number;
  start_time: string;
  end_time: string;
  slot_type: string;
}

export interface ScheduleCell {
  id: number;
  day_id: number;
  slot_id: number;
  status: "EMPTY" | "FILLED" | "LOCKED" | "BLOCKED" | "EXAM" | "HOLIDAY";
  lesson?: { id: number; name: string; code?: string };
  teacher?: { id: number; name: string };
  classroom?: { id: number; name: string };
  room?: { id: number; name: string };
  double_block: boolean;
  notes?: string;
}

export interface ScheduleGridResponse {
  version?: ScheduleVersion;
  term: { id: number; name: string };
  schedule_template: { id: number; name: string };
  weekly_cycle: { id: number; name: string };
  days: ScheduleDay[];
  slots: ScheduleSlot[];
  cells: ScheduleCell[];
  total_cells: number;
  filled_cells: number;
}

export interface ClassScheduleParams {
  classroom_id: number;
  term_id?: number;
  version_id?: number;
}

export interface TeacherScheduleParams {
  teacher_id: number;
  term_id?: number;
  version_id?: number;
}

export interface StudentScheduleParams {
  student_id: number;
  term_id?: number;
  version_id?: number;
}

export interface RoomScheduleParams {
  room_id: number;
  term_id?: number;
  version_id?: number;
}

export interface DailyFlowParams {
  date: string; // YYYY-MM-DD
  classroom_id?: number;
  teacher_id?: number;
  version_id?: number;
}

// ==================== VERSION API ====================

/**
 * Versiyonları listele
 */
export async function fetchScheduleVersions(params?: {
  term_id?: number;
  schedule_template_id?: number;
  weekly_cycle_id?: number;
}): Promise<ApiResponse<ScheduleVersion[]>> {
  const queryParams = new URLSearchParams();
  if (params?.term_id) queryParams.set("term_id", params.term_id.toString());
  if (params?.schedule_template_id) queryParams.set("schedule_template_id", params.schedule_template_id.toString());
  if (params?.weekly_cycle_id) queryParams.set("weekly_cycle_id", params.weekly_cycle_id.toString());
  
  const query = queryParams.toString();
  return apiGet<ScheduleVersion[]>(`/api/academic/schedule/versions/${query ? `?${query}` : ""}`);
}

/**
 * Versiyon detayını getir
 */
export async function fetchScheduleVersion(id: number): Promise<ApiResponse<ScheduleVersion>> {
  return apiGet<ScheduleVersion>(`/api/academic/schedule/versions/${id}/`);
}

/**
 * Yeni versiyon oluştur
 */
export async function createScheduleVersion(data: {
  name: string;
  description?: string;
  term_id: number;
  schedule_template_id: number;
  weekly_cycle_id: number;
}): Promise<ApiResponse<ScheduleVersion>> {
  return apiPost<ScheduleVersion>("/api/academic/schedule/versions/create/", data);
}

/**
 * Versiyonu güncelle
 */
export async function updateScheduleVersion(
  id: number,
  data: { name?: string; description?: string }
): Promise<ApiResponse<ScheduleVersion>> {
  return apiPut<ScheduleVersion>(`/api/academic/schedule/versions/${id}/update/`, data);
}

/**
 * Versiyonu sil
 */
export async function deleteScheduleVersion(id: number): Promise<ApiResponse<{ message: string }>> {
  return apiDelete<{ message: string }>(`/api/academic/schedule/versions/${id}/delete/`);
}

/**
 * Versiyonu aktif yap
 */
export async function activateScheduleVersion(id: number): Promise<ApiResponse<ScheduleVersion>> {
  return apiPost<ScheduleVersion>(`/api/academic/schedule/versions/${id}/activate/`);
}

/**
 * Versiyonu kopyala
 */
export async function duplicateScheduleVersion(
  id: number,
  data: { name: string; description?: string }
): Promise<ApiResponse<ScheduleVersion>> {
  return apiPost<ScheduleVersion>(`/api/academic/schedule/versions/${id}/duplicate/`, data);
}

/**
 * Versiyonu kilitle
 */
export async function lockScheduleVersion(id: number): Promise<ApiResponse<ScheduleVersion>> {
  return apiPost<ScheduleVersion>(`/api/academic/schedule/versions/${id}/lock/`);
}

/**
 * Versiyon kilidini aç
 */
export async function unlockScheduleVersion(id: number): Promise<ApiResponse<ScheduleVersion>> {
  return apiPost<ScheduleVersion>(`/api/academic/schedule/versions/${id}/unlock/`);
}

// ==================== SCHEDULE VIEW API ====================

/**
 * Sınıf programını getir
 */
export async function fetchClassSchedule(params: ClassScheduleParams): Promise<ApiResponse<ScheduleGridResponse>> {
  const queryParams = new URLSearchParams();
  queryParams.set("classroom_id", params.classroom_id.toString());
  if (params.term_id) queryParams.set("term_id", params.term_id.toString());
  if (params.version_id) queryParams.set("version_id", params.version_id.toString());
  
  return apiGet<ScheduleGridResponse>(`/api/academic/schedule/class/?${queryParams.toString()}`);
}

/**
 * Öğretmen programını getir
 */
export async function fetchTeacherSchedule(params: TeacherScheduleParams): Promise<ApiResponse<ScheduleGridResponse>> {
  const queryParams = new URLSearchParams();
  queryParams.set("teacher_id", params.teacher_id.toString());
  if (params.term_id) queryParams.set("term_id", params.term_id.toString());
  if (params.version_id) queryParams.set("version_id", params.version_id.toString());
  
  return apiGet<ScheduleGridResponse>(`/api/academic/schedule/teacher/?${queryParams.toString()}`);
}

/**
 * Öğrenci programını getir
 */
export async function fetchStudentSchedule(params: StudentScheduleParams): Promise<ApiResponse<ScheduleGridResponse>> {
  const queryParams = new URLSearchParams();
  queryParams.set("student_id", params.student_id.toString());
  if (params.term_id) queryParams.set("term_id", params.term_id.toString());
  if (params.version_id) queryParams.set("version_id", params.version_id.toString());
  
  return apiGet<ScheduleGridResponse>(`/api/academic/schedule/student/?${queryParams.toString()}`);
}

/**
 * Oda programını getir
 */
export async function fetchRoomSchedule(params: RoomScheduleParams): Promise<ApiResponse<ScheduleGridResponse>> {
  const queryParams = new URLSearchParams();
  queryParams.set("room_id", params.room_id.toString());
  if (params.term_id) queryParams.set("term_id", params.term_id.toString());
  if (params.version_id) queryParams.set("version_id", params.version_id.toString());
  
  return apiGet<ScheduleGridResponse>(`/api/academic/schedule/room/?${queryParams.toString()}`);
}

/**
 * Günlük akış programını getir
 */
export async function fetchDailyFlow(params: DailyFlowParams): Promise<ApiResponse<ScheduleGridResponse>> {
  const queryParams = new URLSearchParams();
  queryParams.set("date", params.date);
  if (params.classroom_id) queryParams.set("classroom_id", params.classroom_id.toString());
  if (params.teacher_id) queryParams.set("teacher_id", params.teacher_id.toString());
  if (params.version_id) queryParams.set("version_id", params.version_id.toString());
  
  return apiGet<ScheduleGridResponse>(`/api/academic/schedule/daily-flow/?${queryParams.toString()}`);
}

// ==================== EXPORT UTILS ====================

/**
 * Grid verisini CSV formatına dönüştür
 */
export function gridToCSV(data: ScheduleGridResponse, title?: string): string {
  const rows: string[] = [];
  
  // Başlık
  if (title) {
    rows.push(title);
    rows.push("");
  }
  
  // Header satırı: Saat | Pazartesi | Salı | ...
  const headers = ["Saat", ...data.days.map(d => d.name)];
  rows.push(headers.join(","));
  
  // Her slot için satır
  for (const slot of data.slots) {
    if (slot.slot_type !== "DERS") continue; // Sadece ders slotları
    
    const row = [`${slot.start_time}-${slot.end_time}`];
    
    for (const day of data.days) {
      const cell = data.cells.find(c => c.day_id === day.id && c.slot_id === slot.id);
      if (cell?.lesson) {
        const parts = [cell.lesson.name];
        if (cell.teacher) parts.push(cell.teacher.name);
        if (cell.room) parts.push(cell.room.name);
        row.push(`"${parts.join(" - ")}"`);
      } else {
        row.push("");
      }
    }
    
    rows.push(row.join(","));
  }
  
  return rows.join("\n");
}

/**
 * CSV dosyasını indir
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
