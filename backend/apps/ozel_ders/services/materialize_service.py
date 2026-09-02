from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from django.db import transaction
from django.utils import timezone

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    BirebirHakedis,
    HakedisDurumu,
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
from apps.ozel_ders.services.quota_service import (
    resolve_ders_hedef_dakika,
    trim_excess_planlandi,
    used_quota_minutes,
)


def _parse_date(value) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    raise OzelDersError('Geçersiz tarih.', 'date')


_LOCKED_HAKEDIS = (HakedisDurumu.ONAYLANDI, HakedisDurumu.BORDOYA_ISLENDI)
_FUTURE_SYNC_DAYS = 62


def _oturum_can_follow_slot(oturum: BirebirDersOturumu, today: date) -> bool:
    """Yalnızca henüz işlenmemiş gelecek/bugünkü planlı özel ders oturumları."""
    if not oturum.is_active:
        return False
    if oturum.durum != OturumDurumu.PLANLANDI:
        return False
    if oturum.oturum_turu != OturumTuru.OZEL:
        return False
    if oturum.session_date < today:
        return False
    if BirebirHakedis.objects.filter(oturum_id=oturum.id, durum__in=_LOCKED_HAKEDIS).exists():
        return False
    return True


def _apply_slot_fields(oturum: BirebirDersOturumu, slot: BirebirHaftalikSlot) -> bool:
    """Şablon alanlarını oturuma yazar. Çakışmada False (oturum olduğu gibi kalır)."""
    changed = (
        oturum.start_time != slot.baslangic
        or oturum.end_time != slot.bitis
        or oturum.ders_id != slot.ders_id
        or oturum.ogretmen_id != slot.ogretmen_id
        or oturum.oda_id != slot.oda_id
    )
    if not changed:
        return False
    try:
        check_all_for_occurrence(
            ogretmen_id=slot.ogretmen_id,
            ogrenci_id=oturum.ogrenci_id,
            oda_id=slot.oda_id,
            kurum_id=oturum.kurum_id,
            sube_id=oturum.sube_id,
            session_date=oturum.session_date,
            start=slot.baslangic,
            end=slot.bitis,
            exclude_id=oturum.id,
            skip_holiday=False,
        )
    except OzelDersError:
        return False
    oturum.start_time = slot.baslangic
    oturum.end_time = slot.bitis
    oturum.ders_id = slot.ders_id
    oturum.ogretmen_id = slot.ogretmen_id
    oturum.oda_id = slot.oda_id
    oturum.save(update_fields=[
        'start_time', 'end_time', 'ders_id', 'ogretmen_id', 'oda_id', 'updated_at',
    ])
    return True


def _future_planlandi_qs(slot: BirebirHaftalikSlot, today: date):
    return BirebirDersOturumu.objects.filter(
        source_slot_id=slot.id,
        is_active=True,
        durum=OturumDurumu.PLANLANDI,
        oturum_turu=OturumTuru.OZEL,
        session_date__gte=today,
    )


def sync_future_sessions_for_slot(
    slot: BirebirHaftalikSlot,
    *,
    user=None,
    rematerialize: bool = True,
) -> dict:
    """
    Şablon değişince yalnızca planlı gelecek oturumları hizalar.

    Geçmiş günler, yoklaması alınmış kayıtlar, telafi/ek ders ve kilitli
    hakedişler dokunulmaz.
    """
    today = timezone.localdate()
    program = slot.program
    updated = 0
    deactivated = 0

    qs = _future_planlandi_qs(slot, today)
    locked_ids = set(
        BirebirHakedis.objects.filter(
            oturum__source_slot_id=slot.id,
            durum__in=_LOCKED_HAKEDIS,
        ).values_list('oturum_id', flat=True)
    )
    if locked_ids:
        qs = qs.exclude(pk__in=locked_ids)

    slot_start = slot.baslangic_tarihi or program.baslangic_tarihi
    slot_end = slot.bitis_tarihi or program.bitis_tarihi

    for oturum in qs:
        if not slot.aktif:
            oturum.is_active = False
            oturum.save(update_fields=['is_active', 'updated_at'])
            deactivated += 1
            continue

        wrong_day = oturum.session_date.isoweekday() != slot.gun
        before_window = slot_start and oturum.session_date < slot_start
        after_window = slot_end and oturum.session_date > slot_end
        if wrong_day or before_window or after_window:
            # Bugünkü dersi şablon günü değişse bile silme (yoklama / hakediş günü).
            if oturum.session_date > today:
                oturum.is_active = False
                oturum.save(update_fields=['is_active', 'updated_at'])
                deactivated += 1
            continue

        if _apply_slot_fields(oturum, slot):
            updated += 1

    trimmed = trim_excess_planlandi(
        ogrenci_id=program.ogrenci_id,
        ders_id=slot.ders_id,
        hedef_dakika=resolve_ders_hedef_dakika(
            ogrenci_id=program.ogrenci_id, ders_id=slot.ders_id,
        ),
        kurum_id=program.kurum_id,
        today=today,
    )
    deactivated += trimmed

    created = 0
    if rematerialize and slot.aktif and program.durum == ProgramDurumu.AKTIF:
        created = _rematerialize_from_today(slot, user=user)

    return {
        'updated': updated,
        'deactivated': deactivated,
        'created': created,
    }


def _rematerialize_from_today(slot: BirebirHaftalikSlot, *, user=None) -> int:
    program = slot.program
    today = timezone.localdate()
    start = max(today, slot.baslangic_tarihi or program.baslangic_tarihi or today)
    end = slot.bitis_tarihi or program.bitis_tarihi or (today + timedelta(days=_FUTURE_SYNC_DAYS))
    if end < start:
        return 0
    result = materialize_program(
        program.id,
        kurum_id=program.kurum_id,
        sube_id=program.sube_id,
        start_date=start,
        end_date=end,
        user=user,
    )
    return result.get('created') or 0


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
    updated = 0
    skipped_holiday = 0
    skipped_existing = 0
    skipped_conflict = 0
    skipped_quota = 0
    holiday_dates: set[str] = set()
    warnings: list[dict] = []

    slots = list(program.slots.filter(aktif=True).select_related('ders', 'ogretmen', 'oda'))
    candidates: list[tuple[date, BirebirHaftalikSlot]] = []
    for slot in slots:
        slot_start = slot.baslangic_tarihi or program.baslangic_tarihi
        slot_end = slot.bitis_tarihi or program.bitis_tarihi or end
        range_start = max(start, slot_start)
        range_end = min(end, slot_end)
        if range_end < range_start:
            continue
        for day in iter_dates_for_weekday(range_start, range_end, slot.gun):
            candidates.append((day, slot))
    candidates.sort(key=lambda item: (item[0], item[1].id))

    used_by_ders: dict[int, int] = {}
    hedef_by_ders: dict[int, Optional[int]] = {}

    def _hedef_for(slot: BirebirHaftalikSlot) -> Optional[int]:
        if slot.ders_id not in hedef_by_ders:
            hedef_by_ders[slot.ders_id] = resolve_ders_hedef_dakika(
                ogrenci_id=program.ogrenci_id, ders_id=slot.ders_id,
            )
        return hedef_by_ders[slot.ders_id]

    def _used_for(slot: BirebirHaftalikSlot) -> int:
        if slot.ders_id not in used_by_ders:
            used_by_ders[slot.ders_id] = used_quota_minutes(
                ogrenci_id=program.ogrenci_id,
                ders_id=slot.ders_id,
                kurum_id=kurum_id,
            )
        return used_by_ders[slot.ders_id]

    for day, slot in candidates:
        if is_holiday(kurum_id, sube_id, day):
            skipped_holiday += 1
            holiday_dates.add(day.isoformat())
            continue

        existing = (
            BirebirDersOturumu.objects
            .filter(source_slot=slot, session_date=day)
            .order_by('-is_active', '-id')
            .first()
        )
        if existing:
            if not existing.is_active:
                if (
                    existing.durum == OturumDurumu.PLANLANDI
                    and existing.oturum_turu == OturumTuru.OZEL
                ):
                    hedef = _hedef_for(slot)
                    sure = slot.resolved_sure_dk()
                    if hedef and _used_for(slot) + sure > hedef:
                        skipped_quota += 1
                        continue
                    existing.is_active = True
                    existing.start_time = slot.baslangic
                    existing.end_time = slot.bitis
                    existing.ders_id = slot.ders_id
                    existing.ogretmen_id = slot.ogretmen_id
                    existing.oda_id = slot.oda_id
                    existing.program_id = program.id
                    existing.ogrenci_id = program.ogrenci_id
                    existing.kurum_id = kurum_id
                    existing.sube_id = sube_id
                    existing.egitim_yili_id = program.egitim_yili_id
                    existing.save(update_fields=[
                        'is_active', 'start_time', 'end_time', 'ders_id', 'ogretmen_id',
                        'oda_id', 'program_id', 'ogrenci_id', 'kurum_id', 'sube_id',
                        'egitim_yili_id', 'updated_at',
                    ])
                    created += 1
                    if hedef:
                        used_by_ders[slot.ders_id] = _used_for(slot) + sure
                    continue
                skipped_existing += 1
                continue
            today = timezone.localdate()
            if _oturum_can_follow_slot(existing, today) and _apply_slot_fields(existing, slot):
                updated += 1
            else:
                skipped_existing += 1
            continue

        hedef = _hedef_for(slot)
        sure = slot.resolved_sure_dk()
        if hedef and _used_for(slot) + sure > hedef:
            skipped_quota += 1
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
        if hedef:
            used_by_ders[slot.ders_id] = _used_for(slot) + sure

    return {
        'created': created,
        'updated': updated,
        'skipped_holiday': skipped_holiday,
        'skipped_existing': skipped_existing,
        'skipped_conflict': skipped_conflict,
        'skipped_quota': skipped_quota,
        'holiday_dates': sorted(holiday_dates),
        'warnings': warnings,
    }


def materialize_active_programs(
    *,
    kurum_id: int,
    sube_id: int,
    start_date: date | str,
    end_date: date | str,
    user=None,
    max_days: int = 62,
) -> dict:
    """Aktif programların şablon slotlarından tarih aralığı için oturum üretir (idempotent)."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)
    if end < start:
        return {'created': 0, 'programs': 0}
    if (end - start).days > max_days:
        end = start + timedelta(days=max_days)

    program_ids = list(
        BirebirHaftalikSlot.objects.filter(
            aktif=True,
            program__kurum_id=kurum_id,
            program__sube_id=sube_id,
            program__durum=ProgramDurumu.AKTIF,
        ).values_list('program_id', flat=True).distinct()
    )
    created = 0
    for program_id in program_ids:
        result = materialize_program(
            program_id,
            kurum_id=kurum_id,
            sube_id=sube_id,
            start_date=start,
            end_date=end,
            user=user,
        )
        created += result.get('created') or 0
    return {'created': created, 'programs': len(program_ids)}
