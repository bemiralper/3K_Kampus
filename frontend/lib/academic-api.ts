import { apiFetch } from '@/lib/api';

export type SlotTypeCode =
  | 'LESSON'
  | 'SHORT_BREAK'
  | 'LUNCH_BREAK'
  | 'EVENING_BREAK'
  | 'CUSTOM_BREAK';

export type ScheduleTemplate = {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  kurum: number;
  kurum_name: string;
  sube: number | null;
  sube_name: string | null;
  primary_weekly_cycle: number | null;
  weekly_cycle_name: string | null;
  timeslot_count: number;
  lesson_count: number;
  usage_count: number;
  created_at: string;
  updated_at: string;
};

export type ScheduleTemplateDetail = ScheduleTemplate & {
  time_slots: TimeSlot[];
};

export type TimeSlot = {
  id: number;
  schedule_template: number;
  template_name?: string;
  name: string;
  start_time: string;
  end_time: string;
  order: number;
  slot_type: SlotTypeCode;
  slot_type_display: string;
  is_break: boolean;
  is_active: boolean;
  duration: number;
  duration_display: string;
  start_time_display: string;
  end_time_display: string;
};

export type GeneratedSlotPreview = {
  order: number;
  name: string;
  start_time: string;
  end_time: string;
  slot_type: SlotTypeCode;
  slot_type_display: string;
  duration: number;
  is_break: boolean;
};

export type SlotGeneratorConfig = {
  schedule_template_id: number;
  start_time: string;
  lesson_duration: number;
  short_break_duration: number;
  lesson_count: number;
  lunch_break_enabled: boolean;
  lunch_break_after_lesson: number;
  lunch_break_duration: number;
  evening_break_enabled?: boolean;
  evening_break_after_lesson?: number;
  evening_break_duration?: number;
  overwrite_existing?: boolean;
};

export type ScheduleVersionUsage = {
  id: number;
  name: string;
  is_active_version: boolean;
  term_name: string | null;
  egitim_yili_name: string | null;
};

function unwrap<T>(res: Awaited<ReturnType<typeof apiFetch<T>>>): T {
  if (!res.success || res.data === undefined) {
    throw new Error(res.error || 'İstek başarısız');
  }
  return res.data;
}

export async function fetchScheduleTemplates(): Promise<ScheduleTemplate[]> {
  const res = await apiFetch<ScheduleTemplate[]>('/api/academic/schedule-templates/');
  return unwrap(res);
}

export async function fetchScheduleTemplate(id: number): Promise<ScheduleTemplateDetail> {
  const res = await apiFetch<ScheduleTemplateDetail>(`/api/academic/schedule-templates/${id}/`);
  return unwrap(res);
}

export async function createScheduleTemplate(body: Record<string, unknown>): Promise<ScheduleTemplateDetail> {
  const res = await apiFetch<ScheduleTemplateDetail>('/api/academic/schedule-templates/create/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function updateScheduleTemplate(
  id: number,
  body: Record<string, unknown>,
): Promise<ScheduleTemplateDetail> {
  const res = await apiFetch<ScheduleTemplateDetail>(`/api/academic/schedule-templates/${id}/update/`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function deleteScheduleTemplate(id: number): Promise<'deactivated' | 'deleted'> {
  const res = await apiFetch<{ action?: 'deactivated' | 'deleted' }>(
    `/api/academic/schedule-templates/${id}/delete/`,
    { method: 'DELETE' },
  );
  if (!res.success) throw new Error(res.error || 'Silinemedi');
  return res.action === 'deleted' ? 'deleted' : 'deactivated';
}

export async function copyScheduleTemplate(id: number, name?: string): Promise<ScheduleTemplateDetail> {
  const res = await apiFetch<ScheduleTemplateDetail>(`/api/academic/schedule-templates/${id}/copy/`, {
    method: 'POST',
    body: JSON.stringify(name ? { name } : {}),
  });
  return unwrap(res);
}

export async function fetchTemplateUsage(id: number): Promise<ScheduleVersionUsage[]> {
  const res = await apiFetch<ScheduleVersionUsage[]>(`/api/academic/schedule-templates/${id}/usage/`);
  return unwrap(res);
}

export async function createTimeSlot(body: Record<string, unknown>): Promise<TimeSlot> {
  const res = await apiFetch<TimeSlot>('/api/academic/timeslots/create/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function updateTimeSlot(id: number, body: Record<string, unknown>): Promise<TimeSlot> {
  const res = await apiFetch<TimeSlot>(`/api/academic/timeslots/${id}/update/`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function deleteTimeSlot(id: number): Promise<void> {
  const res = await apiFetch(`/api/academic/timeslots/${id}/delete/`, { method: 'DELETE' });
  if (!res.success) throw new Error(res.error || 'Silinemedi');
}

export async function bulkDeleteTimeSlots(templateId: number): Promise<void> {
  const res = await apiFetch(`/api/academic/schedule-templates/${templateId}/timeslots/bulk-delete/`, {
    method: 'DELETE',
  });
  if (!res.success) throw new Error(res.error || 'Toplu silme başarısız');
}

export async function previewSlotGenerator(config: SlotGeneratorConfig) {
  const res = await apiFetch<{ preview: GeneratedSlotPreview[]; summary: Record<string, unknown> }>(
    '/api/academic/timeslots/generate-preview/',
    { method: 'POST', body: JSON.stringify(config) },
  );
  return unwrap(res);
}

export async function createSlotGenerator(config: SlotGeneratorConfig) {
  const res = await apiFetch<{ slots: TimeSlot[]; summary: Record<string, unknown> }>(
    '/api/academic/timeslots/generate-create/',
    { method: 'POST', body: JSON.stringify(config) },
  );
  return unwrap(res);
}

export async function shiftTemplateSlots(templateId: number, minutes: number): Promise<TimeSlot[]> {
  const res = await apiFetch<TimeSlot[]>('/api/academic/timeslots/bulk-shift/', {
    method: 'POST',
    body: JSON.stringify({ template_id: templateId, minutes }),
  });
  return unwrap(res);
}

export async function bulkUpdateLessonDuration(
  templateId: number,
  duration: number,
  slotType = 'LESSON',
): Promise<TimeSlot[]> {
  const res = await apiFetch<TimeSlot[]>('/api/academic/timeslots/bulk-duration/', {
    method: 'POST',
    body: JSON.stringify({ template_id: templateId, duration, slot_type: slotType }),
  });
  return unwrap(res);
}

/**
 * Ders saati şablonunu kurumsal CSV/Excel olarak indir (backend-driven export).
 * GET /api/academic/schedule-templates/<id>/export/?format=csv|xlsx
 */
export async function downloadScheduleTemplateExport(
  templateId: number,
  templateName: string,
  format: 'csv' | 'xlsx' = 'xlsx',
): Promise<void> {
  const { getContextHeaders } = await import('@/lib/api');
  const { downloadBlob } = await import('@/lib/download-file');
  const res = await fetch(
    `/api/academic/schedule-templates/${templateId}/export/?format=${format}`,
    { credentials: 'include', headers: getContextHeaders() },
  );
  if (!res.ok) throw new Error('Dışa aktarma başarısız');
  const blob = await res.blob();
  downloadBlob(blob, `${templateName.replace(/\s+/g, '_')}_ders_saatleri.${format}`);
}

// ---- Çalışma Takvimi (Weekly Cycle) ----

export type ProgramTipi = 'GRUP' | 'BIREBIR' | 'GENEL';

export type WorkCalendarDay = {
  id: number;
  weekly_cycle: number;
  day_of_week: number;
  day_of_week_display: string;
  name: string;
  order: number;
  is_active: boolean;
  schedule_template: number | null;
  schedule_template_name: string | null;
  note: string;
  day_name_short: string;
  is_weekend: boolean;
};

export type WorkCalendar = {
  id: number;
  kurum: number | null;
  sube: number | null;
  schedule_template: number | null;
  template_name: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  color: string;
  icon: string;
  program_tipi: ProgramTipi;
  program_tipi_display: string;
  active_day_count: number;
  usage_count: number;
  used_templates: { id: number; name: string; lesson_count?: number }[];
  total_lesson_count: number;
  days: WorkCalendarDay[];
  created_at: string;
  updated_at: string;
};

export type WorkCalendarDayInput = {
  id?: number;
  day_of_week: number;
  name?: string;
  order?: number;
  is_active: boolean;
  schedule_template?: number | null;
  note?: string;
};

export async function fetchWorkCalendars(): Promise<WorkCalendar[]> {
  const res = await apiFetch<WorkCalendar[]>('/api/academic/weekly-cycles/');
  return unwrap(res);
}

export async function fetchWorkCalendar(id: number): Promise<WorkCalendar> {
  const res = await apiFetch<WorkCalendar>(`/api/academic/weekly-cycles/${id}/`);
  return unwrap(res);
}

export async function createWorkCalendar(body: Record<string, unknown>): Promise<WorkCalendar> {
  const res = await apiFetch<WorkCalendar>('/api/academic/weekly-cycles/create/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function updateWorkCalendar(id: number, body: Record<string, unknown>): Promise<WorkCalendar> {
  const res = await apiFetch<WorkCalendar>(`/api/academic/weekly-cycles/${id}/update/`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function saveWorkCalendarPlan(id: number, days: WorkCalendarDayInput[]): Promise<WorkCalendar> {
  const res = await apiFetch<WorkCalendar>(`/api/academic/weekly-cycles/${id}/plan/`, {
    method: 'PUT',
    body: JSON.stringify({ days }),
  });
  return unwrap(res);
}

export async function deleteWorkCalendar(id: number): Promise<'deactivated' | 'deleted'> {
  const res = await apiFetch<{ action?: 'deactivated' | 'deleted' }>(
    `/api/academic/weekly-cycles/${id}/delete/`,
    { method: 'DELETE' },
  );
  if (!res.success) throw new Error(res.error || 'Silinemedi');
  return res.action === 'deleted' ? 'deleted' : 'deactivated';
}

export async function copyWorkCalendar(id: number, name?: string): Promise<WorkCalendar> {
  const res = await apiFetch<WorkCalendar>(`/api/academic/weekly-cycles/${id}/copy/`, {
    method: 'POST',
    body: JSON.stringify(name ? { name } : {}),
  });
  return unwrap(res);
}

export async function fetchWorkCalendarUsage(id: number): Promise<ScheduleVersionUsage[]> {
  const res = await apiFetch<ScheduleVersionUsage[]>(`/api/academic/weekly-cycles/${id}/usage/`);
  return unwrap(res);
}

export function exportWorkCalendarJson(calendar: WorkCalendar) {
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    calendar: {
      name: calendar.name,
      description: calendar.description,
      is_active: calendar.is_active,
      is_default: calendar.is_default,
      color: calendar.color,
      icon: calendar.icon,
      days: calendar.days.map((d) => ({
        day_of_week: d.day_of_week,
        name: d.name,
        order: d.order,
        is_active: d.is_active,
        schedule_template_name: d.schedule_template_name,
        note: d.note,
      })),
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${calendar.name.replace(/\s+/g, '_')}_calisma_takvimi.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Öğretmen Uygunluğu ----

export type SlotAvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'PREFERRED';

export type TeacherListItem = {
  id: number;
  ad: string;
  soyad: string;
  tam_ad: string;
  personel_no: string;
  brans: string;
  brans_id: number | null;
  gorevlendirme_id: number | null;
  rol_ad: string;
  aktif_mi: boolean;
  sube_id: number | null;
  sube_ad: string;
  fotograf_url: string | null;
  sozlesme_turu: string | null;
  sozlesme_id: number | null;
};

export type GorevlendirmeSummary = {
  id: number;
  personel_id: number;
  egitim_yili_id: number;
  egitim_yili_ad: string;
  gorev_sube_id: number;
  gorev_sube_ad: string;
  rol_id: number | null;
  rol_kodu: string;
  rol_ad: string;
  brans_id: number | null;
  brans_ad: string;
  gorev_baslangic: string | null;
  gorev_bitis: string | null;
  aktif_mi: boolean;
};

export type ContractMesai = {
  gun: number;
  gun_label: string;
  baslangic: string | null;
  bitis: string | null;
  mola_dakika: number;
  aktif: boolean;
};

export type ContractDersUcreti = {
  id: number;
  brans_id: number | null;
  brans_ad: string;
  ucret_tipi: string;
  ucret_tipi_display: string;
  birim_ucret: number;
  haftalik_saat: number;
  min_saat: number | null;
  max_saat: number | null;
  notlar: string;
};

export type ContractSummary = {
  id: number;
  sozlesme_no: string;
  sozlesme_turu: string;
  sozlesme_turu_display: string;
  is_ogretmen: boolean;
  brans_snapshot: string;
  gorev_snapshot: string;
  rol_ad: string;
  gorevlendirme_id: number | null;
  egitim_yili_display: string;
  baslangic_tarihi: string | null;
  bitis_tarihi: string | null;
  haftalik_calisma_gun_sayisi: number;
  haftalik_izin_gunleri: number[];
  haftalik_izin_gunleri_labels: string[];
  working_days_academic: number[];
  mesai_saatleri: ContractMesai[];
  haftalik_sozlesme_saati: number;
  ders_ucretleri: ContractDersUcreti[];
  ders_ucreti_aktif: boolean;
  ek_ders_bilgisi: string;
  ders_birim_ucret: number;
  source: string;
};

export type AvailabilitySetPayload = {
  id: number;
  kind: 'DEFAULT' | 'TEMPORARY';
  title: string;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  calendar_ids: number[];
  cells: Record<string, SlotAvailabilityStatus>;
  updated_at: string;
  summary?: AvailabilitySummary;
};

export type CalendarSummarySlice = {
  total_available_slots: number;
  total_preferred_slots: number;
  weekly_available_days?: number;
  estimated_max_weekly_lesson_slots: number;
};

export type CalendarSummaryByCalendar = CalendarSummarySlice & {
  calendar_id: number;
  name: string;
  program_tipi: ProgramTipi;
  program_tipi_display: string;
  color: string;
};

export type CalendarSummaryByProgramTipi = CalendarSummarySlice & {
  program_tipi: ProgramTipi;
  program_tipi_display: string;
  calendar_count: number;
};

export type AvailabilitySummary = CalendarSummarySlice & {
  weekly_available_days: number;
  assigned_calendar_count: number;
  by_calendar?: CalendarSummaryByCalendar[];
  by_program_tipi?: CalendarSummaryByProgramTipi[];
};

export type WorkCalendarOption = {
  id: number;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  program_tipi: ProgramTipi;
  program_tipi_display: string;
  active_day_count: number;
  used_templates: { id: number; name: string }[];
};

export type GridSlot = {
  timeslot_id: number;
  /** Şablondaki ham sıra (teneffüsler dahil); grid sütun etiketi değil */
  order: number;
  /** O gündeki N. ders slotu (1, 2, 3…) */
  lesson_index: number;
  label: string;
  name: string;
  start_time: string;
  end_time: string;
  duration: number | null;
};

export type GridDay = {
  day_of_week: number;
  day_name: string;
  weekly_day_id: number;
  schedule_template_id: number;
  schedule_template_name: string;
  slots: GridSlot[];
};

export type CalendarGridStructure = {
  weekly_cycle_id: number;
  weekly_cycle_name: string;
  program_tipi: ProgramTipi;
  program_tipi_display: string;
  days: GridDay[];
  max_slot_count: number;
};

export type TeacherAvailabilityDetail = {
  contract: ContractSummary | null;
  gorevlendirme: GorevlendirmeSummary | null;
  default_set: AvailabilitySetPayload | null;
  temporary_sets: AvailabilitySetPayload[];
  work_calendars: WorkCalendarOption[];
  summary: AvailabilitySummary;
};

export type ContractWarning = {
  type: string;
  day_of_week: string;
  day_label: string;
  message: string;
};

export function cellKey(calendarId: number, dayOfWeek: number, timeslotId: number) {
  return `${calendarId}:${dayOfWeek}:${timeslotId}`;
}

export async function fetchTeachersForAvailability(params?: {
  search?: string;
  brans?: string;
  sozlesme_turu?: string;
  aktif_only?: boolean;
}): Promise<TeacherListItem[]> {
  const q = new URLSearchParams();
  if (params?.search) q.set('search', params.search);
  if (params?.brans) q.set('brans', params.brans);
  if (params?.sozlesme_turu) q.set('sozlesme_turu', params.sozlesme_turu);
  if (params?.aktif_only === false) q.set('aktif_only', 'false');
  const res = await apiFetch<TeacherListItem[]>(`/api/academic/teacher-availability/teachers/?${q}`);
  return unwrap(res);
}

export async function fetchTeacherAvailability(personelId: number): Promise<TeacherAvailabilityDetail> {
  const res = await apiFetch<TeacherAvailabilityDetail>(`/api/academic/teacher-availability/${personelId}/`);
  return unwrap(res);
}

export async function fetchCalendarGridStructure(
  personelId: number,
  calendarId: number,
): Promise<CalendarGridStructure> {
  const res = await apiFetch<CalendarGridStructure>(
    `/api/academic/teacher-availability/${personelId}/grid/${calendarId}/`,
  );
  return unwrap(res);
}

export async function saveTeacherAvailability(
  personelId: number,
  body: {
    kind: 'DEFAULT' | 'TEMPORARY';
    set_id?: number;
    title?: string;
    valid_from?: string | null;
    valid_until?: string | null;
    calendar_ids: number[];
    cells: Record<string, SlotAvailabilityStatus>;
    force_save?: boolean;
  },
): Promise<{ data: AvailabilitySetPayload; warnings: ContractWarning[] }> {
  const res = await apiFetch<AvailabilitySetPayload>(
    `/api/academic/teacher-availability/${personelId}/save/`,
    { method: 'PUT', body: JSON.stringify(body) },
  );
  const warnings = ((res as { warnings?: ContractWarning[] }).warnings) || [];
  if (!res.success) {
    const err = new Error(res.error || 'Kaydedilemedi') as Error & {
      warnings?: ContractWarning[];
      isConflict?: boolean;
    };
    err.warnings = warnings;
    err.isConflict = Boolean(warnings.length);
    throw err;
  }
  return {
    data: unwrap(res),
    warnings,
  };
}

export async function deleteTemporaryAvailability(personelId: number, setId: number): Promise<void> {
  const res = await apiFetch(`/api/academic/teacher-availability/${personelId}/temporary/${setId}/`, {
    method: 'DELETE',
  });
  if (!res.success) throw new Error(res.error || 'Silinemedi');
}

// ---- Sınıf Ders Planları ----

export type ClassLessonPlanClassroom = {
  id: number;
  ad: string;
  kod: string;
  kapasite: number;
  ogrenci_sayisi: number;
  sinif_seviyesi_id: number | null;
  sinif_seviyesi_ad: string | null;
  alan_id: number | null;
  alan_ad: string | null;
  oda_ad: string | null;
};

export type ClassLessonPlanTerm = {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  schedule_locked: boolean;
  program_olusturulabilir: boolean;
  order_no: number;
};

export type ClassLessonPlanContext = {
  active_year: {
    id: number;
    yil_str: string;
    baslangic_yil: number;
    bitis_yil: number;
  };
  context_year_mismatch: boolean;
  terms: ClassLessonPlanTerm[];
  active_term_id: number | null;
  classrooms: ClassLessonPlanClassroom[];
};

export type ClassLessonPlan = {
  id: number;
  egitim_yili: number;
  egitim_yili_str: string;
  term: number;
  term_ad: string;
  schedule_locked: boolean;
  sinif: number;
  sinif_ad: string;
  sinif_seviyesi_ad: string | null;
  alan_ad: string | null;
  ders: number;
  ders_ad: string;
  ders_kod: string;
  ders_kisa_ad?: string;
  /** Çözülmüş görünen ad: plan.gorunen_ad → ders.kisa_ad → ders.ad */
  ders_gorunen_ad?: string;
  /** Plan satırı üzerine yazma (boş = ders varsayılanı) */
  gorunen_ad?: string;
  ogretmen: number | null;
  ogretmen_ad: string | null;
  weekly_hours: number;
  credit: number;
  is_mandatory: boolean;
  lesson_type_display: string;
  is_double_block: boolean;
  block_type_display: string;
  priority: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ClassLessonPlanSummary = {
  classroom_id: number;
  classroom_name: string;
  classroom_seviye: string | null;
  classroom_alan: string | null;
  ogrenci_sayisi: number;
  term_id: number;
  term_name: string;
  schedule_locked: boolean;
  total_lessons: number;
  total_weekly_hours: number;
  lessons_with_teacher: number;
  lessons_without_teacher: number;
};

export type ClassLessonPlanDersOption = {
  id: number;
  ad: string;
  kod: string;
};

export type ClassLessonPlanPayload = {
  term: number;
  sinif: number;
  ders: number;
  ogretmen?: number | null;
  weekly_hours: number;
  credit?: number;
  is_mandatory?: boolean;
  is_double_block?: boolean;
  priority?: number;
  notes?: string | null;
};

export type ClassLessonPlanUpdatePayload = {
  ogretmen?: number | null;
  weekly_hours?: number;
  credit?: number;
  is_mandatory?: boolean;
  is_double_block?: boolean;
  priority?: number;
  gorunen_ad?: string;
  notes?: string | null;
};

export async function fetchClassLessonPlanContext(): Promise<ClassLessonPlanContext> {
  const res = await apiFetch<ClassLessonPlanContext>('/api/academic/class-lesson-plan/context/');
  return unwrap(res);
}

export async function fetchClassLessonPlans(params: {
  classroom_id?: number;
  term_id?: number;
  teacher_id?: number;
  all?: boolean;
}): Promise<ClassLessonPlan[]> {
  const q = new URLSearchParams();
  if (params.classroom_id) q.set('classroom_id', String(params.classroom_id));
  if (params.term_id) q.set('term_id', String(params.term_id));
  if (params.teacher_id) q.set('teacher_id', String(params.teacher_id));
  if (params.all) q.set('all', 'true');
  const res = await apiFetch<{ count: number; results: ClassLessonPlan[] }>(
    `/api/academic/class-lesson-plan/?${q}`,
  );
  return unwrap(res).results || [];
}

export async function fetchClassLessonPlanSummary(
  classroomId: number,
  termId: number,
): Promise<ClassLessonPlanSummary> {
  const res = await apiFetch<ClassLessonPlanSummary>(
    `/api/academic/class-lesson-plan/summary/${classroomId}/${termId}/`,
  );
  return unwrap(res);
}

export async function fetchClassLessonPlanDersOptions(
  classroomId: number,
): Promise<ClassLessonPlanDersOption[]> {
  const q = new URLSearchParams({ classroom_id: String(classroomId) });
  const res = await apiFetch<{ count: number; results: ClassLessonPlanDersOption[] }>(
    `/api/academic/class-lesson-plan/ders-options/?${q}`,
  );
  return unwrap(res).results || [];
}

export async function createClassLessonPlan(
  body: ClassLessonPlanPayload,
): Promise<ClassLessonPlan> {
  const res = await apiFetch<ClassLessonPlan>('/api/academic/class-lesson-plan/create/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function updateClassLessonPlan(
  id: number,
  body: ClassLessonPlanUpdatePayload,
): Promise<ClassLessonPlan> {
  const res = await apiFetch<ClassLessonPlan>(`/api/academic/class-lesson-plan/${id}/update/`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

/** SDP değişince ders programı sayfasının yenilemesi için */
export const CLASS_LESSON_PLAN_CHANGED_EVENT = 'akademik:class-lesson-plan-changed';

export type ClassLessonPlanChangedDetail = {
  planId?: number;
  classroomId?: number | null;
  termId?: number | null;
};

export function emitClassLessonPlanChanged(detail?: ClassLessonPlanChangedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ClassLessonPlanChangedDetail>(CLASS_LESSON_PLAN_CHANGED_EVENT, {
      detail: detail || {},
    }),
  );
}

export async function deleteClassLessonPlan(id: number): Promise<void> {
  const res = await apiFetch(`/api/academic/class-lesson-plan/${id}/delete/`, {
    method: 'DELETE',
  });
  if (!res.success) throw new Error(res.error || 'Plan silinemedi');
}

export async function bulkDeleteClassLessonPlans(ids: number[]): Promise<number> {
  const res = await apiFetch<{ deleted_count: number }>(
    '/api/academic/class-lesson-plan/bulk-delete/',
    {
      method: 'POST',
      body: JSON.stringify({ ids }),
    },
  );
  const data = unwrap(res);
  return data.deleted_count ?? 0;
}

export async function seedClassLessonPlansFromAlan(body: {
  classroom_id: number;
  term_id: number;
  default_weekly_hours?: number;
}): Promise<{
  alan_id: number | null;
  alan_ad: string | null;
  created_count: number;
  skipped_existing: number;
  candidate_count: number;
  plans: ClassLessonPlan[];
}> {
  const res = await apiFetch<{
    alan_id: number | null;
    alan_ad: string | null;
    created_count: number;
    skipped_existing: number;
    candidate_count: number;
    plans: ClassLessonPlan[];
  }>('/api/academic/class-lesson-plan/seed-from-alan/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function copyClassLessonPlans(body: {
  source_classroom_id: number;
  term_id: number;
  target_classroom_ids: number[];
  copy_teachers?: boolean;
  mode?: 'skip_existing' | 'overwrite_hours';
}): Promise<{
  source_classroom_id: number;
  term_id: number;
  copy_teachers: boolean;
  mode: string;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  targets: {
    classroom_id: number;
    classroom_ad: string;
    created: number;
    updated: number;
    skipped: number;
  }[];
}> {
  const res = await apiFetch<{
    source_classroom_id: number;
    term_id: number;
    copy_teachers: boolean;
    mode: string;
    created_count: number;
    updated_count: number;
    skipped_count: number;
    targets: {
      classroom_id: number;
      classroom_ad: string;
      created: number;
      updated: number;
      skipped: number;
    }[];
  }>('/api/academic/class-lesson-plan/copy/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

// ---- Öğretmen Atamaları ----

export type TeacherAssignmentRole =
  | 'PRIMARY'
  | 'SECONDARY'
  | 'ASSISTANT'
  | 'CO_TEACHER'
  | 'SUBSTITUTE';

export type TeacherRoleOption = {
  value: TeacherAssignmentRole;
  label: string;
};

export type ClassLessonTeacherAssignment = {
  id: number;
  egitim_yili: number;
  egitim_yili_str: string;
  class_lesson_plan: number;
  sinif_id: number;
  sinif_ad: string;
  ders_id: number;
  ders_ad: string;
  ders_kod: string;
  term_id: number;
  term_ad: string;
  schedule_locked: boolean;
  weekly_hours: number;
  ogretmen: number;
  ogretmen_ad: string | null;
  role: TeacherAssignmentRole;
  role_display: string;
  priority: number;
  max_hours_for_class: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ClassLessonTeacherAssignmentPayload = {
  class_lesson_plan_id: number;
  ogretmen_id: number;
  role?: TeacherAssignmentRole;
  priority?: number;
  max_hours_for_class?: number | null;
  notes?: string | null;
};

export type ClassLessonTeacherAssignmentUpdatePayload = {
  role?: TeacherAssignmentRole;
  priority?: number;
  max_hours_for_class?: number | null;
  notes?: string | null;
};

export async function fetchTeacherAssignmentRoles(): Promise<TeacherRoleOption[]> {
  const res = await apiFetch<{ roles: TeacherRoleOption[] }>(
    '/api/academic/class-lesson-teachers/roles/',
  );
  return unwrap(res).roles || [];
}

export async function fetchClassLessonTeacherAssignments(params: {
  plan_id?: number;
  classroom_id?: number;
  teacher_id?: number;
  role?: string;
}): Promise<ClassLessonTeacherAssignment[]> {
  const q = new URLSearchParams();
  if (params.plan_id) q.set('plan_id', String(params.plan_id));
  if (params.classroom_id) q.set('classroom_id', String(params.classroom_id));
  if (params.teacher_id) q.set('teacher_id', String(params.teacher_id));
  if (params.role) q.set('role', params.role);
  const res = await apiFetch<{ count: number; results: ClassLessonTeacherAssignment[] }>(
    `/api/academic/class-lesson-teachers/?${q}`,
  );
  return unwrap(res).results || [];
}

export async function createClassLessonTeacherAssignment(
  body: ClassLessonTeacherAssignmentPayload,
): Promise<ClassLessonTeacherAssignment> {
  const res = await apiFetch<ClassLessonTeacherAssignment>(
    '/api/academic/class-lesson-teachers/create/',
    { method: 'POST', body: JSON.stringify(body) },
  );
  return unwrap(res);
}

export async function updateClassLessonTeacherAssignment(
  id: number,
  body: ClassLessonTeacherAssignmentUpdatePayload,
): Promise<ClassLessonTeacherAssignment> {
  const res = await apiFetch<ClassLessonTeacherAssignment>(
    `/api/academic/class-lesson-teachers/${id}/update/`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
  return unwrap(res);
}

export async function deleteClassLessonTeacherAssignment(id: number): Promise<void> {
  const res = await apiFetch(`/api/academic/class-lesson-teachers/${id}/delete/`, {
    method: 'DELETE',
  });
  if (!res.success) throw new Error(res.error || 'Atama silinemedi');
}

// ---- Ders Programı (Schedule Version + Grid) ----

export type AcademicScheduleVersion = {
  id: number;
  name: string;
  description?: string | null;
  is_active: boolean;
  is_locked: boolean;
  term: { id: number; name: string } | null;
  schedule_template: { id: number; name: string } | null;
  weekly_cycle: { id: number; name: string } | null;
  egitim_yili: { id: number; display: string } | null;
  cell_count: number;
  filled_cell_count: number;
  completion_rate: string | number;
  created_at: string | null;
  updated_at: string | null;
};

export type ScheduleGridDay = {
  id: number;
  name: string;
  short_name: string;
  order: number;
};

export type ScheduleGridSlot = {
  id: number;
  name: string;
  start: string | null;
  end: string | null;
  order: number;
};

export type ScheduleGridCell = {
  id: number;
  day_id: number;
  timeslot_id: number;
  status: 'EMPTY' | 'FILLED' | 'LOCKED' | 'BLOCKED' | 'EXAM' | 'HOLIDAY';
  status_display: string;
  class_lesson_plan_id: number | null;
  lesson: {
    id: number;
    name: string;
    full_name?: string;
    code?: string | null;
  } | null;
  teacher: { id: number; name: string; short_name?: string } | null;
  classroom: { id: number; name: string; code?: string | null } | null;
  is_double_block_start: boolean;
  notes: string | null;
};

export type ClassScheduleGrid = {
  days: ScheduleGridDay[];
  slots: ScheduleGridSlot[];
  cells: ScheduleGridCell[];
  version?: {
    id: number;
    name: string;
    is_active: boolean;
    is_locked: boolean;
  };
  egitim_yili?: { id: number; display: string };
  empty_reason?: 'no_days' | 'no_slots' | null;
  empty_message?: string | null;
  error?: string;
};

export async function fetchAcademicScheduleVersions(params?: {
  term_id?: number;
  schedule_template_id?: number;
  weekly_cycle_id?: number;
}): Promise<AcademicScheduleVersion[]> {
  const q = new URLSearchParams();
  if (params?.term_id) q.set('term_id', String(params.term_id));
  if (params?.schedule_template_id) q.set('schedule_template_id', String(params.schedule_template_id));
  if (params?.weekly_cycle_id) q.set('weekly_cycle_id', String(params.weekly_cycle_id));
  const res = await apiFetch<{ versions: AcademicScheduleVersion[] }>(
    `/api/academic/schedule/versions/?${q}`,
  );
  return unwrap(res).versions || [];
}

export async function createAcademicScheduleVersion(body: {
  name: string;
  description?: string;
  term_id: number;
  schedule_template_id: number;
  weekly_cycle_id: number;
}): Promise<AcademicScheduleVersion> {
  const res = await apiFetch<AcademicScheduleVersion>('/api/academic/schedule/versions/create/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function updateAcademicScheduleVersion(
  id: number,
  body: { name?: string; description?: string | null },
): Promise<AcademicScheduleVersion> {
  const res = await apiFetch<AcademicScheduleVersion>(
    `/api/academic/schedule/versions/${id}/update/`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
  return unwrap(res);
}

export async function activateAcademicScheduleVersion(
  id: number,
): Promise<AcademicScheduleVersion> {
  const res = await apiFetch<AcademicScheduleVersion | { version: AcademicScheduleVersion }>(
    `/api/academic/schedule/versions/${id}/activate/`,
    { method: 'POST' },
  );
  const data = unwrap(res);
  return 'version' in data && data.version ? data.version : (data as AcademicScheduleVersion);
}

export async function lockAcademicScheduleVersion(id: number): Promise<AcademicScheduleVersion> {
  const res = await apiFetch<AcademicScheduleVersion | { version: AcademicScheduleVersion }>(
    `/api/academic/schedule/versions/${id}/lock/`,
    { method: 'POST' },
  );
  const data = unwrap(res);
  return 'version' in data && data.version ? data.version : (data as AcademicScheduleVersion);
}

export async function unlockAcademicScheduleVersion(id: number): Promise<AcademicScheduleVersion> {
  const res = await apiFetch<AcademicScheduleVersion | { version: AcademicScheduleVersion }>(
    `/api/academic/schedule/versions/${id}/unlock/`,
    { method: 'POST' },
  );
  const data = unwrap(res);
  return 'version' in data && data.version ? data.version : (data as AcademicScheduleVersion);
}

export async function ensureVersionClassroomGrid(
  versionId: number,
  classroomId: number,
): Promise<{ created_count: number; existing_count: number; total_cells: number }> {
  const res = await apiFetch<{
    created_count: number;
    existing_count: number;
    total_cells: number;
  }>('/api/academic/program-grid/ensure-version/', {
    method: 'POST',
    body: JSON.stringify({ version_id: versionId, classroom_id: classroomId }),
  });
  return unwrap(res);
}

export async function fetchClassScheduleGrid(params: {
  classroom_id: number;
  term_id: number;
  version_id?: number;
}): Promise<ClassScheduleGrid> {
  const q = new URLSearchParams();
  q.set('classroom_id', String(params.classroom_id));
  q.set('term_id', String(params.term_id));
  if (params.version_id) q.set('version_id', String(params.version_id));
  const res = await apiFetch<ClassScheduleGrid>(`/api/academic/schedule/class/?${q}`);
  return unwrap(res);
}

export async function fillScheduleCell(
  cellId: number,
  body: {
    class_lesson_plan_id: number;
    ogretmen_id?: number | null;
    notes?: string | null;
  },
): Promise<ScheduleGridCell> {
  const res = await apiFetch<ScheduleGridCell>(`/api/academic/program-grid/cells/${cellId}/fill/`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function clearScheduleCell(cellId: number): Promise<ScheduleGridCell> {
  const res = await apiFetch<ScheduleGridCell>(`/api/academic/program-grid/cells/${cellId}/clear/`, {
    method: 'POST',
  });
  return unwrap(res);
}

export async function swapScheduleCells(
  sourceCellId: number,
  targetCellId: number,
): Promise<{ source: ScheduleGridCell; target: ScheduleGridCell }> {
  const res = await apiFetch<{ source: ScheduleGridCell; target: ScheduleGridCell }>(
    '/api/academic/program-grid/cells/swap/',
    {
      method: 'POST',
      body: JSON.stringify({
        source_cell_id: sourceCellId,
        target_cell_id: targetCellId,
      }),
    },
  );
  return unwrap(res);
}

export type DailyFlowItem = {
  timeslot_id: number;
  start: string | null;
  end: string | null;
  status: string;
  status_display: string;
  lesson: { id: number; name: string } | null;
  teacher: { id: number; name: string } | null;
  classroom: { id: number; name: string } | null;
  room: { id: number; name: string } | null;
};

export type DailyFlowResponse = {
  date: string;
  day_name: string | null;
  day_id?: number;
  info?: string;
  error?: string;
  version?: { id: number; name: string };
  egitim_yili?: { id: number; display: string };
  items: DailyFlowItem[];
};

export async function fetchDailyFlow(params: {
  term_id: number;
  date?: string;
  version_id?: number;
  classroom_id?: number;
  teacher_id?: number;
}): Promise<DailyFlowResponse> {
  const q = new URLSearchParams();
  q.set('term_id', String(params.term_id));
  if (params.date) q.set('date', params.date);
  if (params.version_id) q.set('version_id', String(params.version_id));
  if (params.classroom_id) q.set('classroom_id', String(params.classroom_id));
  if (params.teacher_id) q.set('teacher_id', String(params.teacher_id));
  const res = await apiFetch<DailyFlowResponse>(`/api/academic/schedule/daily-flow/?${q}`);
  return unwrap(res);
}

// ---- Ders Operasyonları ----

export type SessionKind = 'REGULAR' | 'PRIVATE' | 'MAKEUP' | 'EXTRA';
export type SessionStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'POSTPONED'
  | 'NO_SHOW';
export type TeacherAttendanceStatus = 'PENDING' | 'PRESENT' | 'ABSENT' | 'SUBSTITUTE';
export type StudentAttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';

export type LessonSession = {
  id: number;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  session_kind: SessionKind;
  session_kind_display: string;
  status: SessionStatus;
  status_display: string;
  teacher_attendance: TeacherAttendanceStatus;
  teacher_attendance_display: string;
  payable: boolean;
  notes: string;
  cancel_reason: string;
  term_id: number;
  schedule_version_id: number | null;
  source_grid_cell_id: number | null;
  class_lesson_plan_id: number | null;
  timeslot_id: number;
  timeslot_name: string | null;
  weekly_day_id: number | null;
  sinif: { id: number; name: string } | null;
  ders: { id: number; name: string } | null;
  ogretmen: { id: number; name: string } | null;
  effective_teacher: { id: number; name: string } | null;
  substitute_ogretmen: { id: number; name: string } | null;
  private_student: { id: number; name: string } | null;
  replaces_session_id: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AttendanceRosterRow = {
  student_id: number;
  student_name: string;
  status: StudentAttendanceStatus;
  status_display: string;
  note: string;
  record_id: number | null;
};

export type LessonOpsMeta = {
  session_kinds: { value: string; label: string }[];
  session_statuses: { value: string; label: string }[];
  student_attendance_statuses: { value: string; label: string }[];
  teachers: { id: number; name: string }[];
  dersler?: { id: number; ad: string; kod: string }[];
};

export type PaySummaryTeacher = {
  teacher_id: number;
  teacher_name: string;
  session_count: number;
  total_minutes: number;
  total_hours: number;
  by_kind: Record<string, number>;
  unit_rate: number | null;
  estimated_amount: number | null;
  sessions: {
    id: number;
    date: string;
    ders: string | null;
    sinif: string | null;
    kind: string;
    minutes: number;
  }[];
};

export type ScheduleRevisionLog = {
  id: number;
  action: string;
  action_display: string;
  summary: string;
  detail: Record<string, unknown>;
  term_id: number | null;
  schedule_version_id: number | null;
  version_name: string | null;
  lesson_session_id: number | null;
  created_at: string | null;
  created_by: string | null;
};

export async function fetchLessonOpsMeta(): Promise<LessonOpsMeta> {
  const res = await apiFetch<LessonOpsMeta>('/api/academic/lesson-operations/meta/');
  return unwrap(res);
}

export async function materializeLessonSessions(body: {
  term_id: number;
  date: string;
  version_id?: number;
  classroom_id?: number;
}): Promise<{
  date: string;
  day_name?: string;
  created_count: number;
  existing_count: number;
  skipped_count: number;
  info?: string;
  sessions: LessonSession[];
  version?: { id: number; name: string };
}> {
  const res = await apiFetch<{
    date: string;
    day_name?: string;
    created_count: number;
    existing_count: number;
    skipped_count: number;
    info?: string;
    sessions: LessonSession[];
    version?: { id: number; name: string };
  }>('/api/academic/lesson-sessions/materialize/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function fetchLessonSessions(params: {
  term_id: number;
  date?: string;
  date_from?: string;
  date_to?: string;
  version_id?: number;
  classroom_id?: number;
  teacher_id?: number;
  session_kind?: SessionKind | string;
  status?: SessionStatus | string;
}): Promise<LessonSession[]> {
  const q = new URLSearchParams();
  q.set('term_id', String(params.term_id));
  if (params.date) q.set('date', params.date);
  if (params.date_from) q.set('date_from', params.date_from);
  if (params.date_to) q.set('date_to', params.date_to);
  if (params.version_id) q.set('version_id', String(params.version_id));
  if (params.classroom_id) q.set('classroom_id', String(params.classroom_id));
  if (params.teacher_id) q.set('teacher_id', String(params.teacher_id));
  if (params.session_kind) q.set('session_kind', params.session_kind);
  if (params.status) q.set('status', params.status);
  const res = await apiFetch<{ sessions: LessonSession[] }>(`/api/academic/lesson-sessions/?${q}`);
  return unwrap(res).sessions || [];
}

export async function createLessonSession(body: Record<string, unknown>): Promise<LessonSession> {
  const res = await apiFetch<LessonSession>('/api/academic/lesson-sessions/create/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function fetchLessonSessionDetail(
  id: number,
): Promise<LessonSession & { roster: AttendanceRosterRow[] }> {
  const res = await apiFetch<LessonSession & { roster: AttendanceRosterRow[] }>(
    `/api/academic/lesson-sessions/${id}/`,
  );
  return unwrap(res);
}

export async function lessonSessionAction(
  id: number,
  action: 'start' | 'complete' | 'cancel' | 'no_show',
  body?: { cancel_reason?: string },
): Promise<LessonSession> {
  const res = await apiFetch<LessonSession>(`/api/academic/lesson-sessions/${id}/${action}/`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
  return unwrap(res);
}

export async function setLessonTeacherAttendance(
  id: number,
  body: { status: TeacherAttendanceStatus; substitute_ogretmen_id?: number | null },
): Promise<LessonSession> {
  const res = await apiFetch<LessonSession>(`/api/academic/lesson-sessions/${id}/teacher-attendance/`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function fetchLessonStudentAttendance(id: number): Promise<{
  session: LessonSession;
  roster: AttendanceRosterRow[];
  status_options: { value: string; label: string }[];
}> {
  const res = await apiFetch<{
    session: LessonSession;
    roster: AttendanceRosterRow[];
    status_options: { value: string; label: string }[];
  }>(`/api/academic/lesson-sessions/${id}/student-attendance/`);
  return unwrap(res);
}

export async function saveLessonStudentAttendance(
  id: number,
  records: { student_id: number; status: string; note?: string }[],
): Promise<{ roster: AttendanceRosterRow[]; saved: number }> {
  const res = await apiFetch<{ roster: AttendanceRosterRow[]; saved: number }>(
    `/api/academic/lesson-sessions/${id}/student-attendance/`,
    { method: 'POST', body: JSON.stringify({ records }) },
  );
  return unwrap(res);
}

export async function fetchLessonPaySummary(params: {
  term_id: number;
  date_from?: string;
  date_to?: string;
  teacher_id?: number;
}): Promise<{
  date_from: string;
  date_to: string;
  term_id: number;
  teachers: PaySummaryTeacher[];
  totals: { session_count: number; total_minutes: number; total_hours: number };
}> {
  const q = new URLSearchParams();
  q.set('term_id', String(params.term_id));
  if (params.date_from) q.set('date_from', params.date_from);
  if (params.date_to) q.set('date_to', params.date_to);
  if (params.teacher_id) q.set('teacher_id', String(params.teacher_id));
  const res = await apiFetch<{
    date_from: string;
    date_to: string;
    term_id: number;
    teachers: PaySummaryTeacher[];
    totals: { session_count: number; total_minutes: number; total_hours: number };
  }>(`/api/academic/lesson-pay/summary/?${q}`);
  return unwrap(res);
}

export async function fetchScheduleRevisions(params?: {
  term_id?: number;
  version_id?: number;
  limit?: number;
}): Promise<ScheduleRevisionLog[]> {
  const q = new URLSearchParams();
  if (params?.term_id) q.set('term_id', String(params.term_id));
  if (params?.version_id) q.set('version_id', String(params.version_id));
  if (params?.limit) q.set('limit', String(params.limit));
  const res = await apiFetch<{ logs: ScheduleRevisionLog[] }>(
    `/api/academic/schedule/revisions/?${q}`,
  );
  return unwrap(res).logs || [];
}
