import type { ContentTaskHistory } from "@/app/admin/odev/ver/types";
import type { ManualAssignment } from "@/lib/resources-api";

export interface PlanContentItemView {
  id: number;
  contentId: number;
  contentName: string;
  contentType: string;
  questionCount: number;
  pageCount: number;
  /** Kaynak kitaptaki sıra (ResourceContent.sira) */
  contentSira?: number | null;
  /** Kayıtlı tekrar / eksik tamamlama görevi */
  isCompletionTask?: boolean;
  previousCompletionPercent?: number | null;
  previousAssignmentTitle?: string;
}

export interface PlanTopicGroup {
  topicId: number;
  topicName: string;
  items: { content: PlanContentItemView; note: string }[];
}

export interface PlanUnitGroup {
  unitId: number;
  unitName: string;
  topics: PlanTopicGroup[];
}

/** Kitap → Ünite → Konu → Test */
export interface PlanBookGroup {
  bookId: number;
  bookName: string;
  units: PlanUnitGroup[];
  totalQuestions: number;
  totalPages: number;
}

/** Ders → Kitap → Ünite → Konu → Test */
export interface PlanLessonGroup {
  lessonId: number;
  lessonName: string;
  books: PlanBookGroup[];
  totalQuestions: number;
  totalPages: number;
}

/**
 * Ön başlık konu ile aynı kavramsa yalnızca test adını göster.
 * Örn. "Cümlede Anlam/Test-1" + konu "Cümlede Anlam" → "Test-1"
 *      "Cümlede Anlam 1/Test-1" → "Test-1"
 */
export function displayTestLabel(contentName: string, topicName: string): string {
  const name = (contentName || "").trim();
  const topic = (topicName || "").trim();
  if (!name || !topic) return name;

  const slash = name.lastIndexOf("/");
  if (slash <= 0) return name;

  const prefix = name.slice(0, slash).trim();
  const base = name.slice(slash + 1).trim();
  if (!base) return name;

  const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
  const prefixCore = prefix.replace(/\s+\d+$/u, "").trim();
  if (norm(prefix) === norm(topic) || norm(prefixCore) === norm(topic)) {
    return base;
  }
  return name;
}

/** İki sütun: önce sol yukarı→aşağı, sonra sağ yukarı→aşağı */
export function splitColumnMajor<T>(items: T[]): [T[], T[]] {
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

function sortTopicItems(items: PlanTopicGroup["items"]): void {
  // sira yoksa eklenme/görev sırasını koru (alfabetik / id ile yeniden sıralama yok)
  if (!items.some((i) => i.content.contentSira != null)) return;
  items.sort((a, b) => {
    const sa = a.content.contentSira ?? Number.MAX_SAFE_INTEGER;
    const sb = b.content.contentSira ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.content.id - b.content.id;
  });
}

function sortAllTopics(groups: PlanLessonGroup[]): void {
  for (const lesson of groups) {
    for (const book of lesson.books) {
      for (const unit of book.units) {
        for (const topic of unit.topics) {
          sortTopicItems(topic.items);
        }
      }
    }
  }
}

function ensureBook(
  lesson: PlanLessonGroup,
  bookId: number,
  bookName: string,
): PlanBookGroup {
  let book = lesson.books.find((b) => b.bookId === bookId);
  if (!book) {
    book = { bookId, bookName, units: [], totalQuestions: 0, totalPages: 0 };
    lesson.books.push(book);
  }
  return book;
}

function pushTaskToBook(
  book: PlanBookGroup,
  opts: {
    unitId: number;
    unitName: string;
    topicId: number;
    topicName: string;
    item: PlanContentItemView;
    note: string;
  },
): void {
  book.totalQuestions += opts.item.questionCount || 0;
  book.totalPages += opts.item.pageCount || 0;

  const unitName = (opts.unitName || "").trim() || "Ünite";
  let unit = book.units.find((u) =>
    opts.unitId ? u.unitId === opts.unitId : u.unitName === unitName,
  );
  if (!unit) {
    unit = {
      unitId: opts.unitId || book.units.length + 1,
      unitName,
      topics: [],
    };
    book.units.push(unit);
  }

  let topic = unit.topics.find((t) =>
    opts.topicId ? t.topicId === opts.topicId : t.topicName === opts.topicName,
  );
  if (!topic) {
    topic = {
      topicId: opts.topicId || unit.topics.length + 1,
      topicName: opts.topicName,
      items: [],
    };
    unit.topics.push(topic);
  }

  topic.items.push({ content: opts.item, note: opts.note });
}

export function buildPlanGroupsFromAssignment(assignment: ManualAssignment): PlanLessonGroup[] {
  const map = new Map<string, PlanLessonGroup>();
  const lessons: PlanLessonGroup[] = [];

  for (const lb of assignment.lessons || []) {
    const lessonId = lb.lesson ?? 0;
    const lessonName = (lb.lesson_name || lb.topic_name || "Ders").trim() || "Ders";
    const groupKey = `${lessonId}:${lessonName}`;

    let lesson = map.get(groupKey);
    if (!lesson) {
      lesson = {
        lessonId,
        lessonName,
        books: [],
        totalQuestions: 0,
        totalPages: 0,
      };
      map.set(groupKey, lesson);
      lessons.push(lesson);
    }

    const bookId = lb.resource_book ?? 0;
    const bookName = (lb.resource_book_name || "Kitap").trim() || "Kitap";
    const book = ensureBook(lesson, bookId, bookName);

    for (const task of lb.tasks || []) {
      const q = task.question_count || 0;
      const p = task.page_count || 0;
      lesson.totalQuestions += q;
      lesson.totalPages += p;

      const topicName = (task.content_topic_name || lb.topic_name || "Konu").trim() || "Konu";
      const unitName = (task.content_unit_name || "").trim() || "Ünite";
      const topicId = task.content_topic_id ?? lb.id;
      const unitId = task.content_unit_id ?? 0;

      pushTaskToBook(book, {
        unitId,
        unitName,
        topicId,
        topicName,
        note: task.description || "",
        item: {
          id: task.id,
          contentId: task.content_id ?? (typeof task.content === "number" ? task.content : task.id),
          contentName: task.title,
          contentType: task.task_type,
          questionCount: q,
          pageCount: p,
          contentSira: task.content_sira ?? task.order ?? null,
          isCompletionTask: Boolean(task.is_completion_task),
          previousCompletionPercent: task.previous_task_completion_percent ?? null,
          previousAssignmentTitle: task.previous_assignment_title || "",
        },
      });
    }
  }

  sortAllTopics(lessons);
  return lessons;
}

/** Seçili içeriklerden (önizleme) Ders → Kitap → Ünite → Konu → Test */
export function buildPlanGroupsFromSelected(
  items: Array<{
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
    contentSira?: number | null;
  }>,
  contentNotes: Record<number, string> = {},
): PlanLessonGroup[] {
  const map = new Map<number, PlanLessonGroup>();
  const lessons: PlanLessonGroup[] = [];

  for (const item of items) {
    let lesson = map.get(item.lessonId);
    if (!lesson) {
      lesson = {
        lessonId: item.lessonId,
        lessonName: item.lessonName || "Ders",
        books: [],
        totalQuestions: 0,
        totalPages: 0,
      };
      map.set(item.lessonId, lesson);
      lessons.push(lesson);
    }

    const q = item.questionCount || 0;
    const p = item.pageCount || 0;
    lesson.totalQuestions += q;
    lesson.totalPages += p;

    const book = ensureBook(lesson, item.bookId, item.bookName);
    pushTaskToBook(book, {
      unitId: item.unitId,
      unitName: item.unitName,
      topicId: item.topicId,
      topicName: item.topicName,
      note: contentNotes[item.id] || "",
      item: {
        id: item.id,
        contentId: item.contentId,
        contentName: item.contentName,
        contentType: item.contentType,
        questionCount: q,
        pageCount: p,
        contentSira: item.contentSira ?? null,
      },
    });
  }

  sortAllTopics(lessons);
  return lessons;
}

export function countPlanItems(groups: PlanLessonGroup[]): number {
  return groups.reduce(
    (sum, lesson) =>
      sum +
      lesson.books.reduce(
        (bSum, book) =>
          bSum +
          book.units.reduce(
            (uSum, unit) =>
              uSum + unit.topics.reduce((tSum, topic) => tSum + topic.items.length, 0),
            0,
          ),
        0,
      ),
    0,
  );
}

export function countPlanBooks(groups: PlanLessonGroup[]): number {
  return groups.reduce((sum, lesson) => sum + lesson.books.length, 0);
}

export type { ContentTaskHistory };
