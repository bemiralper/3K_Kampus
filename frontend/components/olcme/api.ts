// ─────────────────────────────────────────────────────────────────────────────
//  Ölçme & Değerlendirme — API Client
//  frontend/components/olcme/api.ts
// ─────────────────────────────────────────────────────────────────────────────

import { getContextHeaders } from '@/lib/api';
import { downloadPdfBlob } from '@/lib/download-file';
import type {
  ExamDetail,
  ExamListItem,
  ExamCreateForm,
  ExamParticipantRow,
  ParticipantSearchHit,
  ExamRoomItem,
  ExamSessionItem,
  PreviewStudent,
  SeatingMode,
  LookupItem,
  SessionCreateForm,
  AnswerKey,
  BulkAnswerKeyPayload,
  SubjectItem,
  AnswerKeyItem,
  DATUploadResponse,
  DATParsePayload,
  DATParseResponse,
  DATSessionItem,
  StudentAnswerItem,
  MappingTemplate,
  StudentSearchResult,
  MatchSuggestionsResponse,
  AnalysisSummary,
  AnalysisSectionItem,
  StudentAnalysis,
  ClassAnalysis,
  RankingItem,
  QuestionAnalysis,
  StrategyItem,
  ComparisonItem,
  StudentDetailResponse,
  StudentExamResponse,
  TopicItem,
  OutcomeItem,
  SubOutcomeItem,
  MatchResult,
  PuanAyarlari,
  PuanYilSeti,
  KatsayiKind,
  ExamPublishStatus,
  ExamPublishPreview,
  ExamPublishDispatch,
} from './types';

const BASE = '/api/coaching/olcme-degerlendirme/exams';

/**
 * DRF validasyon hatalarını okunabilir string'e çevirir.
 * { "items": { "non_field_errors": ["Soru numaraları tekrarsız olmalıdır."] } }
 * → "items: Soru numaraları tekrarsız olmalıdır."
 */
function extractValidationErrors(err: Record<string, unknown>): string | null {
  if (!err || typeof err !== 'object') return null;
  const parts: string[] = [];
  for (const [key, val] of Object.entries(err)) {
    if (Array.isArray(val)) {
      parts.push(val.join(', '));
    } else if (typeof val === 'object' && val !== null) {
      // nested: { non_field_errors: [...] }
      const inner = extractValidationErrors(val as Record<string, unknown>);
      if (inner) parts.push(inner);
    } else if (typeof val === 'string') {
      parts.push(val);
    }
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getContextHeaders(), ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // DRF validasyon hataları { field: [...messages] } yapısında gelebilir
    const msg = err?.error || err?.detail || extractValidationErrors(err) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Sınav CRUD ───────────────────────────────────────────────────────────────

/* Boş string tarih/datetime/sayısal alanları null'a çevir (Django DateField/DateTimeField/IntegerField boş string kabul etmez) */
function cleanPayload(data: Record<string, unknown>): Record<string, unknown> {
  const nullIfEmpty = ['exam_date', 'result_publish_date', 'answer_key_publish_date', 'duration_minutes', 'puan_yili'];
  const cleaned = { ...data };
  for (const key of nullIfEmpty) {
    if (key in cleaned && cleaned[key] === '') {
      cleaned[key] = null;
    }
  }
  return cleaned;
}

export const examApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<ExamListItem[]>(`${BASE}/${qs}`);
  },

  downloadListPdf: async (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await fetch(`${BASE}/list-pdf/${qs}`, {
      credentials: 'include',
      headers: getContextHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string })?.error || 'Liste PDF indirilemedi.');
    }
    const blob = await res.blob();
    await downloadPdfBlob(blob, 'sinav-listesi.pdf');
  },

  detail: (id: number) => request<ExamDetail>(`${BASE}/${id}/`),

  create: (data: ExamCreateForm & Record<string, unknown>) =>
    request<ExamDetail>(`${BASE}/`, {
      method: 'POST',
      body: JSON.stringify(cleanPayload(data as unknown as Record<string, unknown>)),
    }),

  update: (id: number, data: Partial<ExamDetail>) =>
    request<ExamDetail>(`${BASE}/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(cleanPayload(data as unknown as Record<string, unknown>)),
    }),

  delete: (id: number) =>
    request<void>(`${BASE}/${id}/`, { method: 'DELETE' }),

  // ── Bölüm ────────────────────────────────────────────────────────────────

  addSection: (examId: number, data: object) =>
    request<ExamDetail>(`${BASE}/${examId}/add_section/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removeSection: (examId: number, sectionId: number) =>
    request<ExamDetail>(`${BASE}/${examId}/remove_section/`, {
      method: 'POST',
      body: JSON.stringify({ section_id: sectionId }),
    }),

  updateSection: (examId: number, sectionId: number, data: { name?: string; question_start?: number; question_end?: number; order?: number; subject?: number | null }) =>
    request<ExamDetail>(`${BASE}/${examId}/update_section/`, {
      method: 'POST',
      body: JSON.stringify({ section_id: sectionId, ...data }),
    }),

  reorderSections: (examId: number, sectionIds: number[]) =>
    request<ExamDetail>(`${BASE}/${examId}/reorder_sections/`, {
      method: 'POST',
      body: JSON.stringify({ section_ids: sectionIds }),
    }),

  applyTemplate: (examId: number) =>
    request<{ message: string; data: ExamDetail }>(
      `${BASE}/${examId}/apply_template/`,
      { method: 'POST' },
    ),

  /** Mevcut alanlara eksik dersleri ekler */
  ensureSubSections: (examId: number) =>
    request<{ message: string; data: ExamDetail }>(
      `${BASE}/${examId}/ensure_sub_sections/`,
      { method: 'POST' },
    ),

  /** Sınav durumunu güncelle */
  updateStatus: (examId: number, status: string) =>
    request<ExamDetail>(`${BASE}/${examId}/update_status/`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  // ── Oturum ────────────────────────────────────────────────────────────────

  addSession: (examId: number, data: SessionCreateForm) =>
    request<ExamDetail>(`${BASE}/${examId}/add_session/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removeSession: (examId: number, sessionId: number) =>
    request<ExamDetail>(`${BASE}/${examId}/remove_session/`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    }),

  updateSession: (examId: number, sessionId: number, data: object) =>
    request<ExamDetail>(`${BASE}/${examId}/update_session/`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, ...data }),
    }),

  // ── Şablon ────────────────────────────────────────────────────────────────

  templates: () =>
    request<Record<string, { label: string; duration: number; sections: { name: string; question_start: number; question_end: number; question_count: number; order: number }[]; sub_sections?: Record<string, { name: string; question_start: number; question_end: number; question_count: number; order: number }[]> }>>(
      `${BASE}/templates/`,
    ),

  // ── Lookup ────────────────────────────────────────────────────────────────

  siniflar: () => request<LookupItem[]>(`${BASE}/siniflar/`),

  sinifSeviyeleri: () => request<LookupItem[]>(`${BASE}/sinif-seviyeleri/`),

  denemeHizmetleri: () => request<LookupItem[]>(`${BASE}/deneme-hizmetleri/`),

  denemePaketleri: (seviyeId?: number) => {
    const qs = seviyeId ? `?seviye_id=${seviyeId}` : '';
    return request<(LookupItem & { deneme_sayisi: number; seviye_ids?: number[] })[]>(
      `${BASE}/deneme-paketleri/${qs}`,
    );
  },

  previewParticipants: (data: {
    sinif_ids?: number[];
    sinif_seviyesi_ids?: number[];
    deneme_paketi_ids?: number[];
  }) =>
    request<{ count: number; students: PreviewStudent[] }>(`${BASE}/preview-participants/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  participants: (examId: number) =>
    request<{
      count: number;
      participants: ExamParticipantRow[];
      rooms: ExamRoomItem[];
      sessions?: ExamSessionItem[];
    }>(
      `${BASE}/${examId}/participants/`,
    ),

  saveParticipants: (examId: number, data: Record<string, unknown>) =>
    request<{ count: number; participants: ExamParticipantRow[]; rooms: ExamRoomItem[] }>(
      `${BASE}/${examId}/participants/`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  addParticipant: (
    examId: number,
    studentId: number,
    examSessionId?: number | null,
    seat?: { room_id: number; seat_no: number },
  ) =>
    request<ExamParticipantRow>(`${BASE}/${examId}/participants/add/`, {
      method: 'POST',
      body: JSON.stringify({
        student_id: studentId,
        exam_session_id: examSessionId ?? null,
        ...(seat ? { room_id: seat.room_id, seat_no: seat.seat_no } : {}),
      }),
    }),

  patchParticipant: (examId: number, participantId: number, data: Record<string, unknown>) =>
    request<ExamParticipantRow>(`${BASE}/${examId}/participants/${participantId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  removeParticipant: (examId: number, participantId: number) =>
    request<void>(`${BASE}/${examId}/participants/${participantId}/`, { method: 'DELETE' }),

  searchParticipants: (examId: number, q: string, examSessionId?: number | null) =>
    request<ParticipantSearchHit[]>(
      `${BASE}/${examId}/participants/search/?q=${encodeURIComponent(q)}${
        examSessionId ? `&exam_session_id=${examSessionId}` : ''
      }`,
    ),

  rooms: (examId: number) =>
    request<{
      rooms: ExamRoomItem[];
      participant_count: number;
      total_capacity: number;
      warning: string | null;
    }>(`${BASE}/${examId}/rooms/`),

  saveRooms: (examId: number, rooms: ExamRoomItem[]) =>
    request<{
      rooms: ExamRoomItem[];
      participant_count: number;
      total_capacity: number;
      warning: string | null;
    }>(`${BASE}/${examId}/rooms/`, {
      method: 'PUT',
      body: JSON.stringify({ rooms }),
    }),

  seating: (examId: number, mode: SeatingMode, onlyUnassigned = false, examSessionId?: number | null) =>
    request<{ ok: boolean; placed: number; unplaced: number; locked?: number; mode: string; error?: string }>(
      `${BASE}/${examId}/seating/`,
      {
        method: 'POST',
        body: JSON.stringify({
          mode,
          only_unassigned: onlyUnassigned,
          exam_session_id: examSessionId ?? null,
        }),
      },
    ),

  audience: (examId: number) =>
    request<{
      id: number;
      sinif_seviyesi_id: number | null;
      sinif_seviyesi: string;
      deneme_paketi_id: number | null;
      deneme_paketi: string;
    }[]>(`${BASE}/${examId}/audience/`),

  saveAudience: (examId: number, audience: { sinif_seviyesi_id?: number | null; deneme_paketi_id?: number | null }[]) =>
    request<unknown>(`${BASE}/${examId}/audience/`, {
      method: 'PUT',
      body: JSON.stringify({ audience }),
    }),

  rosterExportUrl: (examId: number, kind: 'yoklama' | 'salon' | 'oturma') =>
    `${BASE}/${examId}/roster-export/?kind=${kind}`,

  downloadRoster: async (examId: number, kind: 'yoklama' | 'salon' | 'oturma') => {
    const res = await fetch(`${BASE}/${examId}/roster-export/?kind=${kind}`, {
      credentials: 'include',
      headers: getContextHeaders(),
    });
    if (!res.ok) throw new Error('Liste indirilemedi.');
    const blob = await res.blob();
    const { downloadBlob } = await import('@/lib/download-file');
    downloadBlob(blob, `${kind}.xlsx`);
  },

  bulkAttendance: (
    examId: number,
    data: { attendance: 'present' | 'absent'; participant_ids?: number[]; session_id?: number | null },
  ) =>
    request<{ ok: boolean; updated: number; attendance: string }>(
      `${BASE}/${examId}/participants/bulk-attendance/`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  hatirlatmaPreview: (examId: number, participantIds: number[], eventKey = 'sinav.hatirlatma') =>
    request<{
      event_key: string;
      event_label: string;
      preview_body: string;
      preview_body_veli?: string;
      preview_body_ogrenci?: string;
      supports_ogrenci?: boolean;
      binding_hint: string;
      students: {
        participant_id: number;
        student_id: number;
        full_name: string;
        salon_ad: string;
        sira: string;
        recipients: {
          recipient_type: string;
          veli_id: number | null;
          display_name: string;
          telefon: string;
          skip_reason: string;
        }[];
      }[];
    }>(`${BASE}/${examId}/hatirlatma/preview/`, {
      method: 'POST',
      body: JSON.stringify({ participant_ids: participantIds, event_key: eventKey }),
    }),

  hatirlatmaSend: (examId: number, data: {
    participant_ids: number[];
    veli_ids: number[];
    include_student?: boolean;
    event_key?: string;
  }) =>
    request<{ sent: number; skipped: number; errors: string[] }>(
      `${BASE}/${examId}/hatirlatma/send/`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  publishDispatch: (examId: number) =>
    request<ExamPublishStatus>(`${BASE}/${examId}/publish-dispatch/`),

  publishPreview: (examId: number, kind: 'karne' | 'answer_key') =>
    request<ExamPublishPreview>(`${BASE}/${examId}/publish-dispatch/preview/?kind=${kind}`),

  publishSendNow: (
    examId: number,
    kind: 'karne' | 'answer_key',
    payload?: {
      include_veli?: boolean;
      include_student?: boolean;
      student_ids?: number[];
      veli_ids?: number[];
      answer_ids?: number[];
    },
  ) =>
    request<{
      ok: boolean;
      already?: boolean;
      sent?: number;
      skipped?: number;
      errors?: string[];
      error?: string;
      status?: string;
      campaign_id?: string | null;
      dispatch: ExamPublishStatus;
    }>(`${BASE}/${examId}/publish-dispatch/send-now/`, {
      method: 'POST',
      body: JSON.stringify({ kind, ...payload }),
    }),

  publishReschedule: (
    examId: number,
    kind: 'karne' | 'answer_key',
    scheduledAt: string | null,
    isEnabled = false,
  ) =>
    request<ExamPublishStatus>(`${BASE}/${examId}/publish-dispatch/reschedule/`, {
      method: 'POST',
      body: JSON.stringify({ kind, scheduled_at: scheduledAt, is_enabled: isEnabled }),
    }),

  answerKeyPdfMeta: (examId: number) =>
    request<{ has_uploaded: boolean; can_generate: boolean; filename: string }>(
      `${BASE}/${examId}/answer-key-pdf/`,
    ),

  downloadAnswerKeyPdf: async (
    examId: number,
    opts?: 'uploaded' | 'generated' | {
      source?: 'uploaded' | 'generated';
      copies?: number;
      booklet?: string;
    },
  ) => {
    const options = typeof opts === 'string' ? { source: opts } : (opts || {});
    const qs = new URLSearchParams({ download: '1' });
    if (options.source === 'generated') qs.set('source', 'generated');
    if (options.copies && options.copies !== 1) qs.set('copies', String(options.copies));
    if (options.booklet) qs.set('booklet', options.booklet);
    const res = await fetch(`${BASE}/${examId}/answer-key-pdf/?${qs}`, {
      credentials: 'include',
      headers: getContextHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || 'PDF indirilemedi.');
    }
    const blob = await res.blob();
    const name = filenameFromDisposition(
      res.headers.get('content-disposition'),
      'cevap-anahtari.pdf',
    );
    await downloadPdfBlob(blob, name);
  },

  uploadAnswerKeyPdf: async (examId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/${examId}/answer-key-pdf/`, {
      method: 'POST',
      credentials: 'include',
      headers: getContextHeaders(),
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || 'PDF yüklenemedi.');
    }
    return res.json() as Promise<{ ok: boolean; has_uploaded: boolean; filename: string }>;
  },

  deleteAnswerKeyPdf: (examId: number) =>
    request<{ ok: boolean; has_uploaded: boolean }>(`${BASE}/${examId}/answer-key-pdf/`, {
      method: 'DELETE',
    }),

  // ── Yardımcı ──────────────────────────────────────────────────────────────

  lock: (id: number) => request(`${BASE}/${id}/lock/`, { method: 'POST' }),
  unlock: (id: number) => request(`${BASE}/${id}/unlock/`, { method: 'POST' }),

  copy: (id: number, name?: string) =>
    request<ExamDetail>(`${BASE}/${id}/copy/`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  // ── TYT-AYT Bağlantı ─────────────────────────────────────────────────────

  /** Bağlanabilir TYT sınavlarını listele */
  tytExams: () =>
    request<{ id: number; name: string; exam_date: string | null; status: string; already_linked: boolean }[]>(
      `${BASE}/tyt-exams/`,
    ),

  /** AYT sınavına TYT sınavı bağla */
  linkTyt: (examId: number, tytExamId: number | null) =>
    request<{ message: string; data: ExamDetail }>(`${BASE}/${examId}/link-tyt/`, {
      method: 'POST',
      body: JSON.stringify({ tyt_exam_id: tytExamId }),
    }),
};

// ── Cevap Anahtarı API ──────────────────────────────────────────────────────

export const answerKeyApi = {
  /** Sınava ait tüm cevap anahtarlarını getir */
  list: (examId: number) =>
    request<AnswerKey[]>(`${BASE}/${examId}/answer-keys/`),

  /** Tekil cevap anahtarı detay */
  detail: (examId: number, akId: number) =>
    request<AnswerKey>(`${BASE}/${examId}/answer-keys/${akId}/`),

  /** Cevap anahtarı sil */
  delete: (examId: number, akId: number) =>
    request<void>(`${BASE}/${examId}/answer-keys/${akId}/`, { method: 'DELETE' }),

  /** Toplu cevap anahtarı aktarımı */
  bulkImport: (examId: number, data: BulkAnswerKeyPayload) =>
    request<{ answer_key: AnswerKey; b_answer_key: AnswerKey | null; message: string }>(
      `${BASE}/${examId}/answer-keys/bulk-import/`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  /** Tekil soru güncelle */
  updateItem: (examId: number, akId: number, data: { item_id: number; correct_answer?: string; outcome_id?: number | null; sub_outcome_id?: number | null; is_cancelled?: boolean; imported_outcome_text?: string }) =>
    request<AnswerKeyItem>(
      `${BASE}/${examId}/answer-keys/${akId}/update-item/`,
      { method: 'PATCH', body: JSON.stringify(data) },
    ),

  /** Kazanım ağacı (sınav türüne göre filtrelenmiş) */
  outcomes: (examId: number) =>
    request<SubjectItem[]>(`${BASE}/${examId}/answer-keys/outcomes/`),
};

// ── Sonuç Yükleme (DAT Upload) API ─────────────────────────────────────────

export const uploadApi = {
  /** DAT dosyasını yükle */
  upload: async (examId: number, file: File): Promise<DATUploadResponse> => {
    const formData = new FormData();
    formData.append('dat_file', file);

    const res = await fetch(`${BASE}/${examId}/results/upload/`, {
      method: 'POST',
      credentials: 'include',
      headers: getContextHeaders(),
      body: formData,
      // Content-Type header'ını SET ETMEYİN — browser FormData boundary'yi otomatik ayarlar
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /** Yüklenen DAT'ı parse et (field mappings ile) */
  parse: (examId: number, sessionId: number, payload: DATParsePayload) =>
    request<DATParseResponse>(
      `${BASE}/${examId}/results/${sessionId}/parse/`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  /** Sınava ait sonuçlar */
  listResults: (examId: number) =>
    request<StudentAnswerItem[]>(`${BASE}/${examId}/results/`),

  /** Yükleme oturumlarını getir */
  listSessions: (examId: number) =>
    request<DATSessionItem[]>(`${BASE}/${examId}/results/sessions/`),

  /** Yükleme oturumu sil */
  deleteSession: (examId: number, sessionId: number) =>
    request<void>(`${BASE}/${examId}/results/sessions/${sessionId}/`, { method: 'DELETE' }),

  /** Öğrenci kitapçık türünü değiştir */
  updateStudentBooklet: (examId: number, answerId: number, booklet: string) =>
    request<StudentAnswerItem>(`${BASE}/${examId}/results/students/${answerId}/booklet/`, {
      method: 'PATCH',
      body: JSON.stringify({ booklet }),
    }),

  /** Oturumun sonuçlarını getir (tekrar DAT yüklemeden) */
  sessionResults: (examId: number, sessionId: number) =>
    request<DATParseResponse>(`${BASE}/${examId}/results/sessions/${sessionId}/results/`),

  /** Manuel öğrenci eşleştirme */
  updateStudentMatch: (examId: number, answerId: number, studentId: number | null) =>
    request<{ id: number; matched_student_id: number | null; matched_student_name: string | null; match_score: number; match_method: string }>(
      `${BASE}/${examId}/results/students/${answerId}/match/`,
      { method: 'PATCH', body: JSON.stringify({ student_id: studentId }) },
    ),

  /** Öğrenci arama (eşleştirme dialog'u için) */
  searchStudents: (examId: number, query: string, answerId?: number) => {
    const qs = new URLSearchParams({ q: query });
    if (answerId) qs.set('answer_id', String(answerId));
    return request<StudentSearchResult[]>(`${BASE}/${examId}/results/students/search/?${qs}`);
  },

  /** DAT kaydı için skorlanmış aday önerileri */
  suggestStudents: (examId: number, answerId: number) =>
    request<MatchSuggestionsResponse>(
      `${BASE}/${examId}/results/students/${answerId}/suggestions/`,
    ),

  /** Eşleşmemiş sonuçları güncel öğrenci havuzuyla yeniden eşleştir */
  rematchUnmatched: (examId: number) =>
    request<{
      success: boolean;
      total_unmatched: number;
      newly_matched: number;
      still_unmatched: number;
      matched: Array<{
        answer_id: number;
        raw_student_id: string;
        raw_student_name: string;
        matched_student_id: number;
        matched_student_name: string;
        match_score: number;
        match_method: string;
      }>;
      message?: string;
    }>(`${BASE}/${examId}/results/rematch/`, { method: 'POST' }),

  /** TÜM sınavlardaki eşleşmemiş sonuçları toplu yeniden eşleştir */
  rematchAll: () =>
    request<{
      success: boolean;
      total_unmatched: number;
      newly_matched: number;
      still_unmatched: number;
      exam_results: Array<{
        exam_id: number;
        exam_name: string;
        newly_matched: number;
        still_unmatched: number;
      }>;
      message?: string;
    }>(`${BASE}/rematch-all/`, { method: 'POST' }),
};

// ── Eşleştirme Şablonu API ─────────────────────────────────────────────────

export const mappingTemplateApi = {
  /** Şablonları listele (sınav türüne göre filtreli) */
  list: (examType?: string) => {
    const qs = examType ? `?exam_type=${encodeURIComponent(examType)}` : '';
    return request<MappingTemplate[]>(`${BASE}/mapping-templates/${qs}`);
  },

  /** Yeni şablon oluştur */
  create: (data: {
    name: string;
    exam_type: string;
    mappings: { field: string; start: number; end: number; label: string }[];
    first_line_is_header: boolean;
    student_id_field: string;
  }) =>
    request<MappingTemplate>(`${BASE}/mapping-templates/create/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Şablon sil */
  delete: (templateId: number) =>
    request<void>(`${BASE}/mapping-templates/${templateId}/`, { method: 'DELETE' }),
};

// ── Analiz API ──────────────────────────────────────────────────────────────

export const analysisApi = {
  /** Genel sınav özet paneli */
  summary: (examId: number, sessionId?: number, rankingYear?: number) => {
    const params = new URLSearchParams();
    if (sessionId) params.set('session_id', String(sessionId));
    if (rankingYear) params.set('ranking_year', String(rankingYear));
    const qs = params.toString() ? `?${params}` : '';
    return request<AnalysisSummary>(`${BASE}/${examId}/analysis/summary/${qs}`);
  },

  /** Ders bazlı analiz */
  sections: (examId: number, sessionId?: number) => {
    const qs = sessionId ? `?session_id=${sessionId}` : '';
    return request<{ sections: AnalysisSectionItem[] }>(`${BASE}/${examId}/analysis/sections/${qs}`);
  },

  /** Öğrenci bazlı detay */
  students: (examId: number, sessionId?: number, studentId?: number, rankingYear?: number) => {
    const params = new URLSearchParams();
    if (sessionId) params.set('session_id', String(sessionId));
    if (studentId) params.set('student_id', String(studentId));
    if (rankingYear) params.set('ranking_year', String(rankingYear));
    const qs = params.toString() ? `?${params}` : '';
    return request<{ students: StudentAnalysis[]; total_students: number }>(`${BASE}/${examId}/analysis/students/${qs}`);
  },

  /** Öğrenci detay (sınıf/kurum kıyaslama verisi ile) */
  studentDetail: (examId: number, answerId: number, rankingYear?: number) => {
    const qs = rankingYear ? `?ranking_year=${rankingYear}` : '';
    return request<StudentDetailResponse>(`${BASE}/${examId}/analysis/students/${answerId}/detail/${qs}`);
  },

  /** Sınıf/Şube analizi */
  classes: (examId: number, sessionId?: number) => {
    const qs = sessionId ? `?session_id=${sessionId}` : '';
    return request<{ classes: ClassAnalysis[] }>(`${BASE}/${examId}/analysis/classes/${qs}`);
  },

  /** Sıralama ve yüzdelik dilim */
  rankings: (examId: number, sessionId?: number, rankingYear?: number) => {
    const params = new URLSearchParams();
    if (sessionId) params.set('session_id', String(sessionId));
    if (rankingYear) params.set('ranking_year', String(rankingYear));
    const qs = params.toString() ? `?${params}` : '';
    return request<{ rankings: RankingItem[]; sections: import('./types').RankingSectionInfo[]; total_students: number; top_10_count: number; bottom_10_count: number; avg_score: number; referans_yil: number; section_avgs?: Record<string, { avg_correct: number; avg_wrong: number; avg_net: number }>; avg_net?: number; puan_turleri_avgs?: Record<string, number>; sinif_avgs?: Record<string, any>; kurum_ad?: string; sube_ad?: string }>(`${BASE}/${examId}/analysis/rankings/${qs}`);
  },

  /** Madde (soru) analizi */
  questions: (examId: number, sessionId?: number, sectionId?: number) => {
    const params = new URLSearchParams();
    if (sessionId) params.set('session_id', String(sessionId));
    if (sectionId) params.set('section_id', String(sectionId));
    const qs = params.toString() ? `?${params}` : '';
    return request<{ questions: QuestionAnalysis[]; total_students: number }>(`${BASE}/${examId}/analysis/questions/${qs}`);
  },

  /** Strateji önerileri */
  strategy: (examId: number, sessionId?: number) => {
    const qs = sessionId ? `?session_id=${sessionId}` : '';
    return request<{ strategies: StrategyItem[] }>(`${BASE}/${examId}/analysis/strategy/${qs}`);
  },

  /** Karşılaştırmalı analiz */
  comparison: (examId: number) =>
    request<{ comparisons: ComparisonItem[] }>(`${BASE}/${examId}/analysis/comparison/`),

  /** Sıralama listesini Excel/CSV olarak indir */
  exportRankings: async (
    format: 'xlsx' | 'csv',
    examId: number,
    sessionId?: number,
    rankingYear?: number,
    alan?: string | null,
  ): Promise<Blob> => {
    const params = new URLSearchParams();
    params.set('format', format);
    if (sessionId) params.set('session_id', String(sessionId));
    if (rankingYear) params.set('ranking_year', String(rankingYear));
    if (alan) params.set('alan', alan);
    const res = await fetch(`${BASE}/${examId}/analysis/rankings/?${params}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error(format === 'xlsx' ? 'Excel dışa aktarma başarısız' : 'CSV dışa aktarma başarısız');
    }
    return res.blob();
  },

  downloadKarnePdf: async (examId: number, answerId: number, rankingYear?: number) => {
    const params = new URLSearchParams();
    if (rankingYear) params.set('ranking_year', String(rankingYear));
    const qs = params.toString() ? `?${params}` : '';
    const res = await fetch(`${BASE}/${examId}/analysis/students/${answerId}/karne-pdf/${qs}`, {
      credentials: 'include',
      headers: getContextHeaders(),
    });
    if (!res.ok) throw new Error('Karne PDF indirilemedi');
    const blob = await res.blob();
    const name = filenameFromDisposition(res.headers.get('content-disposition'), `karne-${answerId}.pdf`);
    await downloadPdfBlob(blob, name);
  },

  downloadKarnelerPdf: async (examId: number, answerIds: number[], rankingYear?: number) => {
    if (!answerIds.length) throw new Error('İndirilecek öğrenci seçilmedi');
    const params = new URLSearchParams();
    params.set('answer_ids', answerIds.join(','));
    if (rankingYear) params.set('ranking_year', String(rankingYear));
    const res = await fetch(`${BASE}/${examId}/analysis/students/karneler-pdf/?${params}`, {
      credentials: 'include',
      headers: getContextHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || 'Karneler PDF indirilemedi');
    }
    const blob = await res.blob();
    const name = filenameFromDisposition(res.headers.get('content-disposition'), `karneler-${examId}.pdf`);
    await downloadPdfBlob(blob, name);
  },

  karneNotifyPreview: (examId: number, answerId: number, rankingYear?: number) => {
    const qs = rankingYear ? `?ranking_year=${rankingYear}` : '';
    return request<KarneNotifyPreviewResponse>(
      `${BASE}/${examId}/analysis/students/${answerId}/notify-preview/${qs}`,
    );
  },

  karneNotifyBulkPreview: (examId: number, answerIds: number[]) => {
    const params = new URLSearchParams();
    params.set('answer_ids', answerIds.join(','));
    return request<KarneBulkPreviewResponse>(
      `${BASE}/${examId}/analysis/students/notify-bulk-preview/?${params}`,
    );
  },

  karneNotifyBulkSend: (
    examId: number,
    payload: { answer_ids: number[]; include_veli: boolean; include_student: boolean },
    rankingYear?: number,
  ) => {
    const qs = rankingYear ? `?ranking_year=${rankingYear}` : '';
    return request<KarneBulkSendResponse>(
      `${BASE}/${examId}/analysis/students/notify-bulk/${qs}`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
  },

  karneNotifySend: (
    examId: number,
    answerId: number,
    payload: { veli_ids: number[]; include_student: boolean },
    rankingYear?: number,
  ) => {
    const qs = rankingYear ? `?ranking_year=${rankingYear}` : '';
    return request<KarneNotifySendResponse>(
      `${BASE}/${examId}/analysis/students/${answerId}/notify/${qs}`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
  },
};

export interface KarneNotifyRecipient {
  recipient_type: 'veli' | 'ogrenci' | string;
  ogrenci_id: number;
  veli_id: number | null;
  display_name: string;
  telefon: string;
  body: string;
  skip_reason: string;
}

export interface KarneNotifyPreviewResponse {
  success: boolean;
  error?: string;
  data?: {
    exam_id: number;
    answer_id: number;
    exam_name: string;
    student_name: string;
    pdf_title: string;
    send_mode: 'document' | 'meta_template' | string;
    meta_template_veli?: string;
    meta_template_ogrenci?: string;
    recipients: KarneNotifyRecipient[];
  };
}

export interface KarneBulkStudentRow {
  answer_id: number;
  student_name: string;
  veli_count: number;
  has_student: boolean;
  skip_reason: string;
  send_mode?: string;
}

export interface KarneBulkPreviewResponse {
  success: boolean;
  error?: string;
  data?: {
    exam_id: number;
    exam_name: string;
    students: KarneBulkStudentRow[];
    sendable: number;
    total: number;
    scheduled_warning?: ExamPublishDispatch | null;
  };
}

export interface KarneBulkSendResponse {
  success: boolean;
  error?: string;
  data?: {
    sent: number;
    skipped: number;
    errors: string[];
    campaign_id?: string | null;
    schedule_cancelled?: boolean;
    student_results?: Array<{
      answer_id: number;
      student_name: string;
      sent: number;
      errors: string[];
    }>;
  };
}

export interface KarneNotifySendResponse {
  success: boolean;
  error?: string;
  data?: {
    sent: number;
    skipped: number;
    errors: string[];
    sent_details?: Array<{
      recipient_type: string;
      display_name: string;
      telefon: string;
      message_status: string;
    }>;
  };
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try { return decodeURIComponent(star[1]); } catch { /* ignore */ }
  }
  const plain = header.match(/filename="([^"]+)"/i);
  return plain?.[1] || fallback;
}

// ── Öğrenci Sınav Sekmesi API ───────────────────────────────────────────────

const STUDENT_EXAM_BASE = '/api/coaching/olcme-degerlendirme/student-exams';

export const studentExamApi = {
  /** Öğrencinin girdiği tüm sınavlar + KPI + trend */
  results: (studentId: number, examType?: string, rankingYear?: number) => {
    const params = new URLSearchParams();
    if (examType) params.set('exam_type', examType);
    if (rankingYear) params.set('ranking_year', String(rankingYear));
    const qs = params.toString() ? `?${params}` : '';
    return request<StudentExamResponse>(`${STUDENT_EXAM_BASE}/${studentId}/${qs}`);
  },
};

// ── Müfredat / Kazanım API ──────────────────────────────────────────────────

const CURRICULUM_BASE = '/api/coaching/olcme-degerlendirme/curriculum';

export const curriculumApi = {
  /** Ders listesi (özet) */
  listSubjects: (examType?: string, band?: string) => {
    const params = new URLSearchParams();
    if (examType) params.set('exam_type', examType);
    if (band) params.set('band', band);
    const qs = params.toString() ? `?${params}` : '';
    return request<SubjectItem[]>(`${CURRICULUM_BASE}/subjects/${qs}`);
  },

  /** Ders detayı (tüm konu/kazanım ağacı) */
  getSubject: (subjectId: number) =>
    request<SubjectItem>(`${CURRICULUM_BASE}/subjects/${subjectId}/`),

  /** Yeni ders oluştur */
  createSubject: (data: { code: string; name: string; display_name?: string; exam_type_filter?: string; order?: number }) =>
    request<SubjectItem>(`${CURRICULUM_BASE}/subjects/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Ders güncelle */
  updateSubject: (subjectId: number, data: Partial<SubjectItem>) =>
    request<SubjectItem>(`${CURRICULUM_BASE}/subjects/${subjectId}/`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /** Ders sil */
  deleteSubject: (subjectId: number) =>
    request<void>(`${CURRICULUM_BASE}/subjects/${subjectId}/`, { method: 'DELETE' }),

  /** Konu listesi */
  listTopics: (subjectId: number) =>
    request<TopicItem[]>(`${CURRICULUM_BASE}/subjects/${subjectId}/topics/`),

  /** Yeni konu oluştur */
  createTopic: (subjectId: number, data: { code?: string; name: string; order?: number; outcomes?: object[] }) =>
    request<TopicItem>(`${CURRICULUM_BASE}/subjects/${subjectId}/topics/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Konu güncelle */
  updateTopic: (subjectId: number, topicId: number, data: { code?: string; name?: string; order?: number }) =>
    request<TopicItem>(`${CURRICULUM_BASE}/subjects/${subjectId}/topics/${topicId}/`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /** Konu sil */
  deleteTopic: (subjectId: number, topicId: number) =>
    request<void>(`${CURRICULUM_BASE}/subjects/${subjectId}/topics/${topicId}/`, { method: 'DELETE' }),

  /** Konuları yeniden sırala (drag & drop) — tüm kodlar otomatik yeniden numaralanır */
  reorderTopics: (subjectId: number, topicIds: number[]) =>
    request<SubjectItem>(`${CURRICULUM_BASE}/subjects/${subjectId}/reorder-topics/`, {
      method: 'POST',
      body: JSON.stringify({ topic_ids: topicIds }),
    }),

  /** Toplu kazanım eşleştirme (backend akıllı eşleştirme) */
  matchOutcomes: (subjectId: number, texts: string[]) =>
    request<{ results: MatchResult[] }>(`${CURRICULUM_BASE}/subjects/${subjectId}/match-outcomes/`, {
      method: 'POST',
      body: JSON.stringify({ texts }),
    }),

  /** Kazanım listesi */
  listOutcomes: (subjectId: number, topicId: number) =>
    request<OutcomeItem[]>(`${CURRICULUM_BASE}/subjects/${subjectId}/topics/${topicId}/outcomes/`),

  /** Yeni kazanım oluştur */
  createOutcome: (subjectId: number, topicId: number, data: { code?: string; text: string; order?: number; sub_outcomes?: object[] }) =>
    request<OutcomeItem>(`${CURRICULUM_BASE}/subjects/${subjectId}/topics/${topicId}/outcomes/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Kazanım güncelle */
  updateOutcome: (subjectId: number, topicId: number, outcomeId: number, data: { code?: string; text?: string; order?: number; is_active?: boolean }) =>
    request<OutcomeItem>(`${CURRICULUM_BASE}/subjects/${subjectId}/topics/${topicId}/outcomes/${outcomeId}/`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /** Kazanım sil */
  deleteOutcome: (subjectId: number, topicId: number, outcomeId: number) =>
    request<void>(`${CURRICULUM_BASE}/subjects/${subjectId}/topics/${topicId}/outcomes/${outcomeId}/`, { method: 'DELETE' }),

  /** Alt kazanım oluştur */
  createSubOutcome: (subjectId: number, topicId: number, outcomeId: number, data: { code?: string; text: string; order?: number }) =>
    request<SubOutcomeItem>(`${CURRICULUM_BASE}/subjects/${subjectId}/topics/${topicId}/outcomes/${outcomeId}/sub-outcomes/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Alt kazanım güncelle */
  updateSubOutcome: (subjectId: number, topicId: number, outcomeId: number, subId: number, data: { code?: string; text?: string; order?: number; is_active?: boolean }) =>
    request<SubOutcomeItem>(`${CURRICULUM_BASE}/subjects/${subjectId}/topics/${topicId}/outcomes/${outcomeId}/sub-outcomes/${subId}/`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /** Alt kazanım sil */
  deleteSubOutcome: (subjectId: number, topicId: number, outcomeId: number, subId: number) =>
    request<void>(`${CURRICULUM_BASE}/subjects/${subjectId}/topics/${topicId}/outcomes/${outcomeId}/sub-outcomes/${subId}/`, { method: 'DELETE' }),

  /** JSON formatında toplu içe aktarım */
  bulkImport: (data: { subject_id: number; topics: object[] }) =>
    request<{ message: string; stats: { topics: number; outcomes: number; sub_outcomes: number }; subject: SubjectItem }>(
      `${CURRICULUM_BASE}/bulk-import/`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  downloadCatalog: async (codes?: string[]) => {
    const qs = codes?.length ? `?codes=${encodeURIComponent(codes.join(','))}` : '';
    const res = await fetch(`${CURRICULUM_BASE}/catalog/export/${qs}`, {
      credentials: 'include',
      headers: getContextHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || 'Katalog indirilemedi.');
    }
    const blob = await res.blob();
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { downloadBlob } = await import('@/lib/download-file');
    downloadBlob(blob, `kazanim-katalogu-${stamp}.json`);
  },

  importCatalog: async (file: File, mode: 'replace' | 'merge', dryRun = false) => {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    if (dryRun) form.append('dry_run', '1');
    const res = await fetch(`${CURRICULUM_BASE}/catalog/import/`, {
      method: 'POST',
      credentials: 'include',
      headers: getContextHeaders(),
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || 'Katalog yüklenemedi.');
    }
    return res.json() as Promise<{
      ok: boolean;
      message: string;
      dry_run: boolean;
      mode: string;
      counts: { subjects: number; topics: number; outcomes: number; sub_outcomes: number };
      imported?: { subjects: number; topics: number; outcomes: number; sub_outcomes: number };
      subjects?: { code: string; name: string; topics: number }[];
    }>;
  },

  /** Metin formatında toplu içe aktarım (kopyala-yapıştır) */
  bulkTextImport: (data: { subject_id: number; text: string }) =>
    request<{ message: string; stats: { topics: number; outcomes: number; sub_outcomes: number }; subject: SubjectItem }>(
      `${CURRICULUM_BASE}/bulk-text-import/`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  /** Dersi sınav bölümüne bağla */
  linkSection: (subjectId: number, sectionId: number) =>
    request<{ message: string; section_id: number; subject_id: number }>(
      `${CURRICULUM_BASE}/link-section/`,
      { method: 'POST', body: JSON.stringify({ subject_id: subjectId, section_id: sectionId }) },
    ),

  /** Sınav bölümünden ders bağlantısını kaldır */
  unlinkSection: (sectionId: number) =>
    request<{ message: string; section_id: number }>(
      `${CURRICULUM_BASE}/unlink-section/`,
      { method: 'POST', body: JSON.stringify({ section_id: sectionId }) },
    ),
};

const PUAN_AYAR_BASE = '/api/coaching/olcme-degerlendirme/puan-ayarlari';

export const puanAyarlariApi = {
  get: () => request<PuanAyarlari>(`${PUAN_AYAR_BASE}/`),

  updateDefault: (default_puan_yili: number) =>
    request<PuanAyarlari>(`${PUAN_AYAR_BASE}/`, {
      method: 'PATCH',
      body: JSON.stringify({ default_puan_yili }),
    }),

  getYear: (year: number) =>
    request<PuanYilSeti>(`${PUAN_AYAR_BASE}/katsayilar/${year}/`),

  saveYear: (year: number, sets: Partial<Record<KatsayiKind, { coefficients: Record<string, number> }>>) =>
    request<PuanYilSeti>(`${PUAN_AYAR_BASE}/katsayilar/${year}/`, {
      method: 'PUT',
      body: JSON.stringify({ sets }),
    }),

  resetYear: (year: number) =>
    request<PuanYilSeti>(`${PUAN_AYAR_BASE}/katsayilar/${year}/reset/`, {
      method: 'POST',
    }),
};

const OTURUM_AYAR_BASE = '/api/coaching/olcme-degerlendirme/oturum-ayarlari';

export type OturumSeviyeAyar = {
  sinif_seviyesi_id: number;
  sinif_seviyesi: string;
  kod: string;
  aktif_mi?: boolean;
  preference: 'HAFTA_ICI' | 'HAFTA_SONU';
  fallback: 'HAFTA_ICI' | 'HAFTA_SONU';
};

export type OturumOgrenciAyar = {
  ogrenci_id: number;
  full_name: string;
  tc_kimlik_no: string;
  sinif: string;
  sinif_seviyesi_id: number | null;
  sinif_seviyesi: string;
  preference: 'HAFTA_ICI' | 'HAFTA_SONU';
  is_override: boolean;
};

export const oturumAyarlariApi = {
  seviyeler: () => request<{ items: OturumSeviyeAyar[] }>(`${OTURUM_AYAR_BASE}/seviyeler/`),

  saveSeviyeler: (items: { sinif_seviyesi_id: number; preference: string }[]) =>
    request<{ items: OturumSeviyeAyar[] }>(`${OTURUM_AYAR_BASE}/seviyeler/`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }),

  ogrenciler: (params?: { paket_id?: number | ''; seviye_id?: number | ''; group?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.paket_id) qs.set('paket_id', String(params.paket_id));
    if (params?.seviye_id) qs.set('seviye_id', String(params.seviye_id));
    if (params?.group) qs.set('group', params.group);
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<{ items: OturumOgrenciAyar[]; paketler: { id: number; ad: string }[] }>(
      `${OTURUM_AYAR_BASE}/ogrenciler/${suffix}`,
    );
  },

  patchOgrenci: (ogrenciId: number, preference: 'HAFTA_ICI' | 'HAFTA_SONU' | 'default') =>
    request<{ items: OturumOgrenciAyar[]; paketler: { id: number; ad: string }[] }>(
      `${OTURUM_AYAR_BASE}/ogrenciler/`,
      { method: 'PATCH', body: JSON.stringify({ ogrenci_id: ogrenciId, preference }) },
    ),
};
