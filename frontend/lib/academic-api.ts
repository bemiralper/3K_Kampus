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

export function exportSlotsCsv(templateName: string, slots: TimeSlot[]) {
  const header = ['Sıra', 'Ad', 'Başlangıç', 'Bitiş', 'Süre (dk)', 'Tip'];
  const rows = slots.map((s) => [
    s.order,
    s.name,
    s.start_time_display,
    s.end_time_display,
    s.duration,
    s.slot_type_display,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${templateName.replace(/\s+/g, '_')}_ders_saatleri.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  used_templates: { id: number; name: string }[];
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
