"""Öğretmenin kendi dersine ait sınav netleri. Puan, sıra ve diğer dersler yok."""
from __future__ import annotations

from django.db.models import Q

from apps.egitim_tanimlari.display import resolve_ders_display_name
from apps.ozel_ders.domain.models import BirebirHaftalikSlot, ProgramDurumu

from .services import MobileAuthError
from .teacher_read import _load_term, _placement_rows, _term_id

_GROUP_ORDER = (
    'YKS_TYT',
    'YKS_AYT',
    'AYT_11',
    'LGS',
    'LGS_7',
    'DENEME',
    'KURUM_ICI',
    'KONU_TARAMA',
    'KAZANIM',
    'OZEL',
)
_GROUP_LABEL = {
    'YKS_TYT': 'TYT',
    'YKS_AYT': 'AYT',
    'AYT_11': '11. Sınıf AYT',
    'LGS': 'LGS',
    'LGS_7': 'LGS 7',
    'DENEME': 'Deneme',
    'KURUM_ICI': 'Kurum sınavı',
    'KONU_TARAMA': 'Konu tarama',
    'KAZANIM': 'Kazanım',
    'OZEL': 'Özel sınav',
}
_PUBLISHED = ('RESULTS_UPLOADED', 'COMPLETED')
_EXAM_LIMIT = 12
_TOPIC_LIMIT = 6
_FAMILY = {
    'temelmatematik': {'matematik', 'geometri', 'temelmatematik'},
    'matematik': {'matematik', 'geometri', 'temelmatematik'},
    'geometri': {'geometri'},
    'fen': {'fen', 'fizik', 'kimya', 'biyoloji'},
    'fizik': {'fizik'},
    'kimya': {'kimya'},
    'biyoloji': {'biyoloji'},
    'turkce': {'turkce'},
    'edebiyat': {'edebiyat', 'turkdili'},
    'turkdili': {'edebiyat', 'turkdili'},
    'tarih': {'tarih', 'tarih1', 'tarih2'},
    'cografya': {'cografya', 'cografya1', 'cografya2'},
    'felsefe': {'felsefe', 'felsefegrubu', 'felsefesecmeli'},
    'din': {'dkab'},
    'sosyal': {'sosyal', 'tarih', 'tarih1', 'tarih2', 'cografya', 'cografya1', 'cografya2', 'felsefe', 'felsefegrubu', 'dkab'},
    'ingilizce': {'ingilizce'},
}


def _stem(name: str) -> str:
    from apps.coaching.olcme_degerlendirme.views.analysis_views import _section_name_key

    compact = _section_name_key(name or '')
    stem = ''.join(ch for ch in compact if not ch.isdigit())
    for token in ('tyt', 'ayt', 'lgs'):
        stem = stem.replace(token, '')
    return stem


def _lesson_keys(name: str) -> set[str]:
    stem = _stem(name)
    if len(stem) < 3:
        return set()
    exact = [
        (family, members)
        for family, members in _FAMILY.items()
        if stem == family or stem.startswith(family)
    ]
    if exact:
        longest = max(len(family) for family, _members in exact)
        keys: set[str] = set()
        for family, members in exact:
            if len(family) == longest:
                keys |= members
        return keys
    short = [
        (family, members)
        for family, members in _FAMILY.items()
        if family.startswith(stem)
    ]
    if short:
        longest = max(len(family) for family, _members in short)
        keys = set()
        for family, members in short:
            if len(family) == longest:
                keys |= members
        return keys
    return {stem}


def _keys_for(names: list[str]) -> set[str]:
    keys: set[str] = set()
    for name in names:
        keys |= _lesson_keys(name)
    return keys


def _section_matches(section, keys: set[str]) -> bool:
    from apps.coaching.olcme_degerlendirme.views.analysis_views import _section_name_key

    values = [section.name or '']
    subject = getattr(section, 'subject', None)
    if subject is not None:
        values.extend([subject.name or '', subject.display_name or '', subject.code or ''])
    for value in values:
        if not value:
            continue
        if _stem(value) in keys or _section_name_key(value) in keys:
            return True
    return False


def _num(value) -> float:
    return round(float(value), 2)


def _lesson_names(scope, term_id: int, student_id: int) -> tuple[object | None, list[str]]:
    student = None
    names: list[str] = []
    for placement, plan in _placement_rows(scope, term_id, None, None, ''):
        if placement.student_id != student_id:
            continue
        student = placement.student
        label = resolve_ders_display_name(ders=plan.ders, plan=plan)
        if label and label not in names:
            names.append(label)
    context = scope['context']
    slots = (
        BirebirHaftalikSlot.objects.filter(
            aktif=True,
            ogretmen_id=scope['personel'].id,
            program__ogrenci_id=student_id,
            program__durum=ProgramDurumu.AKTIF,
            program__kurum_id=context['kurum_id'],
            program__sube_id=context['sube_id'],
            program__egitim_yili_id=context['egitim_yili_id'],
        )
        .filter(Q(program__term_id=term_id) | Q(program__term_id__isnull=True))
        .select_related('program__ogrenci', 'ders')
    )
    for slot in slots:
        student = slot.program.ogrenci
        label = resolve_ders_display_name(ders=slot.ders)
        if label and label not in names:
            names.append(label)
    return student, names


def _companion_topic_row(exam, title: str, row: dict, keys: set[str]) -> bool:
    """11. sınıf matematiğinin içindeki geometri kazanımı, geometri öğretmenine görünür."""
    if getattr(exam, 'exam_type', '') != 'AYT_11':
        return False
    if _stem(title) != 'matematik':
        return False
    if 'geometri' not in keys or 'matematik' in keys:
        return False
    return (row.get('subject_code') or '').upper() == 'GEOMETRI'


def _companion_exam_stats(answer, keys: set[str]) -> dict | None:
    """Geometri öğretmeni 30 soruluk matematik netini değil, geometri kazanımlarının netini görür."""
    if 'geometri' not in keys or 'matematik' in keys:
        return None
    exam = answer.session.exam
    if exam.exam_type != 'AYT_11':
        return None
    from apps.coaching.olcme_degerlendirme.services.topic_blocks import build_topic_blocks

    correct = wrong = empty = questions = 0
    blocks = build_topic_blocks(exam, answer.comparison or {}, answer.booklet or '')
    for block in blocks:
        heading = block.get('heading') or ''
        for table in block.get('tables') or []:
            title = table.get('title') or heading
            for row in table.get('rows') or []:
                if not _companion_topic_row(exam, title, row, keys):
                    continue
                correct += int(row.get('dogru') or 0)
                wrong += int(row.get('yanlis') or 0)
                empty += int(row.get('bos') or 0)
                questions += int(row.get('soru') or 0)
    if questions <= 0:
        return None
    return {
        'net': _num(correct - wrong / 4),
        'correct': correct,
        'wrong': wrong,
        'empty': empty,
        'question_count': questions,
    }


def _topics(answer, keys: set[str]) -> list[dict]:
    from apps.coaching.olcme_degerlendirme.services.topic_blocks import build_topic_blocks

    exam = answer.session.exam
    blocks = build_topic_blocks(exam, answer.comparison or {}, answer.booklet or '')
    rows = []
    for block in blocks:
        heading = block.get('heading') or ''
        for table in block.get('tables') or []:
            title = table.get('title') or heading
            title_ok = _stem(title) in keys or _stem(heading) in keys
            for row in table.get('rows') or []:
                if not title_ok and not _companion_topic_row(exam, title, row, keys):
                    continue
                question_count = int(row.get('soru') or 0)
                if question_count <= 0:
                    continue
                name = (row.get('topic') or row.get('outcome') or row.get('name') or '').strip()
                if not name:
                    continue
                correct = int(row.get('dogru') or 0)
                rows.append({
                    'name': name,
                    'mastery': round(correct / question_count * 100, 1),
                    'correct': correct,
                    'question_count': question_count,
                })
    rows.sort(key=lambda item: (item['mastery'], -item['question_count'], item['name']))
    return rows[:_TOPIC_LIMIT]


def _owned_answers(student, scope):
    from apps.coaching.olcme_degerlendirme.models import StudentAnswer

    context = scope['context']
    return (
        StudentAnswer.objects.filter(
            student=student,
            session__status='COMPLETED',
            session__exam__is_active=True,
            session__exam__is_template=False,
            session__exam__status__in=_PUBLISHED,
        )
        .filter(
            Q(session__exam__kurum_id__isnull=True) | Q(session__exam__kurum_id=context['kurum_id'])
        )
        .filter(
            Q(session__exam__sube_id__isnull=True) | Q(session__exam__sube_id=context['sube_id'])
        )
        .filter(
            Q(session__exam__egitim_yili_id__isnull=True)
            | Q(session__exam__egitim_yili_id=context['egitim_yili_id'])
        )
        .select_related('session__exam__egitim_yili')
        .prefetch_related('section_scores__section__subject')
        .order_by('session__exam__exam_date', 'session__exam__created_at', 'id')
    )


def student_exams(request, scope, student_id: int) -> dict:
    if student_id < 1:
        raise MobileAuthError('not_found', 'Öğrenci bulunamadı.', 404)
    term = _load_term(scope, _term_id(request))
    student, names = _lesson_names(scope, term.id, student_id)
    if student is None:
        raise MobileAuthError('not_found', 'Öğrenci bulunamadı.', 404)
    keys = _keys_for(names)
    if not keys:
        return {'ders': ' · '.join(names), 'groups': []}

    from apps.coaching.olcme_degerlendirme.services.development_analysis import (
        ayt_section_allowed,
        scoring_scores_by_name,
    )
    from apps.coaching.olcme_degerlendirme.views.analysis_views import _get_student_alan

    latest = {}
    for answer in _owned_answers(student, scope):
        previous = latest.get(answer.session.exam_id)
        if previous is None or answer.created_at >= previous.created_at:
            latest[answer.session.exam_id] = answer
    ordered = sorted(
        latest.values(),
        key=lambda answer: (
            answer.session.exam.exam_date or answer.session.exam.created_at.date(),
            answer.session.exam.id,
        ),
    )
    alan_by_year = {}
    buckets: dict[str, list] = {}
    for answer in ordered:
        exam = answer.session.exam
        year_id = exam.egitim_yili_id
        if year_id not in alan_by_year:
            alan_by_year[year_id] = _get_student_alan(student, exam.egitim_yili) if year_id else None
        matched = []
        for score in scoring_scores_by_name(answer, exam).values():
            if not ayt_section_allowed(score.section.name, exam.exam_type, alan_by_year[year_id]):
                continue
            if not _section_matches(score.section, keys):
                continue
            matched.append(score)
        if matched:
            buckets.setdefault(exam.exam_type, []).append((answer, matched))
            continue
        stats = _companion_exam_stats(answer, keys)
        if stats:
            buckets.setdefault(exam.exam_type, []).append((answer, stats))

    groups = []
    for code, rows in buckets.items():
        rows = rows[-_EXAM_LIMIT:]
        exams = []
        previous_net = None
        for answer, scores in rows:
            exam = answer.session.exam
            if isinstance(scores, dict):
                net = scores['net']
                correct = scores['correct']
                wrong = scores['wrong']
                empty = scores['empty']
                question_count = scores['question_count']
            else:
                net = _num(sum(float(score.net or 0) for score in scores))
                correct = sum(int(score.correct or 0) for score in scores)
                wrong = sum(int(score.wrong or 0) for score in scores)
                empty = sum(int(score.empty or 0) for score in scores)
                question_count = sum(int(score.section.question_count or 0) for score in scores)
            delta = None if previous_net is None else _num(net - previous_net)
            exams.append({
                'id': exam.id,
                'name': exam.name,
                'date': exam.exam_date.isoformat() if exam.exam_date else None,
                'net': net,
                'delta': delta,
                'correct': correct,
                'wrong': wrong,
                'empty': empty,
                'question_count': question_count,
            })
            previous_net = net
        last = exams[-1]
        groups.append({
            'code': code,
            'label': _GROUP_LABEL.get(code, code),
            'last_net': last['net'],
            'average_net': _num(sum(item['net'] for item in exams) / len(exams)),
            'delta': last['delta'],
            'exams': exams,
            'topics': _topics(rows[-1][0], keys),
        })
    groups.sort(key=lambda group: _GROUP_ORDER.index(group['code']) if group['code'] in _GROUP_ORDER else len(_GROUP_ORDER))
    return {'ders': ' · '.join(names), 'groups': groups}
