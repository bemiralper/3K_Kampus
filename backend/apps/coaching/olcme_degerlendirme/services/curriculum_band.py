"""YKS (9–12) ve LGS (5–8) müfredat bantları — ders/kazanım karışmasın."""
from __future__ import annotations

import re

from django.db.models import Prefetch

BAND_YKS = 'YKS'
BAND_LGS = 'LGS'
CURRICULUM_BANDS = (BAND_YKS, BAND_LGS)

YKS_EXAM_TYPES = frozenset({'YKS_TYT', 'YKS_AYT', 'DENEME'})
LGS_EXAM_TYPES = frozenset({'LGS'})
LOCKED_BAND_TYPES = YKS_EXAM_TYPES | LGS_EXAM_TYPES

YKS_GRADES = frozenset({9, 10, 11, 12})
LGS_GRADES = frozenset({5, 6, 7, 8})

_GRADE_RE = re.compile(r'(?<!\d)(5|6|7|8|9|10|11|12)(?!\d)')


def band_for_exam_type(exam_type: str | None) -> str:
    if exam_type in LGS_EXAM_TYPES:
        return BAND_LGS
    return BAND_YKS


def band_is_locked(exam_type: str | None) -> bool:
    return exam_type in LOCKED_BAND_TYPES


def normalize_band(raw, exam_type: str | None = None) -> str:
    if band_is_locked(exam_type):
        return band_for_exam_type(exam_type)
    value = (raw or '').strip().upper()
    if value in CURRICULUM_BANDS:
        return value
    return band_for_exam_type(exam_type)


def resolved_band(exam) -> str:
    return normalize_band(getattr(exam, 'curriculum_band', None), exam.exam_type)


def grades_from_text(*texts: str) -> set[int]:
    found: set[int] = set()
    for text in texts:
        if not text:
            continue
        for match in _GRADE_RE.finditer(text):
            found.add(int(match.group(1)))
    return found


def _subject_grades(subject) -> set[int]:
    found: set[int] = set()
    topics = list(subject.topics.all()) if hasattr(subject, 'topics') else []
    for topic in topics:
        found.update(grades_from_text(topic.code or '', topic.name or ''))
        outcomes = list(topic.outcomes.all()) if hasattr(topic, 'outcomes') else []
        for outcome in outcomes:
            found.update(grades_from_text(outcome.code or ''))
    return found


def subject_band(subject) -> str | None:
    filt = getattr(subject, 'exam_type_filter', None) or 'ALL'
    if filt == 'LGS':
        return BAND_LGS
    if filt in ('YKS_TYT', 'YKS_AYT'):
        return BAND_YKS
    grades = _subject_grades(subject)
    has_yks = bool(grades & YKS_GRADES)
    has_lgs = bool(grades & LGS_GRADES)
    if has_yks and not has_lgs:
        return BAND_YKS
    if has_lgs and not has_yks:
        return BAND_LGS
    return None


def subject_matches_band(subject, band: str) -> bool:
    owned = subject_band(subject)
    return owned is None or owned == band


def topic_matches_band(topic, band: str) -> bool:
    texts = [topic.code or '', topic.name or '']
    outcomes = list(topic.outcomes.all()) if hasattr(topic, 'outcomes') else []
    for outcome in outcomes:
        texts.append(outcome.code or '')
    grades = grades_from_text(*texts)
    if not grades:
        return True
    allowed = YKS_GRADES if band == BAND_YKS else LGS_GRADES
    return bool(grades & allowed)


def subjects_for_band(band: str):
    from ..models.curriculum import Outcome, Subject, Topic

    return [
        subject
        for subject in (
            Subject.objects
            .prefetch_related(
                Prefetch('topics', queryset=Topic.objects.order_by('order')),
                Prefetch('topics__outcomes', queryset=Outcome.objects.filter(is_active=True)),
            )
            .order_by('order', 'name')
        )
        if subject_matches_band(subject, band)
    ]


def subject_allowed_for_exam(exam, subject) -> bool:
    return subject_matches_band(subject, resolved_band(exam))
