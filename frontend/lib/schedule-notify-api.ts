import { apiFetch } from '@/lib/api';

function unwrap<T>(res: Awaited<ReturnType<typeof apiFetch<T>>>): T {
  if (!res.success || res.data === undefined) {
    throw new Error(res.error || 'İstek başarısız');
  }
  return res.data;
}

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
  warning: string | null;
  default_selected: boolean;
};

export type ScheduleNotifyPreviewResponse = {
  term_id: number;
  term_name: string;
  version_id: number;
  version_name: string;
  classes: ScheduleNotifyClassPreview[];
};

export type ScheduleNotifySendResult = {
  sinif_id: number;
  sinif_ad: string;
  status: string;
  reason: string | null;
  veli_sent: number;
  ogrenci_sent: number;
  errors: string[];
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

export async function previewScheduleNotify(body: {
  term_id: number;
  version_id: number;
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
  version_id: number;
  sinif_ids: number[];
  force_unchanged_ids?: number[];
  send_to?: Array<'veli' | 'ogrenci'>;
}): Promise<ScheduleNotifySendResponse> {
  const res = await apiFetch<ScheduleNotifySendResponse>('/api/academic/schedule/notify/send/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}
