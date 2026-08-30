"""Çakışma kontrolleri — öğretmen, öğrenci, derslik, tatil, izin."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Optional

from django.db.models import Q

from apps.ozel_ders.domain.models import BirebirDersOturumu, OturumDurumu
from apps.ozel_ders.services.errors import OzelDersError


INACTIVE_STATUSES = {OturumDurumu.IPTAL}


def _overlap_q(start: time, end: time) -> Q:
    return Q(start_time__lt=end, end_time__gt=start)


def _active_oturum_qs():
    return BirebirDersOturumu.objects.filter(is_active=True).exclude(
        durum__in=INACTIVE_STATUSES,
    )


def check_teacher_conflict(
    *,
    ogretmen_id: int,
    session_date: date,
    start: time,
    end: time,
    exclude_id: Optional[int] = None,
    hard_block_class_sessions: bool = False,
) -> list[dict]:
    warnings: list[dict] = []
    qs = _active_oturum_qs().filter(
        ogretmen_id=ogretmen_id,
        session_date=session_date,
    ).filter(_overlap_q(start, end))
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    hit = qs.first()
    if hit:
        raise OzelDersError(
            f'Öğretmen çakışması: {hit.start_time}-{hit.end_time} '
            f'(oturum #{hit.pk})',
            'teacher_conflict',
        )

    try:
        from apps.academic.domain.lesson_session import LessonSession, SessionStatus
        class_qs = LessonSession.objects.filter(
            is_active=True,
            ogretmen_id=ogretmen_id,
            session_date=session_date,
        ).exclude(
            status__in=[SessionStatus.CANCELLED, SessionStatus.POSTPONED],
        ).filter(start_time__lt=end, end_time__gt=start)
        class_hit = class_qs.first()
        if class_hit:
            msg = (
                f'Sınıf dersi ile örtüşme: {class_hit.start_time}-{class_hit.end_time} '
                f'(lesson_session #{class_hit.pk})'
            )
            if hard_block_class_sessions:
                raise OzelDersError(msg, 'teacher_class_conflict')
            warnings.append({'type': 'teacher_class', 'message': msg})
    except ImportError:
        pass

    return warnings


def check_student_conflict(
    *,
    ogrenci_id: int,
    session_date: date,
    start: time,
    end: time,
    exclude_id: Optional[int] = None,
) -> None:
    qs = _active_oturum_qs().filter(
        ogrenci_id=ogrenci_id,
        session_date=session_date,
    ).filter(_overlap_q(start, end))
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    hit = qs.first()
    if hit:
        raise OzelDersError(
            f'Öğrenci çakışması: {hit.start_time}-{hit.end_time} '
            f'(oturum #{hit.pk})',
            'student_conflict',
        )


def check_room_conflict(
    *,
    oda_id: Optional[int],
    session_date: date,
    start: time,
    end: time,
    exclude_id: Optional[int] = None,
) -> None:
    if not oda_id:
        return
    qs = _active_oturum_qs().filter(
        oda_id=oda_id,
        session_date=session_date,
    ).filter(_overlap_q(start, end))
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    hit = qs.first()
    if hit:
        raise OzelDersError(
            f'Derslik çakışması: {hit.start_time}-{hit.end_time} '
            f'(oturum #{hit.pk})',
            'room_conflict',
        )


def _holiday_event_qs(kurum_id: int, sube_id: Optional[int]):
    from apps.takvim.domain.models import Event
    from apps.takvim.domain.enums import EventCategory

    qs = Event.objects.filter(
        kurum_id=kurum_id,
        event_type__kategori=EventCategory.TATIL,
        is_deleted=False,
    )
    if sube_id:
        qs = qs.filter(Q(sube_id=sube_id) | Q(sube_id__isnull=True))
    return qs


def _ozel_ders_aktif_on(kurum_id: int, sube_id: Optional[int], day: date) -> bool:
    """Kurum kararı: bu günde özel ders devam edecek mi?"""
    try:
        from apps.ozel_ders.domain.models import OzelDersTatilKarari

        qs = OzelDersTatilKarari.objects.filter(
            kurum_id=kurum_id,
            tarih=day,
            ozel_ders_aktif=True,
        )
        if sube_id:
            qs = qs.filter(Q(sube_id=sube_id) | Q(sube_id__isnull=True))
        else:
            qs = qs.filter(sube_id__isnull=True)
        return qs.exists()
    except Exception:
        return False


def _catalog_covers(day: date) -> bool:
    try:
        from apps.takvim.data.resmi_tatiller_tr import holidays_for_year

        return any(h.start <= day <= h.end for h in holidays_for_year(day.year))
    except Exception:
        return False


def is_holiday(kurum_id: int, sube_id: Optional[int], day: date) -> bool:
    """
    Özel ders için tatil mi?
    - Manuel TATIL event → her zaman tatil
    - Sadece resmi_tatil event + ozel_ders_aktif → devam (False)
    - Resmi tatil, karar yok → tatil
    """
    try:
        from apps.takvim.application.integration_service import KaynakModul

        start_dt = datetime.combine(day, time.min)
        end_dt = datetime.combine(day, time.max)
        events = list(
            _holiday_event_qs(kurum_id, sube_id)
            .filter(baslangic__lte=end_dt, bitis__gte=start_dt)
            .only('kaynak_modul', 'kaynak_id', 'baslik')
        )
        if not events:
            if not _catalog_covers(day):
                return False
            if _ozel_ders_aktif_on(kurum_id, sube_id, day):
                return False
            return True

        has_manual = any(
            (e.kaynak_modul or '') != KaynakModul.RESMI_TATIL for e in events
        )
        if has_manual:
            return True

        # Yalnızca resmi tatil event(ler)i
        if _ozel_ders_aktif_on(kurum_id, sube_id, day):
            return False
        return True
    except Exception:
        return False


def list_holidays(
    kurum_id: int,
    sube_id: Optional[int],
    start_date: date,
    end_date: date,
) -> list[dict]:
    """Aralıktaki tatil günleri: date, title, bitis, holiday_key, source, ozel_ders_aktif."""
    if end_date < start_date:
        return []
    try:
        from apps.takvim.application.integration_service import KaynakModul

        start_dt = datetime.combine(start_date, time.min)
        end_dt = datetime.combine(end_date, time.max)
        events = list(
            _holiday_event_qs(kurum_id, sube_id)
            .filter(baslangic__lte=end_dt, bitis__gte=start_dt)
            .order_by('baslangic')
        )
        resmi_modul = KaynakModul.RESMI_TATIL
    except Exception:
        events = []
        resmi_modul = 'resmi_tatil'

    by_day: dict[date, dict] = {}
    for ev in events:
        day0 = max(ev.baslangic.date(), start_date)
        day1 = min(ev.bitis.date(), end_date)
        if day1 < day0:
            continue
        is_resmi = (ev.kaynak_modul or '') == resmi_modul
        is_cevre = (ev.kaynak_modul or '') == getattr(KaynakModul, 'OZEL_DERS_CEVRE', 'ozel_ders_cevre')
        source = 'resmi' if is_resmi else ('cevre' if is_cevre else 'manuel')
        cur = day0
        while cur <= day1:
            prev = by_day.get(cur)
            # Manuel/çevre tatil resmi üzerine yazılır
            if prev and prev.get('source') in ('manuel', 'cevre'):
                cur += timedelta(days=1)
                continue
            by_day[cur] = {
                'date': cur.isoformat(),
                'title': ev.baslik or 'Tatil',
                'bitis': ev.bitis.date().isoformat(),
                'holiday_key': (ev.kaynak_id or '') if (is_resmi or is_cevre) else '',
                'source': source,
                'ozel_ders_aktif': False,
            }
            cur += timedelta(days=1)

    try:
        from apps.takvim.data.resmi_tatiller_tr import holidays_in_range

        for h in holidays_in_range(start_date, end_date):
            for d in h.iter_days():
                if d < start_date or d > end_date or d in by_day:
                    continue
                by_day[d] = {
                    'date': d.isoformat(),
                    'title': h.title,
                    'bitis': h.end.isoformat(),
                    'holiday_key': h.key,
                    'source': 'katalog',
                    'ozel_ders_aktif': False,
                }
    except Exception:
        pass

    # Override kararları
    try:
        from apps.ozel_ders.domain.models import OzelDersTatilKarari

        karar_qs = OzelDersTatilKarari.objects.filter(
            kurum_id=kurum_id,
            tarih__gte=start_date,
            tarih__lte=end_date,
        )
        if sube_id:
            karar_qs = karar_qs.filter(Q(sube_id=sube_id) | Q(sube_id__isnull=True))
        else:
            karar_qs = karar_qs.filter(sube_id__isnull=True)
        for k in karar_qs:
            row = by_day.get(k.tarih)
            if not row:
                continue
            # Manuel / çevre tatilde override uygulanmaz
            if row.get('source') in ('manuel', 'cevre'):
                row['ozel_ders_aktif'] = False
            else:
                row['ozel_ders_aktif'] = bool(k.ozel_ders_aktif)
                if k.holiday_key and not row.get('holiday_key'):
                    row['holiday_key'] = k.holiday_key
    except Exception:
        pass

    return [by_day[d] for d in sorted(by_day.keys())]


def check_teacher_off_day(ogretmen_id: int, day: date) -> list[dict]:
    """Sözleşme haftalık izin günü + availability UNAVAILABLE uyarısı."""
    warnings: list[dict] = []
    weekday = day.isoweekday()  # 1=Mon … 7=Sun

    try:
        from apps.personel.domain.sozlesme_models import PersonelSozlesme, SozlesmeDurumu
        soz = (
            PersonelSozlesme.objects.filter(
                personel_id=ogretmen_id,
                durum=SozlesmeDurumu.AKTIF,
                baslangic_tarihi__lte=day,
                bitis_tarihi__gte=day,
            )
            .order_by('-id')
            .first()
        )
        if soz and soz.haftalik_izin_gunleri and weekday in soz.haftalik_izin_gunleri:
            warnings.append({
                'type': 'weekly_off',
                'message': f'Öğretmenin sözleşmede izin günü (gün={weekday})',
            })
    except Exception:
        pass

    try:
        from apps.academic.domain.teacher_availability import (
            SlotAvailabilityStatus,
            TeacherAvailabilityCell,
            TeacherAvailabilitySet,
        )
        sets = TeacherAvailabilitySet.objects.filter(
            personel_id=ogretmen_id,
            is_active=True,
        )
        dow = weekday - 1  # model: 0=Pazartesi … 6=Pazar
        for aset in sets:
            if aset.valid_from and day < aset.valid_from:
                continue
            if aset.valid_until and day > aset.valid_until:
                continue
            cell = TeacherAvailabilityCell.objects.filter(
                availability_set=aset,
                day_of_week=dow,
                status=SlotAvailabilityStatus.UNAVAILABLE,
            ).first()
            if cell:
                warnings.append({
                    'type': 'unavailable',
                    'message': f'Öğretmen uygunlukta müsait değil (gün={weekday})',
                })
                break
    except Exception:
        pass

    return warnings


def validate_slot_window(start: time, end: time) -> None:
    if start >= end:
        raise OzelDersError('Başlangıç saati bitişten önce olmalı.', 'time_range')


def check_all_for_occurrence(
    *,
    ogretmen_id: int,
    ogrenci_id: int,
    oda_id: Optional[int],
    kurum_id: int,
    sube_id: int,
    session_date: date,
    start: time,
    end: time,
    exclude_id: Optional[int] = None,
    skip_holiday: bool = True,
    hard_block_class_sessions: bool = False,
) -> list[dict]:
    validate_slot_window(start, end)
    if skip_holiday and is_holiday(kurum_id, sube_id, session_date):
        raise OzelDersError('Seçilen tarih tatil günü.', 'holiday')

    warnings = []
    warnings.extend(
        check_teacher_conflict(
            ogretmen_id=ogretmen_id,
            session_date=session_date,
            start=start,
            end=end,
            exclude_id=exclude_id,
            hard_block_class_sessions=hard_block_class_sessions,
        )
    )
    check_student_conflict(
        ogrenci_id=ogrenci_id,
        session_date=session_date,
        start=start,
        end=end,
        exclude_id=exclude_id,
    )
    check_room_conflict(
        oda_id=oda_id,
        session_date=session_date,
        start=start,
        end=end,
        exclude_id=exclude_id,
    )
    warnings.extend(check_teacher_off_day(ogretmen_id, session_date))
    return warnings


def iter_dates_for_weekday(
    start: date,
    end: date,
    weekday: int,
):
    """weekday: 1=Mon … 7=Sun"""
    if end < start:
        return
    cur = start
    while cur.isoweekday() != weekday:
        cur += timedelta(days=1)
        if cur > end:
            return
    while cur <= end:
        yield cur
        cur += timedelta(days=7)
