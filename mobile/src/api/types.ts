export type LessonSessionMark = {
  id: number;
  date: string;
  status: string;
  status_label: string;
  kind: string;
  kind_label: string;
};

export type LessonCell = {
  id: number;
  day_id: number;
  kind: 'class' | 'private' | string;
  class_lesson_plan_id: number | null;
  lesson: { id: number | null; name: string | null } | null;
  classroom: { id: number; name: string } | null;
  room: { id: number; name: string } | null;
  student: { id: number; name: string } | null;
  start: string | null;
  end: string | null;
  session?: LessonSessionMark | null;
  topic?: { name: string } | null;
};

export type HomePayload = {
  date: string;
  weekday: number;
  term_id: number;
  next: LessonCell | null;
  today: LessonCell[];
  counts: { classes: number; lessons: number; private: number };
};

export type ScheduleDay = { id: number; name: string; short_name: string; order: number };

export type ScheduleSlot = {
  id: number | string;
  name?: string | null;
  start: string | null;
  end: string | null;
  order?: number | null;
};

export type SchedulePayload = {
  term_id: number;
  days: ScheduleDay[];
  slots?: ScheduleSlot[];
  cells: LessonCell[];
  week?: { start: string; end: string };
};

export type LessonNote = {
  id: number;
  plan_id: number;
  session_date: string;
  file_name: string;
  mime_type: string;
  size: number;
  created_at: string;
};

export type ClassRow = {
  id: number;
  sinif: { id: number; ad: string };
  ders: { id: number; ad: string };
  weekly_hours: number;
  rol: string;
  term_id: number;
  groups: { id: number; name: string }[];
};

export type TeacherProfile = {
  ad: string;
  soyad: string;
  fotograf: string | null;
  tc_kimlik_no: string;
  dogum_tarihi: string;
  cinsiyet: string;
  telefon: string;
  cep_telefon: string;
  email: string;
  adres: string;
  il: string;
  ilce: string;
  acil_durum_kisi: string;
  acil_durum_telefon: string;
  brans: string;
  rol: string;
  gorev_baslangic: string;
};

export type StudentRow = {
  student_id: number;
  ad: string;
  soyad: string;
  okul_no: string;
  plan_id: number;
  sinif_ad: string;
  group_ad: string;
  placement_type: string;
  profil_foto: string | null;
};

export type ExamPoint = {
  id: number;
  name: string;
  date: string | null;
  net: number;
  delta: number | null;
  correct: number;
  wrong: number;
  empty: number;
  question_count: number;
};

export type ExamTopic = {
  name: string;
  mastery: number;
  correct: number;
  question_count: number;
};

export type ExamGroup = {
  code: string;
  label: string;
  last_net: number;
  average_net: number;
  delta: number | null;
  exams: ExamPoint[];
  topics: ExamTopic[];
};

export type StudentExams = {
  ders: string;
  groups: ExamGroup[];
};

export type StudentCard = {
  student_id: number;
  ad: string;
  soyad: string;
  okul_no: string;
  sinif: string;
  grup: string;
  profil_foto: string | null;
  dersler: { plan_id: number; ders: string; sinif: string; grup: string }[];
};

export type PrivateStudent = {
  student_id: number;
  ad: string;
  soyad: string;
  okul_no: string;
  sinif: string;
  grup: string;
  profil_foto: string | null;
  dersler: string[];
};

export type TopicOutcome = { id: number; code: string; text: string };

export type TopicRow = {
  id: number;
  plan_id: number;
  session_date: string;
  lesson_session_id: number | null;
  program_grid_cell_id: number | null;
  topic: { id: number; name: string; code: string } | null;
  outcomes?: TopicOutcome[];
  note: string;
  updated_at: string;
  created_at: string;
};

export type CatalogTopic = {
  id: number;
  name: string;
  code: string;
  subject: string;
  outcomes?: TopicOutcome[];
};

export type BoardRow = {
  id: string;
  state: 'idle' | 'busy' | string;
  mine: boolean;
  lesson: string;
};

export type NotificationItem = {
  id: string;
  category: 'announcement' | 'schedule' | 'private' | string;
  title: string;
  body: string;
  occurred_at: string;
};

export type NotificationPage = Page<NotificationItem> & {
  timezone: string;
  categories: { code: string; label: string }[];
};

export type Page<T> = { page: number; page_size: number; count: number; results: T[] };

export function clock(value: string | null | undefined) {
  if (!value) return '';
  return value.slice(0, 5);
}

export const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
