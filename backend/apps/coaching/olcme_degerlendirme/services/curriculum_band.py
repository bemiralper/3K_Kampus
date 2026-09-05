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

# Okulizyon birim kodları (SHG21 / 21.5.1) sınıf değildir; 21.5 içindeki 5
# LGS 5. sınıf sanılınca Geometri YKS sınavından düşüyordu.
_OKULIZYON_CODE_RE = re.compile(r'(?:SHG\s*)?21(?:\.\d+)+', re.I)
_SHG_TOKEN_RE = re.compile(r'\bSHG\s*(?:\(\s*)?(?:21|22)(?:\s*\))?', re.I)
_SINIF_RE = re.compile(r'(?<!\d)(5|6|7|8|9|10|11|12)\s*\.\s*s[ıi]n[ıi]f', re.I)
_PRIMARY_SINIF_RE = re.compile(r'(?<!\d)([1-4])\s*\.\s*s[ıi]n[ıi]f', re.I)
# MEB kodu: sınıf ilk parça (9.1.2, 12.3). 21.5.1 buraya düşmez.
_MEB_HEAD_RE = re.compile(r'(?<![0-9.])(5|6|7|8|9|10|11|12)(?:\.\d+)+')
_TOPIC_PREFIX_SPLIT = re.compile(r'\s*[·•|:]\s*')


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


def topic_display_name(name: str) -> str:
    """'SHG21 · SAYILAR' / '9. sınıf · KÜMELER' → asıl konu başlığı."""
    raw = (name or '').strip()
    parts = _TOPIC_PREFIX_SPLIT.split(raw, maxsplit=1)
    display = (parts[-1] if parts else raw).strip()
    return display or raw


def grades_from_text(*texts: str) -> set[int]:
    found: set[int] = set()
    for text in texts:
        if not text:
            continue
        for match in _SINIF_RE.finditer(text):
            found.add(int(match.group(1)))
        cleaned = _OKULIZYON_CODE_RE.sub(' ', text)
        cleaned = _SHG_TOKEN_RE.sub(' ', cleaned)
        for match in _MEB_HEAD_RE.finditer(cleaned):
            found.add(int(match.group(1)))
    return found


def is_okulizyon_yks(*texts: str) -> bool:
    """SHG21 / 21.x Okulizyon birimleri TYT-AYT müfredadıdır, LGS değil."""
    for text in texts:
        if text and (_OKULIZYON_CODE_RE.search(text) or _SHG_TOKEN_RE.search(text)):
            return True
    return False


def _topic_texts(topic) -> list[str]:
    texts = [topic.code or '', topic.name or '']
    outcomes = list(topic.outcomes.all()) if hasattr(topic, 'outcomes') else []
    for outcome in outcomes:
        texts.append(outcome.code or '')
    return texts


def _subject_signals(subject) -> tuple[set[int], bool]:
    grades: set[int] = set()
    has_yks_okulizyon = False
    topics = list(subject.topics.all()) if hasattr(subject, 'topics') else []
    for topic in topics:
        texts = _topic_texts(topic)
        grades.update(grades_from_text(*texts))
        if is_okulizyon_yks(*texts):
            has_yks_okulizyon = True
    return grades, has_yks_okulizyon


def subject_band(subject) -> str | None:
    filt = getattr(subject, 'exam_type_filter', None) or 'ALL'
    if filt == 'LGS':
        return BAND_LGS
    if filt in ('YKS_TYT', 'YKS_AYT'):
        return BAND_YKS
    grades, has_yks_okulizyon = _subject_signals(subject)
    has_yks = bool(grades & YKS_GRADES) or has_yks_okulizyon
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
    texts = _topic_texts(topic)
    if is_okulizyon_yks(*texts):
        return band == BAND_YKS
    grades = grades_from_text(*texts)
    if grades:
        allowed = YKS_GRADES if band == BAND_YKS else LGS_GRADES
        return bool(grades & allowed)
    if any(_PRIMARY_SINIF_RE.search(text or '') for text in texts):
        return False
    return True


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
