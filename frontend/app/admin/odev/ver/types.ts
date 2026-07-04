export interface Student {
  id: number;
  ad: string;
  soyad: string;
  sinif_ad?: string;
  profil_foto?: string;
  numara?: string;
}

export interface StudentResource {
  id: number;
  resource_book: number;
  resource_name: string;
  resource_type: string;
  resource_type_display?: string;
  publication_year?: number;
  lesson: number;
  lesson_name: string;
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
  startPage?: number | null;
  endPage?: number | null;
  note?: string;
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

/* ─── Content Task History ─── */
export interface ContentTaskHistoryItem {
  content_id: number;
  completion_status: 'PENDING' | 'DONE' | 'NOT_DONE' | 'PARTIAL';
  task_completion_percent: number;
  completed_question_count: number;
  question_count: number;
  assignment_id: number;
  assignment_title: string;
  assignment_status: string;
  evaluated_at: string | null;
}

export type ContentTaskHistory = Record<number, ContentTaskHistoryItem>;

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
