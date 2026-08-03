"""
Atama dersi ↔ kitap dersi senkronu.

StudentResourceAssignment.lesson denormalize bir alandır; kaynak kütüphanesi
ResourceBook.ders üzerinden listeler. Kitap dersi sonradan düzeltildiğinde
atama.lesson eski kalırsa ödev ver ekranında Tarih/Coğrafya gibi yer değişimleri
görülür. Kaynak gerçeği her zaman kitaptaki derstir.
"""
from __future__ import annotations

from apps.student_resources.models import StudentResourceAssignment


def effective_lesson_id(assignment: StudentResourceAssignment) -> int | None:
    """Gruplama için kullanılacak ders: kitabın dersi, yoksa atama dersi."""
    book = getattr(assignment, 'resource_book', None)
    if book is not None and book.ders_id:
        return book.ders_id
    return assignment.lesson_id


def effective_lesson_name(assignment: StudentResourceAssignment) -> str:
    book = getattr(assignment, 'resource_book', None)
    if book is not None:
        ders = getattr(book, 'ders', None)
        if ders is not None and ders.ad:
            return ders.ad
    lesson = getattr(assignment, 'lesson', None)
    if lesson is not None and lesson.ad:
        return lesson.ad
    return 'Bilinmiyor'


def heal_mismatched_assignments(*, student_id: int | None = None) -> int:
    """lesson_id != resource_book.ders_id olan aktif atamaları düzeltir."""
    qs = (
        StudentResourceAssignment.objects
        .filter(is_active=True)
        .exclude(resource_book__ders_id__isnull=True)
        .select_related('resource_book')
        .only('id', 'lesson_id', 'resource_book_id', 'resource_book__ders_id')
    )
    if student_id is not None:
        qs = qs.filter(student_id=student_id)

    to_update: list[StudentResourceAssignment] = []
    for assignment in qs.iterator(chunk_size=200):
        book_ders_id = assignment.resource_book.ders_id
        if book_ders_id and assignment.lesson_id != book_ders_id:
            assignment.lesson_id = book_ders_id
            to_update.append(assignment)
    if not to_update:
        return 0
    StudentResourceAssignment.objects.bulk_update(to_update, ['lesson_id'], batch_size=200)
    return len(to_update)


def sync_assignments_for_book(book_id: int, ders_id: int | None) -> int:
    """Kitabın dersi değişince bağlı tüm aktif atamaları güncelle."""
    if not ders_id:
        return 0
    return StudentResourceAssignment.objects.filter(
        resource_book_id=book_id,
        is_active=True,
    ).exclude(lesson_id=ders_id).update(lesson_id=ders_id)
