// ─────────────────────────────────────────────────────────────────────────────
//  Ölçme & Değerlendirme — API Client
//  frontend/components/olcme/api.ts
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ExamDetail,
  ExamListItem,
  ExamCreateForm,
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
    headers: { 'Content-Type': 'application/json', ...options.headers },
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
  const nullIfEmpty = ['exam_date', 'result_publish_date', 'answer_key_publish_date', 'duration_minutes'];
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

  detail: (id: number) => request<ExamDetail>(`${BASE}/${id}/`),

  create: (data: ExamCreateForm) =>
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

  updateSection: (examId: number, sectionId: number, data: { name?: string; question_start?: number; question_end?: number; order?: number }) =>
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

  denemePaketleri: () =>
    request<(LookupItem & { deneme_sayisi: number })[]>(`${BASE}/deneme-paketleri/`),

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
  updateItem: (examId: number, akId: number, data: { item_id: number; correct_answer?: string; outcome_id?: number | null; is_cancelled?: boolean; imported_outcome_text?: string }) =>
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
  searchStudents: (examId: number, query: string) =>
    request<StudentSearchResult[]>(`${BASE}/${examId}/results/students/search/?q=${encodeURIComponent(query)}`),

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
  summary: (examId: number, sessionId?: number) => {
    const qs = sessionId ? `?session_id=${sessionId}` : '';
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
    return request<{ rankings: RankingItem[]; sections: import('./types').RankingSectionInfo[]; total_students: number; top_10_count: number; bottom_10_count: number; avg_score: number; referans_yil: number; section_avgs?: Record<string, { avg_correct: number; avg_wrong: number; avg_net: number }>; avg_net?: number; puan_turleri_avgs?: Record<string, number>; sinif_avgs?: Record<string, any> }>(`${BASE}/${examId}/analysis/rankings/${qs}`);
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
  ): Promise<Blob> => {
    const params = new URLSearchParams();
    params.set('format', format);
    if (sessionId) params.set('session_id', String(sessionId));
    if (rankingYear) params.set('ranking_year', String(rankingYear));
    const res = await fetch(`${BASE}/${examId}/analysis/rankings/?${params}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error(format === 'xlsx' ? 'Excel dışa aktarma başarısız' : 'CSV dışa aktarma başarısız');
    }
    return res.blob();
  },
};

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
  listSubjects: (examType?: string) => {
    const qs = examType ? `?exam_type=${encodeURIComponent(examType)}` : '';
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
