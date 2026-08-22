"""Paragraf/problem kota planı — kitap atama, bitirme, istatistik alanları."""

from datetime import datetime, time

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.resources.models import ResourceBook
from apps.student_resources.models import StudentResourceAssignment, StudentRoutineQuota

QUOTA_BOOK_TYPE_KOD = {
    StudentRoutineQuota.Kind.PARAGRAF: 'PARAGRAF',
    StudentRoutineQuota.Kind.PROBLEM: 'PROBLEM',
}


def validate_book_for_kind(book, kind):
    expected = QUOTA_BOOK_TYPE_KOD.get(kind)
    kod = getattr(getattr(book, 'book_type', None), 'kod', None)
    if not expected or kod != expected:
        raise ValidationError({
            'resource_book': (
                f'Seçilen kitap {StudentRoutineQuota.Kind(kind).label} türünde olmalı.'
            ),
        })
    if not book.aktif_mi:
        raise ValidationError({'resource_book': 'Bu kitap aktif değil.'})
    return book


def ensure_pool_assignment(student, book, coach=None, started_on=None):
    """Öğrencinin kaynak havuzunda kitabı aç / yeniden etkinleştir."""
    started_on = started_on or timezone.now().date()
    existing = StudentResourceAssignment.objects.filter(
        student=student,
        resource_book=book,
        is_active=True,
    ).first()
    if existing:
        updates = []
        if existing.status == StudentResourceAssignment.Status.COMPLETED:
            existing.status = StudentResourceAssignment.Status.IN_PROGRESS
            existing.completed_at = None
            existing.progress_percent = 0
            updates.extend(['status', 'completed_at', 'progress_percent'])
        if started_on and not existing.started_on:
            existing.started_on = started_on
            updates.append('started_on')
        elif started_on and existing.status == StudentResourceAssignment.Status.IN_PROGRESS:
            existing.started_on = started_on
            updates.append('started_on')
        if coach and not existing.coach_id:
            existing.coach = coach
            updates.append('coach')
        if updates:
            updates.append('updated_at')
            existing.save(update_fields=updates)
        return existing

    return StudentResourceAssignment.objects.create(
        student=student,
        coach=coach,
        lesson=book.ders,
        resource_book=book,
        status=StudentResourceAssignment.Status.IN_PROGRESS,
        ownership_type=StudentResourceAssignment.OwnershipType.STUDENT_OWNED,
        started_on=started_on,
    )


def complete_pool_assignment(assignment, finished_on=None):
    finished_on = finished_on or timezone.now().date()
    assignment.status = StudentResourceAssignment.Status.COMPLETED
    assignment.progress_percent = 100
    assignment.completed_at = timezone.make_aware(
        datetime.combine(finished_on, time(12, 0))
    )
    assignment.save(update_fields=['status', 'progress_percent', 'completed_at', 'updated_at'])
    return assignment


def mark_quota_finished(quota, finished_on=None, coach=None):
    if quota.status == StudentRoutineQuota.Status.BOOK_FINISHED and quota.finished_on:
        return quota
    finished_on = finished_on or timezone.now().date()
    if quota.started_on and finished_on < quota.started_on:
        raise ValidationError({'finished_on': 'Bitiş tarihi başlamadan önce olamaz.'})
    quota.status = StudentRoutineQuota.Status.BOOK_FINISHED
    quota.finished_on = finished_on
    if coach:
        quota.coach = coach
    quota.save(update_fields=['status', 'finished_on', 'coach', 'updated_at'])
    if quota.source_assignment_id:
        complete_pool_assignment(quota.source_assignment, finished_on)
    else:
        pool = StudentResourceAssignment.objects.filter(
            student=quota.student,
            resource_book=quota.resource_book,
            is_active=True,
        ).first()
        if pool:
            complete_pool_assignment(pool, finished_on)
            quota.source_assignment = pool
            quota.save(update_fields=['source_assignment', 'updated_at'])
    return quota


@transaction.atomic
def upsert_quota(*, student, kind, daily_question_count, resource_book, started_on=None, coach=None):
    if daily_question_count is None or int(daily_question_count) < 1:
        raise ValidationError({'daily_question_count': 'Günlük soru sayısı en az 1 olmalı.'})
    daily_question_count = int(daily_question_count)

    try:
        book_id = resource_book.pk if isinstance(resource_book, ResourceBook) else resource_book
        resource_book = ResourceBook.objects.select_related('book_type', 'ders').get(pk=book_id)
    except ResourceBook.DoesNotExist:
        raise ValidationError({'resource_book': 'Kitap bulunamadı.'})

    validate_book_for_kind(resource_book, kind)
    started_on = started_on or timezone.now().date()

    active = (
        StudentRoutineQuota.objects.select_for_update()
        .filter(student=student, kind=kind, status=StudentRoutineQuota.Status.ACTIVE)
        .first()
    )

    if active and active.resource_book_id != resource_book.id:
        mark_quota_finished(active, finished_on=timezone.now().date(), coach=coach)
        active = None

    pool = ensure_pool_assignment(student, resource_book, coach=coach, started_on=started_on)

    if active:
        active.daily_question_count = daily_question_count
        active.started_on = started_on
        active.resource_book = resource_book
        active.source_assignment = pool
        if coach:
            active.coach = coach
        active.finished_on = None
        active.save()
        return active

    return StudentRoutineQuota.objects.create(
        student=student,
        kind=kind,
        daily_question_count=daily_question_count,
        resource_book=resource_book,
        source_assignment=pool,
        status=StudentRoutineQuota.Status.ACTIVE,
        started_on=started_on,
        coach=coach,
    )


def pending_quota_kinds_for_student(student_id):
    from apps.coaching.assignment_manual.models import AssignmentTask

    return set(
        AssignmentTask.objects.filter(
            quota_kind__in=list(StudentRoutineQuota.Kind.values),
            completion_status=AssignmentTask.CompletionStatus.PENDING,
            lesson_block__assignment__student_id=student_id,
            lesson_block__assignment__is_active=True,
            lesson_block__assignment__status__in=['ASSIGNED', 'IN_PROGRESS', 'OVERDUE'],
        ).values_list('quota_kind', flat=True)
    )


def daily_from_weekly(weekly):
    if not weekly:
        return 20
    weekly = int(weekly)
    if weekly < 7:
        return max(1, weekly)
    return max(1, weekly // 7)


def last_quota_defaults_for_student(student_id):
    """Son paragraf/problem ödevindeki kitap ve soru sayısı (sonraki ödev varsayılanı)."""
    from apps.coaching.assignment_manual.models import AssignmentTask

    defaults = {'PARAGRAF': None, 'PROBLEM': None}
    for kind in StudentRoutineQuota.Kind.values:
        task = (
            AssignmentTask.objects.filter(
                quota_kind=kind,
                lesson_block__assignment__student_id=student_id,
                lesson_block__assignment__is_active=True,
            )
            .select_related('lesson_block__resource_book')
            .order_by('-lesson_block__assignment__created_at', '-id')
            .first()
        )
        if task:
            book = task.lesson_block.resource_book
            weekly = task.question_count or 0
            daily = daily_from_weekly(weekly)
            defaults[kind] = {
                'kind': kind,
                'resource_book': book.id if book else None,
                'resource_book_name': book.ad if book else '',
                'daily_question_count': daily,
                'weekly_question_count': weekly or daily * 7,
            }
            continue
        quota = (
            StudentRoutineQuota.objects.filter(student_id=student_id, kind=kind)
            .select_related('resource_book')
            .order_by('-updated_at')
            .first()
        )
        if quota:
            defaults[kind] = {
                'kind': kind,
                'resource_book': quota.resource_book_id,
                'resource_book_name': quota.resource_book.ad if quota.resource_book_id else '',
                'daily_question_count': quota.daily_question_count,
                'weekly_question_count': quota.weekly_question_count,
            }
    return defaults


def available_books_for_kind(kind, kurum_id, sube_id):
    expected = QUOTA_BOOK_TYPE_KOD.get(kind)
    if not expected:
        return ResourceBook.objects.none()
    return ResourceBook.objects.filter(
        book_type__kod=expected,
        aktif_mi=True,
        kurum_id=kurum_id,
        sube_id=sube_id,
    ).select_related('publisher', 'book_type', 'ders').order_by('ad')
