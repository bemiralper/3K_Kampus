import { useQuery } from '@tanstack/react-query';
import { Linking, Share } from 'react-native';
import { API_URL, api, apiBlob } from '@/api/client';
import { useSession } from '@/auth/store';
import type { BoardRow, CatalogTopic, ClassRow, HomePayload, LessonNote, NotificationPage, Page, PrivateStudent, SchedulePayload, StudentCard, StudentExams, StudentRow, TeacherProfile, TopicRow } from '@/api/types';

function useScopeKey() {
  const kurumId = useSession((state) => state.kurumId);
  const subeId = useSession((state) => state.subeId);
  const yilId = useSession((state) => state.yilId);
  return { kurumId, subeId, yilId, ready: kurumId != null && subeId != null && yilId != null };
}

export function useTeacherProfile() {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ['teacher-profile', scope],
    enabled: scope.ready,
    queryFn: () => api<TeacherProfile>('/api/teacher/profile/'),
  });
}

export function useTerms() {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ['teacher-terms', scope],
    enabled: scope.ready,
    queryFn: () => api<{ results: { id: number; name: string; is_current: boolean }[] }>('/api/teacher/terms/'),
  });
}

export function useTermId() {
  const terms = useTerms();
  const current = terms.data?.results.find((row) => row.is_current) ?? terms.data?.results[0];
  return { termId: current?.id ?? null, termName: current?.name ?? '', terms };
}

export function useHome(termId: number | null) {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ['teacher-home', scope, termId],
    enabled: scope.ready && termId != null,
    queryFn: () => api<HomePayload>(`/api/teacher/home/?term_id=${termId}`),
  });
}

export function useSchedule(termId: number | null) {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ['teacher-schedule', scope, termId],
    enabled: scope.ready && termId != null,
    queryFn: () => api<SchedulePayload>(`/api/teacher/schedule/?term_id=${termId}`),
  });
}

export function useClasses(termId: number | null) {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ['teacher-classes', scope, termId],
    enabled: scope.ready && termId != null,
    queryFn: () => api<Page<ClassRow>>(`/api/teacher/classes/?term_id=${termId}`),
  });
}

export function useStudents(
  termId: number | null,
  planId: number | null,
  query: string,
  groupId: number | null = null,
  page = 1,
) {
  const scope = useScopeKey();
  const q = query.trim();
  return useQuery({
    queryKey: ['teacher-students', scope, termId, planId, q, groupId, page],
    enabled: scope.ready && termId != null,
    queryFn: () => {
      const params = new URLSearchParams({ term_id: String(termId), page: String(page) });
      if (planId) params.set('plan_id', String(planId));
      if (groupId) params.set('group_id', String(groupId));
      if (q) params.set('q', q);
      return api<Page<StudentRow>>(`/api/teacher/students/?${params.toString()}`);
    },
  });
}

export function usePrivateStudents(termId: number | null) {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ['teacher-private-students', scope, termId],
    enabled: scope.ready && termId != null,
    queryFn: () => api<Page<PrivateStudent>>(`/api/teacher/private-students/?term_id=${termId}`),
  });
}

export function useTopicCatalog(termId: number | null, planId: number | null) {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ['teacher-topic-catalog', scope, termId, planId],
    enabled: scope.ready && termId != null && planId != null,
    queryFn: () =>
      api<{ results: CatalogTopic[] }>(
        `/api/teacher/classes/${planId}/topic-catalog/?term_id=${termId}`,
      ),
  });
}

export function useTopics(termId: number | null, planId: number | null, cellId: number | null, sessionDate: string) {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ['teacher-topics', scope, termId, planId, cellId, sessionDate],
    enabled: scope.ready && termId != null && planId != null && cellId != null && sessionDate !== '',
    queryFn: () => {
      const params = new URLSearchParams({
        term_id: String(termId),
        program_grid_cell_id: String(cellId),
        session_date: sessionDate,
      });
      return api<Page<TopicRow>>(`/api/teacher/classes/${planId}/topics/?${params.toString()}`);
    },
  });
}

export function saveTopic(input: {
  planId: number;
  termId: number;
  cellId: number;
  sessionDate: string;
  topicId: number | null;
  outcomeIds: number[];
  note: string;
  idempotencyKey: string;
}) {
  return api<TopicRow>(`/api/teacher/classes/${input.planId}/topics/`, {
    method: 'POST',
    headers: { 'Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify({
      term_id: input.termId,
      session_date: input.sessionDate,
      program_grid_cell_id: input.cellId,
      topic_id: input.topicId,
      outcome_ids: input.outcomeIds,
      note: input.note,
    }),
  });
}

export function useNotifications(category: string) {
  const scope = useScopeKey();
  const selected = category.trim();
  return useQuery({
    queryKey: ['teacher-notifications', scope, selected],
    enabled: scope.ready,
    queryFn: () => {
      const params = new URLSearchParams();
      if (selected) params.set('category', selected);
      const query = params.toString();
      return api<NotificationPage>(`/api/teacher/notifications/${query ? `?${query}` : ''}`);
    },
  });
}

export function useBoards() {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ['teacher-boards', scope],
    enabled: scope.ready,
    queryFn: () => api<{ results: BoardRow[] }>('/api/teacher/boards/'),
  });
}

export function pairBoard(code: string) {
  return api<BoardRow>('/api/teacher/boards/', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function showOnBoard(boardId: string, termId: number, planId: number) {
  return api<BoardRow>(`/api/teacher/boards/${boardId}/show/`, {
    method: 'POST',
    body: JSON.stringify({ term_id: termId, plan_id: planId }),
  });
}

export function endBoard(boardId: string) {
  return api<{ code: string; message: string }>(`/api/teacher/boards/${boardId}/end/`, {
    method: 'POST',
    body: '{}',
  });
}

export function useStudentExams(termId: number | null, studentId: number | null) {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ['teacher-student-exams', scope, termId, studentId],
    enabled: scope.ready && termId != null && studentId != null,
    queryFn: () => api<StudentExams>(`/api/teacher/students/${studentId}/exams/?term_id=${termId}`),
  });
}

export function useLessonNotes(termId: number | null, planId: number | null) {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ['teacher-lesson-notes', scope, termId, planId],
    enabled: scope.ready && termId != null && planId != null,
    queryFn: () => api<{ results: LessonNote[] }>(`/api/teacher/classes/${planId}/notes/?term_id=${termId}`),
  });
}

export function deleteLessonNote(noteId: number) {
  return api<{ deleted: boolean }>(`/api/teacher/notes/${noteId}/`, { method: 'DELETE' });
}

export function saveLessonNote(planId: number, termId: number, sessionDate: string, file: File, idempotencyKey: string) {
  const body = new FormData();
  body.append('term_id', String(termId));
  body.append('session_date', sessionDate);
  body.append('file', file);
  return api<LessonNote>(`/api/teacher/classes/${planId}/notes/`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body,
  });
}

export type NotePreview = { pages: { number: number; width: number; height: number }[] };

export function useNotePreview(noteId: number | null) {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ['teacher-note-preview', scope, noteId],
    enabled: scope.ready && noteId != null,
    queryFn: () => api<NotePreview>(`/api/teacher/notes/${noteId}/preview/`),
  });
}

export function notePreviewUri(noteId: number, page: number) {
  return `${API_URL}/api/teacher/notes/${noteId}/preview/${page}/`;
}

export async function downloadLessonNoteFile(noteId: number, fileName: string) {
  const body = await api<{ view: string }>(`/api/teacher/notes/${noteId}/link/`, { method: 'POST' });
  const url = `${API_URL}/api/teacher/notes/${noteId}/file/?view=${encodeURIComponent(body.view)}&download=1`;
  try {
    const result = await Share.share({ title: fileName, url });
    if (result.action === Share.dismissedAction) return;
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/cancel|dismiss|did not share/i.test(message)) return;
    await Linking.openURL(url);
  }
}

export async function lessonNoteObjectUrl(note: LessonNote) {
  const raw = await apiBlob(`/api/teacher/notes/${note.id}/file/`);
  const blob = new Blob([await raw.arrayBuffer()], { type: note.mime_type || raw.type || 'application/octet-stream' });
  return URL.createObjectURL(blob);
}

export function downloadObjectUrl(fileName: string, url: string) {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
}

export function useStudent(termId: number | null, planId: number | null, studentId: number | null) {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ['teacher-student', scope, termId, planId, studentId],
    enabled: scope.ready && termId != null && planId != null && studentId != null,
    queryFn: () =>
      api<StudentCard>(
        `/api/teacher/students/${studentId}/?term_id=${termId}&plan_id=${planId}`,
      ),
  });
}
