"""
Öğrenci Portalı — Haftalık Çalışma Programı, Tam Ekran Odak Sayacı Kaydı,
Gün Sonu Check-in (`DailyFeedback`), Ödev Özetleri ve Rozet Vitrini.
"""
from __future__ import annotations

from datetime import date

from django.db import transaction
from django.utils import timezone

from apps.coaching.study_program import services as sp_services
from apps.coaching.study_program.models import (
    Badge,
    BadgeCode,
    DailyFeedback,
    ProgramBlock,
    ProgramDay,
    WeeklyProgram,
)

from ..auth import ISTANBUL, StudentPortalError
from .homework_service import list_student_assignments
from .schedule_service import subject_color


def _evaluate_program_badges_safe(program: WeeklyProgram, *, completed_dt=None) -> list[dict]:
    """
    `study_program.services.calculate_badges` (ve ERKEN_KUSU) mantığını
    çağırır ve yeni kazanılan rozetleri döndürür.
    """
    new_codes: list[str] = []
    if hasattr(sp_services, 'calculate_badges'):
        try:
            new_codes = list(sp_services.calculate_badges(program) or [])
        except Exception:
            new_codes = []

    # Sabah 08:00'den önce odak/görev tamamlama -> ERKEN_KUSU rozeti
    if completed_dt is not None:
        local_dt = timezone.localtime(completed_dt, ISTANBUL)
        if local_dt.hour < 8:
            exists = Badge.objects.filter(
                program=program,
                code=BadgeCode.ERKEN_KUSU,
            ).exists()
            if not exists:
                Badge.objects.create(
                    student_id=program.student_id,
                    program=program,
                    code=BadgeCode.ERKEN_KUSU,
                    title='Erken Kuşu',
                    description='Sabah 08:00 öncesi ilk çalışma görevini tamamladı',
                    icon='🌅',
                    earned_date=local_dt.date(),
                )
                new_codes.append(BadgeCode.ERKEN_KUSU)

    if not new_codes:
        return []
    return [
        _serialize_badge(b)
        for b in Badge.objects.filter(program=program, code__in=new_codes).order_by('-id')
    ]


def _serialize_badge(b: Badge) -> dict:
    earned_iso = b.earned_date.isoformat() if b.earned_date else ''
    return {
        'id': b.id,
        'code': b.code,
        'badge_type': b.code,
        'title': b.title,
        'description': b.description,
        'icon': b.icon or '🏅',
        'earned_date': earned_iso or None,
        'earned_at': earned_iso,
        'week_start': None,
    }


def _serialize_block(block: ProgramBlock) -> dict:
    lesson_name = block.lesson.ad if block.lesson else ''
    subject_label = lesson_name or block.title
    topic_label = block.topic_name or (block.title if lesson_name else '')
    est_mins = int(block.estimated_duration_minutes or 30)
    return {
        'id': block.id,
        'day_id': block.day_id,
        'order': block.order,
        'title': block.title,
        'subject': subject_label,
        'topic': topic_label,
        'subtopic': '',
        'topic_name': block.topic_name or '',
        'resource_name': block.resource_name or '',
        'page_range': '',
        'lesson_name': lesson_name,
        'task_type': block.block_type,
        'task_type_label': block.get_block_type_display(),
        'block_type': block.block_type,
        'block_type_label': block.get_block_type_display(),
        'goal_type': block.goal_type or '',
        'goal_type_label': block.get_goal_type_display() if block.goal_type else '',
        'question_count': block.question_count,
        'duration_minutes': est_mins,
        'estimated_duration_minutes': block.estimated_duration_minutes,
        'actual_duration': block.actual_duration,
        'start_time': None,
        'end_time': None,
        'description': '',
        'priority': block.priority,
        'is_completed': block.is_completed,
        'completed_at': block.completed_at.isoformat() if block.completed_at else None,
        'color': block.color or subject_color(subject_label),
    }


def _serialize_day(day: ProgramDay, today: date) -> dict:
    fb = getattr(day, 'feedback', None)
    blocks = [_serialize_block(b) for b in day.blocks.all()]
    done_blocks = sum(1 for b in blocks if b['is_completed'])
    planned_minutes = sum((b['duration_minutes'] or 0) for b in blocks)
    focused_minutes = sum((b['actual_duration'] or 0) for b in blocks)
    return {
        'id': day.id,
        'date': day.day_date.isoformat(),
        'weekday': day.weekday,
        'day_of_week': day.weekday,
        'day_label': day.get_weekday_display(),
        'weekday_label': day.get_weekday_display(),
        'is_today': day.day_date == today,
        'is_off_day': False,
        'total_question_count': day.total_question_count,
        'total_block_count': day.total_block_count,
        'completed_block_count': done_blocks,
        'total_planned_minutes': planned_minutes,
        'total_actual_minutes': focused_minutes,
        'focused_minutes': focused_minutes,
        'completion_percent': day.completion_percent,
        'load_level': day.load_level,
        'load_level_label': day.get_load_level_display(),
        'coach_note': day.coach_note or '',
        'feedback': {
            'id': fb.id,
            'struggled': fb.struggled,
            'difficulty': 'ZOR' if fb.struggled else 'ORTA',
            'time_enough': fb.time_enough,
            'time_sufficient': fb.time_enough,
            'unclear_topic': fb.unclear_topic or '',
            'comment': fb.comment or '',
            'note': fb.comment or '',
            'energy_level': fb.energy_level,
            'created_at': fb.created_at.isoformat() if fb.created_at else '',
            'updated_at': fb.updated_at.isoformat() if fb.updated_at else None,
        } if fb else None,
        'blocks': blocks,
    }


def _compute_global_streak(student_id: int, today: date) -> int:
    """Öğrencinin bugüne kadar ardışık %100 tamamladığı çalışma günü serisi."""
    past_days = list(
        ProgramDay.objects.filter(
            program__student_id=student_id,
            program__is_template=False,
            day_date__lte=today,
            total_block_count__gt=0,
        )
        .order_by('-day_date')[:30]
    )
    streak = 0
    for idx, pday in enumerate(past_days):
        if pday.completion_percent >= 100:
            streak += 1
        elif idx == 0 and pday.day_date == today:
            # Bugün henüz devam ediyor olabilir; dünkü seriyi kırmasın
            continue
        else:
            break
    return streak


def build_study_workspace(scope: dict, requested_program_id: int | None = None) -> dict:
    """
    Öğrencinin aktif (veya seçili) haftalık çalışma programını, manuel ödev
    özetlerini, toplam odak süresini, aktif serisini ve rozet koleksiyonunu döndürür.
    """
    ogrenci = scope['ogrenci']
    today = timezone.localtime(timezone.now(), ISTANBUL).date()

    programs_qs = (
        WeeklyProgram.objects.filter(student_id=ogrenci.id, is_template=False)
        .order_by('-week_start', '-id')
    )
    program_list = [
        {
            'id': p.id,
            'title': f'{p.week_start.isoformat()} — {p.week_end.isoformat()}',
            'status': 'ACTIVE',
            'week_start': p.week_start.isoformat(),
            'week_end': p.week_end.isoformat(),
            'completion_percent': p.completion_percent,
            'total_question_count': p.total_question_count,
            'total_block_count': p.total_block_count,
            'is_current': p.week_start <= today <= p.week_end,
        }
        for p in programs_qs[:12]
    ]

    selected_program = None
    base_detail_qs = WeeklyProgram.objects.select_related('coach').prefetch_related(
        'days__blocks__lesson',
        'days__feedback',
        'badges',
    ).filter(student_id=ogrenci.id, is_template=False)

    if requested_program_id:
        selected_program = base_detail_qs.filter(id=requested_program_id).first()
    if selected_program is None:
        selected_program = (
            base_detail_qs.filter(week_start__lte=today, week_end__gte=today)
            .order_by('-week_start')
            .first()
        )
    if selected_program is None:
        selected_program = base_detail_qs.order_by('-week_start', '-id').first()

    program_payload = None
    if selected_program is not None:
        days_payload = [_serialize_day(d, today) for d in selected_program.days.all()]
        week_focused_minutes = sum(d['focused_minutes'] for d in days_payload)
        week_planned_minutes = sum(d['total_planned_minutes'] for d in days_payload)
        coach_name = ''
        if selected_program.coach:
            coach_name = selected_program.coach.get_full_name() or selected_program.coach.username
        program_payload = {
            'id': selected_program.id,
            'title': f'{selected_program.week_start.isoformat()} — {selected_program.week_end.isoformat()}',
            'status': 'ACTIVE',
            'week_start': selected_program.week_start.isoformat(),
            'week_end': selected_program.week_end.isoformat(),
            'coach_name': coach_name,
            'coach_note': selected_program.coach_note or '',
            'total_questions': selected_program.total_question_count,
            'total_question_count': selected_program.total_question_count,
            'total_block_count': selected_program.total_block_count,
            'total_planned_minutes': week_planned_minutes,
            'completion_percent': selected_program.completion_percent,
            'focused_minutes': week_focused_minutes,
            'days': days_payload,
        }

    # Zengin koç ödevleri listesi ve KPI özeti (homework_service)
    hw_bundle = list_student_assignments(scope)
    assignments = hw_bundle['items']

    badges = [
        _serialize_badge(b)
        for b in Badge.objects.filter(student_id=ogrenci.id).order_by('-earned_date', '-id')[:24]
    ]
    block_focus_minutes = (
        ProgramBlock.objects.filter(
            day__program__student_id=ogrenci.id,
            day__program__is_template=False,
            actual_duration__isnull=False,
        )
        .values_list('actual_duration', flat=True)
    )
    total_focus = sum(int(m or 0) for m in block_focus_minutes) + int(
        hw_bundle['summary']['total_focused_minutes'] or 0
    )

    return {
        'today': today.isoformat(),
        'streak_days': _compute_global_streak(ogrenci.id, today),
        'total_focused_minutes': total_focus,
        'programs': program_list,
        'recent_programs': program_list,
        'active_program': program_payload,
        'assignments': assignments,
        'manual_assignments': assignments,
        'assignments_summary': hw_bundle['summary'],
        'badges': badges,
    }


@transaction.atomic
def toggle_or_complete_study_block(
    scope: dict,
    block_id: int,
    *,
    is_completed: bool = True,
    actual_duration_minutes: int | None = None,
    add_duration_minutes: int | None = None,
) -> dict:
    """
    Öğrencinin kendi haftalık çalışma bloğunu tamamlamasını veya Odak Modu
    süresini (`actual_duration`) kaydetmesini sağlar.
    """
    block = (
        ProgramBlock.objects.select_related('day', 'day__program', 'lesson')
        .filter(
            id=block_id,
            day__program__student_id=scope['ogrenci'].id,
            day__program__is_template=False,
        )
        .first()
    )
    if block is None:
        raise StudentPortalError('not_found', 'Çalışma görevi bulunamadı.', 404)

    now = timezone.now()
    block.is_completed = bool(is_completed)
    block.completed_at = now if block.is_completed else None

    if add_duration_minutes is not None:
        if add_duration_minutes < 0 or add_duration_minutes > 600:
            raise StudentPortalError('validation_error', 'Odak süresi geçersiz.', 400)
        block.actual_duration = int(block.actual_duration or 0) + int(add_duration_minutes)
    elif actual_duration_minutes is not None:
        if actual_duration_minutes < 0 or actual_duration_minutes > 600:
            raise StudentPortalError('validation_error', 'Odak süresi geçersiz.', 400)
        block.actual_duration = int(actual_duration_minutes)

    block.save(update_fields=['is_completed', 'completed_at', 'actual_duration', 'updated_at'])

    day = block.day
    day.refresh_stats()
    program = day.program
    program.refresh_stats()

    earned_badges = _evaluate_program_badges_safe(
        program,
        completed_dt=now if block.is_completed else None,
    )

    today = timezone.localtime(now, ISTANBUL).date()
    return {
        'block': _serialize_block(block),
        'day_completion_percent': day.completion_percent,
        'program_completion_percent': program.completion_percent,
        'streak_days': _compute_global_streak(scope['ogrenci'].id, today),
        'earned_badges': earned_badges,
    }


@transaction.atomic
def submit_daily_feedback(
    scope: dict,
    day_id: int,
    *,
    struggled: bool | None,
    time_enough: bool | None,
    unclear_topic: str = '',
    comment: str = '',
) -> dict:
    """
    Öğrencinin gün sonu 30 saniyelik mini check-in yanıtını (`DailyFeedback`)
    kaydeder; koçun çalışma programı ekranına doğrudan yansır.
    """
    day = (
        ProgramDay.objects.select_related('program')
        .filter(
            id=day_id,
            program__student_id=scope['ogrenci'].id,
            program__is_template=False,
        )
        .first()
    )
    if day is None:
        raise StudentPortalError('not_found', 'Program günü bulunamadı.', 404)

    fb, _created = DailyFeedback.objects.update_or_create(
        day=day,
        defaults={
            'struggled': struggled,
            'time_enough': time_enough,
            'unclear_topic': (unclear_topic or '').strip()[:255],
            'comment': (comment or '').strip()[:1000],
        },
    )
    return {
        'day_id': day.id,
        'feedback': {
            'struggled': fb.struggled,
            'time_enough': fb.time_enough,
            'unclear_topic': fb.unclear_topic,
            'comment': fb.comment,
            'energy_level': fb.energy_level,
            'updated_at': fb.updated_at.isoformat() if fb.updated_at else None,
        },
    }
