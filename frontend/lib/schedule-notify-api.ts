import { apiFetch } from '@/lib/api';

function unwrap<T>(res: Awaited<ReturnType<typeof apiFetch<T>>>): T {
  if (!res.success || res.data === undefined) {
    throw new Error(res.error || 'İstek başarısız');
  }
  return res.data;
}

export type ScheduleNotifyStudent = {
  id: number;
  name: string;
  phone: string;
  has_phone: boolean;
};

export type ScheduleNotifyVeli = {
  id: number;
  name: string;
  phone: string;
  has_phone: boolean;
  ogrenci_id: number;
  ogrenci_ad: string;
};

export type ScheduleNotifyClassPreview = {
  sinif_id: number;
  sinif_ad: string;
  has_changes: boolean;
  empty_grid: boolean;
  filled_count: number;
  last_sent_at: string | null;
  student_count: number;
  veli_count: number;
  students_with_phone: number;
  students_no_phone: number;
  veliler_no_phone: number;
  students?: ScheduleNotifyStudent[];
  veliler?: ScheduleNotifyVeli[];
  warning: string | null;
  default_selected: boolean;
};

export type ScheduleNotifyPreviewResponse = {
  term_id: number;
  term_name: string;
  version_id: number;
  calendar_name: string | null;
  classes: ScheduleNotifyClassPreview[];
};

export type ScheduleNotifyRecipient = {
  kind: 'veli' | 'ogrenci' | 'ogretmen' | 'sinif';
  id: number;
  name: string;
  phone: string;
  status: 'sent' | 'failed' | 'skipped';
  error: string;
  sinif_ad: string;
};

export type ScheduleNotifySendResult = {
  sinif_id: number;
  sinif_ad: string;
  status: string;
  reason: string | null;
  veli_sent: number;
  ogrenci_sent: number;
  errors: string[];
  recipients?: ScheduleNotifyRecipient[];
};

export type ScheduleNotifySendResponse = {
  term_id: number;
  version_id: number;
  total_veli_sent: number;
  total_ogrenci_sent: number;
  total_skipped: number;
  total_errors: number;
  results: ScheduleNotifySendResult[];
  sent_at: string;
};

export type TeacherScheduleNotifyPreview = {
  teacher_id: number;
  teacher_name: string;
  phone: string;
  has_phone: boolean;
  empty_grid: boolean;
  filled_count: number;
  warning: string | null;
  default_selected: boolean;
};

export type TeacherScheduleNotifyPreviewResponse = {
  term_id: number;
  term_name: string;
  teachers: TeacherScheduleNotifyPreview[];
};

export type TeacherScheduleNotifySendResponse = {
  term_id: number;
  total_sent: number;
  total_skipped: number;
  total_errors: number;
  results: {
    teacher_id: number;
    teacher_name: string;
    status: string;
    reason: string | null;
    sent: number;
    errors: string[];
    recipients?: ScheduleNotifyRecipient[];
  }[];
  sent_at: string;
};

export type ScheduleNotifyHistoryItem = {
  id: number;
  batch_id: string;
  target_kind: 'class' | 'teacher';
  title: string;
  status: string;
  veli_count: number;
  ogrenci_count: number;
  sent_at: string | null;
  sent_by: string;
  recipients: ScheduleNotifyRecipient[];
  errors: string[];
};

export async function previewScheduleNotify(body: {
  term_id: number;
  version_id?: number | null;
  weekly_cycle_id?: number | null;
  sinif_ids: number[];
}): Promise<ScheduleNotifyPreviewResponse> {
  const res = await apiFetch<ScheduleNotifyPreviewResponse>('/api/academic/schedule/notify/preview/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function sendScheduleNotify(body: {
  term_id: number;
  version_id?: number | null;
  weekly_cycle_id?: number | null;
  sinif_ids: number[];
  force_unchanged_ids?: number[];
  send_to?: Array<'veli' | 'ogrenci'>;
  exclude_ogrenci_ids?: number[];
  exclude_veli_ids?: number[];
  include_ogrenci_ids?: number[];
  include_veli_ids?: number[];
  batch_id?: string;
}): Promise<ScheduleNotifySendResponse> {
  const res = await apiFetch<ScheduleNotifySendResponse>('/api/academic/schedule/notify/send/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function previewTeacherScheduleNotify(body: {
  term_id: number;
  teacher_ids: number[];
}): Promise<TeacherScheduleNotifyPreviewResponse> {
  const res = await apiFetch<TeacherScheduleNotifyPreviewResponse>(
    '/api/academic/schedule/notify/teacher/preview/',
    { method: 'POST', body: JSON.stringify(body) },
  );
  return unwrap(res);
}

export async function sendTeacherScheduleNotify(body: {
  term_id: number;
  teacher_ids: number[];
  exclude_teacher_ids?: number[];
  include_teacher_ids?: number[];
  batch_id?: string;
}): Promise<TeacherScheduleNotifySendResponse> {
  const res = await apiFetch<TeacherScheduleNotifySendResponse>(
    '/api/academic/schedule/notify/teacher/send/',
    { method: 'POST', body: JSON.stringify(body) },
  );
  return unwrap(res);
}

export async function fetchScheduleNotifyHistory(params: {
  term_id: number;
  target: 'class' | 'teacher';
}): Promise<{ term_id: number; items: ScheduleNotifyHistoryItem[] }> {
  const q = new URLSearchParams({
    term_id: String(params.term_id),
    target: params.target,
  });
  const res = await apiFetch<{ term_id: number; items: ScheduleNotifyHistoryItem[] }>(
    `/api/academic/schedule/notify/history/?${q}`,
  );
  return unwrap(res);
}
