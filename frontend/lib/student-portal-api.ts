/**
 * 3K Kampüs — İzole Öğrenci Portalı İstemci Katmanı (`/api/student/*`)
 * Mevcut personel/koç API istemcilerinden bağımsızdır; X-Sube-ID başlığı göndermez,
 * kimlik ve kapsam tamamen sunucu oturumundan çözülür.
 */

export interface StudentIdentityPayload {
  student: {
    id: number;
    first_name: string;
    last_name: string;
    full_name: string;
    okul_no: string;
    photo_url: string | null;
    telefon: string;
    email: string;
    dogum_tarihi: string | null;
    kayit_turu: string;
    school_name: string;
    sinif: { id: number; name: string } | null;
    sinif_seviyesi: { id: number; name: string } | null;
    alan: { id: number; name: string } | null;
  };
  institution: {
    kurum_id: number;
    kurum_name: string;
    sube_id: number;
    sube_name: string;
    egitim_yili_id: number;
    egitim_yili_name: string;
    branding?: {
      logo_source: 'sube' | 'kurum' | 'default';
      app_logo_url: string | null;
      dark_logo_url: string | null;
      favicon_url: string | null;
      display_name: string;
    };
  };
  active_term: {
    id: number;
    name: string;
    code: string;
    start_date: string;
    end_date: string;
  } | null;
  terms: Array<{
    id: number;
    name: string;
    code: string;
    start_date: string;
    end_date: string;
  }>;
  coach: {
    coach_id: number;
    personel_id: number;
    full_name: string;
    photo_url: string | null;
    start_date: string | null;
  } | null;
  must_change_password: boolean;
  username: string;
  preferences: {
    theme: 'light' | 'dark' | 'system';
    focus_minutes: number;
    focus_presets: number[];
    notifications_enabled: boolean;
  };
  gamification?: {
    level: StudentLevelInfo;
    pinned_badge: AchievementCatalogItem | null;
    unlocked_count: number;
    total_count: number;
  } | null;
}

export interface StudentLevelInfo {
  level: number;
  max_level?: number;
  total_xp: number;
  current_level_xp: number;
  next_level_xp_span: number;
  xp_to_next_level: number;
  level_progress_percent: number;
  rank_title: string;
  rank_icon: string;
  next_rank_title: string | null;
  next_rank_level: number | null;
}

export interface StudentTrackProfile {
  code: 'SAYISAL' | 'ESIT_AGIRLIK' | 'SOZEL' | 'LGS' | 'YKS_GENEL' | string;
  group: 'YKS' | 'LGS' | string;
  label: string;
  short_label: string;
  tab_label: string;
}

export interface MonthlySeasonQuest {
  code: string;
  icon: string;
  title: string;
  description: string;
  current_value: number;
  target_value: number;
  remaining_value: number;
  unit: string;
  progress_percent: number;
  is_completed: boolean;
}

export interface MonthlySeasonMedal {
  month_key: string;
  title: string;
  icon: string;
  earned_at: string;
  completed_quests: number;
  xp_reward: number;
}

export interface MonthlySeasonPayload {
  month_key: string;
  month_label: string;
  days_remaining: number;
  required_quests_for_medal: number;
  completed_quests_count: number;
  total_quests_count: number;
  season_medal_xp: number;
  season_medal_unlocked: boolean;
  season_medal_title: string;
  quests: MonthlySeasonQuest[];
  earned_medals: MonthlySeasonMedal[];
}

export interface AchievementCatalogItem {
  code: string;
  category: 'streak' | 'focus' | 'homework' | 'exam' | 'track_exam' | string;
  category_label: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
  xp_reward: number;
  icon: string;
  title: string;
  description: string;
  is_unlocked: boolean;
  earned_at: string | null;
  current_value: number;
  target_value: number;
  remaining_value: number;
  unit: string;
  progress_percent: number;
  motivation_text: string;
  tier_group?: string | null;
  tier_level?: number | null;
  tier_total?: number | null;
  tier_label?: string | null;
  is_active_tier?: boolean;
  track_badge_label?: string | null;
}

export interface WeeklyFocusLeaderboard {
  scope_label: string;
  week_start: string;
  week_end: string;
  my_rank: number;
  my_weekly_focus_minutes: number;
  active_competitors: number;
  minutes_to_overtake_next: number | null;
  opt_in: boolean;
  entries: Array<{
    rank: number;
    is_me: boolean;
    display_name: string;
    classroom: string;
    weekly_focus_minutes: number;
  }>;
}

export interface StudentAchievementsResponse {
  level: StudentLevelInfo;
  student_track?: StudentTrackProfile;
  monthly_season?: MonthlySeasonPayload;
  summary: {
    unlocked_count: number;
    total_count: number;
    active_view_count?: number;
    completion_percent: number;
    streak_days: number;
    best_streak: number;
    total_focus_minutes: number;
    total_season_questions?: number;
    season_medals_count?: number;
  };
  pinned_badge: AchievementCatalogItem | null;
  closest_target: AchievementCatalogItem | null;
  newly_unlocked: BadgeItem[];
  categories: Array<{ code: string; label: string }>;
  badges: AchievementCatalogItem[];
  leaderboard: WeeklyFocusLeaderboard | null;
}

export interface ScheduleItem {
  id: string;
  kind: 'group_lesson' | 'private_lesson' | 'exam' | 'homework' | 'holiday' | 'event';
  kind_label?: string;
  title: string;
  subtitle: string;
  teacher_name: string;
  room_name: string;
  seat_no?: number | null;
  desk_no?: string;
  start_time: string;
  end_time: string;
  period_no: number | null;
  color: string;
  all_day: boolean;
  state: 'past' | 'live' | 'upcoming' | 'cancelled';
  covered_topic?: string;
  exam_id?: number;
  assignment_id?: number;
}

export interface ScheduleDay {
  date: string;
  weekday: number;
  day_label: string;
  is_today: boolean;
  is_holiday: boolean;
  item_count: number;
  items: ScheduleItem[];
}

export interface UnifiedScheduleResponse {
  start_date: string;
  end_date: string;
  classroom: { id: number; name: string; grade_level: string } | null;
  schedule_version_number: number | null;
  days: ScheduleDay[];
}

export interface ExamBoardingPass {
  exam_id: number;
  exam_name: string;
  exam_type: string;
  exam_type_label: string;
  exam_date: string;
  days_left: number;
  is_today: boolean;
  start_time: string;
  end_time?: string;
  duration_minutes: number;
  session_name: string;
  room_name: string;
  seat_no: number | null;
  desk_no: string;
  student_no: string;
  student_name: string;
  booklet_type: string;
}

export interface StoryCapsule {
  id: string;
  badge: string;
  tone: 'orange' | 'violet' | 'blue' | 'emerald' | 'gold' | 'slate';
  title: string;
  body: string;
  cta_label: string;
  cta_href: string;
}

export interface StudyBlockItem {
  id: number;
  order: number;
  task_type: string;
  task_type_label: string;
  subject: string;
  color: string;
  topic: string;
  subtopic: string;
  resource_name: string;
  page_range: string;
  question_count: number | null;
  duration_minutes: number;
  estimated_duration_minutes?: number | null;
  actual_duration: number | null;
  start_time: string | null;
  end_time: string | null;
  description: string;
  is_completed: boolean;
  completed_at: string | null;
}

export interface StudyDayItem {
  id: number;
  day_of_week: number;
  day_label: string;
  date: string | null;
  is_today: boolean;
  coach_note: string;
  is_off_day: boolean;
  completion_percent: number;
  completed_block_count: number;
  total_block_count: number;
  total_planned_minutes: number;
  total_actual_minutes: number;
  blocks: StudyBlockItem[];
  feedback: {
    id: number;
    difficulty: string;
    time_sufficient: boolean | null;
    unclear_topic: string;
    note: string;
    created_at: string;
  } | null;
}

export interface StudyProgramDetail {
  id: number;
  title: string;
  week_start: string;
  week_end: string;
  status: string;
  coach_name: string;
  coach_note: string;
  completion_percent: number;
  total_planned_minutes: number;
  total_questions: number;
  days: StudyDayItem[];
}

export interface BadgeItem {
  id: number;
  badge_type: string;
  title: string;
  description: string;
  icon: string;
  earned_at: string;
  week_start: string | null;
}

export interface StudentHomeworkTask {
  id: number;
  lesson_block_id: number;
  assignment_id: number;
  order: number;
  title: string;
  description: string;
  subject: string;
  book_name: string;
  color: string;
  unit_name: string;
  topic_name: string;
  task_type: string;
  task_type_label: string;
  quota_kind: string;
  quota_kind_label: string;
  is_required: boolean;
  question_count: number | null;
  completed_question_count: number | null;
  remaining_question_count: number | null;
  page_count: number | null;
  page_start: number | null;
  page_end: number | null;
  video_url: string;
  target_minutes: number | null;
  estimated_duration_minutes: number | null;
  k3_mode: string;
  k3_mode_label: string;
  actual_duration_minutes: number;
  student_prepared: boolean;
  effective_ready: boolean;
  student_feedback: string;
  is_coach_evaluated: boolean;
  completion_status: 'PENDING' | 'DONE' | 'PARTIAL' | 'NOT_DONE';
  completion_status_label: string;
  task_completion_percent: number;
  coach_evaluation_note: string;
  evaluated_at: string | null;
  is_completion_task: boolean;
  previous_assignment_title: string;
  previous_task_completion_percent: number | null;
}

export interface StudentHomeworkLessonBlock {
  id: number;
  order: number;
  lesson_name: string;
  color: string;
  book: {
    id: number;
    name: string;
    publisher: string;
    cover_url: string | null;
  } | null;
  content_mode: string;
  content_mode_label: string;
  topic_name: string;
  page_start: number | null;
  page_end: number | null;
  test_number: string;
  k3_mode: string;
  k3_mode_label: string;
  k3_target_minutes: number | null;
  notes: string;
  task_count: number;
  ready_task_count: number;
  coach_done_count: number;
  question_count: number;
  focused_minutes: number;
  tasks: StudentHomeworkTask[];
}

export interface StudentHomeworkSummaryCard {
  id: number;
  title: string;
  description: string;
  coach_name: string;
  subject: string;
  color: string;
  topic: string;
  subjects: Array<{ name: string; color: string }>;
  books: string[];
  status: string;
  raw_status: string;
  status_label: string;
  priority: string;
  priority_label: string;
  assigned_date: string | null;
  due_date: string | null;
  due_datetime: string | null;
  completed_date: string | null;
  days_left: number | null;
  is_overdue: boolean;
  is_due_today: boolean;
  is_completed: boolean;
  lesson_count: number;
  task_count: number;
  ready_task_count: number;
  student_prepared_count: number;
  student_ready_percent: number;
  evaluated_task_count: number;
  done_task_count: number;
  partial_task_count: number;
  not_done_task_count: number;
  completion_percent: number;
  question_count: number;
  focused_minutes: number;
  estimated_minutes: number | null;
  difficulty_level: number;
  postpone_count: number;
  postpone_reason: string;
  non_submission_reason: string;
  non_submission_label: string;
  non_submission_note: string;
  late_submission_note: string;
  student_notes: string;
  can_download_plan_pdf: boolean;
  can_download_report_pdf: boolean;
}

export interface StudentHomeworkDetail extends StudentHomeworkSummaryCard {
  lessons: StudentHomeworkLessonBlock[];
}

export interface StudentHomeworkOverviewStats {
  total_count: number;
  active_count: number;
  completed_count: number;
  overdue_count: number;
  active_task_count: number;
  ready_active_task_count: number;
  active_ready_percent: number;
  total_focused_minutes: number;
  next_due: {
    id: number;
    title: string;
    due_date: string | null;
    days_left: number | null;
    is_overdue: boolean;
    is_due_today: boolean;
    ready_task_count: number;
    task_count: number;
  } | null;
}

export interface StudyWorkspaceResponse {
  active_program: StudyProgramDetail | null;
  recent_programs: Array<{
    id: number;
    title: string;
    week_start: string;
    week_end: string;
    status: string;
    completion_percent: number;
  }>;
  assignments: StudentHomeworkSummaryCard[];
  manual_assignments: StudentHomeworkSummaryCard[];
  assignments_summary?: StudentHomeworkOverviewStats;
  badges: BadgeItem[];
  streak_days: number;
  total_focused_minutes: number;
}

export interface LivingHomeResponse {
  server_time: string;
  context_mode: 'exam_day' | 'campus_hours' | 'evening_focus';
  greeting_title: string;
  greeting_subtitle: string;
  live_or_next_lesson: ScheduleItem | null;
  boarding_pass: ExamBoardingPass | null;
  stories: StoryCapsule[];
  today_schedule: ScheduleItem[];
  upcoming_items: Array<ScheduleItem & { date: string }>;
  today_study: StudyDayItem | null;
  study_summary: {
    has_program: boolean;
    week_completion_percent: number;
    streak_days: number;
    total_focused_minutes: number;
    badges_count: number;
    total_badges_count?: number;
    active_homework_count?: number;
  };
  homework_summary?: StudentHomeworkOverviewStats;
  achievements_spotlight?: {
    level: StudentLevelInfo;
    student_track?: StudentTrackProfile;
    monthly_season?: {
      month_label: string;
      days_remaining: number;
      completed_quests_count: number;
      total_quests_count: number;
      season_medal_unlocked: boolean;
    };
    pinned_badge: AchievementCatalogItem | null;
    closest_target: AchievementCatalogItem | null;
    unlocked_count: number;
    total_count: number;
    league: {
      scope_label: string;
      my_rank: number;
      my_weekly_focus_minutes: number;
      minutes_to_overtake_next: number | null;
    } | null;
  };
  latest_exam: {
    exam_count: number;
    same_type_exam_count?: number;
    kpi_type_label?: string;
    latest_exam_id: number;
    latest_exam_name: string;
    latest_net: number;
    latest_net_delta: number | null;
    latest_score: number;
    latest_kurum_rank: number | null;
    latest_kurum_total: number;
    personal_best_net: number;
    average_net: number;
    personal_best_score: number;
    latest_badges: Array<{ code: string; label: string; tone: string }>;
  } | null;
  campus: {
    seat: {
      hall_name: string;
      floor: string;
      seat_number: number;
      label: string;
      start_date: string;
      end_date: string | null;
    } | null;
    locker: {
      unit_name: string;
      locker_number: number;
      label: string;
      start_date: string;
      end_date: string | null;
    } | null;
    attendance_rate: number;
  };
  counters: {
    unread_coach_messages: number;
    unread_announcements: number;
  };
}

export interface CourseNoteItem {
  id: number;
  title: string;
  description: string;
  course_id: number;
  course_name: string;
  color: string;
  classroom_name: string;
  teacher_name: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  is_pdf: boolean;
  is_image: boolean;
  created_at: string;
}

export interface CoursesAndNotesResponse {
  classroom: { id: number; name: string } | null;
  courses: Array<{
    id: number;
    name: string;
    code: string;
    color: string;
    topic_count: number;
    note_count: number;
  }>;
  topics: Array<{
    id: number;
    date: string;
    period_no: number | null;
    course_id: number;
    course_name: string;
    color: string;
    unit: string;
    topic: string;
    note: string;
    teacher_name: string;
    outcomes: Array<{ code: string; description: string }>;
  }>;
  notes: CourseNoteItem[];
  resources: Array<{
    id: number;
    name: string;
    publisher: string;
    subject: string;
    color: string;
    grade_level: string;
    assigned_at: string;
  }>;
}

export interface CampusLifeResponse {
  seat: LivingHomeResponse['campus']['seat'];
  locker: LivingHomeResponse['campus']['locker'];
  attendance: {
    total_records: number;
    present_count: number;
    absent_count: number;
    excused_count: number;
    late_count: number;
    rate_percent: number;
    history: Array<{
      id: string;
      kind: string;
      kind_label: string;
      date: string;
      title: string;
      period_label: string;
      status: string;
      status_label: string;
      tone: 'ok' | 'danger' | 'warn' | 'muted';
    }>;
  };
}

export interface ExamOverviewItem {
  exam_id: number;
  answer_id: number;
  exam_name: string;
  exam_type: string;
  exam_type_label: string;
  exam_type_short?: string;
  exam_date: string | null;
  total_correct: number;
  total_wrong: number;
  total_empty: number;
  total_net: number;
  net_delta: number | null;
  score: number;
  kurum_rank: number | null;
  kurum_total: number;
  estimated_national_rank: number | null;
  percentile: number | null;
  badges: Array<{ code: string; label: string; tone: string }>;
  sections: Array<{
    section_id: number;
    name: string;
    display_name?: string;
    metric_key?: string;
    is_sub_section?: boolean;
    is_parent_group?: boolean;
    parent_id?: number | null;
    alana_dahil?: boolean;
    attempted?: boolean;
    color: string;
    correct: number;
    wrong: number;
    empty: number;
    question_count: number;
    net: number;
  }>;
}

export interface ExamsOverviewResponse {
  available_types: Array<{ code: string; label: string; short_label?: string; count?: number }>;
  recommended_type?: string;
  student_alan?: string;
  selected_type: string;
  kpi: LivingHomeResponse['latest_exam'];
  trend: ExamOverviewItem[];
  exams: ExamOverviewItem[];
  mastery_heatmap: Array<{
    section_name: string;
    color: string;
    average_mastery_percent: number;
    topics: Array<{
      topic_name: string;
      correct: number;
      wrong: number;
      empty: number;
      total: number;
      exam_hits: number;
      mastery_percent: number;
      level: 'strong' | 'good' | 'developing' | 'critical';
    }>;
  }>;
  upcoming_boarding_pass: ExamBoardingPass | null;
}

export interface ExamDetailResponse {
  exam_id: number;
  answer_id: number;
  exam_name: string;
  exam_type: string;
  exam_type_label: string;
  exam_type_short?: string;
  exam_date: string | null;
  total_net: number;
  field_net: number;
  net_label: string;
  score: number;
  score_types: Record<string, { label?: string; puan?: number; siralama?: number | null }> | null;
  total_correct: number;
  total_wrong: number;
  total_empty: number;
  accuracy_percent: number;
  kurum_rank: number | null;
  kurum_total: number | null;
  kurum_avg_net: number | null;
  sinif_rank: number | null;
  sinif_total: number | null;
  sinif_avg_net: number | null;
  estimated_national_rank: number | null;
  percentile: number | null;
  section_details: Array<{
    section_id?: number;
    section_name: string;
    color: string;
    question_count: number;
    correct: number;
    wrong: number;
    empty: number;
    net: number;
    is_sub_section?: boolean;
    is_parent_group?: boolean;
    parent_id?: number | null;
    alana_dahil?: boolean;
    is_optional_unattempted?: boolean;
    source?: string;
    net_rate?: number;
    sinif_avg_net?: number | null;
    kurum_avg_net?: number | null;
  }>;
  strong_areas: Array<{ section: string; topic?: string; rate?: number }>;
  weak_areas: Array<{ section: string; topic?: string; rate?: number; wrong?: number; empty?: number }>;
  difficulty: Record<string, { correct?: number; wrong?: number; empty?: number; total?: number; rate?: number }> | null;
  topic_blocks: Array<{
    section_name: string;
    topics: Array<{
      topic_name?: string;
      name?: string;
      correct: number;
      wrong: number;
      empty: number;
      net?: number;
      success_rate?: number;
    }>;
  }>;
  quick_gain_radar: Array<{
    section_name: string;
    color: string;
    topic_name: string;
    correct: number;
    wrong: number;
    empty: number;
    potential_net_gain: number;
    accuracy_percent: number;
    hint: string;
  }>;
}

export interface PortalMessageItem {
  id: number;
  sender_kind: 'student' | 'coach';
  sender_name: string;
  body: string;
  created_at: string;
  read_by_student: boolean;
  read_by_coach: boolean;
}

export interface StudentMessagesResponse {
  coach: {
    coach_id: number;
    full_name: string;
    photo_url: string | null;
  } | null;
  can_send: boolean;
  unread_count: number;
  messages: PortalMessageItem[];
}

export interface AnnouncementAttachmentItem {
  id: string;
  name: string;
  mime_type: string;
  file_size: number;
  url: string;
  is_pdf: boolean;
  is_image: boolean;
}

export interface AnnouncementFeedItem {
  id: number;
  item_key?: string;
  source_kind?: 'website' | 'message';
  category?: 'duyuru' | 'sinav' | 'odev' | 'yoklama';
  category_label?: string;
  recipient_channel?: 'kampus' | 'ogrenci' | 'veli_hatti';
  title: string;
  summary: string;
  content: string;
  published_date: string;
  published_at?: string;
  is_read: boolean;
  attachments?: AnnouncementAttachmentItem[];
}

export interface AnnouncementsResponse {
  unread_count: number;
  categories?: Array<{ code: string; label: string; count: number }>;
  items: AnnouncementFeedItem[];
}

export interface CommandPaletteItem {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  href: string;
  note_id?: number;
  focus_block?: StudyBlockItem;
}

export class StudentApiClientError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = 'error', status = 400) {
    super(message);
    this.name = 'StudentApiClientError';
    this.code = code;
    this.status = status;
  }
}

function readNamedCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function readCsrfCookie(): string {
  return readNamedCookie('lms_csrftoken') || readNamedCookie('csrftoken');
}

async function spFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };

  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    const csrf = readCsrfCookie();
    if (csrf) {
      headers['X-CSRFToken'] = csrf;
    }
  }

  const res = await fetch(path, {
    ...init,
    method,
    credentials: 'include',
    headers,
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.success) {
    throw new StudentApiClientError(
      payload?.error || 'İstek tamamlanamadı.',
      payload?.code || 'request_failed',
      res.status,
    );
  }

  return payload.data as T;
}

export const studentPortalApi = {
  bootstrap: () => spFetch<StudentIdentityPayload>('/api/student/bootstrap/'),
  me: () => spFetch<StudentIdentityPayload>('/api/student/me/'),
  updatePreferences: (patch: Partial<StudentIdentityPayload['preferences']>) =>
    spFetch<StudentIdentityPayload['preferences']>('/api/student/preferences/', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  changePassword: (body: {
    current_password?: string;
    new_password: string;
    new_password_confirm: string;
  }) =>
    spFetch<StudentIdentityPayload>('/api/student/password/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  home: () => spFetch<LivingHomeResponse>('/api/student/home/'),
  commandPalette: () => spFetch<{ items: CommandPaletteItem[] }>('/api/student/search/'),
  schedule: (start?: string, end?: string) => {
    const qs = new URLSearchParams();
    if (start) qs.set('start', start);
    if (end) qs.set('end', end);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return spFetch<UnifiedScheduleResponse>(`/api/student/schedule/${suffix}`);
  },
  courses: () => spFetch<CoursesAndNotesResponse>('/api/student/courses/'),
  notePreviewCatalog: (noteId: number) =>
    spFetch<{ id: number; title: string; mime_type: string; page_count: number }>(
      `/api/student/notes/${noteId}/preview/`,
    ),
  notePreviewPageUrl: (noteId: number, pageNo: number) =>
    `/api/student/notes/${noteId}/preview/pages/${pageNo}/`,
  noteOpenUrl: (noteId: number, download = false) =>
    `/api/student/notes/${noteId}/open/${download ? '?download=1' : ''}`,
  campus: () => spFetch<CampusLifeResponse>('/api/student/campus/'),
  studyWorkspace: (programId?: number) =>
    spFetch<StudyWorkspaceResponse>(
      `/api/student/study-program/${programId ? `?program_id=${programId}` : ''}`,
    ),
  completeStudyBlock: (
    blockId: number,
    body: {
      is_completed: boolean;
      focus_minutes_added?: number;
      actual_duration?: number;
    },
  ) =>
    spFetch<{
      block_id: number;
      is_completed: boolean;
      actual_duration: number | null;
      day_completion_percent: number;
      program_completion_percent: number;
      new_badges: BadgeItem[];
    }>(`/api/student/study-program/blocks/${blockId}/complete/`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  submitDailyFeedback: (
    dayId: number,
    body: {
      difficulty?: string;
      time_sufficient?: boolean | null;
      unclear_topic?: string;
      note?: string;
    },
  ) =>
    spFetch<StudyDayItem['feedback']>(`/api/student/study-program/days/${dayId}/feedback/`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  assignments: () =>
    spFetch<{
      today: string;
      summary: StudentHomeworkOverviewStats;
      items: StudentHomeworkSummaryCard[];
    }>('/api/student/assignments/'),
  assignmentDetail: (assignmentId: number) =>
    spFetch<StudentHomeworkDetail>(`/api/student/assignments/${assignmentId}/`),
  updateAssignmentNote: (assignmentId: number, studentNotes: string) =>
    spFetch<{ assignment_id: number; student_notes: string }>(
      `/api/student/assignments/${assignmentId}/note/`,
      {
        method: 'PATCH',
        body: JSON.stringify({ student_notes: studentNotes }),
      },
    ),
  updateAssignmentTask: (
    taskId: number,
    body: {
      prepared?: boolean;
      focus_minutes_added?: number;
      actual_duration_minutes?: number;
      student_feedback?: string;
    },
  ) =>
    spFetch<{ task: StudentHomeworkTask; assignment_id: number; new_badges?: BadgeItem[] }>(
      `/api/student/assignments/tasks/${taskId}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    ),
  assignmentPdfUrl: (
    assignmentId: number,
    kind: 'plan' | 'report' = 'plan',
    download = true,
  ) =>
    `/api/student/assignments/${assignmentId}/pdf/?kind=${kind}${download ? '&download=1' : ''}`,
  achievements: () => spFetch<StudentAchievementsResponse>('/api/student/achievements/'),
  updateAchievementPreferences: (body: {
    pinned_badge_code?: string;
    leaderboard_opt_in?: boolean;
  }) =>
    spFetch<StudentAchievementsResponse>('/api/student/achievements/preferences/', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  exams: (examType?: string) =>
    spFetch<ExamsOverviewResponse>(
      `/api/student/exams/${examType ? `?exam_type=${encodeURIComponent(examType)}` : ''}`,
    ),
  examDetail: (examId: number) => spFetch<ExamDetailResponse>(`/api/student/exams/${examId}/`),
  examKarnePdfUrl: (examId: number) => `/api/student/exams/${examId}/karne-pdf/`,
  messages: (markRead = true) =>
    spFetch<StudentMessagesResponse>(`/api/student/messages/?mark_read=${markRead ? '1' : '0'}`),
  sendMessage: (bodyText: string) =>
    spFetch<PortalMessageItem>('/api/student/messages/', {
      method: 'POST',
      body: JSON.stringify({ body: bodyText }),
    }),
  announcements: () => spFetch<AnnouncementsResponse>('/api/student/announcements/'),
  markAnnouncementsRead: (ids?: Array<number | string>) =>
    spFetch<AnnouncementsResponse>('/api/student/announcements/read/', {
      method: 'POST',
      body: JSON.stringify(ids ? { ids } : {}),
    }),
};
