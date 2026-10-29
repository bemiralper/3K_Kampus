"""Günü birlik deneme listesi: tarihi gelmemiş ve sınıf seviyesine uygun sınavlar."""
from __future__ import annotations

import re

from django.utils import timezone

_GRADE_RE = re.compile(r'(?<!\d)(1[0-2]|[1-9])(?!\d)')

# Kitle (sınıf seviyesi) seçilmemiş sınavlar türden eşlenir.
# 11. sınıf genel TYT/AYT listesine düşmez; kurum isterse kitleye 11'i yazar.
_GRADE_TYPES = {
    12: frozenset({'YKS_TYT', 'YKS_AYT', 'DENEME'}),
    11: frozenset({'TYT_11', 'AYT_11'}),
    10: frozenset({'YKS_TYT', 'DENEME'}),
    9: frozenset({'YKS_TYT', 'DENEME'}),
    8: frozenset({'LGS'}),
    7: frozenset({'LGS_7'}),
    6: frozenset({'LGS'}),
    5: frozenset({'LGS'}),
}
_GENERIC_TYPES = frozenset({'KURUM_ICI', 'KONU_TARAMA', 'KAZANIM', 'OZEL'})


def grade_of_seviye(seviye) -> int | None:
    if seviye is None:
        return None
    kod = str(getattr(seviye, 'kod', '') or '').strip()
    ad = str(getattr(seviye, 'ad', '') or '').strip()
    blob = f'{kod} {ad}'.lower()
    if 'mezun' in blob:
        return 12
    if kod.isdigit():
        number = int(kod)
        if 1 <= number <= 12:
            return number
    match = _GRADE_RE.search(ad)
    if match:
        return int(match.group(1))
    return None


def target_seviye_ids(exam) -> set[int]:
    """Sınavın açıkça seçtiği sınıf seviyeleri. Boşsa tür eşlemesi kullanılır."""
    ids: set[int] = set()
    for audience in exam.audiences.all():
        if audience.sinif_seviyesi_id:
            ids.add(audience.sinif_seviyesi_id)
        paket = audience.deneme_paketi
        if paket is not None:
            ids.update(item.id for item in paket.sinif_seviyeleri.all())
    if getattr(exam, 'deneme_paketi_id', None) and exam.deneme_paketi is not None:
        ids.update(item.id for item in exam.deneme_paketi.sinif_seviyeleri.all())
    ids.update(
        sinif.sinif_seviyesi_id
        for sinif in exam.siniflar.all()
        if sinif.sinif_seviyesi_id
    )
    return ids


def _type_matches(exam, grade: int | None) -> bool:
    if grade is None:
        return False
    exam_type = exam.exam_type or ''
    if exam_type in _GRADE_TYPES.get(grade, frozenset()):
        return True
    if exam_type not in _GENERIC_TYPES:
        return False
    from apps.coaching.olcme_degerlendirme.services.curriculum_band import (
        BAND_LGS,
        BAND_YKS,
        LGS_GRADES,
        YKS_GRADES,
        resolved_band,
    )

    band = resolved_band(exam)
    if grade in YKS_GRADES and band == BAND_YKS:
        return True
    if grade in LGS_GRADES and band == BAND_LGS:
        return True
    return False


class ExamLevelGate:
    def __init__(self, exam):
        self.exam = exam
        self.targets = target_seviye_ids(exam)

    def matches(self, seviye) -> bool:
        if seviye is None:
            return False
        if self.targets:
            return seviye.id in self.targets
        return _type_matches(self.exam, grade_of_seviye(seviye))


def exam_matches_seviye(exam, seviye) -> bool:
    return ExamLevelGate(exam).matches(seviye)


def upcoming_sessions(exam, today=None, sessions=None):
    """Tarihi geçmiş oturumlar seçilemez. Tarihsiz oturum, sınav açıksa kalır."""
    today = today or timezone.localdate()
    if sessions is None:
        sessions = list(exam.exam_sessions.order_by('order', 'id'))
    else:
        sessions = list(sessions)
    if not any(session.session_date for session in sessions):
        return sessions
    return [
        session for session in sessions
        if session.session_date is None or session.session_date >= today
    ]


def exam_is_open(exam, today=None) -> bool:
    """Seçilebilir oturum varsa kayıt açıktır.

    İlk oturum (ve ondan türeyen exam_date) geçmiş olsa bile sonraki oturum
    bugün veya sonrasıysa sınav listede kalır. Oturum yoksa exam_date esas alınır.
    """
    today = today or timezone.localdate()
    sessions = list(exam.exam_sessions.all())
    if sessions:
        return bool(upcoming_sessions(exam, today=today, sessions=sessions))
    return bool(exam.exam_date and exam.exam_date >= today)


def exam_date_error(exam, today=None) -> str:
    if exam_is_open(exam, today):
        return ''
    return 'Tarihi geçmiş denemeye kayıt yapılamaz.'


def exam_registration_error(exam, seviye, today=None) -> str:
    date_error = exam_date_error(exam, today)
    if date_error:
        return date_error
    if seviye is None:
        return 'Sınıf seviyesi bulunamadı.'
    if not exam_matches_seviye(exam, seviye):
        return 'Bu deneme seçilen sınıf seviyesine uygun değil.'
    return ''
