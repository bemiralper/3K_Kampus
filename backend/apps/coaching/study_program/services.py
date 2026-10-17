"""
Çalışma Programı - Services

Dengeli Dağıtım motoru, rozet hesaplama, haftalık özet, tarih aralığı senkronu.
"""
import re
from datetime import date, datetime, timedelta

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from .models import (
    WeeklyProgram, ProgramDay, ProgramBlock, Badge,
    BlockType, GoalType, BadgeCode, LoadLevel,
)


# ────────────────────────────────────────
# 0) Tarih aralığı senkronu
# ────────────────────────────────────────

def _drop_prefetch(instance, relation: str) -> None:
    cache = getattr(instance, '_prefetched_objects_cache', None)
    if cache is not None:
        cache.pop(relation, None)


# 7 gün varsayılan. 8 gün, programın yapıldığı günü de kapsar; kontrol yerinde kalır.
PROGRAM_LENGTHS = (7, 8)


def validate_program_length(week_start: date, week_end: date) -> None:
    if week_end < week_start:
        raise ValidationError({'week_end': 'Bitiş tarihi başlangıçtan önce olamaz.'})
    if (week_end - week_start).days + 1 not in PROGRAM_LENGTHS:
        raise ValidationError({
            'week_end': (
                'Haftalık program 7 veya 8 gün olmalıdır. '
                'Son gün kontrol günüdür. 8 gün, programın yapıldığı günü de kapsar.'
            ),
        })


def sync_program_date_range(
    program: WeeklyProgram,
    week_start: date,
    week_end: date,
    *,
    force_remove_blocks: bool = False,
) -> dict:
    """
    Program tarih aralığını günceller ve ProgramDay satırlarını senkronlar.

    - Yeni günler eklenir
    - Aralık dışı boş günler silinir
    - Aralık 7 veya 8 gündür. Son gün kontrol günüdür.
    - Blok içeren günler aralık dışına düşerse force yoksa ValidationError
    """
    validate_program_length(week_start, week_end)

    conflict = (
        WeeklyProgram.objects.filter(
            student_id=program.student_id,
            week_start=week_start,
            is_template=False,
        )
        .exclude(pk=program.pk)
        .exists()
    )
    if conflict:
        raise ValidationError({
            'week_start': 'Bu öğrenci için aynı başlangıç tarihli başka bir program var.',
        })

    with transaction.atomic():
        wanted = {
            week_start + timedelta(days=i)
            for i in range((week_end - week_start).days + 1)
        }
        existing = {d.day_date: d for d in program.days.all()}

        removed_with_blocks = []
        for day_date, day in list(existing.items()):
            if day_date in wanted:
                continue
            if day.blocks.exists():
                if not force_remove_blocks:
                    removed_with_blocks.append(str(day_date))
                    continue
                day.blocks.all().delete()
            day.delete()

        if removed_with_blocks:
            raise ValidationError({
                'week_end': (
                    'Şu günlerde blok var; aralığı daraltmadan önce blokları taşıyın veya silin: '
                    + ', '.join(removed_with_blocks)
                ),
            })

        created = 0
        for day_date in sorted(wanted):
            if day_date in existing:
                continue
            ProgramDay.objects.create(
                program=program,
                day_date=day_date,
                weekday=day_date.weekday(),
            )
            created += 1

        program.week_start = week_start
        program.week_end = week_end
        program.save(update_fields=['week_start', 'week_end', 'updated_at'])
        _drop_prefetch(program, 'days')
        program.refresh_stats()

    return {
        'week_start': str(program.week_start),
        'week_end': str(program.week_end),
        'day_count': program.days.count(),
        'created_days': created,
    }


# ────────────────────────────────────────
# 1) Dengeli Dağıtım
# ────────────────────────────────────────

TEST_TASK_TYPES = ('SOLVE_TEST', 'SOLVE_PDF', 'SOLVE_EXAM')


def _as_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        if timezone.is_aware(value):
            return timezone.localtime(value).date()
        return value.date()
    if isinstance(value, date):
        return value
    return None


def _assignment_overlaps_week(assignment, week_start: date, week_end: date) -> bool:
    assigned = _as_date(assignment.assigned_date)
    due = _as_date(assignment.due_date)
    start = assigned or due
    end = due or assigned
    if not start or not end:
        return False
    return start <= week_end and end >= week_start


def _program_days(program: WeeklyProgram) -> list[ProgramDay]:
    """Haftanın 7 günü. Son gün kontrol günüdür ve dağıtıma dahildir."""
    return list(program.days.order_by('day_date'))


def _split_amounts(total: int, parts: int) -> list[int]:
    if parts <= 0:
        return []
    total = max(0, int(total))
    base, rem = divmod(total, parts)
    return [base + (1 if i < rem else 0) for i in range(parts)]


def _is_test_task(task) -> bool:
    if (task.question_count or 0) > 0:
        return True
    return task.task_type in TEST_TASK_TYPES


def auto_distribute(
    program: WeeklyProgram,
    assignment_ids: list[int] | None = None,
    metric: str = 'question',
    day_ids: list[int] | None = None,
    lesson_ids: list[int] | None = None,
):
    """
    Seçilen ödevin her konusunu haftanın her gününe kendi ölçütüyle böler.

    Haftanın toplam sorusundan gün doldurulmaz. 47 soruluk bir konu 7 güne
    kendi içinde bölünür. Kontrol günü de pay alır.

    metric:
      question — konunun soru sayısı günlere eşit
      test — konunun testleri bütün kalır, günlere eşit sayıda düşer
    """
    from apps.coaching.assignment_manual.models import ManualAssignment, AssignmentTask

    if metric not in ('question', 'test'):
        return {'distributed': 0, 'detail': 'Ölçüt soru veya test olmalıdır.'}

    days = _program_days(program)
    if day_ids:
        wanted_days = {int(day_id) for day_id in day_ids}
        days = [day for day in days if day.id in wanted_days]
    if not days:
        return {'distributed': 0, 'detail': 'Dağıtılacak gün seçilmedi.'}

    if (program.week_end - program.week_start).days + 1 not in PROGRAM_LENGTHS:
        return {
            'distributed': 0,
            'detail': 'Haftalık program 7 veya 8 gün olmalıdır. Önce tarihi düzeltin.',
        }

    qs = ManualAssignment.objects.filter(
        student=program.student,
        is_active=True,
        status__in=['ASSIGNED', 'IN_PROGRESS', 'DRAFT', 'OVERDUE'],
    )
    if assignment_ids:
        qs = qs.filter(id__in=assignment_ids)
    assignments = [
        a for a in qs.prefetch_related('lessons__lesson', 'lessons__resource_book', 'lessons__tasks')
        if _assignment_overlaps_week(a, program.week_start, program.week_end)
    ]
    if not assignments:
        return {'distributed': 0, 'detail': 'Bu haftayla kesişen ödev yok.'}

    planned_rows = (
        ProgramBlock.objects.filter(
            day__program=program,
            source_assignment__isnull=False,
        )
        .values('source_assignment_id', 'source_lesson_id')
        .annotate(planned_q=models.Sum('question_count'))
    )
    planned_q = {
        (row['source_assignment_id'], row['source_lesson_id']): row['planned_q'] or 0
        for row in planned_rows
    }

    units = []
    for asgn in assignments:
        lessons = list(asgn.lessons.all())
        if not lessons:
            total_q = AssignmentTask.objects.filter(
                lesson_block__assignment=asgn,
            ).aggregate(s=models.Sum('question_count'))['s'] or 0
            key = (asgn.id, None)
            if key in planned_q and (total_q <= 0 or planned_q[key] >= total_q):
                continue
            remaining = max(0, total_q - planned_q.get(key, 0))
            units.append({
                'assignment': asgn,
                'lesson': None,
                'remaining': remaining,
                'tests': [],
                'planned': key in planned_q,
            })
            continue
        for lesson in lessons:
            if lesson_ids and lesson.id not in lesson_ids:
                continue
            tasks = list(lesson.tasks.all())
            total_q = sum((t.question_count or 0) for t in tasks)
            key = (asgn.id, lesson.id)
            already = planned_q.get(key, 0)
            if key in planned_q and (total_q <= 0 or already >= total_q):
                continue
            remaining = max(0, total_q - already) if total_q else 0
            tests = [t for t in tasks if _is_test_task(t)]
            units.append({
                'assignment': asgn,
                'lesson': lesson,
                'remaining': remaining,
                'tests': tests,
                'planned': key in planned_q,
            })

    if not units:
        return {'distributed': 0, 'detail': 'Bu ödevin konuları zaten takvimde.'}

    # Her konu kendi içinde günlere bölünür. Gün → [(unit, question_count, task)]
    day_chunks: dict[int, list] = {d.id: [] for d in days}
    n_days = len(days)

    if metric == 'test':
        placed_any = False
        for unit in units:
            if unit['planned']:
                continue
            atoms = []
            if unit['tests']:
                atoms = [(unit, task.question_count or 0, task) for task in unit['tests']]
            else:
                atoms = [(unit, unit['remaining'], None)]
            counts = _split_amounts(len(atoms), n_days)
            cursor = 0
            for day, count in zip(days, counts):
                for item in atoms[cursor:cursor + count]:
                    day_chunks[day.id].append(item)
                    placed_any = True
                cursor += count
        if not placed_any:
            return {'distributed': 0, 'detail': 'Test olarak dağıtılacak yeni konu yok.'}
    else:
        for unit in units:
            left = unit['remaining']
            if left <= 0:
                if not unit['planned']:
                    day_chunks[days[0].id].append((unit, 0, None))
                continue
            for day, amount in zip(days, _split_amounts(left, n_days)):
                if amount > 0:
                    day_chunks[day.id].append((unit, amount, None))

    # Aynı konunun kaç güne düştüğünü say (başlık 1/n)
    span_count: dict[tuple, int] = {}
    for chunks in day_chunks.values():
        seen = set()
        for unit, _q, _task in chunks:
            key = (unit['assignment'].id, unit['lesson'].id if unit['lesson'] else None)
            if key in seen:
                continue
            seen.add(key)
            span_count[key] = span_count.get(key, 0) + 1
    span_seen: dict[tuple, int] = {}

    created_count = 0
    with transaction.atomic():
        for day in days:
            _drop_prefetch(day, 'blocks')
            # Aynı dersin aynı gündeki testlerini tek blokta birleştir
            grouped: dict[tuple, dict] = {}
            order_keys = []
            for unit, q, task in day_chunks[day.id]:
                key = (unit['assignment'].id, unit['lesson'].id if unit['lesson'] else None)
                if key not in grouped:
                    grouped[key] = {'unit': unit, 'q': 0, 'tasks': []}
                    order_keys.append(key)
                grouped[key]['q'] += q
                if task is not None:
                    grouped[key]['tasks'].append(task)
            for key in order_keys:
                bucket = grouped[key]
                unit = bucket['unit']
                lesson = unit['lesson']
                asgn = unit['assignment']
                parts = span_count.get(key, 1)
                span_seen[key] = span_seen.get(key, 0) + 1
                part_no = span_seen[key]
                lesson_obj = lesson.lesson if lesson else None
                topic = (lesson.topic_name if lesson else '') or ''
                resource = ''
                if lesson and lesson.resource_book_id and lesson.resource_book:
                    resource = lesson.resource_book.ad or ''
                base = topic or (lesson_obj.ad if lesson_obj else '') or asgn.title
                title = f'{base} ({part_no}/{parts})' if parts > 1 else base
                tasks = bucket['tasks']
                ProgramBlock.objects.create(
                    day=day,
                    source_assignment=asgn,
                    source_lesson=lesson,
                    source_task=tasks[0] if len(tasks) == 1 else None,
                    lesson=lesson_obj,
                    title=title,
                    topic_name=topic,
                    resource_name=resource,
                    block_type=BlockType.SORU_COZUMU,
                    question_count=bucket['q'],
                    priority=asgn.priority,
                    order=day.blocks.count(),
                    color=_lesson_color(lesson_obj),
                )
                created_count += 1
            _drop_prefetch(day, 'blocks')
            day.refresh_stats()
        _drop_prefetch(program, 'days')
        program.refresh_stats()

    per_day = [
        sum(q for _u, q, _t in day_chunks[d.id])
        for d in days
    ]
    return {
        'distributed': created_count,
        'metric': metric,
        'study_days': len(days),
        'per_day': per_day,
    }


_PART_SUFFIX = re.compile(r'\s*\(\d+/\d+\)\s*$')


def _block_match_key(block: ProgramBlock):
    """Aynı ödev parçası: ders bloğu, yoksa ödev + konu."""
    if block.source_lesson_id:
        return ('lesson', block.source_lesson_id)
    if block.source_assignment_id:
        return (
            'topic',
            block.source_assignment_id,
            block.lesson_id,
            (block.topic_name or '').strip(),
        )
    return None


def _plain_title(block: ProgramBlock) -> str:
    topic = (block.topic_name or '').strip()
    if topic:
        return topic
    return _PART_SUFFIX.sub('', block.title or '').strip() or (block.title or '')


def move_block(block: ProgramBlock, new_day: ProgramDay) -> dict:
    """
    Bloğu başka güne taşır. Hedef günde aynı ödev varsa soru sayıları birleşir.
    """
    old_day = block.day
    if old_day.program_id != new_day.program_id:
        raise ValidationError('Blok yalnızca kendi programının gününe taşınır.')
    if old_day.id == new_day.id:
        return {'merged': False, 'block': block}

    key = _block_match_key(block)
    target = None
    if key is not None:
        for sibling in new_day.blocks.exclude(pk=block.pk):
            if _block_match_key(sibling) == key:
                target = sibling
                break

    with transaction.atomic():
        if target is not None:
            target.question_count = (target.question_count or 0) + (block.question_count or 0)
            extra = block.estimated_duration_minutes or 0
            if extra:
                target.estimated_duration_minutes = (target.estimated_duration_minutes or 0) + extra
            target.title = _plain_title(target)
            target.save()
            block.delete()
            result = target
            merged = True
        else:
            block.day = new_day
            block.order = new_day.blocks.count()
            block.save(update_fields=['day_id', 'order', 'updated_at'])
            result = block
            merged = False
        _drop_prefetch(old_day, 'blocks')
        _drop_prefetch(new_day, 'blocks')
        old_day.refresh_stats()
        new_day.refresh_stats()
        new_day.program.refresh_stats()

    return {'merged': merged, 'block': result}


def redistribute_existing_blocks(program: WeeklyProgram):
    """
    Programdaki mevcut blokları günlere yeniden dengeli dağıtır.
    Soru sayısına göre greedy balancing — en az sorusu olan güne atar.
    """
    days = _program_days(program)
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

    _drop_prefetch(program, 'days')
    for d in program.days.all():
        _drop_prefetch(d, 'blocks')
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
    days = program.days.order_by('day_date')
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
    Kontrol günü de özetin içindedir; o güne yazılan program görünür.
    """
    days = program.days.order_by('day_date')
    study_days = list(days)
    day_data = []
    best_day = None
    worst_day = None

    for d in study_days:
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

    # Seri (yalnızca çalışma günleri)
    streak = 0
    max_streak = 0
    for d in study_days:
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
