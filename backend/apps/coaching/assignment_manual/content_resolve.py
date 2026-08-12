"""Orphan AssignmentTask.content (SET_NULL) → canlı ResourceContent eşleme."""

from __future__ import annotations

import re
from typing import Optional

_TRAILING_NUM = re.compile(r'(\d+)\s*$')


def extract_trailing_number(name: str | None) -> int | None:
    if not name:
        return None
    match = _TRAILING_NUM.search(str(name).strip())
    if not match:
        return None
    try:
        return int(match.group(1))
    except (TypeError, ValueError):
        return None


def _normalize_topic_name(name: str | None) -> str:
    if not name:
        return ''
    cleaned = str(name).strip()
    for prefix in ('▶', '►', '●', '•'):
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):].strip()
    return cleaned


def resolve_content_for_orphan_task(task) -> Optional['ResourceContent']:
    """
    content FK'si null olan görev için kitaptaki güncel içeriği bul.

    Biyotik gibi yeniden yapılandırılmış kitaplarda eski ad (Test-11) ile
    yeni ad (Analiz-11 / Sentez-11) sondaki numara + konu ile eşlenir.
    """
    from apps.resources.models import ResourceContent

    if getattr(task, 'content_id', None):
        return getattr(task, 'content', None)

    lesson_block = getattr(task, 'lesson_block', None)
    book_id = getattr(lesson_block, 'resource_book_id', None) if lesson_block else None
    if not book_id:
        return None

    num = extract_trailing_number(getattr(task, 'title', None))
    if num is None:
        return None

    qs = ResourceContent.objects.filter(
        topic__unit__book_id=book_id,
        aktif_mi=True,
    ).select_related('topic')

    topic_name = _normalize_topic_name(getattr(lesson_block, 'topic_name', None))
    if topic_name:
        topic_qs = qs.filter(topic__ad__icontains=topic_name)
        if topic_qs.exists():
            qs = topic_qs

    candidates = []
    for content in qs:
        content_num = extract_trailing_number(content.ad)
        if content_num == num or content.sira == num:
            candidates.append(content)

    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    by_sira = [c for c in candidates if c.sira == num]
    if len(by_sira) == 1:
        return by_sira[0]

    q_count = getattr(task, 'question_count', None)
    if q_count is not None:
        by_q = [c for c in candidates if c.question_count == q_count]
        if len(by_q) == 1:
            return by_q[0]

    # Aynı numarada Analiz/Sentez varsa sira eşleşeni tercih et; yoksa ilk
    by_num_and_sira = [c for c in candidates if extract_trailing_number(c.ad) == num and c.sira == num]
    if by_num_and_sira:
        return by_num_and_sira[0]
    by_num = [c for c in candidates if extract_trailing_number(c.ad) == num]
    if by_num:
        return by_num[0]
    return candidates[0]


def remap_orphan_assignment_contents(*, book_id: int | None = None, dry_run: bool = False) -> dict:
    """
    content__isnull=True görevlerin FK'sini eşleşen içeriğe yeniden bağla.
    """
    from apps.coaching.assignment_manual.models import AssignmentTask

    qs = (
        AssignmentTask.objects.filter(content__isnull=True)
        .exclude(lesson_block__resource_book_id__isnull=True)
        .select_related('lesson_block')
    )
    if book_id:
        qs = qs.filter(lesson_block__resource_book_id=book_id)

    remapped = 0
    skipped = 0
    updates = []
    for task in qs.iterator(chunk_size=200):
        content = resolve_content_for_orphan_task(task)
        if not content:
            skipped += 1
            continue
        remapped += 1
        if dry_run:
            updates.append({'task_id': task.id, 'content_id': content.id, 'title': task.title})
            continue
        task.content_id = content.id
        task.save(update_fields=['content_id', 'updated_at'])

    return {
        'remapped': remapped,
        'skipped': skipped,
        'dry_run': dry_run,
        'samples': updates[:20],
    }


def assignment_task_count_for_contents(content_ids) -> int:
    from apps.coaching.assignment_manual.models import AssignmentTask

    if not content_ids:
        return 0
    return AssignmentTask.objects.filter(content_id__in=list(content_ids)).count()


def assignment_task_count_for_topics(topic_ids) -> int:
    from apps.resources.models import ResourceContent

    if not topic_ids:
        return 0
    content_ids = ResourceContent.objects.filter(
        topic_id__in=list(topic_ids)
    ).values_list('id', flat=True)
    return assignment_task_count_for_contents(content_ids)


def assignment_task_count_for_units(unit_ids) -> int:
    from apps.resources.models import ResourceContent

    if not unit_ids:
        return 0
    content_ids = ResourceContent.objects.filter(
        topic__unit_id__in=list(unit_ids)
    ).values_list('id', flat=True)
    return assignment_task_count_for_contents(content_ids)
