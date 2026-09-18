"""Şablon tohumu ve özet hesapları."""

from collections import defaultdict

from .engine import WEEKDAY_LABELS, day_state
from .models import (
    DistributionStrategy,
    StudyScenario,
    StudyTemplate,
    TemplateScope,
    WeekendPolicy,
)

BUILTIN_TEMPLATES = [
    {
        'name': 'Standart',
        'scenario': StudyScenario.STANDART,
        'active_weekdays': [0, 1, 2, 3, 4],
        'day_weights': {0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 0, 6: 0},
        'weekend_policy': WeekendPolicy.OFF,
        'strategy': DistributionStrategy.BY_TEST,
        'max_questions_per_day': 20,
        'max_tests_per_day': 2,
        'max_minutes_per_day': 90,
        'max_slots_per_day': 6,
    },
    {
        'name': 'Yoğun',
        'scenario': StudyScenario.YOGUN,
        'active_weekdays': [0, 1, 2, 3, 4, 5],
        'day_weights': {0: 1, 1: 1, 2: 1, 3: 1, 4: 1.1, 5: 0.7, 6: 0},
        'weekend_policy': WeekendPolicy.LIGHT,
        'strategy': DistributionStrategy.BY_TEST,
        'max_questions_per_day': 40,
        'max_tests_per_day': 4,
        'max_minutes_per_day': 150,
        'max_slots_per_day': 8,
    },
    {
        'name': 'Sınav Haftası',
        'scenario': StudyScenario.SINAV_HAFTASI,
        'active_weekdays': [0, 1, 2, 3, 4],
        'day_weights': {0: 1.2, 1: 0.8, 2: 1, 3: 1, 4: 0.6, 5: 0, 6: 0},
        'weekend_policy': WeekendPolicy.OFF,
        'strategy': DistributionStrategy.BY_QUESTION,
        'max_questions_per_day': 16,
        'max_tests_per_day': 2,
        'max_minutes_per_day': 80,
        'max_slots_per_day': 5,
    },
    {
        'name': 'Özel',
        'scenario': StudyScenario.OZEL,
        'active_weekdays': [0, 1, 2, 3, 4],
        'day_weights': {0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 0, 6: 0},
        'weekend_policy': WeekendPolicy.OFF,
        'strategy': DistributionStrategy.EQUAL,
        'max_questions_per_day': 20,
        'max_tests_per_day': 2,
        'max_minutes_per_day': 90,
        'max_slots_per_day': 6,
    },
]


def ensure_builtin_templates(kurum, created_by=None) -> list[StudyTemplate]:
    created = []
    for spec in BUILTIN_TEMPLATES:
        defaults = {
            'scenario': spec['scenario'],
            'scope': TemplateScope.KURUM,
            'is_builtin': True,
            'is_active': True,
            'active_weekdays': spec['active_weekdays'],
            'day_weights': {str(k): v for k, v in spec['day_weights'].items()},
            'weekend_policy': spec['weekend_policy'],
            'intensify_weekdays': [],
            'strategy': spec['strategy'],
            'unit_priority': ['test', 'exam', 'question', 'review'],
            'max_questions_per_day': spec['max_questions_per_day'],
            'max_tests_per_day': spec['max_tests_per_day'],
            'max_minutes_per_day': spec['max_minutes_per_day'],
            'max_slots_per_day': spec['max_slots_per_day'],
            'overflow': 'leftover',
            'lock_past_days': True,
            'respect_due_date': True,
            'honor_calendar': True,
        }
        obj, was_created = StudyTemplate.objects.get_or_create(
            kurum=kurum,
            name=spec['name'],
            defaults={**defaults, 'created_by': created_by},
        )
        if was_created:
            created.append(obj)
    return created


def format_minutes(total: int) -> str:
    hours, minutes = divmod(int(total or 0), 60)
    if hours and minutes:
        return f'{hours}s {minutes}dk'
    if hours:
        return f'{hours}s'
    return f'{minutes}dk'


def build_summary(program) -> dict:
    days = list(program.days.all().prefetch_related('slots__lesson', 'slots__source_assignment'))
    leftovers = list(program.leftovers.all())
    tasks_done = sum(d.completed_slots for d in days)
    tasks_total = sum(d.planned_slots for d in days)
    questions_done = sum(d.completed_questions for d in days)
    questions_total = sum(d.planned_questions for d in days) + sum(x.remaining_questions for x in leftovers)
    tests_done = sum(d.completed_tests for d in days)
    tests_total = sum(d.planned_tests for d in days) + sum(x.remaining_tests for x in leftovers)
    minutes_done = sum(d.completed_minutes for d in days)
    minutes_total = sum(d.planned_minutes for d in days) + sum(x.remaining_minutes for x in leftovers)
    planned_only_q = sum(d.planned_questions for d in days)
    planned_only_t = sum(d.planned_tests for d in days)
    planned_only_m = sum(d.planned_minutes for d in days)

    completion = 0
    if tasks_total:
        completion = int(round(100 * tasks_done / tasks_total))

    missing = []
    for item in leftovers:
        bits = []
        if item.remaining_tests:
            bits.append(f'{item.remaining_tests} test')
        if item.remaining_questions:
            bits.append(f'{item.remaining_questions} soru')
        missing.append(f'Leftover: {", ".join(bits) or item.title}')

    subject_minutes = defaultdict(int)
    for day in days:
        for slot in day.slots.all():
            name = slot.lesson.ad if slot.lesson else (slot.topic_name or 'Diğer')
            subject_minutes[name] += slot.planned_minutes
    subject_total = sum(subject_minutes.values()) or 1
    subjects = [
        {
            'lesson': name,
            'percent': int(round(100 * mins / subject_total)),
            'minutes': mins,
        }
        for name, mins in sorted(subject_minutes.items(), key=lambda x: -x[1])
    ]

    day_rows = []
    for day in days:
        day_rows.append({
            'id': day.id,
            'date': day.day_date.isoformat(),
            'label': WEEKDAY_LABELS[day.weekday],
            'weekday': day.weekday,
            'tasks': f'{day.completed_slots}/{day.planned_slots}',
            'minutes': f'{day.completed_minutes}/{day.planned_minutes or day.target_minutes}',
            'chip': (
                f'{WEEKDAY_LABELS[day.weekday]} {day.completed_slots}/{day.planned_slots}'
                f' · {day.completed_minutes}/{day.planned_minutes or day.target_minutes}'
            ),
            'state': day_state(day),
            'load_level': day.load_level,
            'is_locked': day.is_locked,
            'planned_tests': day.planned_tests,
            'planned_questions': day.planned_questions,
            'planned_minutes': day.planned_minutes,
            'planned_slots': day.planned_slots,
            'completed_slots': day.completed_slots,
            'completed_minutes': day.completed_minutes,
            'cap_tests': day.cap_tests,
            'cap_questions': day.cap_questions,
            'cap_minutes': day.cap_minutes,
        })

    return {
        'tasks': {'done': tasks_done, 'total': tasks_total},
        'questions': {'done': questions_done, 'total': questions_total, 'planned': planned_only_q},
        'tests': {'done': tests_done, 'total': tests_total, 'planned': planned_only_t},
        'minutes': {
            'done': minutes_done,
            'total': minutes_total,
            'planned': planned_only_m,
            'done_label': format_minutes(minutes_done),
            'total_label': format_minutes(minutes_total),
        },
        'completion_percent': completion,
        'missing': missing,
        'subjects': subjects,
        'days': day_rows,
        'leftover_count': len(leftovers),
        'leftover_tests': sum(x.remaining_tests for x in leftovers),
        'leftover_questions': sum(x.remaining_questions for x in leftovers),
        'leftover_minutes': sum(x.remaining_minutes for x in leftovers),
    }
