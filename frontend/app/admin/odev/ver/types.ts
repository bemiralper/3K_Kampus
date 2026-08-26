import type { ScopeCompletionProgress as ScopeProgress } from '@/lib/resources-api';

export type {
  ContentTaskHistoryItem,
  ContentTaskHistory,
  ScopeCompletionProgress,
} from '@/lib/resources-api';
export type ScopeCompletionMap = Record<number, ScopeProgress>;

export interface Student {
  id: number;
  ad: string;
  soyad: string;
  sinif_ad?: string;
  profil_foto?: string;
  numara?: string;
  okul_no?: string;
}

export interface StudentResource {
  id: number;
  resource_book: number;
  resource_name: string;
  resource_type: string;
  resource_type_display?: string;
  resource_type_kod?: string;
  publication_year?: number;
  publisher?: string;
  lesson: number;
  lesson_name: string;
  status?: string;
}

export type RoutineQuotaKind = 'PARAGRAF' | 'PROBLEM';

export function isRoutineQuotaResource(r: Pick<StudentResource, 'resource_type_kod' | 'resource_type'>): boolean {
  const kod = (r.resource_type_kod || '').toUpperCase();
  if (kod === 'PARAGRAF' || kod === 'PROBLEM') return true;
  const ad = (r.resource_type || '').toLocaleLowerCase('tr');
  return ad === 'paragraf' || ad === 'problem';
}

export function routineQuotaKindOf(r: Pick<StudentResource, 'resource_type_kod' | 'resource_type'>): RoutineQuotaKind | null {
  const kod = (r.resource_type_kod || '').toUpperCase();
  if (kod === 'PARAGRAF' || kod === 'PROBLEM') return kod;
  const ad = (r.resource_type || '').toLocaleLowerCase('tr');
  if (ad === 'paragraf') return 'PARAGRAF';
  if (ad === 'problem') return 'PROBLEM';
  return null;
}

export interface Content {
  id: number;
  ad: string;
  name?: string;
  content_type: string;
  content_type_display?: string;
  question_count: number | null;
  page_start: number | null;
  page_end: number | null;
  start_page?: number | null;
  end_page?: number | null;
  page_count: number | null;
  difficulty?: string;
  difficulty_display?: string;
  sira?: number;
}

export interface Topic {
  id: number;
  ad: string;
  name?: string;
  kod?: string;
  content_count?: number;
  contents: Content[];
}

export interface Unit {
  id: number;
  ad: string;
  name?: string;
  sira?: number;
  topic_count?: number;
  topics: Topic[];
}

export interface BookDetails {
  id: number;
  ad: string;
  name?: string;
  kod?: string;
  lesson_name?: string;
  lesson_id?: number;
  publisher_name?: string;
  resource_type?: string;
  resource_type_display?: string;
  total_units?: number;
  total_topics?: number;
  total_contents?: number;
  units: Unit[];
}

export interface SelectedContent {
  id: number;
  contentId: number;
  contentName: string;
  contentType: string;
  topicId: number;
  topicName: string;
  unitId: number;
  unitName: string;
  bookId: number;
  bookName: string;
  lessonId: number;
  lessonName: string;
  questionCount: number | null;
  pageCount: number | null;
  /** Kaynak kitaptaki sıra */
  contentSira?: number | null;
  startPage?: number | null;
  endPage?: number | null;
  note?: string;
  quotaKind?: RoutineQuotaKind;
  quotaPlanId?: number;
  dailyQuestionCount?: number;
}

export interface SavedAssignment {
  student: Student;
  contents: SelectedContent[];
  dueDate: string;
  createdDate: string;
  title: string;
  coachNotes: string;
  coachName: string;
}

/* ─── Cart Grouping ─── */
export interface CartContentItem {
  content: SelectedContent;
  note: string;
}

export interface CartTopicGroup {
  topicId: number;
  topicName: string;
  items: CartContentItem[];
}

export interface CartLessonGroup {
  lessonId: number;
  lessonName: string;
  topics: CartTopicGroup[];
  totalQuestions: number;
  totalPages: number;
}

/* ─── Accordion Resource Grouping ─── */
export interface ResourcesByBook {
  bookId: number;
  bookName: string;
  resource: StudentResource;
}

export interface ResourcesByType {
  typeName: string;
  books: ResourcesByBook[];
}

export interface ResourcesByLesson {
  lessonId: number;
  lessonName: string;
  types: ResourcesByType[];
}
