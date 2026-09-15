"""Aktif eğitim dönemi — şube + aktif eğitim yılı kapsamında."""

from __future__ import annotations

from apps.academic.services.active_academic_year import (
    ActiveAcademicYearError,
    get_active_academic_year,
)
from apps.term.domain.models import Term


class ActiveTermError(Exception):
    pass


def get_active_term(*, kurum_id: int, sube_id: int) -> Term:
    """
    Aktif dönemi döndürür.

    Öncelik:
    1. is_active=True olan dönem (en son güncellenen)
    2. Aktif yıldaki ilk dönem (order_no)
    """
    try:
        active_year = get_active_academic_year()
    except ActiveAcademicYearError as exc:
        raise ActiveTermError(str(exc)) from exc

    active = (
        Term.objects
        .filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili=active_year,
            is_active=True,
        )
        .order_by('-updated_at', 'order_no', 'start_date')
        .first()
    )
    if active:
        return active

    fallback = (
        Term.objects
        .filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili=active_year,
        )
        .order_by('order_no', 'start_date')
        .first()
    )
    if not fallback:
        raise ActiveTermError('Bu şube için tanımlı eğitim dönemi bulunamadı.')
    return fallback


def get_active_term_or_none(*, kurum_id: int, sube_id: int) -> Term | None:
    try:
        return get_active_term(kurum_id=kurum_id, sube_id=sube_id)
    except ActiveTermError:
        return None


def term_to_dict(term: Term) -> dict:
    return {
        'id': term.id,
        'name': term.name,
        'code': term.code,
        'term_type': term.term_type,
        'start_date': term.start_date.isoformat() if term.start_date else None,
        'end_date': term.end_date.isoformat() if term.end_date else None,
        'is_active': term.is_active,
    }
