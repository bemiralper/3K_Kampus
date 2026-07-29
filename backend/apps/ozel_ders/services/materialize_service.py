from __future__ import annotations

from datetime import date, datetime, time
from typing import Optional

from django.db import transaction

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    OturumDurumu,
    OturumTuru,
    ProgramDurumu,
)
from apps.ozel_ders.services.conflict_service import (
    check_all_for_occurrence,
    is_holiday,
    iter_dates_for_weekday,
)
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services.program_service import get_program


def _parse_date(value) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    raise OzelDersError('Geçersiz tarih.', 'date')


@transaction.atomic
def materialize_program(
    program_id: int,
    *,
    kurum_id: int,
    sube_id: int,
    start_date: date | str,
    end_date: date | str,
    user=None,
) -> dict:
    program = get_program(program_id, kurum_id=kurum_id, sube_id=sube_id)
    if program.durum != ProgramDurumu.AKTIF:
        raise OzelDersError('Pasif program için oturum üretilemez.', 'program_passive')

    start = _parse_date(start_date)
    end = _parse_date(end_date)
    if end < start:
        raise OzelDersError('Bitiş tarihi başlangıçtan önce olamaz.', 'date_range')

    # Clamp to program window
    if start < program.baslangic_tarihi:
        start = program.baslangic_tarihi
    if program.bitis_tarihi and end > program.bitis_tarihi:
        end = program.bitis_tarihi

    created = 0
    skipped_holiday = 0
    skipped_existing = 0
    skipped_conflict = 0
    holiday_dates: set[str] = set()
    warnings: list[dict] = []

    slots = program.slots.filter(aktif=True).select_related('ders', 'ogretmen', 'oda')
    for slot in slots:
        slot_start = slot.baslangic_tarihi or program.baslangic_tarihi
        slot_end = slot.bitis_tarihi or program.bitis_tarihi or end
        range_start = max(start, slot_start)
        range_end = min(end, slot_end)
        if range_end < range_start:
            continue

        for day in iter_dates_for_weekday(range_start, range_end, slot.gun):
            if is_holiday(kurum_id, sube_id, day):
                skipped_holiday += 1
                holiday_dates.add(day.isoformat())
                continue

            existing = BirebirDersOturumu.objects.filter(
                source_slot=slot,
                session_date=day,
                is_active=True,
            ).first()
            if existing:
                skipped_existing += 1
                continue

            try:
                w = check_all_for_occurrence(
                    ogretmen_id=slot.ogretmen_id,
                    ogrenci_id=program.ogrenci_id,
                    oda_id=slot.oda_id,
                    kurum_id=kurum_id,
                    sube_id=sube_id,
                    session_date=day,
                    start=slot.baslangic,
                    end=slot.bitis,
                    skip_holiday=False,
                )
                warnings.extend(w)
            except OzelDersError:
                skipped_conflict += 1
                continue

            BirebirDersOturumu.objects.create(
                program=program,
                source_slot=slot,
                kurum_id=kurum_id,
                sube_id=sube_id,
                egitim_yili_id=program.egitim_yili_id,
                session_date=day,
                start_time=slot.baslangic,
                end_time=slot.bitis,
                ogrenci_id=program.ogrenci_id,
                ders_id=slot.ders_id,
                ogretmen_id=slot.ogretmen_id,
                oda_id=slot.oda_id,
                oturum_turu=OturumTuru.OZEL,
                durum=OturumDurumu.PLANLANDI,
                created_by=user if user and getattr(user, 'is_authenticated', False) else None,
            )
            created += 1

    return {
        'created': created,
        'skipped_holiday': skipped_holiday,
        'skipped_existing': skipped_existing,
        'skipped_conflict': skipped_conflict,
        'holiday_dates': sorted(holiday_dates),
        'warnings': warnings,
    }
