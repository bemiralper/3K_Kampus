"""Kütüphane OgrenciIzin → akademik sınıf yoklaması köprüsü."""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

from django.utils import timezone

from apps.academic.domain.class_period_attendance import (
    ClassPeriodAttendanceRecord,
    ClassPeriodCode,
)
from apps.academic.domain.lesson_attendance import (
    LessonAttendanceRecord,
    StudentAttendanceStatus,
)
from apps.academic.domain.lesson_session import LessonSession, SessionStatus
from apps.academic.services.class_period_attendance_service import (
    classify_period,
    lunch_split_time,
)


ACADEMIC_PERIODS = frozenset({ClassPeriodCode.MORNING, ClassPeriodCode.AFTERNOON})


def library_izin_for_academic(
    ogrenci_id: int,
    tarih: date,
    periyot_kodu: str,
) -> Optional[Any]:
    """Kurum geneli eşleşen izin (salon fark etmez). Akşam yalnızca kütüphane."""
    if periyot_kodu not in ACADEMIC_PERIODS:
        return None
    from apps.kutuphane.application.service import OgrenciIzinService

    return OgrenciIzinService().get_exemption_detail(
        ogrenci_id,
        tarih,
        periyot_kodu,
        ignore_library=True,
    )


def is_library_izinli(ogrenci_id: int, tarih: date, periyot_kodu: str) -> bool:
    return library_izin_for_academic(ogrenci_id, tarih, periyot_kodu) is not None


def lesson_academic_period(session: LessonSession) -> str:
    lunch = None
    template_id = None
    version = getattr(session, 'schedule_version', None)
    if version is not None:
        template_id = getattr(version, 'schedule_template_id', None)
    if template_id:
        lunch = lunch_split_time(template_id)
    return classify_period(session.start_time, lunch_start=lunch)


def virtual_izin_status(
    *,
    ogrenci_id: int,
    tarih: date,
    periyot_kodu: str,
    rec=None,
) -> dict[str, Any]:
    """Kayıt yoksa izinliyse EXCUSED; kayıt varsa durumu koru, canlı rozet."""
    izin = library_izin_for_academic(ogrenci_id, tarih, periyot_kodu)
    izinli = izin is not None
    sebep = izin.sebep_label() if izin else ''
    if rec is None:
        if izinli:
            return {
                'status': StudentAttendanceStatus.EXCUSED,
                'status_display': dict(StudentAttendanceStatus.choices)[
                    StudentAttendanceStatus.EXCUSED
                ],
                'note': sebep,
                'izinli_mi': True,
                'izin_sebep': sebep,
            }
        return {
            'status': StudentAttendanceStatus.PRESENT,
            'status_display': dict(StudentAttendanceStatus.choices)[
                StudentAttendanceStatus.PRESENT
            ],
            'note': '',
            'izinli_mi': False,
            'izin_sebep': '',
        }
    return {
        'status': rec.status,
        'status_display': rec.get_status_display(),
        'note': rec.note,
        'izinli_mi': izinli,
        'izin_sebep': sebep if izinli else '',
    }


def apply_izin_badge_on_save(
    *,
    student_id: int,
    session_date: date,
    periyot_kodu: str,
    status: str,
    defaults: dict[str, Any],
) -> dict[str, Any]:
    izinli = is_library_izinli(student_id, session_date, periyot_kodu)
    defaults['izinli_mi'] = izinli
    if izinli and not defaults.get('note'):
        izin = library_izin_for_academic(student_id, session_date, periyot_kodu)
        if izin:
            defaults['note'] = izin.sebep_label()
    return defaults


def _apply_to_record(record, *, tarih: date, periyot: str, ogrenci_id: int) -> bool:
    izin = library_izin_for_academic(ogrenci_id, tarih, periyot)
    changed = False
    if izin:
        if not record.izinli_mi:
            record.izinli_mi = True
            record.status = StudentAttendanceStatus.EXCUSED
            label = izin.sebep_label()
            if label and not record.note:
                record.note = label
            changed = True
        elif record.status == StudentAttendanceStatus.EXCUSED:
            record.izinli_mi = True
            changed = True
    elif record.izinli_mi:
        record.izinli_mi = False
        if record.status == StudentAttendanceStatus.EXCUSED:
            record.status = StudentAttendanceStatus.PRESENT
        changed = True
    if changed:
        record.save(update_fields=['izinli_mi', 'status', 'note', 'marked_at'])
    return changed


def sync_academic_attendance_for_student(ogrenci_id: int, kurum_id: int, tarih: date | None = None):
    """Bugünkü (veya verilen gün) akademik yoklama kayıtlarını izinle hizala."""
    del kurum_id  # öğrenci id yeterli; kurum izolasyonu izin kaydında
    gun = tarih or timezone.localdate()

    period_records = ClassPeriodAttendanceRecord.objects.filter(
        student_id=ogrenci_id,
        session__is_active=True,
        session__session_date=gun,
    ).select_related('session')
    for rec in period_records:
        _apply_to_record(
            rec,
            tarih=rec.session.session_date,
            periyot=rec.session.period,
            ogrenci_id=ogrenci_id,
        )

    lesson_records = LessonAttendanceRecord.objects.filter(
        student_id=ogrenci_id,
        session__is_active=True,
        session__session_date=gun,
    ).exclude(session__status=SessionStatus.CANCELLED).select_related(
        'session', 'session__schedule_version',
    )
    for rec in lesson_records:
        periyot = lesson_academic_period(rec.session)
        _apply_to_record(
            rec,
            tarih=rec.session.session_date,
            periyot=periyot,
            ogrenci_id=ogrenci_id,
        )
