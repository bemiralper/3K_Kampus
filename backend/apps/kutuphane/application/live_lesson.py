"""Kütüphane yoklaması sırasında öğrencinin o anki dersini (birebir / grup) tespit eder."""
from __future__ import annotations

from datetime import date, datetime, time

from django.db.models import Q
from django.utils import timezone

TUR_BIREBIR = 'BIREBIR'
TUR_GRUP = 'GRUP'

BIREBIR_LABEL = 'Birebir özel ders'
GRUP_LABEL = 'Grup dersi'


def _fmt_range(start: time, end: time) -> str:
    return f"{start.strftime('%H:%M')}–{end.strftime('%H:%M')}"


def _personel_adi(personel) -> str:
    if personel is None:
        return ''
    return f"{(getattr(personel, 'ad', '') or '').strip()} {(getattr(personel, 'soyad', '') or '').strip()}".strip()


def _ders_adi(ders) -> str:
    if ders is None:
        return ''
    return (getattr(ders, 'kisa_ad', None) or getattr(ders, 'ad', None) or '').strip()


def _payload(tur: str, ders_adi: str, ogretmen_adi: str, start: time, end: time, yer: str = '') -> dict:
    return {
        'derste': True,
        'ders_turu': tur,
        'ders_turu_label': BIREBIR_LABEL if tur == TUR_BIREBIR else GRUP_LABEL,
        'ders_adi': ders_adi or '',
        'ogretmen_adi': ogretmen_adi or '',
        'saat': _fmt_range(start, end),
        'yer': yer or '',
    }


def _resolve_clock(on_date: date, now=None, at_time: time | None = None):
    moment = now or timezone.localtime()
    if isinstance(moment, datetime):
        today = timezone.localdate(moment) if timezone.is_aware(moment) else moment.date()
        clock = at_time if at_time is not None else (
            timezone.localtime(moment).time() if timezone.is_aware(moment) else moment.time()
        )
    else:
        today = timezone.localdate()
        clock = at_time if at_time is not None else timezone.localtime().time()
    return on_date == today, clock


def _put(out: dict, ogrenci_id: int, payload: dict, *, prefer: bool = False):
    if not ogrenci_id or not payload:
        return
    if ogrenci_id not in out or prefer:
        out[ogrenci_id] = payload


def _add_birebir(out: dict, ogrenci_ids: list[int], on_date: date, at_time: time):
    from apps.ozel_ders.domain.models import (
        BirebirDersOturumu,
        BirebirHaftalikSlot,
        OturumDurumu,
        ProgramDurumu,
    )

    inactive = {
        OturumDurumu.IPTAL,
        OturumDurumu.OGRETMEN_GELMEDI,
        OturumDurumu.OGRENCI_GELMEDI,
    }
    oturumlar = (
        BirebirDersOturumu.objects.filter(
            ogrenci_id__in=ogrenci_ids,
            session_date=on_date,
            is_active=True,
            start_time__lte=at_time,
            end_time__gt=at_time,
        )
        .select_related('ders', 'ogretmen', 'oda')
    )
    blocked = set()
    for oturum in oturumlar:
        if oturum.durum in inactive:
            blocked.add(oturum.ogrenci_id)
            continue
        yer = ''
        if getattr(oturum, 'oda', None) is not None:
            yer = oturum.oda.ad or ''
        _put(
            out,
            oturum.ogrenci_id,
            _payload(
                TUR_BIREBIR,
                _ders_adi(oturum.ders),
                _personel_adi(oturum.ogretmen),
                oturum.start_time,
                oturum.end_time,
                yer,
            ),
            prefer=True,
        )
        blocked.add(oturum.ogrenci_id)

    remaining = [oid for oid in ogrenci_ids if oid not in blocked and oid not in out]
    if not remaining:
        return

    slots = (
        BirebirHaftalikSlot.objects.filter(
            aktif=True,
            gun=on_date.isoweekday(),
            baslangic__lte=at_time,
            bitis__gt=at_time,
            program__durum=ProgramDurumu.AKTIF,
            program__ogrenci_id__in=remaining,
        )
        .filter(
            Q(program__baslangic_tarihi__lte=on_date),
            Q(program__bitis_tarihi__isnull=True) | Q(program__bitis_tarihi__gte=on_date),
            Q(baslangic_tarihi__isnull=True) | Q(baslangic_tarihi__lte=on_date),
            Q(bitis_tarihi__isnull=True) | Q(bitis_tarihi__gte=on_date),
        )
        .select_related('program', 'ders', 'ogretmen', 'oda')
    )
    for slot in slots:
        oid = slot.program.ogrenci_id
        yer = ''
        if getattr(slot, 'oda', None) is not None:
            yer = slot.oda.ad or ''
        _put(
            out,
            oid,
            _payload(
                TUR_BIREBIR,
                _ders_adi(slot.ders),
                _personel_adi(slot.ogretmen),
                slot.baslangic,
                slot.bitis,
                yer,
            ),
            prefer=True,
        )


def _placement_classrooms(ogrenci_ids: list[int], on_date: date) -> dict[int, list[int]]:
    from apps.academic.domain.student_class_placement import StudentClassPlacement

    by_class: dict[int, list[int]] = {}
    placements = StudentClassPlacement.objects.filter(
        student_id__in=ogrenci_ids,
        is_active=True,
    ).filter(
        Q(start_date__isnull=True) | Q(start_date__lte=on_date),
        Q(end_date__isnull=True) | Q(end_date__gte=on_date),
    ).values_list('classroom_id', 'student_id')
    for classroom_id, student_id in placements:
        by_class.setdefault(classroom_id, []).append(student_id)
    return by_class


def _add_group_lessons(
    out: dict,
    ogrenci_ids: list[int],
    on_date: date,
    at_time: time,
    exclude_sinif_ids: set[int] | None = None,
):
    from apps.academic.domain.lesson_session import LessonSession, SessionKind, SessionStatus
    from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell

    skip = {int(x) for x in (exclude_sinif_ids or set()) if x}
    by_class = _placement_classrooms(ogrenci_ids, on_date)
    classroom_ids = [cid for cid in by_class.keys() if cid not in skip]

    active_status = {SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS}
    sessions = (
        LessonSession.objects.filter(
            session_date=on_date,
            is_active=True,
            start_time__lte=at_time,
            end_time__gt=at_time,
            status__in=active_status,
        )
        .filter(
            Q(private_student_id__in=ogrenci_ids)
            | Q(sinif_id__in=classroom_ids)
        )
        .select_related('ders', 'ogretmen', 'sinif')
    )
    for session in sessions:
        yer = ''
        if getattr(session, 'sinif', None) is not None:
            yer = session.sinif.ad or ''
        payload = _payload(
            TUR_BIREBIR if session.session_kind == SessionKind.PRIVATE else TUR_GRUP,
            _ders_adi(session.ders),
            _personel_adi(session.ogretmen),
            session.start_time,
            session.end_time,
            yer,
        )
        if session.private_student_id:
            _put(out, session.private_student_id, payload, prefer=session.session_kind == SessionKind.PRIVATE)
        if session.sinif_id and session.sinif_id not in skip:
            for oid in by_class.get(session.sinif_id, []):
                _put(out, oid, payload)

    missing_classes = [
        cid for cid, students in by_class.items()
        if cid not in skip and any(oid not in out for oid in students)
    ]
    if not missing_classes:
        return

    cells = (
        ProgramGridCell.objects.filter(
            is_active=True,
            status=CellStatus.FILLED,
            sinif_id__in=missing_classes,
            weekly_day__day_of_week=on_date.weekday(),
            timeslot__start_time__lte=at_time,
            timeslot__end_time__gt=at_time,
        )
        .filter(Q(schedule_version__is_active=True) | Q(schedule_version__isnull=True))
        .select_related('ders', 'ogretmen', 'timeslot', 'sinif')
    )
    for cell in cells:
        start = cell.timeslot.start_time
        end = cell.timeslot.end_time
        yer = cell.sinif.ad if getattr(cell, 'sinif', None) is not None else ''
        payload = _payload(
            TUR_GRUP,
            _ders_adi(cell.ders),
            _personel_adi(cell.ogretmen),
            start,
            end,
            yer,
        )
        for oid in by_class.get(cell.sinif_id, []):
            _put(out, oid, payload)


def live_lessons_for_students(
    ogrenci_ids,
    on_date: date,
    now=None,
    at_time: time | None = None,
    exclude_sinif_ids=None,
) -> dict:
    """
    Öğrenci id → {derste, ders_turu, ders_adi, ogretmen_adi, saat, yer}.
    Verilen gün + saatte çakışan birebir / grup dersini döner.
    Birebir, grup dersinin üzerine yazılır.
    """
    ids = [int(x) for x in ogrenci_ids if x]
    if not ids or on_date is None:
        return {}
    _is_today, clock = _resolve_clock(on_date, now=now, at_time=at_time)

    out: dict = {}
    _add_group_lessons(out, ids, on_date, clock, exclude_sinif_ids=exclude_sinif_ids)
    _add_birebir(out, ids, on_date, clock)
    return out
