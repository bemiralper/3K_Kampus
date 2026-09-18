"""
Üretim motoru: ödev birimlerini günlere böler, tavan aşımlarını leftover'a yazar.

Mevcut greedy auto_distribute kullanılmaz.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timedelta
from typing import Iterable

from django.db import transaction
from django.utils import timezone

from apps.coaching.assignment_manual.models import AssignmentTask, ManualAssignment
from apps.coaching.assignment_manual.title_utils import strip_completion_title_suffix

from .models import (
    DayState,
    DistributionStrategy,
    LeftoverReason,
    LoadLevel,
    ProgramStatus,
    SlotSourceKind,
    StudentStudyWindow,
    StudyDay,
    StudyGenerationRun,
    StudyLeftover,
    StudyProgram,
    StudySlot,
    StudyTemplate,
)

WEEKDAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
DEFAULT_MINUTES_PER_QUESTION = 1.2
DEFAULT_TASK_MINUTES = 20
OPEN_ASSIGNMENT_STATUSES = ('ASSIGNED', 'IN_PROGRESS', 'OVERDUE')


class StudyPlanError(ValueError):
    """Koça gösterilecek üretim hatası."""


@dataclass
class WorkUnit:
    source_assignment_id: int | None
    source_lesson_id: int | None
    source_task_id: int | None
    source_kind: str
    title: str
    lesson_id: int | None
    lesson_name: str
    topic_name: str
    resource_name: str
    tests: int
    questions: int
    minutes: int
    priority: str
    due_date: date | None
    warnings: list[str] = field(default_factory=list)


@dataclass
class DayPlan:
    day_date: date
    weekday: int
    weight: float
    cap_tests: int
    cap_questions: int
    cap_minutes: int
    cap_slots: int
    remaining_tests: int
    remaining_questions: int
    remaining_minutes: int
    remaining_slots: int
    is_locked: bool = False
    slots: list[dict] = field(default_factory=list)


@dataclass
class LeftoverItem:
    source_assignment_id: int | None
    source_lesson_id: int | None
    source_task_id: int | None
    source_kind: str
    title: str
    lesson_name: str
    remaining_tests: int
    remaining_questions: int
    remaining_minutes: int
    reason: str


@dataclass
class GenerationDraft:
    week_start: date
    week_end: date
    days: list[DayPlan]
    leftovers: list[LeftoverItem]
    warnings: list[str]
    units: list[WorkUnit]
    pool_tests: int
    pool_questions: int
    pool_minutes: int
    overflow_sources: int


def monday_of(value: date) -> date:
    return value - timedelta(days=value.weekday())


def week_end_of(week_start: date) -> date:
    return week_start + timedelta(days=6)


def _as_date(value) -> date | None:
    """Tarihi kurum yerel gününe çevir — UTC gece yarısı önceki/sonraki haftaya kaymasın."""
    if value is None:
        return None
    if isinstance(value, datetime):
        if timezone.is_aware(value):
            return timezone.localtime(value).date()
        return value.date()
    if isinstance(value, date):
        return value
    return None


def homework_work_window(assignment, *, respect_due_date: bool = True) -> tuple[date, date] | None:
    """
    Ödevin çalışma penceresi: [assigned, due) — kontrol günü (due) iş günü değil.
    Assigned yoksa due haftasına sıkışır.
    """
    due = _as_date(getattr(assignment, 'due_date', None))
    assigned = _as_date(getattr(assignment, 'assigned_date', None))
    if due is None and assigned is None:
        return None
    start = assigned or due
    end = due or assigned
    if start > end:
        start, end = end, start
    if respect_due_date and due is not None and end >= due:
        end = due - timedelta(days=1)
    if end < start:
        end = start
    return start, end


def week_has_workdays(week_start: date, window_start: date, window_end: date, weekdays: list[int] | None = None) -> bool:
    week_start = monday_of(week_start)
    days = weekdays if weekdays is not None else [0, 1, 2, 3, 4]
    for weekday in days:
        day = week_start + timedelta(days=int(weekday))
        if window_start <= day <= window_end:
            return True
    return False


def overlapping_work_weeks(window_start: date, window_end: date, weekdays: list[int] | None = None) -> list[date]:
    weeks = []
    mon = monday_of(window_start)
    last = monday_of(window_end)
    while mon <= last:
        if week_has_workdays(mon, window_start, window_end, weekdays):
            weeks.append(mon)
        mon += timedelta(days=7)
    return weeks


def assignment_belongs_to_week(assignment, week_start: date, week_end: date, *, respect_due_date: bool = True) -> bool:
    window = homework_work_window(assignment, respect_due_date=respect_due_date)
    if window is None:
        return False
    work_start, work_end = window
    if work_end < week_start or work_start > week_end:
        return False
    return week_has_workdays(week_start, work_start, work_end)


def slice_unit_for_week(unit: WorkUnit, work_weeks: list[date], week_start: date) -> WorkUnit | None:
    """Çok haftalık ödevi haftalara böler; seçilen haftanın payını döner."""
    if not work_weeks:
        return None
    week_start = monday_of(week_start)
    if week_start not in work_weeks:
        return None
    if len(work_weeks) == 1:
        return unit
    idx = work_weeks.index(week_start)
    t = split_even(unit.tests, len(work_weeks))[idx]
    q = split_even(unit.questions, len(work_weeks))[idx]
    m = split_even(unit.minutes, len(work_weeks))[idx]
    if t <= 0 and q <= 0 and m <= 0:
        return None
    return WorkUnit(**{**asdict(unit), 'tests': t, 'questions': q, 'minutes': m})


def _weight_for(template: StudyTemplate, weekday: int) -> float:
    raw = template.day_weights or {}
    if str(weekday) in raw:
        return float(raw[str(weekday)])
    if weekday in raw:
        return float(raw[weekday])
    return 1.0


def _priority_rank(priority: str) -> int:
    return {'URGENT': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}.get(priority or 'MEDIUM', 2)


def split_even(total: int, n: int) -> list[int]:
    """10 / 5 → [2,2,2,2,2]; kalan en baştaki günlere +1."""
    if n <= 0 or total <= 0:
        return [0] * max(n, 0)
    base, rem = divmod(total, n)
    return [base + (1 if i < rem else 0) for i in range(n)]


def split_weighted(total: int, weights: list[float]) -> list[int]:
    if total <= 0 or not weights:
        return [0] * len(weights)
    positive = [max(0.0, w) for w in weights]
    s = sum(positive)
    if s <= 0:
        return split_even(total, len(weights))
    raw = [total * w / s for w in positive]
    shares = [int(x) for x in raw]
    leftover = total - sum(shares)
    order = sorted(range(len(weights)), key=lambda i: (raw[i] - shares[i]), reverse=True)
    for i in order[:leftover]:
        shares[i] += 1
    return shares


def distribute_proportional(total: int, guides: list[int]) -> list[int]:
    if total <= 0:
        return [0] * len(guides)
    guide_sum = sum(guides)
    if guide_sum <= 0:
        return split_even(total, len(guides))
    raw = [total * g / guide_sum for g in guides]
    shares = [int(x) for x in raw]
    leftover = total - sum(shares)
    order = sorted(range(len(guides)), key=lambda i: (raw[i] - shares[i]), reverse=True)
    for i in order[:leftover]:
        shares[i] += 1
    return shares


def unitize_task(task: AssignmentTask, assignment: ManualAssignment) -> WorkUnit | None:
    lesson = task.lesson_block
    content = getattr(task, 'content', None)
    content_type = getattr(content, 'content_type', '') or ''
    questions = int(task.question_count or 0)
    completed_q = int(task.completed_question_count or 0)
    remaining_q = max(0, questions - completed_q) if questions else 0
    pct = int(task.task_completion_percent or 0)
    if task.status == AssignmentTask.TaskStatus.COMPLETED or pct >= 100:
        return None
    if questions and remaining_q <= 0:
        return None

    is_test = (
        task.task_type == AssignmentTask.TaskType.SOLVE_TEST
        or content_type == 'TEST_SET'
    )
    is_exam = task.task_type == AssignmentTask.TaskType.SOLVE_EXAM
    tests = 1 if is_test or is_exam else 0
    if not remaining_q and not tests and not (task.estimated_duration_minutes or 0):
        # Sıfır birimli görev: 1 "görev" süresi
        minutes = DEFAULT_TASK_MINUTES
        warnings = ['Süre yok — 20 dk varsayıldı']
        questions_out = 0
        tests_out = 0
    else:
        warnings = []
        questions_out = remaining_q
        tests_out = tests
        if task.estimated_duration_minutes:
            minutes = max(1, int(round(task.estimated_duration_minutes * (100 - pct) / 100))) if pct else task.estimated_duration_minutes
        elif remaining_q:
            minutes = max(1, int(round(remaining_q * DEFAULT_MINUTES_PER_QUESTION)))
            warnings.append(f'Süre yok — {DEFAULT_MINUTES_PER_QUESTION} dk/soru varsayıldı')
        else:
            minutes = DEFAULT_TASK_MINUTES
            warnings.append('Süre yok — 20 dk varsayıldı')

    title = strip_completion_title_suffix(assignment.title) or assignment.title or task.title
    lesson_name = lesson.lesson.ad if lesson and lesson.lesson else ''
    resource_name = ''
    if lesson and lesson.resource_book:
        resource_name = lesson.resource_book.ad
    return WorkUnit(
        source_assignment_id=assignment.id,
        source_lesson_id=lesson.id if lesson else None,
        source_task_id=task.id,
        source_kind=SlotSourceKind.HOMEWORK,
        title=title,
        lesson_id=lesson.lesson_id if lesson else None,
        lesson_name=lesson_name,
        topic_name=(lesson.topic_name if lesson else '') or '',
        resource_name=resource_name,
        tests=tests_out,
        questions=questions_out,
        minutes=minutes,
        priority=assignment.priority or 'MEDIUM',
        due_date=_as_date(assignment.due_date),
        warnings=warnings,
    )


def collect_homework_units(
    student_id: int,
    week_start: date,
    week_end: date,
    *,
    respect_due_date: bool = True,
) -> list[WorkUnit]:
    week_start = monday_of(week_start)
    week_end = week_end_of(week_start)
    assignments = (
        ManualAssignment.objects.filter(
            student_id=student_id,
            is_active=True,
            status__in=OPEN_ASSIGNMENT_STATUSES,
        )
        .select_related('coach')
        .prefetch_related(
            'lessons__lesson',
            'lessons__resource_book',
            'lessons__tasks__content',
        )
    )
    raw_units: list[WorkUnit] = []
    work_weeks_by_assignment: dict[int, list[date]] = {}
    for assignment in assignments:
        if not assignment_belongs_to_week(
            assignment, week_start, week_end, respect_due_date=respect_due_date,
        ):
            continue
        window = homework_work_window(assignment, respect_due_date=respect_due_date)
        work_weeks_by_assignment[assignment.id] = (
            overlapping_work_weeks(window[0], window[1]) if window else [week_start]
        )
        due = _as_date(assignment.due_date)

        lessons = list(assignment.lessons.all())
        tasks: list[AssignmentTask] = []
        for lesson in lessons:
            tasks.extend(list(lesson.tasks.all()))
        if not tasks:
            title = strip_completion_title_suffix(assignment.title) or assignment.title
            raw_units.append(WorkUnit(
                source_assignment_id=assignment.id,
                source_lesson_id=None,
                source_task_id=None,
                source_kind=SlotSourceKind.HOMEWORK,
                title=title,
                lesson_id=None,
                lesson_name='',
                topic_name='',
                resource_name='',
                tests=0,
                questions=0,
                minutes=assignment.estimated_duration_minutes or DEFAULT_TASK_MINUTES,
                priority=assignment.priority or 'MEDIUM',
                due_date=due,
                warnings=[] if assignment.estimated_duration_minutes else ['Süre yok — 20 dk varsayıldı'],
            ))
            continue
        for task in tasks:
            unit = unitize_task(task, assignment)
            if unit:
                raw_units.append(unit)

    units: list[WorkUnit] = []
    for unit in merge_units_by_assignment(raw_units):
        weeks = work_weeks_by_assignment.get(unit.source_assignment_id or 0) or [week_start]
        sliced = slice_unit_for_week(unit, weeks, week_start)
        if sliced:
            units.append(sliced)
    return units


def collect_previous_leftovers(student_id: int, week_start: date) -> list[WorkUnit]:
    prev = (
        StudyProgram.objects.filter(
            student_id=student_id,
            week_start__lt=week_start,
            status=ProgramStatus.ACTIVE,
        )
        .order_by('-week_start')
        .first()
    )
    if not prev:
        return []
    units = []
    for item in prev.leftovers.all():
        if item.remaining_tests <= 0 and item.remaining_questions <= 0 and item.remaining_minutes <= 0:
            continue
        units.append(WorkUnit(
            source_assignment_id=item.source_assignment_id,
            source_lesson_id=item.source_lesson_id,
            source_task_id=item.source_task_id,
            source_kind=item.source_kind,
            title=item.title,
            lesson_id=None,
            lesson_name=item.lesson_name,
            topic_name='',
            resource_name='',
            tests=item.remaining_tests,
            questions=item.remaining_questions,
            minutes=item.remaining_minutes,
            priority='HIGH',
            due_date=None,
            warnings=[],
        ))
    return units


def eligible_weekdays(
    template: StudyTemplate,
    week_start: date,
    today: date | None,
    lock_past: bool,
    honor_availability: bool,
    student_id: int,
    blocked_dates: Iterable[date] | None = None,
) -> list[int]:
    if template.active_weekdays is None:
        active = [0, 1, 2, 3, 4]
    else:
        active = list(template.active_weekdays)
    blocked = set(blocked_dates or [])
    windows = {}
    if honor_availability:
        for row in StudentStudyWindow.objects.filter(student_id=student_id):
            windows[row.weekday] = row

    eligible = []
    for weekday in range(7):
        if weekday not in active:
            continue
        if _weight_for(template, weekday) <= 0:
            continue
        day_date = week_start + timedelta(days=weekday)
        if day_date in blocked:
            continue
        if lock_past and today and day_date < today:
            continue
        window = windows.get(weekday)
        if window is not None:
            if not window.is_available:
                continue
            exceptions = {_as_date(x) for x in (window.exception_dates or [])}
            if day_date in exceptions:
                continue
        eligible.append(weekday)
    return eligible


def build_day_plans(
    template: StudyTemplate,
    week_start: date,
    eligible: list[int],
    honor_availability: bool,
    student_id: int,
) -> list[DayPlan]:
    windows = {}
    if honor_availability:
        for row in StudentStudyWindow.objects.filter(student_id=student_id):
            windows[row.weekday] = row

    days = []
    for weekday in eligible:
        weight = _weight_for(template, weekday)
        cap_q = max(0, int(template.max_questions_per_day * weight))
        cap_t = max(0, int(template.max_tests_per_day * weight))
        cap_m = max(0, int(template.max_minutes_per_day * weight))
        window = windows.get(weekday)
        if window and window.available_minutes:
            cap_m = min(cap_m, int(window.available_minutes * weight))
        cap_s = template.max_slots_per_day
        days.append(DayPlan(
            day_date=week_start + timedelta(days=weekday),
            weekday=weekday,
            weight=weight,
            cap_tests=cap_t,
            cap_questions=cap_q,
            cap_minutes=cap_m,
            cap_slots=cap_s,
            remaining_tests=cap_t,
            remaining_questions=cap_q,
            remaining_minutes=cap_m,
            remaining_slots=cap_s,
        ))
    return days


def _shares_for(unit: WorkUnit, days: list[DayPlan], strategy: str) -> tuple[list[int], list[int], list[int]]:
    n = len(days)
    weights = [d.weight for d in days]
    if strategy == DistributionStrategy.WEIGHTED:
        t = split_weighted(unit.tests, weights)
        q = split_weighted(unit.questions, weights)
        m = split_weighted(unit.minutes, weights)
        return t, q, m
    if strategy == DistributionStrategy.BY_QUESTION and unit.questions > 0:
        q = split_even(unit.questions, n)
        t = distribute_proportional(unit.tests, q)
        m = distribute_proportional(unit.minutes, q)
        return t, q, m
    if strategy == DistributionStrategy.BY_TEST and unit.tests > 0:
        t = split_even(unit.tests, n)
        q = distribute_proportional(unit.questions, t)
        m = distribute_proportional(unit.minutes, t)
        return t, q, m
    t = split_even(unit.tests, n)
    q = split_even(unit.questions, n)
    m = split_even(unit.minutes, n)
    return t, q, m


def _place_share(day: DayPlan, unit: WorkUnit, tests: int, questions: int, minutes: int) -> tuple[int, int, int]:
    """Sığanı yerleştirir; sığmayanı (tests, questions, minutes) olarak döner."""
    if tests <= 0 and questions <= 0 and minutes <= 0:
        return 0, 0, 0
    if day.remaining_slots <= 0:
        return tests, questions, minutes

    fit_t = min(tests, day.remaining_tests) if tests else 0
    fit_q = min(questions, day.remaining_questions) if questions else 0
    fit_m = min(minutes, day.remaining_minutes) if minutes else 0

    # Test/soru/süre birlikte kesilir: tavanlardan en kısıtlı oran
    ratios = []
    if tests:
        ratios.append(fit_t / tests if tests else 0)
    if questions:
        ratios.append(fit_q / questions if questions else 0)
    if minutes:
        ratios.append(fit_m / minutes if minutes else 0)
    if not ratios:
        return tests, questions, minutes
    ratio = min(ratios)
    placed_t = int(tests * ratio) if tests else 0
    placed_q = int(questions * ratio) if questions else 0
    placed_m = int(minutes * ratio) if minutes else 0

    # Oran 0 ama en az bir birim sığıyorsa, sığanı koy (test/soru ayrı)
    if placed_t == 0 and placed_q == 0 and placed_m == 0:
        if tests and day.remaining_tests > 0:
            placed_t = min(tests, day.remaining_tests)
        elif questions and day.remaining_questions > 0:
            placed_q = min(questions, day.remaining_questions)
        elif minutes and day.remaining_minutes > 0:
            placed_m = min(minutes, day.remaining_minutes)
        else:
            return tests, questions, minutes

    if placed_t == 0 and placed_q == 0 and placed_m == 0:
        return tests, questions, minutes

    day.slots.append({
        'source_assignment_id': unit.source_assignment_id,
        'source_lesson_id': unit.source_lesson_id,
        'source_task_id': unit.source_task_id,
        'source_kind': unit.source_kind,
        'title': unit.title,
        'lesson_id': unit.lesson_id,
        'lesson_name': unit.lesson_name,
        'topic_name': unit.topic_name,
        'resource_name': unit.resource_name,
        'planned_tests': placed_t,
        'planned_questions': placed_q,
        'planned_minutes': placed_m,
    })
    day.remaining_tests = max(0, day.remaining_tests - placed_t)
    day.remaining_questions = max(0, day.remaining_questions - placed_q)
    day.remaining_minutes = max(0, day.remaining_minutes - placed_m)
    day.remaining_slots = max(0, day.remaining_slots - 1)
    return tests - placed_t, questions - placed_q, minutes - placed_m


def merge_units_by_assignment(units: list[WorkUnit]) -> list[WorkUnit]:
    """Haftalık dilim için ödevi tek havuz yap — ders başına 1 test 3 haftaya [1,0,0] gitmesin."""
    grouped: dict[int | None, WorkUnit] = {}
    order: list[int | None] = []
    for unit in units:
        key = unit.source_assignment_id
        if key not in grouped:
            grouped[key] = WorkUnit(
                source_assignment_id=unit.source_assignment_id,
                source_lesson_id=None,
                source_task_id=None,
                source_kind=unit.source_kind,
                title=unit.title,
                lesson_id=None,
                lesson_name=unit.lesson_name,
                topic_name=unit.topic_name,
                resource_name=unit.resource_name,
                tests=0,
                questions=0,
                minutes=0,
                priority=unit.priority,
                due_date=unit.due_date,
                warnings=list(unit.warnings),
            )
            order.append(key)
        acc = grouped[key]
        acc.tests += unit.tests
        acc.questions += unit.questions
        acc.minutes += unit.minutes
        if _priority_rank(unit.priority) < _priority_rank(acc.priority):
            acc.priority = unit.priority
        if unit.due_date and (acc.due_date is None or unit.due_date < acc.due_date):
            acc.due_date = unit.due_date
        acc.warnings.extend(unit.warnings)
        if unit.lesson_name and not acc.lesson_name:
            acc.lesson_name = unit.lesson_name
    return [grouped[k] for k in order]


def merge_units_by_source(units: list[WorkUnit]) -> list[WorkUnit]:
    """Aynı ödev/ders birimlerini topla — 10 test tek kaynak olur, günlere bölünür."""
    grouped: dict[tuple, WorkUnit] = {}
    order: list[tuple] = []
    for unit in units:
        key = (unit.source_assignment_id, unit.source_lesson_id, unit.source_kind)
        if key not in grouped:
            grouped[key] = WorkUnit(
                source_assignment_id=unit.source_assignment_id,
                source_lesson_id=unit.source_lesson_id,
                source_task_id=None,
                source_kind=unit.source_kind,
                title=unit.title,
                lesson_id=unit.lesson_id,
                lesson_name=unit.lesson_name,
                topic_name=unit.topic_name,
                resource_name=unit.resource_name,
                tests=0,
                questions=0,
                minutes=0,
                priority=unit.priority,
                due_date=unit.due_date,
                warnings=list(unit.warnings),
            )
            order.append(key)
        acc = grouped[key]
        acc.tests += unit.tests
        acc.questions += unit.questions
        acc.minutes += unit.minutes
        if _priority_rank(unit.priority) < _priority_rank(acc.priority):
            acc.priority = unit.priority
        if unit.due_date and (acc.due_date is None or unit.due_date < acc.due_date):
            acc.due_date = unit.due_date
        acc.warnings.extend(unit.warnings)
    return [grouped[k] for k in order]


def distribute_units(
    units: list[WorkUnit],
    days: list[DayPlan],
    strategy: str,
    respect_due_date: bool,
) -> list[LeftoverItem]:
    leftovers: list[LeftoverItem] = []
    ordered = sorted(
        units,
        key=lambda u: (
            u.due_date.toordinal() if u.due_date else 10**9,
            _priority_rank(u.priority),
            -(u.tests + u.questions),
        ),
    )
    open_days = [d for d in days if not d.is_locked]
    if not open_days:
        for unit in ordered:
            leftovers.append(LeftoverItem(
                source_assignment_id=unit.source_assignment_id,
                source_lesson_id=unit.source_lesson_id,
                source_task_id=unit.source_task_id,
                source_kind=unit.source_kind,
                title=unit.title,
                lesson_name=unit.lesson_name,
                remaining_tests=unit.tests,
                remaining_questions=unit.questions,
                remaining_minutes=unit.minutes,
                reason=LeftoverReason.NO_DAY,
            ))
        return leftovers

    for unit in ordered:
        targets = open_days
        if respect_due_date and unit.due_date:
            before_due = [d for d in open_days if d.day_date < unit.due_date]
            if before_due:
                targets = before_due
        share_t, share_q, share_m = _shares_for(unit, targets, strategy)
        rem_t = rem_q = rem_m = 0
        for day, t, q, m in zip(targets, share_t, share_q, share_m):
            leftover_t, leftover_q, leftover_m = _place_share(day, unit, t, q, m)
            rem_t += leftover_t
            rem_q += leftover_q
            rem_m += leftover_m
        if rem_t or rem_q or rem_m:
            leftovers.append(LeftoverItem(
                source_assignment_id=unit.source_assignment_id,
                source_lesson_id=unit.source_lesson_id,
                source_task_id=unit.source_task_id,
                source_kind=unit.source_kind,
                title=unit.title,
                lesson_name=unit.lesson_name,
                remaining_tests=rem_t,
                remaining_questions=rem_q,
                remaining_minutes=rem_m,
                reason=LeftoverReason.OVER_CAP,
            ))
    return leftovers


def build_draft(
    *,
    student_id: int,
    week_start: date,
    template: StudyTemplate,
    include_homework: bool = True,
    honor_availability: bool = True,
    today: date | None = None,
    lock_past: bool | None = None,
    extra_units: list[WorkUnit] | None = None,
    locked_days: list[DayPlan] | None = None,
) -> GenerationDraft:
    today = today or timezone.localdate()
    week_start = monday_of(week_start)
    week_end = week_end_of(week_start)
    lock_past = template.lock_past_days if lock_past is None else lock_past
    if week_end < today:
        raise StudyPlanError('Geçmiş hafta salt okunur; yeniden üretilemez.')

    eligible = eligible_weekdays(
        template,
        week_start,
        today if lock_past else None,
        lock_past,
        honor_availability,
        student_id,
    )
    if not eligible and not locked_days:
        raise StudyPlanError('Bu hafta müsait gün yok.')

    days = build_day_plans(template, week_start, eligible, honor_availability, student_id)
    if locked_days:
        locked_dates = {d.day_date for d in locked_days}
        days = [d for d in days if d.day_date not in locked_dates]
        days = [d for d in locked_days if week_start <= d.day_date <= week_end] + days
        days.sort(key=lambda d: d.day_date)
    days = [d for d in days if week_start <= d.day_date <= week_end]

    units: list[WorkUnit] = []
    warnings: list[str] = []
    if include_homework:
        units.extend(collect_homework_units(
            student_id, week_start, week_end,
            respect_due_date=template.respect_due_date,
        ))
        units.extend(collect_previous_leftovers(student_id, week_start))
    if extra_units:
        units.extend(extra_units)
    for unit in units:
        warnings.extend(unit.warnings)

    leftovers = distribute_units(
        merge_units_by_source(units),
        days,
        template.strategy,
        template.respect_due_date,
    )
    overflow_sources = len({
        (item.source_assignment_id, item.source_lesson_id)
        for item in leftovers
        if item.remaining_tests or item.remaining_questions or item.remaining_minutes
    })
    return GenerationDraft(
        week_start=week_start,
        week_end=week_end,
        days=days,
        leftovers=leftovers,
        warnings=list(dict.fromkeys(warnings)),
        units=units,
        pool_tests=sum(u.tests for u in units),
        pool_questions=sum(u.questions for u in units),
        pool_minutes=sum(u.minutes for u in units),
        overflow_sources=overflow_sources,
    )


def preview_payload(draft: GenerationDraft, template: StudyTemplate) -> dict:
    active_days = [d for d in draft.days if not d.is_locked]
    n = len(active_days) or 1
    avg_min = template.max_minutes_per_day
    return {
        'week_start': draft.week_start.isoformat(),
        'week_end': draft.week_end.isoformat(),
        'days': n,
        'avg_minutes': avg_min,
        'pool_tests': draft.pool_tests,
        'pool_questions': draft.pool_questions,
        'pool_minutes': draft.pool_minutes,
        'overflow_sources': draft.overflow_sources,
        'label': (
            f'{n} gün · ~{avg_min} dk/gün · '
            f'{draft.pool_tests} test + {draft.pool_questions} soru havuzda'
            + (f' · {draft.overflow_sources} ödev taşacak' if draft.overflow_sources else '')
        ),
        'warnings': draft.warnings,
        'day_shares': [
            {
                'date': d.day_date.isoformat(),
                'label': WEEKDAY_LABELS[d.weekday],
                'tests': sum(s['planned_tests'] for s in d.slots),
                'questions': sum(s['planned_questions'] for s in d.slots),
                'minutes': sum(s['planned_minutes'] for s in d.slots),
                'slots': len(d.slots),
            }
            for d in draft.days
        ],
        'leftovers': [asdict(item) for item in draft.leftovers],
    }


def _load_level(day: DayPlan) -> str:
    used_t = day.cap_tests - day.remaining_tests
    used_q = day.cap_questions - day.remaining_questions
    used_m = day.cap_minutes - day.remaining_minutes
    over = (
        (day.cap_tests and used_t > day.cap_tests)
        or (day.cap_questions and used_q > day.cap_questions)
        or (day.cap_minutes and used_m > day.cap_minutes)
        or day.remaining_slots < 0
    )
    if over:
        return LoadLevel.TASTI
    busy = False
    if day.cap_tests and used_t >= max(1, int(day.cap_tests * 0.85)):
        busy = True
    if day.cap_questions and used_q >= max(1, int(day.cap_questions * 0.85)):
        busy = True
    if day.cap_minutes and used_m >= max(1, int(day.cap_minutes * 0.85)):
        busy = True
    return LoadLevel.YOGUN if busy else LoadLevel.IDEAL


def persist_draft(
    *,
    student,
    coach,
    template: StudyTemplate,
    draft: GenerationDraft,
    program: StudyProgram | None = None,
    keep_day_ids: set[int] | None = None,
) -> StudyProgram:
    keep_day_ids = keep_day_ids or set()
    with transaction.atomic():
        if program is None:
            program = StudyProgram.objects.create(
                student=student,
                coach=coach,
                template=template,
                week_start=draft.week_start,
                week_end=draft.week_end,
                generation_version=1,
                status=ProgramStatus.ACTIVE,
            )
        else:
            program.template = template
            program.generation_version = (program.generation_version or 1) + 1
            program.status = ProgramStatus.ACTIVE
            program.week_end = draft.week_end
            program.save(update_fields=[
                'template', 'generation_version', 'status', 'week_end', 'updated_at',
            ])
            StudyLeftover.objects.filter(program=program).delete()
            if keep_day_ids:
                StudyDay.objects.filter(program=program).exclude(id__in=keep_day_ids).delete()
                StudySlot.objects.filter(day__program=program, is_locked=False).exclude(
                    day_id__in=keep_day_ids,
                ).delete()
            else:
                StudyDay.objects.filter(program=program).delete()

        existing_days = {d.day_date: d for d in program.days.all()}
        for plan in draft.days:
            if plan.is_locked and plan.day_date in existing_days:
                continue
            day = existing_days.get(plan.day_date)
            totals_t = sum(s['planned_tests'] for s in plan.slots)
            totals_q = sum(s['planned_questions'] for s in plan.slots)
            totals_m = sum(s['planned_minutes'] for s in plan.slots)
            values = {
                'weekday': plan.weekday,
                'is_locked': plan.is_locked,
                'target_minutes': plan.cap_minutes,
                'planned_tests': totals_t,
                'planned_questions': totals_q,
                'planned_minutes': totals_m,
                'planned_slots': len(plan.slots),
                'load_level': _load_level(plan),
                'cap_tests': plan.cap_tests,
                'cap_questions': plan.cap_questions,
                'cap_minutes': plan.cap_minutes,
                'cap_slots': plan.cap_slots,
            }
            if day is None:
                day = StudyDay.objects.create(program=program, day_date=plan.day_date, **values)
            else:
                for key, val in values.items():
                    setattr(day, key, val)
                day.save()
                if not plan.is_locked:
                    day.slots.filter(is_locked=False).delete()
            for order, slot in enumerate(plan.slots):
                StudySlot.objects.create(
                    day=day,
                    source_assignment_id=slot['source_assignment_id'],
                    source_lesson_id=slot['source_lesson_id'],
                    source_task_id=slot['source_task_id'],
                    source_kind=slot['source_kind'],
                    lesson_id=slot['lesson_id'],
                    title=slot['title'],
                    topic_name=slot['topic_name'],
                    resource_name=slot['resource_name'],
                    planned_tests=slot['planned_tests'],
                    planned_questions=slot['planned_questions'],
                    planned_minutes=slot['planned_minutes'],
                    order=order,
                )

        for item in draft.leftovers:
            if not (item.remaining_tests or item.remaining_questions or item.remaining_minutes):
                continue
            StudyLeftover.objects.create(
                program=program,
                source_assignment_id=item.source_assignment_id,
                source_lesson_id=item.source_lesson_id,
                source_task_id=item.source_task_id,
                source_kind=item.source_kind,
                title=item.title,
                lesson_name=item.lesson_name,
                remaining_tests=item.remaining_tests,
                remaining_questions=item.remaining_questions,
                remaining_minutes=item.remaining_minutes,
                reason=item.reason,
            )

        def _unit_snapshot(unit: WorkUnit) -> dict:
            payload = asdict(unit)
            if unit.due_date:
                payload['due_date'] = unit.due_date.isoformat()
            return payload

        StudyGenerationRun.objects.create(
            program=program,
            template=template,
            created_by=coach,
            input_snapshot={
                'week_start': draft.week_start.isoformat(),
                'pool_tests': draft.pool_tests,
                'pool_questions': draft.pool_questions,
                'strategy': template.strategy,
                'units': [_unit_snapshot(u) for u in draft.units],
            },
            warnings=draft.warnings,
        )
    return program


def locked_day_plans(program: StudyProgram, today: date) -> list[DayPlan]:
    plans = []
    for day in program.days.filter(day_date__lt=today):
        slots = []
        for slot in day.slots.all():
            slots.append({
                'source_assignment_id': slot.source_assignment_id,
                'source_lesson_id': slot.source_lesson_id,
                'source_task_id': slot.source_task_id,
                'source_kind': slot.source_kind,
                'title': slot.title,
                'lesson_id': slot.lesson_id,
                'lesson_name': slot.lesson.ad if slot.lesson else '',
                'topic_name': slot.topic_name,
                'resource_name': slot.resource_name,
                'planned_tests': slot.planned_tests,
                'planned_questions': slot.planned_questions,
                'planned_minutes': slot.planned_minutes,
            })
        plans.append(DayPlan(
            day_date=day.day_date,
            weekday=day.weekday,
            weight=1,
            cap_tests=day.cap_tests,
            cap_questions=day.cap_questions,
            cap_minutes=day.cap_minutes,
            cap_slots=day.cap_slots,
            remaining_tests=0,
            remaining_questions=0,
            remaining_minutes=0,
            remaining_slots=0,
            is_locked=True,
            slots=slots,
        ))
    return plans


def remaining_units_after_lock(units: list[WorkUnit], locked: list[DayPlan]) -> list[WorkUnit]:
    used: dict[tuple, list[int]] = {}
    for day in locked:
        for slot in day.slots:
            key = (
                slot['source_assignment_id'],
                slot['source_lesson_id'],
                slot.get('source_kind') or SlotSourceKind.HOMEWORK,
            )
            acc = used.setdefault(key, [0, 0, 0])
            acc[0] += slot['planned_tests']
            acc[1] += slot['planned_questions']
            acc[2] += slot['planned_minutes']
    leftover_units = []
    for unit in merge_units_by_source(units):
        key = (unit.source_assignment_id, unit.source_lesson_id, unit.source_kind)
        taken = used.get(key, [0, 0, 0])
        tests = max(0, unit.tests - taken[0])
        questions = max(0, unit.questions - taken[1])
        minutes = max(0, unit.minutes - taken[2])
        if tests or questions or minutes:
            leftover_units.append(WorkUnit(
                **{**asdict(unit), 'tests': tests, 'questions': questions, 'minutes': minutes}
            ))
    return leftover_units


def day_state(day: StudyDay) -> str:
    if day.is_locked:
        return DayState.LOCKED
    if day.planned_slots == 0:
        return DayState.EMPTY
    if day.load_level == LoadLevel.TASTI:
        return DayState.OVER
    if day.completed_slots >= day.planned_slots and day.planned_slots:
        return DayState.DONE
    if day.completed_slots > 0:
        return DayState.PARTIAL
    return DayState.PARTIAL if day.planned_slots else DayState.EMPTY
