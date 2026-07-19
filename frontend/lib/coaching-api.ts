/**
 * Coaching API Client
 * Koçluk modülü için API fonksiyonları
 */

import { apiGet, apiPost, apiFetch, ApiResponse } from './api';

// Types
export interface Coach {
  id: number;
  teacher: number;
  teacher_id: number;
  teacher_ad: string;
  teacher_soyad: string;
  teacher_full_name: string;
  teacher_fotograf?: string | null;
  capacity: number;
  is_active: boolean;
  is_coach: boolean;
  current_student_count: number;
  available_capacity: number;
  created_at: string;
  updated_at: string;
}

export interface CoachCreateUpdate {
  teacher_id?: number;  // Frontend'den gelen
  teacher?: number;      // Backend API format
  capacity: number;
  is_active: boolean;
  is_coach: boolean;
}

export interface CoachStats {
  current_student_count: number;
  available_capacity: number;
  active_assignments: number;
  pending_events: number;
  completed_events: number;
  total_events: number;
  gorev_bekleyen: number;
  gorev_geciken: number;
  gorev_tamamlanan: number;
}

export interface CoachStudent {
  id: number;
  student: number;
  student_id: number;
  student_ad: string;
  student_soyad: string;
  student_full_name: string;
  start_date: string;
  end_date: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface CoachListResponse {
  results?: Coach[];
  count?: number;
}

// API Functions

/**
 * Koç listesini getir
 */
export async function fetchCoaches(params?: {
  search?: string;
  is_active?: boolean;
  is_coach?: boolean;
  ordering?: string;
  page?: number;
}): Promise<ApiResponse<Coach[]>> {
  const searchParams = new URLSearchParams();
  
  if (params?.search) searchParams.append('search', params.search);
  if (params?.is_active !== undefined) searchParams.append('is_active', String(params.is_active));
  if (params?.is_coach !== undefined) searchParams.append('is_coach', String(params.is_coach));
  if (params?.ordering) searchParams.append('ordering', params.ordering);
  if (params?.page) searchParams.append('page', String(params.page));
  
  const queryString = searchParams.toString();
  const url = `/api/coaching/coaches/${queryString ? `?${queryString}` : ''}`;
  
  const response = await apiGet<CoachListResponse | Coach[]>(url);
  
  // DRF pagination format veya direkt array
  if (response.success && response.data !== undefined) {
    return { ...response, data: normalizeCoachList(response.data) };
  }
  
  return { ...response, data: [] } as ApiResponse<Coach[]>;
}

/**
 * Koç detayını getir
 */
export async function fetchCoach(id: number): Promise<ApiResponse<Coach>> {
  return apiGet<Coach>(`/api/coaching/coaches/${id}/`);
}

/**
 * Yeni koç oluştur
 */
export async function createCoach(data: CoachCreateUpdate): Promise<ApiResponse<Coach>> {
  // Frontend'den teacher_id gelirse teacher'a dönüştür
  const payload = {
    teacher: data.teacher_id || data.teacher,
    capacity: data.capacity,
    is_active: data.is_active,
    is_coach: data.is_coach,
  };
  return apiPost<Coach>('/api/coaching/coaches/', payload);
}

/**
 * Koç güncelle
 */
export async function updateCoach(id: number, data: Partial<CoachCreateUpdate>): Promise<ApiResponse<Coach>> {
  // Frontend'den teacher_id gelirse teacher'a dönüştür
  const payload: Record<string, unknown> = {};
  if (data.teacher_id !== undefined || data.teacher !== undefined) {
    payload.teacher = data.teacher_id || data.teacher;
  }
  if (data.capacity !== undefined) payload.capacity = data.capacity;
  if (data.is_active !== undefined) payload.is_active = data.is_active;
  if (data.is_coach !== undefined) payload.is_coach = data.is_coach;
  
  return apiFetch<Coach>(`/api/coaching/coaches/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Koç sil
 */
export async function deleteCoach(id: number): Promise<ApiResponse<void>> {
  return apiFetch<void>(`/api/coaching/coaches/${id}/`, {
    method: 'DELETE',
  });
}

/**
 * Koç istatistiklerini getir
 */
export async function fetchCoachStats(id: number): Promise<ApiResponse<CoachStats>> {
  return apiGet<CoachStats>(`/api/coaching/coaches/${id}/stats/`);
}

/**
 * Koça atanmış öğrencileri getir
 */
export async function fetchCoachStudents(id: number, activeOnly: boolean = true): Promise<ApiResponse<CoachStudent[]>> {
  const url = `/api/coaching/coaches/${id}/students/?active_only=${activeOnly}`;
  return apiGet<CoachStudent[]>(url);
}


// ==================== ASSIGNMENT TYPES & API ====================

export interface Assignment {
  id: number;
  coach: number;
  coach_id: number;
  coach_full_name: string;
  coach_capacity: number;
  coach_current_count: number;
  student: number;
  student_id: number;
  student_ad: string;
  student_soyad: string;
  student_full_name: string;
  student_sinif: string | null;
  start_date: string;
  end_date: string | null;
  is_primary: boolean;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignmentCreate {
  coach: number;
  student: number;
  start_date?: string;
  is_primary?: boolean;
}

export interface BulkAssignData {
  coach_id: number;
  student_ids: number[];
  start_date?: string;
  is_primary?: boolean;
}

export interface CoachChangeData {
  student_id: number;
  new_coach_id: number;
  transfer_date?: string;
}

export interface CoachChangeResult {
  previous_assignment: Assignment | null;
  new_assignment: Assignment;
}

export interface AvailableStudent {
  id: number;
  ad: string;
  soyad: string;
  full_name: string;
  sinif?: string | null;
  seviye?: string | null;
}

function normalizeStudentList(data: unknown): AvailableStudent[] {
  if (Array.isArray(data)) return data as AvailableStudent[];
  if (data && typeof data === 'object' && Array.isArray((data as { data?: AvailableStudent[] }).data)) {
    return (data as { data: AvailableStudent[] }).data;
  }
  return [];
}

function normalizeCoachList(data: unknown): Coach[] {
  if (Array.isArray(data)) return data as Coach[];
  if (data && typeof data === 'object') {
    const obj = data as { results?: Coach[]; data?: Coach[] };
    if (Array.isArray(obj.results)) return obj.results;
    if (Array.isArray(obj.data)) return obj.data;
  }
  return [];
}

export function normalizeAssignmentList(data: unknown): Assignment[] {
  if (Array.isArray(data)) return data as Assignment[];
  if (data && typeof data === 'object') {
    const obj = data as { results?: Assignment[]; data?: Assignment[] };
    if (Array.isArray(obj.results)) return obj.results;
    if (Array.isArray(obj.data)) return obj.data;
  }
  return [];
}

function pickActiveAssignment(
  assignments: Assignment[],
  activeCoach?: Assignment | null
): Assignment | null {
  if (activeCoach) return activeCoach;
  return (
    assignments.find(a => a.is_primary && (a.is_active ?? !a.end_date)) ??
    assignments.find(a => a.is_active ?? !a.end_date) ??
    assignments[0] ??
    null
  );
}

export function assignmentCoachName(assignment: Assignment | null | undefined): string {
  if (!assignment) return '';
  return assignment.coach_full_name?.trim() || 'Koç';
}

/**
 * Assignment listesini getir
 */
export async function fetchAssignments(params?: {
  coach_id?: number;
  student_id?: number;
  active_only?: boolean;
  is_primary?: boolean;
  search?: string;
  ordering?: string;
}): Promise<ApiResponse<Assignment[]>> {
  const searchParams = new URLSearchParams();
  
  if (params?.coach_id) searchParams.append('coach_id', String(params.coach_id));
  if (params?.student_id) searchParams.append('student_id', String(params.student_id));
  if (params?.active_only !== undefined) searchParams.append('active_only', String(params.active_only));
  if (params?.is_primary !== undefined) searchParams.append('is_primary', String(params.is_primary));
  if (params?.search) searchParams.append('search', params.search);
  if (params?.ordering) searchParams.append('ordering', params.ordering);
  
  const queryString = searchParams.toString();
  const url = `/api/coaching/assignments/${queryString ? `?${queryString}` : ''}`;
  
  const response = await apiGet<Assignment[] | { results?: Assignment[]; data?: Assignment[] }>(url);
  if (response.success && response.data !== undefined) {
    return { ...response, data: normalizeAssignmentList(response.data) };
  }
  return { ...response, data: [] };
}

/**
 * Öğrencinin aktif birincil koç atamasını getir.
 */
export async function fetchActiveCoachForStudent(
  studentId: number
): Promise<ApiResponse<Assignment | null>> {
  const historyRes = await fetchStudentCoachHistory(studentId);
  if (historyRes.success) {
    const activeCoach = historyRes.active_coach ?? null;
    const assignments = normalizeAssignmentList(historyRes.data);
    return {
      success: true,
      data: pickActiveAssignment(assignments, activeCoach),
    };
  }

  const listRes = await fetchAssignments({ student_id: studentId, active_only: true });
  if (listRes.success) {
    return {
      success: true,
      data: pickActiveAssignment(listRes.data ?? [], null),
    };
  }

  return {
    success: false,
    error: historyRes.error || listRes.error || 'Koç bilgisi alınamadı',
    data: null,
  };
}

/**
 * Assignment detayını getir
 */
export async function fetchAssignment(id: number): Promise<ApiResponse<Assignment>> {
  return apiGet<Assignment>(`/api/coaching/assignments/${id}/`);
}

/**
 * Yeni assignment oluştur
 */
export async function createAssignment(data: AssignmentCreate): Promise<ApiResponse<Assignment>> {
  return apiPost<Assignment>('/api/coaching/assignments/', data);
}

/**
 * Assignment güncelle
 */
export async function updateAssignment(id: number, data: { end_date?: string; is_primary?: boolean }): Promise<ApiResponse<Assignment>> {
  return apiFetch<Assignment>(`/api/coaching/assignments/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Assignment sonlandır (soft delete)
 */
export async function removeAssignment(id: number): Promise<ApiResponse<void>> {
  return apiFetch<void>(`/api/coaching/assignments/${id}/`, {
    method: 'DELETE',
  });
}

/**
 * Toplu öğrenci atama
 */
export async function bulkAssignStudents(data: BulkAssignData): Promise<ApiResponse<{
  coach_id: number;
  assigned_count: number;
  new_student_count: number;
  available_capacity: number;
}>> {
  return apiPost('/api/coaching/assignments/bulk-assign/', data);
}

/**
 * Öğrencinin birincil koçunu değiştir (geçmiş korunur).
 */
export async function changeCoach(data: CoachChangeData): Promise<ApiResponse<CoachChangeResult>> {
  return apiPost<CoachChangeResult>('/api/coaching/assignments/change-coach/', data);
}

export type StudentCoachHistoryResponse = ApiResponse<Assignment[]> & {
  active_coach?: Assignment | null;
  count?: number;
};

/**
 * Öğrencinin koç atama geçmişi.
 */
export async function fetchStudentCoachHistory(studentId: number): Promise<StudentCoachHistoryResponse> {
  const response = await apiGet<Assignment[]>(
    `/api/coaching/assignments/student-history/?student_id=${studentId}`
  );
  const extra = response as StudentCoachHistoryResponse;
  return {
    ...response,
    data: normalizeAssignmentList(response.data),
    active_coach: extra.active_coach ?? null,
    count: extra.count,
  };
}

/**
 * Koça atanabilecek öğrencileri getir
 */
export async function fetchAvailableStudents(coachId: number, params?: {
  search?: string;
  sinif_id?: number;
  seviye?: string;
}): Promise<ApiResponse<AvailableStudent[]>> {
  const searchParams = new URLSearchParams();
  
  if (params?.search) searchParams.append('search', params.search);
  if (params?.sinif_id) searchParams.append('sinif_id', String(params.sinif_id));
  if (params?.seviye) searchParams.append('seviye', params.seviye);
  
  const queryString = searchParams.toString();
  const url = `/api/coaching/coaches/${coachId}/available-students/${queryString ? `?${queryString}` : ''}`;
  
  const response = await apiGet<AvailableStudent[] | { data?: AvailableStudent[] }>(url);
  if (response.success && response.data !== undefined) {
    return { ...response, data: normalizeStudentList(response.data) };
  }
  return { ...response, data: [] };
}

// ==========================================
// INTELLIGENCE API
// ==========================================

export interface IntelligenceDashboard {
  overview: {
    total_coaches: number;
    total_students: number;
    active_assignments: number;
    avg_engagement_score: number;
  };
  risk: {
    high_risk: number;
    medium_risk: number;
    low_risk: number;
    distribution: {
      labels: string[];
      values: number[];
      colors: string[];
    };
  };
  events: {
    pending_count: number;
    weekly_meetings: number;
    completion_rate: number;
  };
  engagement: {
    average_score: number;
    coaches_below_50: number;
  };
}

export interface CoachMetrics {
  coach: {
    id: number;
    ad: string;
    soyad: string;
    aktif: boolean;
  };
  metrics: {
    total_students: number;
    active_students: number;
    capacity_used: number;
    pending_events: number;
    completed_events: number;
    risk_students: number;
  };
  engagement: {
    score: number;
    level: 'excellent' | 'good' | 'moderate' | 'low';
    weekly_meetings: number;
    completion_rate: number;
    avg_response_days: number;
  };
  risk_students: Array<{
    assignment_id: number;
    student_id: number;
    student_name: string;
    risk_score: number;
    risk_level: string;
    reasons: string[];
  }>;
  charts: {
    event_distribution: {
      labels: string[];
      values: number[];
    };
    weekly_trend: {
      labels: string[];
      values: number[];
    };
  };
}

export interface StudentTimeline {
  student: {
    id: number;
    ad: string;
    soyad: string;
  };
  assignment: {
    id: number;
    coach_id: number;
    coach_name: string;
    baslangic_tarihi: string | null;
    durum: string;
  } | null;
  risk: {
    score: number;
    level: string;
    reasons: string[];
  } | null;
  timeline: Array<{
    id: number;
    event_type: string;
    event_type_display: string;
    baslik: string;
    aciklama: string;
    durum: string;
    durum_display: string;
    planned_date: string | null;
    completed_date: string | null;
    created_at: string;
    is_auto: boolean;
    event_source: string;
  }>;
}

export interface RiskStudent {
  assignment_id: number;
  student_id: number;
  student_name: string;
  risk_score: number;
  risk_level: string;
  reasons: string[];
}

/**
 * Intelligence Dashboard verilerini getir
 */
export async function fetchIntelligenceDashboard(): Promise<ApiResponse<IntelligenceDashboard>> {
  return apiGet('/api/coaching/intelligence/dashboard/');
}

/**
 * Koç metriklerini getir
 */
export async function fetchCoachMetrics(coachId: number): Promise<ApiResponse<CoachMetrics>> {
  return apiGet(`/api/coaching/intelligence/coach/${coachId}/metrics/`);
}

/**
 * Öğrenci timeline getir
 */
export async function fetchStudentTimeline(studentId: number): Promise<ApiResponse<StudentTimeline>> {
  return apiGet(`/api/coaching/intelligence/student/${studentId}/timeline/`);
}

/**
 * Yüksek riskli öğrenci listesi
 */
export async function fetchRiskList(params?: {
  coach_id?: number;
  limit?: number;
}): Promise<ApiResponse<{ total_count: number; students: RiskStudent[] }>> {
  const searchParams = new URLSearchParams();
  
  if (params?.coach_id) searchParams.append('coach_id', String(params.coach_id));
  if (params?.limit) searchParams.append('limit', String(params.limit));
  
  const queryString = searchParams.toString();
  const url = `/api/coaching/intelligence/risk-list/${queryString ? `?${queryString}` : ''}`;
  
  return apiGet(url);
}

/** Koç Risk Bildir + otomatik RISK olayları (admin / müdür) */
export interface CoachRiskReport {
  id: number;
  student_id: number;
  student_name: string;
  student_sube_id?: number | null;
  coach_id?: number | null;
  coach_name?: string;
  title: string;
  description?: string;
  reason?: string;
  notes?: string;
  event_source?: string;
  status: string;
  event_date?: string | null;
  created_at?: string | null;
  meeting_draft_id?: number | null;
}

export async function fetchCoachRiskReports(params?: {
  status?: string;
  source?: string;
  limit?: number;
}): Promise<ApiResponse<CoachRiskReport[]> & { kpi?: { pending: number; shown: number } }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.source) searchParams.set('source', params.source);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return apiGet(`/api/coaching/risk-reports/${qs ? `?${qs}` : ''}`);
}

export async function patchCoachRiskReport(
  eventId: number,
  status: string,
): Promise<ApiResponse<CoachRiskReport>> {
  return apiFetch(`/api/coaching/risk-reports/${eventId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}


// =====================
// PREDICTIVE API
// =====================

export interface PredictiveDashboard {
  overview: {
    total_students: number;
    avg_dropout_score: number;
    avg_success_score: number;
    avg_engagement: number;
    critical_count: number;
    intervention_required: number;
  };
  coaches: {
    total_coaches: number;
    total_assignments: number;
  };
  risk_distribution: {
    labels: string[];
    values: number[];
    colors: string[];
  };
  success_distribution: {
    labels: string[];
    values: number[];
    colors: string[];
  };
  daily_trend: Array<{
    date: string;
    avg_dropout: number;
    count: number;
  }>;
  top_risk_students: Array<{
    student_id: number;
    student_name: string;
    dropout_score: number;
    dropout_level: string;
    intervention_required: boolean;
  }>;
}

export interface StudentScores {
  student: {
    id: number;
    ad: string;
    soyad: string;
  };
  assignment: {
    id: number;
    coach_id: number;
    coach_name: string;
    start_date: string | null;
  } | null;
  scores: {
    dropout_score: number;
    dropout_level: string;
    success_score: number;
    engagement_score: number;
    intervention_required: boolean;
    last_updated: string;
  } | null;
  latest_snapshot: {
    date: string;
    features: Record<string, any>;
    scores: Record<string, any>;
  } | null;
  trend: Array<{
    date: string;
    dropout_score: number;
    success_score: number;
  }>;
}

export interface WeeklyPlan {
  student_id: number;
  meetings_suggested: number;
  homework_volume: string;
  focus_areas: string[];
  intervention_required: boolean;
  priority_level: string;
  recommendations: string[];
}

export interface CoachMatch {
  coach_id: number;
  coach_name: string;
  match_score: number;
  factors: Record<string, number>;
  capacity_available: number;
  current_load: number;
  capacity_total: number;
  load_percentage: number;
}

export interface HighRiskStudent {
  student_id: number;
  student_name: string;
  dropout_score: number;
  dropout_level: string;
  success_score: number;
  engagement_score: number;
  intervention_required: boolean;
  weekly_plan: WeeklyPlan;
}

/**
 * Predictive Dashboard verilerini getir
 */
export async function fetchPredictiveDashboard(): Promise<ApiResponse<PredictiveDashboard>> {
  return apiGet('/api/coaching/predictive/dashboard/');
}

/**
 * Öğrenci skorlarını getir
 */
export async function fetchStudentScores(studentId: number): Promise<ApiResponse<StudentScores>> {
  return apiGet(`/api/coaching/predictive/student/${studentId}/scores/`);
}

/**
 * Öğrenci haftalık plan önerisini getir
 */
export async function fetchStudentWeeklyPlan(studentId: number): Promise<ApiResponse<{ student: any; weekly_plan: WeeklyPlan }>> {
  return apiGet(`/api/coaching/predictive/student/${studentId}/weekly-plan/`);
}

/**
 * Koç eşleştirme önerilerini getir
 */
export async function fetchCoachMatches(studentId: number, limit?: number): Promise<ApiResponse<{ student: any; matches: CoachMatch[] }>> {
  const params = limit ? `?limit=${limit}` : '';
  return apiGet(`/api/coaching/predictive/coach-match/${studentId}/${params}`);
}

/**
 * Yüksek dropout riskli öğrencileri getir
 */
export async function fetchHighRiskStudents(params?: {
  level?: string;
  coach_id?: number;
  limit?: number;
}): Promise<ApiResponse<{ total_count: number; students: HighRiskStudent[] }>> {
  const searchParams = new URLSearchParams();
  
  if (params?.level) searchParams.append('level', params.level);
  if (params?.coach_id) searchParams.append('coach_id', String(params.coach_id));
  if (params?.limit) searchParams.append('limit', String(params.limit));
  
  const queryString = searchParams.toString();
  const url = `/api/coaching/predictive/high-risk/${queryString ? `?${queryString}` : ''}`;
  
  return apiGet(url);
}

/**
 * Predictive döngüsünü manuel çalıştır
 */
export async function runPredictiveCycle(options?: {
  skip_snapshot?: boolean;
  skip_events?: boolean;
}): Promise<ApiResponse<{ output: string }>> {
  return apiPost('/api/coaching/predictive/run-cycle/', options || {});
}

