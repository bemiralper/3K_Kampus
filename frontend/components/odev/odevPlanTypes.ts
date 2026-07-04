import type { ContentTaskHistory } from "@/app/admin/odev/ver/types";
import type { ManualAssignment } from "@/lib/resources-api";

export interface PlanContentItemView {
  id: number;
  contentId: number;
  contentName: string;
  contentType: string;
  questionCount: number;
  pageCount: number;
}

export interface PlanTopicGroup {
  topicId: number;
  topicName: string;
  items: { content: PlanContentItemView; note: string }[];
}

export interface PlanBookGroup {
  bookId: number;
  bookName: string;
  topics: PlanTopicGroup[];
}

export interface PlanLessonGroup {
  lessonId: number;
  lessonName: string;
  books: PlanBookGroup[];
  totalQuestions: number;
  totalPages: number;
}

export function buildPlanGroupsFromAssignment(assignment: ManualAssignment): PlanLessonGroup[] {
  const map = new Map<number, PlanLessonGroup>();
  for (const lb of assignment.lessons || []) {
    if (!map.has(lb.lesson)) {
      map.set(lb.lesson, {
        lessonId: lb.lesson,
        lessonName: lb.lesson_name,
        books: [],
        totalQuestions: 0,
        totalPages: 0,
      });
    }
    const lesson = map.get(lb.lesson)!;
    let book = lesson.books.find((b) => b.bookId === lb.resource_book);
    if (!book) {
      book = { bookId: lb.resource_book, bookName: lb.resource_book_name, topics: [] };
      lesson.books.push(book);
    }
    let topic = book.topics.find((t) => t.topicId === lb.id);
    if (!topic) {
      topic = { topicId: lb.id, topicName: lb.topic_name || "Konu", items: [] };
      book.topics.push(topic);
    }
    for (const task of lb.tasks || []) {
      const q = task.question_count || 0;
      const p = task.page_count || 0;
      lesson.totalQuestions += q;
      lesson.totalPages += p;
      topic.items.push({
        content: {
          id: task.id,
          contentId: task.content_id ?? task.id,
          contentName: task.title,
          contentType: task.task_type,
          questionCount: q,
          pageCount: p,
        },
        note: task.description || lb.notes || "",
      });
    }
  }
  return Array.from(map.values());
}

export function countPlanItems(groups: PlanLessonGroup[]): number {
  return groups.reduce(
    (sum, lesson) => sum + lesson.books.reduce(
      (bSum, book) => bSum + book.topics.reduce((tSum, topic) => tSum + topic.items.length, 0),
      0,
    ),
    0,
  );
}

export type { ContentTaskHistory };
