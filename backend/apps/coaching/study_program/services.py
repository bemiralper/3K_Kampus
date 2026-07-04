"""
Çalışma Programı - Services

Dengeli Dağıtım motoru, rozet hesaplama, haftalık özet.
"""
from datetime import timedelta
from django.db import models
from django.utils import timezone

from .models import (
    WeeklyProgram, ProgramDay, ProgramBlock, Badge,
    BlockType, GoalType, BadgeCode, LoadLevel,
)


# ────────────────────────────────────────
# 1) Dengeli Dağıtım
# ────────────────────────────────────────

def auto_distribute(program: WeeklyProgram, assignment_ids: list[int] | None = None):
    """
    Atanmamış ödevleri / verilen assignment_id'leri haftanın günlerine
    soru sayısına göre dengeli biçimde dağıtır.

    Strateji: en az sorusu olan güne at — greedy balancing.
    """
    from apps.coaching.assignment_manual.models import ManualAssignment, AssignmentTask

    # Dağıtılacak ödevleri belirle
    if assignment_ids:
        assignments = ManualAssignment.objects.filter(
            id__in=assignment_ids,
            student=program.student,
        )
    else:
        # Programa henüz atanmamış tüm ASSIGNED ödevler
        already_mapped = ProgramBlock.objects.filter(
            day__program=program,
            source_assignment__isnull=False,
        ).values_list('source_assignment_id', flat=True)

        assignments = ManualAssignment.objects.filter(
            student=program.student,
            status__in=['ASSIGNED', 'IN_PROGRESS'],
            is_active=True,
        ).exclude(id__in=already_mapped)

    if not assignments.exists():
        return {'distributed': 0}

    # Günleri hazırla — mevcut soru toplamlarını al
    days = list(program.days.order_by('day_date'))
    day_loads: dict[int, int] = {}
    for d in days:
        day_loads[d.id] = d.total_question_count

    created_count = 0

    for asgn in assignments:
        # En az yüklü günü bul
        target_day_id = min(day_loads, key=day_loads.get)  # type: ignore
        target_day = next(d for d in days if d.id == target_day_id)

        # Ödevin ilk lesson + task bilgisini al
        first_lesson = asgn.lessons.first()
        lesson_obj = first_lesson.lesson if first_lesson else None
        topic = first_lesson.topic_name if first_lesson else ''
        resource = first_lesson.resource_book.ad if first_lesson and first_lesson.resource_book else ''

        q_count = AssignmentTask.objects.filter(
            lesson_block__assignment=asgn
        ).aggregate(s=models.Sum('question_count'))['s'] or 0

        ProgramBlock.objects.create(
            day=target_day,
            source_assignment=asgn,
            lesson=lesson_obj,
            title=asgn.title,
            topic_name=topic,
            resource_name=resource,
            block_type=BlockType.SORU_COZUMU,
            question_count=q_count,
            priority=asgn.priority,
            order=target_day.blocks.count(),
            color=_lesson_color(lesson_obj),
        )

        day_loads[target_day_id] += q_count
        created_count += 1

    # Günleri yenile
    for d in days:
        d.refresh_stats()
    program.refresh_stats()

    return {'distributed': created_count}


def redistribute_existing_blocks(program: WeeklyProgram):
    """
    Programdaki mevcut blokları günlere yeniden dengeli dağıtır.
    Soru sayısına göre greedy balancing — en az sorusu olan güne atar.
    """
    days = list(program.days.order_by('day_date'))
    all_blocks = list(
        ProgramBlock.objects.filter(day__program=program).order_by('-question_count')
    )

    if not all_blocks or not days:
        return {'redistributed': 0}

    # Tüm blokları günlerden kopar
    day_loads: dict[int, int] = {d.id: 0 for d in days}

    for block in all_blocks:
        # En az yüklü günü bul
        target_day_id = min(day_loads, key=day_loads.get)  # type: ignore
        target_day = next(d for d in days if d.id == target_day_id)
        block.day = target_day
        block.order = sum(1 for b in all_blocks if b.day_id == target_day_id)
        block.save(update_fields=['day_id', 'order', 'updated_at'])
        day_loads[target_day_id] += block.question_count or 0

    for d in days:
        d.refresh_stats()
    program.refresh_stats()

    return {'redistributed': len(all_blocks)}


def _lesson_color(lesson) -> str:
    """Ders adına göre sabit renk paleti."""
    palette = {
        'Matematik':    '#3b82f6',
        'Türkçe':       '#ef4444',
        'Fen':          '#22c55e',
        'Fen Bilimleri': '#22c55e',
        'Sosyal':       '#f97316',
        'İngilizce':    '#8b5cf6',
        'Din':          '#6366f1',
    }
    if not lesson:
        return '#6b7280'
    for key, color in palette.items():
        if key.lower() in lesson.ad.lower():
            return color
    return '#6b7280'


# ────────────────────────────────────────
# 2) Rozet Hesaplama
# ────────────────────────────────────────

def calculate_badges(program: WeeklyProgram):
    """
    Haftalık program tamamlanınca rozetleri hesapla ve kaydet.
    Mevcut rozetleri silmez, tekrar kazanılanları atlar.
    """
    student = program.student
    days = program.days.order_by('weekday')
    existing_codes = set(
        program.badges.values_list('code', flat=True)
    )

    new_badges: list[Badge] = []

    # ─ Eksiksiz Gün (her %100 gün için)
    for d in days:
        if d.completion_percent >= 100 and BadgeCode.EKSIKSIZ_GUN not in existing_codes:
            new_badges.append(Badge(
                student=student, program=program,
                code=BadgeCode.EKSIKSIZ_GUN,
                title='Eksiksiz Gün',
                description=f'{d.get_weekday_display()} günü %100 tamamlandı',
                icon='🏅',
                earned_date=d.day_date,
            ))
            existing_codes.add(BadgeCode.EKSIKSIZ_GUN)

    # ─ Seri (ardışık %100 günler)
    streak = 0
    for d in days:
        if d.completion_percent >= 100:
            streak += 1
        else:
            streak = 0

        if streak >= 3 and BadgeCode.SERI_3 not in existing_codes:
            new_badges.append(Badge(
                student=student, program=program,
                code=BadgeCode.SERI_3,
                title='3 Gün Seri',
                description='3 gün üst üste eksiksiz tamamladı',
                icon='🔥',
                earned_date=d.day_date,
            ))
            existing_codes.add(BadgeCode.SERI_3)

        if streak >= 5 and BadgeCode.SERI_5 not in existing_codes:
            new_badges.append(Badge(
                student=student, program=program,
                code=BadgeCode.SERI_5,
                title='5 Gün Seri',
                description='5 gün üst üste eksiksiz tamamladı',
                icon='💪',
                earned_date=d.day_date,
            ))
            existing_codes.add(BadgeCode.SERI_5)

        if streak >= 7 and BadgeCode.SERI_7 not in existing_codes:
            new_badges.append(Badge(
                student=student, program=program,
                code=BadgeCode.SERI_7,
                title='7 Gün Seri',
                description='Tam hafta eksiksiz tamamladı',
                icon='🏆',
                earned_date=d.day_date,
            ))
            existing_codes.add(BadgeCode.SERI_7)

    # ─ Hafta Şampiyonu (%90+ haftalık)
    if program.completion_percent >= 90 and BadgeCode.HAFTA_SAMPIYONU not in existing_codes:
        new_badges.append(Badge(
            student=student, program=program,
            code=BadgeCode.HAFTA_SAMPIYONU,
            title='Hafta Şampiyonu',
            description=f'Haftalık tamamlanma: %{program.completion_percent}',
            icon='👑',
            earned_date=program.week_end,
        ))

    # ─ Soru Avcısı (500+ soru)
    if program.total_question_count >= 500 and BadgeCode.SORU_AVCISI not in existing_codes:
        new_badges.append(Badge(
            student=student, program=program,
            code=BadgeCode.SORU_AVCISI,
            title='Soru Avcısı',
            description=f'Bu hafta {program.total_question_count} soru çözüldü',
            icon='🎯',
            earned_date=program.week_end,
        ))

    Badge.objects.bulk_create(new_badges)
    return [b.code for b in new_badges]


# ────────────────────────────────────────
# 3) Haftalık Özet
# ────────────────────────────────────────

def weekly_summary(program: WeeklyProgram) -> dict:
    """
    Otomatik üretilen haftalık özet kartı verisi.
    Frontend'de hafta sonunda gösterilir.
    """
    days = program.days.order_by('weekday')
    day_data = []
    best_day = None
    worst_day = None

    for d in days:
        dd = {
            'weekday': d.get_weekday_display(),
            'date': str(d.day_date),
            'questions': d.total_question_count,
            'blocks': d.total_block_count,
            'completion': d.completion_percent,
            'load': d.load_level,
            'energy': d.feedback.energy_level if hasattr(d, 'feedback') and d.feedback else None,
        }
        day_data.append(dd)

        if best_day is None or d.completion_percent > best_day['completion']:
            best_day = dd
        if worst_day is None or d.completion_percent < worst_day['completion']:
            worst_day = dd

    # Seri
    streak = 0
    max_streak = 0
    for d in days:
        if d.completion_percent >= 100:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    return {
        'program_id': program.id,
        'student_id': program.student_id,
        'week_start': str(program.week_start),
        'week_end': str(program.week_end),
        'total_questions': program.total_question_count,
        'total_blocks': program.total_block_count,
        'completion_percent': program.completion_percent,
        'max_streak': max_streak,
        'best_day': best_day,
        'worst_day': worst_day,
        'days': day_data,
        'badges': list(program.badges.values('code', 'title', 'icon', 'earned_date')),
    }
