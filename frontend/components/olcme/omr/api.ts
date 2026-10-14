import { getContextHeaders } from '@/lib/api';

const BASE = '/api/coaching/olcme-degerlendirme/exams';

export interface OmrPage {
  id: number;
  sequence: number;
  original_filename: string;
  source_page: number;
  status: 'PENDING' | 'PROCESSING' | 'REVIEW' | 'READY' | 'ERROR';
  registration: { overlay?: Array<{ x_mm: number; y_mm: number; score: number; alan_id: string }> };
  decoded: Record<string, unknown> & {
    cevaplar?: Record<string, string>;
    tc?: string;
    ogrenci_no?: string;
    ad_soyad?: string;
    kitapcik?: string;
  };
  review: { approved?: boolean; values?: Record<string, unknown> };
  match_preview: { student_id?: number | null; student_name?: string; score?: number; method?: string };
  confidence: number;
  warnings: string[];
  critical_warnings: string[];
  error_message: string;
  image_url: string;
}

export interface OmrJob {
  id: number;
  exam_id: number;
  sablon_id: number;
  sablon_adi: string;
  page_width_mm: number;
  page_height_mm: number;
  status: 'PENDING' | 'PROCESSING' | 'REVIEW' | 'CONFIRMED' | 'ERROR';
  total_pages: number;
  processed_pages: number;
  error_pages: number;
  result_session_id: number | null;
  pages?: OmrPage[];
}

async function fail(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
}

async function json<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getContextHeaders(), ...init.headers },
    ...init,
  });
  if (!res.ok) return fail(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const omrApi = {
  list: (examId: number) => json<OmrJob[]>(`${BASE}/${examId}/omr/`),
  detail: (examId: number, jobId: number) => json<OmrJob>(`${BASE}/${examId}/omr/${jobId}/`),
  create: async (examId: number, templateId: number, files: File[]) => {
    const form = new FormData();
    form.append('sablon_id', String(templateId));
    files.forEach(file => form.append('files', file));
    const res = await fetch(`${BASE}/${examId}/omr/`, {
      method: 'POST',
      credentials: 'include',
      headers: getContextHeaders(),
      body: form,
    });
    if (!res.ok) return fail(res);
    return res.json() as Promise<OmrJob>;
  },
  process: (examId: number, jobId: number, batchSize = 4) =>
    json<OmrJob>(`${BASE}/${examId}/omr/${jobId}/process/`, {
      method: 'POST',
      body: JSON.stringify({ batch_size: batchSize }),
    }),
  review: (examId: number, jobId: number, pageId: number, review: OmrPage['review']) =>
    json<OmrPage>(`${BASE}/${examId}/omr/${jobId}/pages/${pageId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ review }),
    }),
  confirm: (examId: number, jobId: number) =>
    json<OmrJob>(`${BASE}/${examId}/omr/${jobId}/confirm/`, {
      method: 'POST',
      body: '{}',
    }),
};
