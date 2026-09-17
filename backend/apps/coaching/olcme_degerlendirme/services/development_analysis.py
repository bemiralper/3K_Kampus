"""
Öğrenci gelişim analizi.

Kayıtlı StudentSectionScore.net + comparison + primary AnswerKeyItem okur.
Net / puan üretmez; calculate_score_for_exam çağırmaz.
"""
from __future__ import annotations

import math
from collections import OrderedDict, defaultdict
from datetime import date, datetime

from . import development_thresholds as T
from .topic_blocks import build_topic_blocks


def ayt_section_allowed(name: str, exam_type: str, alan: str | None) -> bool:
    """AYT'de yalnızca öğrencinin alan testlerini bırak."""
    if exam_type != 'YKS_AYT':
        return True
    from ..views.analysis_views import _AYT_ALAN_SECTION_KEYS, _normalize_alan_kodu, _section_name_key
    allowed = _AYT_ALAN_SECTION_KEYS.get(_normalize_alan_kodu(alan) or '')
    if not allowed:
        return True
    return _section_name_key(name) in allowed

INSUFFICIENT = 'Yeterli veri yok.'


def _r(value, nd=2):
    if value is None:
        return None
    return round(float(value), nd)


def _safe_float(value, default=0.0):
    if value is None:
        return default
    return float(value)


def resolve_exam_type_group(raw: str | None) -> str | None:
    if not raw:
        return None
    key = str(raw).strip()
    if key in T.DEVELOPMENT_EXAM_TYPE_GROUPS:
        return key
    upper = key.upper()
    for group, types in T.DEVELOPMENT_EXAM_TYPE_GROUPS.items():
        if upper in types:
            return group
        if upper == group:
            return group
    return None


def group_for_exam_type(exam_type: str) -> str | None:
    return resolve_exam_type_group(exam_type)


def types_for_group(group: str) -> tuple[str, ...]:
    return T.DEVELOPMENT_EXAM_TYPE_GROUPS[group]


def parse_window(raw) -> str:
    if raw is None or raw == '':
        return T.DEVELOPMENT_DEFAULT_WINDOW
    value = str(raw).strip().lower()
    return value if value in T.DEVELOPMENT_WINDOWS else T.DEVELOPMENT_DEFAULT_WINDOW


def parse_exam_ids(raw) -> list[int]:
    if raw is None:
        return []
    if isinstance(raw, (list, tuple)):
        parts = []
        for item in raw:
            parts.extend(str(item).split(','))
    else:
        parts = str(raw).split(',')
    ids = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        try:
            ids.append(int(part))
        except (TypeError, ValueError):
            continue
    return ids


def parse_date(raw):
    if not raw:
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    text = str(raw).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def sample_stdev(values: list[float]) -> float | None:
    n = len(values)
    if n < 2:
        return None
    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / (n - 1)
    return math.sqrt(variance)


def ols_slope(values: list[float]) -> float | None:
    n = len(values)
    if n < 3:
        return None
    xs = list(range(1, n + 1))
    sum_x = sum(xs)
    sum_y = sum(values)
    sum_xy = sum(x * y for x, y in zip(xs, values))
    sum_x2 = sum(x * x for x in xs)
    denom = n * sum_x2 - sum_x * sum_x
    if denom == 0:
        return None
    return (n * sum_xy - sum_x * sum_y) / denom


def period_split(n: int) -> tuple[int, int] | None:
    if n < 3:
        return None
    if n == 3:
        return 1, 2
    if n == 4:
        return 2, 2
    if n == 5:
        return 2, 3
    recent = n // 2
    previous = n - recent
    return previous, recent


def period_change(values: list[float]) -> float | None:
    split = period_split(len(values))
    if not split:
        return None
    prev_n, recent_n = split
    previous = values[:prev_n]
    recent = values[-recent_n:]
    if not previous or not recent:
        return None
    return (sum(recent) / len(recent)) - (sum(previous) / len(previous))


def confidence_from_exam_count(n: int) -> int:
    if n <= 0:
        return 0
    if n == 1:
        return 1
    if n == 2:
        return 2
    if n >= 5:
        return 5
    return 3


def outcome_data_confidence(question_count: int) -> str:
    if question_count < T.DEVELOPMENT_OUTCOME_DATA_MIN:
        return 'insufficient'
    if question_count <= T.DEVELOPMENT_OUTCOME_DATA_LOW:
        return 'low'
    if question_count <= T.DEVELOPMENT_OUTCOME_DATA_MID:
        return 'medium'
    return 'high'


def performance_level(rate: float | None) -> str | None:
    if rate is None:
        return None
    if rate >= T.DEVELOPMENT_LEVEL_VERY_HIGH:
        return 'very_high'
    if rate >= T.DEVELOPMENT_LEVEL_HIGH:
        return 'high'
    if rate >= T.DEVELOPMENT_LEVEL_MID:
        return 'medium'
    if rate >= T.DEVELOPMENT_LEVEL_DEVELOP:
        return 'needs_work'
    return 'low'


def slope_label(slope: float | None) -> str | None:
    if slope is None:
        return None
    if slope >= T.DEVELOPMENT_SLOPE_STRONG:
        return 'strong_up'
    if slope >= T.DEVELOPMENT_SLOPE_UP:
        return 'up'
    if slope > -T.DEVELOPMENT_SLOPE_UP and slope <= T.DEVELOPMENT_SLOPE_NEUTRAL:
        return 'neutral'
    if slope > T.DEVELOPMENT_SLOPE_STRONG_DOWN:
        return 'down'
    return 'strong_down'


def change_label(value: float | None) -> str | None:
    if value is None:
        return None
    if value >= T.DEVELOPMENT_AB_STRONG:
        return 'strong_up'
    if value >= T.DEVELOPMENT_AB_UP:
        return 'up'
    if value > T.DEVELOPMENT_AB_DOWN and value <= T.DEVELOPMENT_AB_NEUTRAL:
        return 'neutral'
    if value > T.DEVELOPMENT_AB_STRONG_DOWN:
        return 'down'
    return 'strong_down'


def outcome_change_label(value: float | None) -> str | None:
    if value is None:
        return None
    if value >= T.DEVELOPMENT_OUTCOME_CHANGE_STRONG:
        return 'strong_up'
    if value >= T.DEVELOPMENT_OUTCOME_CHANGE_UP:
        return 'up'
    if value > T.DEVELOPMENT_OUTCOME_CHANGE_DOWN and value <= T.DEVELOPMENT_OUTCOME_CHANGE_NEUTRAL:
        return 'neutral'
    if value > T.DEVELOPMENT_OUTCOME_CHANGE_STRONG_DOWN:
        return 'down'
    return 'strong_down'


def volatility_label(value: float | None) -> str | None:
    if value is None:
        return None
    if value < T.DEVELOPMENT_VOLATILITY_LOW:
        return 'low'
    if value < T.DEVELOPMENT_VOLATILITY_MID:
        return 'medium'
    return 'high'


def subject_status(n: int, a, b, c, volatility) -> tuple[str, bool]:
    is_volatile = volatility is not None and volatility >= T.DEVELOPMENT_VOLATILITY_FLAG
    if n < 2:
        return 'insufficient_data', is_volatile
    if n == 2:
        if a is not None and a >= T.DEVELOPMENT_AB_UP:
            return 'improving', is_volatile
        if a is not None and a <= T.DEVELOPMENT_AB_DOWN:
            return 'declining', is_volatile
        return 'stable', is_volatile

    pos = 0
    neg = 0
    if a is not None and a >= T.DEVELOPMENT_AB_UP:
        pos += 1
    if b is not None and b >= T.DEVELOPMENT_AB_UP:
        pos += 1
    if c is not None and c >= T.DEVELOPMENT_SLOPE_UP:
        pos += 1
    if a is not None and a <= T.DEVELOPMENT_AB_DOWN:
        neg += 1
    if b is not None and b <= T.DEVELOPMENT_AB_DOWN:
        neg += 1
    if c is not None and c <= T.DEVELOPMENT_SLOPE_DOWN:
        neg += 1

    status = 'stable'
    if pos >= 2:
        status = 'improving'
    elif neg >= 2:
        status = 'declining'

    if not is_volatile:
        strong_up = (
            a is not None and a >= T.DEVELOPMENT_AB_STRONG
            and b is not None and b >= T.DEVELOPMENT_PERIOD_STRONG
            and c is not None and c >= T.DEVELOPMENT_SLOPE_STRONG
        )
        strong_down = (
            a is not None and a <= T.DEVELOPMENT_AB_STRONG_DOWN
            and b is not None and b <= -T.DEVELOPMENT_PERIOD_STRONG
            and c is not None and c <= T.DEVELOPMENT_SLOPE_STRONG_DOWN
        )
        if strong_up:
            status = 'strongly_improving'
        elif strong_down:
            status = 'strongly_declining'
    return status, is_volatile


def bucket_low_performance(mastery: float | None) -> float:
    if mastery is None:
        return 0.0
    if mastery >= 80:
        return 0.0
    if mastery >= 70:
        return 20.0
    if mastery >= 60:
        return 40.0
    if mastery >= 50:
        return 70.0
    return 100.0


def bucket_decline(change: float | None) -> float:
    if change is None:
        return 0.0
    if change >= 5:
        return 0.0
    if change >= 0:
        return 10.0
    if change > -7:
        return 40.0
    if change > -15:
        return 70.0
    return 100.0


def bucket_recent_weakness(mastery: float | None) -> float:
    return bucket_low_performance(mastery)


def bucket_persistence(masteries: list[float]) -> float:
    if not masteries:
        return 0.0
    recent = masteries[-3:]
    low = sum(1 for rate in recent if rate < T.DEVELOPMENT_PERSIST_LOW)
    n = len(recent)
    if n == 0:
        return 0.0
    if n >= 3:
        return {3: 100.0, 2: 70.0, 1: 30.0, 0: 0.0}[low]
    if n == 2:
        return {2: 100.0, 1: 70.0, 0: 0.0}[low]
    return 100.0 if low else 0.0


def priority_level(score: float) -> str:
    if score >= T.DEVELOPMENT_PRIORITY_CRITICAL:
        return 'critical'
    if score >= T.DEVELOPMENT_PRIORITY_HIGH:
        return 'high'
    if score >= T.DEVELOPMENT_PRIORITY_MID:
        return 'medium'
    return 'low'


_LEAF_TO_PARENT = {
    'fizik': 'fen',
    'kimya': 'fen',
    'biyoloji': 'fen',
    'tarih': 'sosyal',
    'cografya': 'sosyal',
    'felsefe': 'sosyal',
    'dkab': 'sosyal',
    'felsefesecmeli': 'sosyal',
    'matematik': 'temelmatematik',
    'geometri': 'temelmatematik',
}


def _section_key(name: str) -> str:
    from ..views.analysis_views import _section_name_key
    return _section_name_key(name)


def _main_matches_parent(main_name: str, needle: str) -> bool:
    key = _section_key(main_name)
    return key == needle or needle in key.replace(' ', '')


def _is_secmeli_track(name: str) -> bool:
    return _section_key(name) == 'felsefesecmeli'


def _secmeli_allowed(alan: str | None) -> bool:
    from ..views.analysis_views import _normalize_alan_kodu
    return _normalize_alan_kodu(alan) == 'SOZEL'


def scoring_scores_by_name(answer, exam) -> dict:
    """Yaprak dersleri kullan; Fen/Sosyal/Mat üst başlığını çocuk varsa düşür."""
    scores = [
        ss for ss in answer.section_scores.all()
        if (ss.section.question_count or 0) > 0
    ]
    mains = [ss for ss in scores if not ss.section.is_sub_section]
    subs = [ss for ss in scores if ss.section.is_sub_section]
    parent_ids = {
        ss.section.parent_section_id
        for ss in subs
        if ss.section.parent_section_id
    }
    for ss in subs:
        if ss.section.parent_section_id:
            continue
        needle = _LEAF_TO_PARENT.get(_section_key(ss.section.name))
        if not needle:
            continue
        for main in mains:
            if _main_matches_parent(main.section.name, needle):
                parent_ids.add(main.section.id)
                break
    result = {}
    for ss in mains:
        if ss.section.id in parent_ids:
            continue
        result[ss.section.name] = ss
    for ss in subs:
        result[ss.section.name] = ss
    return result


def subject_narrative(name: str, status: str, n: int, is_volatile: bool) -> str:
    if n < 2 or status == 'insufficient_data':
        return INSUFFICIENT
    if status == 'strongly_improving' and n >= 3:
        return f'{name} güçlü yükseliş gösteriyor.'
    if status == 'strongly_declining' and n >= 3:
        return f'{name} güçlü gerileme gösteriyor.'
    if status == 'improving':
        return f'{name} yükseliyor.'
    if status == 'declining':
        return f'{name} geriliyor.'
    if is_volatile:
        return f'{name} dalgalı bir seyir izliyor.'
    return f'{name} istikrarlı.'


def outcome_narrative(name: str, status: str, q: int, period_status: str | None) -> str:
    if q < T.DEVELOPMENT_OUTCOME_DATA_MIN:
        return INSUFFICIENT
    if period_status == 'yeni_olculdu':
        return f'{name} yeni ölçüldü.'
    if period_status == 'insufficient_data' or status == 'insufficient_data':
        return INSUFFICIENT
    if status == 'strongly_improving':
        return f'{name} güçlü yükseliş gösteriyor.'
    if status == 'strongly_declining':
        return f'{name} güçlü gerileme gösteriyor.'
    if status == 'improving':
        return f'{name} yükseliyor.'
    if status == 'declining':
        return f'{name} geriliyor.'
    return f'{name} istikrarlı.'


def empty_payload(student_name: str, filters: dict) -> dict:
    return {
        'student_name': student_name,
        'filters': filters,
        'exam_count': 0,
        'exams': [],
        'summary': {
            'improving': 0,
            'stable': 0,
            'declining': 0,
            'insufficient': 0,
            'top_improving': None,
            'top_declining': None,
            'most_stable': None,
            'most_volatile': None,
            'narratives': [INSUFFICIENT],
        },
        'subjects': [],
        'priorities': [],
    }


def _select_answers(ogrenci, exam_type_group, window, exam_ids, date_from, date_to):
    from ..models import StudentAnswer

    answers = list(
        StudentAnswer.objects
        .filter(student=ogrenci, session__status='COMPLETED')
        .select_related('session__exam')
        .prefetch_related('section_scores__section')
        .order_by('session__exam__exam_date', 'session__exam__created_at', 'id')
    )
    latest_group = None
    if answers:
        latest = answers[-1].session.exam
        latest_group = group_for_exam_type(latest.exam_type)

    group = exam_type_group or latest_group
    allowed_types = types_for_group(group) if group else None
    if allowed_types:
        answers = [a for a in answers if a.session.exam.exam_type in allowed_types]

    by_exam = {}
    for answer in answers:
        exam = answer.session.exam
        prev = by_exam.get(exam.id)
        if prev is None or answer.created_at >= prev.created_at:
            by_exam[exam.id] = answer
    selected = list(by_exam.values())
    selected.sort(key=lambda a: (
        a.session.exam.exam_date or date.min,
        a.session.exam.created_at,
        a.session.exam.id,
    ))

    if date_from:
        selected = [
            a for a in selected
            if a.session.exam.exam_date and a.session.exam.exam_date >= date_from
        ]
    if date_to:
        selected = [
            a for a in selected
            if a.session.exam.exam_date and a.session.exam.exam_date <= date_to
        ]

    if exam_ids:
        wanted = set(exam_ids)
        selected = [a for a in selected if a.session.exam_id in wanted]
    elif window != 'all':
        selected = selected[-int(window):]

    filters = {
        'exam_type_group': group,
        'exam_types': list(allowed_types) if allowed_types else [],
        'window': 'custom' if exam_ids else window,
        'exam_ids': exam_ids,
        'date_from': date_from.isoformat() if date_from else None,
        'date_to': date_to.isoformat() if date_to else None,
    }
    return selected, filters


def _build_exam_summaries(answers) -> list[dict]:
    exams = []
    for answer in answers:
        exam = answer.session.exam
        exams.append({
            'exam_id': exam.id,
            'name': exam.name,
            'date': str(exam.exam_date) if exam.exam_date else None,
            'exam_type': exam.exam_type,
            'booklet': answer.booklet or '',
        })
    return exams


def _collect_subject_series(answers, alan: str | None = None) -> OrderedDict:
    series = OrderedDict()
    for answer in answers:
        exam = answer.session.exam
        by_name = scoring_scores_by_name(answer, exam)
        for name, ss in by_name.items():
            if not ayt_section_allowed(name, exam.exam_type, alan):
                continue
            if _is_secmeli_track(name) and not _secmeli_allowed(alan):
                continue
            q = ss.section.question_count or 0
            if q <= 0:
                continue
            net = _safe_float(ss.net)
            rate = (net / q) * 100
            series.setdefault(name, []).append({
                'exam_id': exam.id,
                'exam_name': exam.name,
                'exam_date': str(exam.exam_date) if exam.exam_date else None,
                'net': _r(net),
                'correct': ss.correct,
                'wrong': ss.wrong,
                'empty': ss.empty,
                'question_count': q,
                'performance_rate': _r(rate),
                '_rate': rate,
                '_net': net,
            })
    return series


def _collect_outcome_series(answers, alan: str | None = None) -> OrderedDict:
    series = OrderedDict()
    exam_index = {answer.session.exam_id: i for i, answer in enumerate(answers)}
    for answer in answers:
        exam = answer.session.exam
        blocks = build_topic_blocks(exam, answer.comparison or {}, answer.booklet or '')
        for block in blocks:
            heading = block.get('heading') or ''
            for table in block.get('tables') or []:
                table_name = table.get('title') or heading
                subject = table_name
                if exam.exam_type == 'YKS_AYT':
                    if ayt_section_allowed(table_name, exam.exam_type, alan):
                        subject = table_name
                    elif ayt_section_allowed(heading, exam.exam_type, alan):
                        subject = heading
                    else:
                        continue
                if _is_secmeli_track(subject) and not _secmeli_allowed(alan):
                    continue
                topic_fallback = table_name or heading
                for row in table.get('rows') or []:
                    topic = (row.get('topic') or '').strip() or topic_fallback
                    outcome = (row.get('outcome') or '').strip() or (row.get('name') or '').strip()
                    if not outcome:
                        continue
                    q = int(row.get('soru') or 0)
                    if q <= 0:
                        continue
                    c = int(row.get('dogru') or 0)
                    w = int(row.get('yanlis') or 0)
                    b = int(row.get('bos') or 0)
                    mastery = (c / q) * 100
                    attempted = c + w
                    accuracy = (c / attempted) * 100 if attempted else None
                    key = (subject, topic, outcome)
                    series.setdefault(key, []).append({
                        'exam_id': exam.id,
                        'exam_name': exam.name,
                        'exam_date': str(exam.exam_date) if exam.exam_date else None,
                        'exam_index': exam_index[exam.id],
                        'question_count': q,
                        'correct': c,
                        'wrong': w,
                        'empty': b,
                        'mastery_rate': _r(mastery),
                        'accuracy_rate': _r(accuracy),
                        '_mastery': mastery,
                    })
    return series


def _outcome_period_change(points: list[dict], exam_count: int):
    if exam_count < 3 or not points:
        return None, None
    split = period_split(exam_count)
    if not split:
        return None, None
    prev_n, _recent_n = split
    previous = [p['_mastery'] for p in points if p['exam_index'] < prev_n]
    recent = [p['_mastery'] for p in points if p['exam_index'] >= prev_n]
    if previous and recent:
        return (sum(recent) / len(recent)) - (sum(previous) / len(previous)), None
    if recent and not previous:
        return None, 'yeni_olculdu'
    return None, 'insufficient_data'


def _analyze_subject(name: str, points: list[dict], outcome_groups: list[dict]) -> dict:
    rates = [p['_rate'] for p in points]
    nets = [p['_net'] for p in points]
    n = len(points)
    a = (rates[-1] - rates[0]) if n >= 2 else None
    b = period_change(rates)
    c = ols_slope(rates)
    volatility = sample_stdev(rates)
    status, is_volatile = subject_status(n, a, b, c, volatility)
    avg_rate = sum(rates) / n if n else None
    avg_net = sum(nets) / n if n else None

    public_series = []
    for p in points:
        public_series.append({k: v for k, v in p.items() if not k.startswith('_')})

    strong_areas = []
    growth_areas = []
    for item in outcome_groups:
        q = item['question_count']
        mastery = item['mastery_rate']
        conf = item['data_confidence']
        if (
            mastery is not None
            and mastery >= T.DEVELOPMENT_STRONG_AREA_MASTERY
            and q >= T.DEVELOPMENT_STRONG_AREA_MIN_Q
            and conf in ('medium', 'high')
        ):
            strong_areas.append({
                'name': item['name'],
                'topic': item['topic'],
                'mastery_rate': mastery,
                'question_count': q,
            })
        improving = item['development_status'] in ('improving', 'strongly_improving')
        if (
            mastery is not None
            and mastery < T.DEVELOPMENT_LEVEL_MID
            and q >= T.DEVELOPMENT_OUTCOME_DATA_MIN
            and not improving
        ):
            growth_areas.append({
                'name': item['name'],
                'topic': item['topic'],
                'mastery_rate': mastery,
                'question_count': q,
            })
    strong_areas.sort(key=lambda x: (-x['mastery_rate'], -x['question_count']))
    growth_areas.sort(key=lambda x: (x['mastery_rate'], -x['question_count']))

    topics_map = OrderedDict()
    for item in outcome_groups:
        topic_name = item['topic'] or item['name']
        bucket = topics_map.setdefault(topic_name, {
            'name': topic_name,
            'question_count': 0,
            'correct': 0,
            'wrong': 0,
            'empty': 0,
            'outcomes': [],
        })
        bucket['question_count'] += item['question_count']
        bucket['correct'] += item['correct']
        bucket['wrong'] += item['wrong']
        bucket['empty'] += item['empty']
        bucket['outcomes'].append({
            'name': item['name'],
            'question_count': item['question_count'],
            'correct': item['correct'],
            'wrong': item['wrong'],
            'empty': item['empty'],
            'mastery_rate': item['mastery_rate'],
            'accuracy_rate': item['accuracy_rate'],
            'development_status': item['development_status'],
            'data_confidence': item['data_confidence'],
        })
    topics = []
    for bucket in topics_map.values():
        q = bucket['question_count']
        bucket['mastery_rate'] = _r((bucket['correct'] / q) * 100) if q else None
        topics.append(bucket)

    return {
        'name': name,
        'exam_count': n,
        'average_net': _r(avg_net),
        'first_net': _r(nets[0]) if nets else None,
        'last_net': _r(nets[-1]) if nets else None,
        'net_change': _r(nets[-1] - nets[0]) if n >= 2 else None,
        'average_performance_rate': _r(avg_rate),
        'first_performance_rate': _r(rates[0]) if rates else None,
        'last_performance_rate': _r(rates[-1]) if rates else None,
        'performance_level': performance_level(avg_rate),
        'development_status': status,
        'is_volatile': is_volatile,
        'confidence': confidence_from_exam_count(n),
        'rates': {
            'first_last_change': _r(a),
            'first_last_label': change_label(a),
            'period_change': _r(b),
            'period_label': change_label(b),
            'slope': _r(c),
            'slope_label': slope_label(c),
            'volatility': _r(volatility),
            'volatility_label': volatility_label(volatility),
        },
        'series': public_series,
        'strong_areas': strong_areas[:3],
        'growth_areas': growth_areas[:3],
        'topics': topics,
        'outcomes': outcome_groups,
        'narrative': subject_narrative(name, status, n, is_volatile),
    }


def _analyze_outcome(key: tuple[str, str, str], points: list[dict], exam_count: int) -> dict:
    subject, topic, name = key
    q = sum(p['question_count'] for p in points)
    c = sum(p['correct'] for p in points)
    w = sum(p['wrong'] for p in points)
    b = sum(p['empty'] for p in points)
    mastery = (c / q) * 100 if q else None
    attempted = c + w
    accuracy = (c / attempted) * 100 if attempted else None
    masteries = [p['_mastery'] for p in points]
    n = len(points)
    a = (masteries[-1] - masteries[0]) if n >= 2 else None
    period, period_status = _outcome_period_change(points, exam_count)
    if period is None and a is not None and period_status is None and n >= 2 and exam_count < 3:
        period = None
    slope = ols_slope(masteries)
    if q < T.DEVELOPMENT_OUTCOME_DATA_MIN:
        status = 'insufficient_data'
        is_volatile = False
    elif period_status == 'yeni_olculdu':
        status = 'yeni_olculdu'
        is_volatile = False
    else:
        change_for_status = period if period is not None else a
        status, is_volatile = subject_status(n, a, change_for_status, slope, sample_stdev(masteries))
        if period_status == 'insufficient_data' and n < 2:
            status = 'insufficient_data'

    last_two = masteries[-2:] if masteries else []
    recent_mastery = (sum(last_two) / len(last_two)) if last_two else mastery
    decline_input = period if period is not None else a
    low_s = bucket_low_performance(mastery)
    dec_s = bucket_decline(decline_input)
    rec_s = bucket_recent_weakness(recent_mastery)
    per_s = bucket_persistence(masteries)
    priority_score = (
        low_s * T.DEVELOPMENT_PRIORITY_LOW_W
        + dec_s * T.DEVELOPMENT_PRIORITY_DECLINE_W
        + rec_s * T.DEVELOPMENT_PRIORITY_RECENT_W
        + per_s * T.DEVELOPMENT_PRIORITY_PERSIST_W
    ) if q >= T.DEVELOPMENT_OUTCOME_DATA_MIN else None

    public_series = []
    for p in points:
        public_series.append({k: v for k, v in p.items() if not k.startswith('_') and k != 'exam_index'})

    return {
        'name': name,
        'subject': subject,
        'topic': topic,
        'question_count': q,
        'correct': c,
        'wrong': w,
        'empty': b,
        'mastery_rate': _r(mastery),
        'accuracy_rate': _r(accuracy),
        'data_confidence': outcome_data_confidence(q),
        'development_status': status,
        'is_volatile': is_volatile,
        'period_change': _r(period),
        'period_status': period_status,
        'first_last_change': _r(a),
        'change_label': outcome_change_label(period if period is not None else a),
        'series': public_series,
        'narrative': outcome_narrative(name, status, q, period_status),
        'priority_components': {
            'low_performance': _r(low_s, 1) if priority_score is not None else None,
            'decline': _r(dec_s, 1) if priority_score is not None else None,
            'recent_weakness': _r(rec_s, 1) if priority_score is not None else None,
            'persistence': _r(per_s, 1) if priority_score is not None else None,
        } if priority_score is not None else None,
        'priority_score': _r(priority_score, 1) if priority_score is not None else None,
        'priority_level': priority_level(priority_score) if priority_score is not None else None,
    }


def _build_summary(subjects: list[dict]) -> dict:
    counts = {'improving': 0, 'stable': 0, 'declining': 0, 'insufficient': 0}
    top_improving = None
    top_declining = None
    most_stable = None
    most_volatile = None
    best_up = None
    best_down = None
    best_stable = None
    best_vol = None

    for sub in subjects:
        status = sub['development_status']
        if status in ('improving', 'strongly_improving'):
            counts['improving'] += 1
            change = sub['rates']['first_last_change']
            if change is not None and (best_up is None or change > best_up):
                best_up = change
                top_improving = sub['name']
        elif status in ('declining', 'strongly_declining'):
            counts['declining'] += 1
            change = sub['rates']['first_last_change']
            if change is not None and (best_down is None or change < best_down):
                best_down = change
                top_declining = sub['name']
        elif status == 'stable':
            counts['stable'] += 1
            vol = sub['rates']['volatility']
            if vol is not None and (best_stable is None or vol < best_stable):
                best_stable = vol
                most_stable = sub['name']
        else:
            counts['insufficient'] += 1
        vol = sub['rates']['volatility']
        if sub.get('is_volatile') and vol is not None and (best_vol is None or vol > best_vol):
            best_vol = vol
            most_volatile = sub['name']
        elif vol is not None and most_volatile is None and (best_vol is None or vol > best_vol):
            best_vol = vol
            most_volatile = sub['name']

    narratives = []
    if not subjects:
        narratives.append(INSUFFICIENT)
    else:
        if top_improving:
            narratives.append(f'{top_improving} en çok yükselen ders.')
        if top_declining:
            narratives.append(f'{top_declining} en çok gerileyen ders.')
        if most_volatile and any(s.get('is_volatile') for s in subjects):
            narratives.append(f'{most_volatile} en dalgalı ders.')
        if not narratives:
            if counts['insufficient'] == len(subjects):
                narratives.append(INSUFFICIENT)
            else:
                narratives.append('Seçilen pencerede dersler genel olarak istikrarlı.')

    return {
        'improving': counts['improving'],
        'stable': counts['stable'],
        'declining': counts['declining'],
        'insufficient': counts['insufficient'],
        'top_improving': top_improving,
        'top_declining': top_declining,
        'most_stable': most_stable,
        'most_volatile': most_volatile,
        'narratives': narratives,
    }


def build_development_analysis(
    ogrenci,
    *,
    exam_type=None,
    window=None,
    exam_ids=None,
    date_from=None,
    date_to=None,
) -> dict:
    group = resolve_exam_type_group(exam_type)
    win = parse_window(window)
    ids = parse_exam_ids(exam_ids)
    d_from = parse_date(date_from)
    d_to = parse_date(date_to)
    answers, filters = _select_answers(ogrenci, group, win, ids, d_from, d_to)
    student_name = f'{ogrenci.ad} {ogrenci.soyad}'.strip()
    if not answers:
        return empty_payload(student_name, filters)

    from ..views.analysis_views import _get_student_alan
    alan = _get_student_alan(ogrenci, answers[-1].session.exam.egitim_yili)
    filters['alan'] = alan

    exam_summaries = _build_exam_summaries(answers)
    subject_series = _collect_subject_series(answers, alan)
    outcome_series = _collect_outcome_series(answers, alan)

    outcomes_by_subject = defaultdict(list)
    priorities = []
    for key, points in outcome_series.items():
        analyzed = _analyze_outcome(key, points, len(answers))
        outcomes_by_subject[key[0]].append(analyzed)
        if analyzed['priority_score'] is not None:
            mastery = analyzed['mastery_rate']
            q = analyzed['question_count'] or 0
            correct = analyzed['correct'] or 0
            if mastery is not None and mastery >= T.DEVELOPMENT_PRIORITY_MASTERED:
                continue
            if q and correct >= q:
                continue
            priorities.append({
                'outcome': analyzed['name'],
                'subject': analyzed['subject'],
                'topic': analyzed['topic'],
                'priority_score': analyzed['priority_score'],
                'priority_level': analyzed['priority_level'],
                'mastery_rate': analyzed['mastery_rate'],
                'question_count': analyzed['question_count'],
                'correct': analyzed['correct'],
                'exam_count': len(analyzed['series']),
                'development_status': analyzed['development_status'],
                'narrative': analyzed['narrative'],
            })
    priorities.sort(key=lambda x: (-x['priority_score'], x['mastery_rate'] or 0, x['outcome']))
    priorities = priorities[:T.DEVELOPMENT_PRIORITY_LIMIT]

    subjects = []
    for name, points in subject_series.items():
        subjects.append(_analyze_subject(name, points, outcomes_by_subject.get(name, [])))

    return {
        'student_name': student_name,
        'filters': filters,
        'exam_count': len(answers),
        'exams': exam_summaries,
        'summary': _build_summary(subjects),
        'subjects': subjects,
        'priorities': priorities,
    }
