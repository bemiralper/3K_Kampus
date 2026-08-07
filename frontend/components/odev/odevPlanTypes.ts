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

/** @deprecated Ders sarmalayıcı; yeni kod PlanBookGroup kullanır */
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

export function buildPlanGroupsFromAssignment(assignment: ManualAssignment): PlanBookGroup[] {
  const bookMap = new Map<number, PlanBookGroup>();
  const books: PlanBookGroup[] = [];

  for (const lb of assignment.lessons || []) {
    const bookId = lb.resource_book ?? 0;
    const bookName = (lb.resource_book_name || "Kitap").trim() || "Kitap";

    let book = bookMap.get(bookId);
    if (!book) {
      book = { bookId, bookName, units: [], totalQuestions: 0, totalPages: 0 };
      bookMap.set(bookId, book);
      books.push(book);
    }

    for (const task of lb.tasks || []) {
      const q = task.question_count || 0;
      const p = task.page_count || 0;
      book.totalQuestions += q;
      book.totalPages += p;

      const topicName = (task.content_topic_name || lb.topic_name || "Konu").trim() || "Konu";
      const unitName = (task.content_unit_name || "").trim() || "Ünite";
      const topicId = task.content_topic_id ?? lb.id;
      const unitId = task.content_unit_id ?? 0;

      let unit = book.units.find((u) =>
        unitId ? u.unitId === unitId : u.unitName === unitName,
      );
      if (!unit) {
        unit = { unitId: unitId || book.units.length + 1, unitName, topics: [] };
        book.units.push(unit);
      }

      let topic = unit.topics.find((t) =>
        topicId ? t.topicId === topicId : t.topicName === topicName,
      );
      if (!topic) {
        topic = { topicId: topicId || unit.topics.length + 1, topicName, items: [] };
        unit.topics.push(topic);
      }

      topic.items.push({
        content: {
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
        note: task.description || "",
      });
    }
  }

  for (const book of books) {
    for (const unit of book.units) {
      for (const topic of unit.topics) {
        sortTopicItems(topic.items);
      }
    }
  }

  return books;
}

/** Seçili içeriklerden (önizleme) Kitap → Ünite → Konu → Test */
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
    questionCount: number | null;
    pageCount: number | null;
    contentSira?: number | null;
  }>,
  contentNotes: Record<number, string> = {},
): PlanBookGroup[] {
  const bookMap = new Map<number, PlanBookGroup>();
  const books: PlanBookGroup[] = [];

  for (const item of items) {
    let book = bookMap.get(item.bookId);
    if (!book) {
      book = {
        bookId: item.bookId,
        bookName: item.bookName,
        units: [],
        totalQuestions: 0,
        totalPages: 0,
      };
      bookMap.set(item.bookId, book);
      books.push(book);
    }
    book.totalQuestions += item.questionCount || 0;
    book.totalPages += item.pageCount || 0;

    const unitName = (item.unitName || "").trim() || "Ünite";
    let unit = book.units.find((u) =>
      item.unitId ? u.unitId === item.unitId : u.unitName === unitName,
    );
    if (!unit) {
      unit = { unitId: item.unitId || book.units.length + 1, unitName, topics: [] };
      book.units.push(unit);
    }

    let topic = unit.topics.find((t) => t.topicId === item.topicId);
    if (!topic) {
      topic = { topicId: item.topicId, topicName: item.topicName, items: [] };
      unit.topics.push(topic);
    }

    topic.items.push({
      content: {
        id: item.id,
        contentId: item.contentId,
        contentName: item.contentName,
        contentType: item.contentType,
        questionCount: item.questionCount || 0,
        pageCount: item.pageCount || 0,
        contentSira: item.contentSira ?? null,
      },
      note: contentNotes[item.id] || "",
    });
  }

  for (const book of books) {
    for (const unit of book.units) {
      for (const topic of unit.topics) {
        sortTopicItems(topic.items);
      }
    }
  }

  return books;
}

export function countPlanItems(groups: PlanBookGroup[]): number {
  return groups.reduce(
    (sum, book) =>
      sum +
      book.units.reduce(
        (uSum, unit) =>
          uSum + unit.topics.reduce((tSum, topic) => tSum + topic.items.length, 0),
        0,
      ),
    0,
  );
}

export type { ContentTaskHistory };
