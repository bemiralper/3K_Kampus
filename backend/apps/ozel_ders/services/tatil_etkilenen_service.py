"""Tatil gününde etkilenen özel dersler (planlanan slot + mevcut oturum)."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import Q

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    ProgramDurumu,
)
from apps.ozel_ders.services.errors import OzelDersError
from apps.takvim.application.integration_service import CalendarIntegrationService, KaynakModul
from apps.takvim.domain.enums import EventCategory, EventStatus
from apps.takvim.domain.models import Event

TZ = ZoneInfo('Europe/Istanbul')
CEVRE_MODUL = KaynakModul.OZEL_DERS_CEVRE


def _weekday(day: date) -> int:
    return day.isoweekday()  # 1=Mon … 7=Sun


def _person_ad(obj) -> str:
    if obj is None:
        return ''
    ad = getattr(obj, 'tam_ad', None)
    if ad:
        return str(ad)
    return f'{getattr(obj, "ad", "")} {getattr(obj, "soyad", "")}'.strip()


def _fmt_time(t: time) -> str:
    return t.strftime('%H:%M')


def _cevre_kaynak_id(day: date) -> str:
    return f'CEVRE-{day.isoformat()}'


def cevre_target_date(base: date, side: str) -> date:
    if side == 'prev':
        return base - timedelta(days=1)
    if side == 'next':
        return base + timedelta(days=1)
    raise OzelDersError('side prev veya next olmalı.', 'side')


def _program_covers_day(program, day: date) -> bool:
    if day < program.baslangic_tarihi:
        return False
    if program.bitis_tarihi and day > program.bitis_tarihi:
        return False
    return True


def _slot_covers_day(slot, program, day: date) -> bool:
    start = slot.baslangic_tarihi or program.baslangic_tarihi
    end = slot.bitis_tarihi or program.bitis_tarihi
    if day < start:
        return False
    if end and day > end:
        return False
    return _program_covers_day(program, day)


def list_affected_for_date(
    *,
    kurum_id: int,
    sube_id: Optional[int],
    day: date | str,
) -> dict:
    if isinstance(day, str):
        day = date.fromisoformat(day[:10])

    weekday = _weekday(day)
    rows_by_key: dict[str, dict] = {}

    slot_qs = (
        BirebirHaftalikSlot.objects.filter(
            aktif=True,
            gun=weekday,
            program__kurum_id=kurum_id,
            program__durum=ProgramDurumu.AKTIF,
        )
        .select_related('program', 'program__ogrenci', 'ders', 'ogretmen')
    )
    if sube_id:
        slot_qs = slot_qs.filter(program__sube_id=sube_id)

    for slot in slot_qs:
        program = slot.program
        if not _slot_covers_day(slot, program, day):
            continue
        key = f'slot:{slot.id}'
        rows_by_key[key] = {
            'kind': 'planned',
            'oturum_id': None,
            'program_id': program.id,
            'slot_id': slot.id,
            'ogrenci_id': program.ogrenci_id,
            'ogrenci_ad': _person_ad(program.ogrenci),
            'ders_id': slot.ders_id,
            'ders_ad': getattr(slot.ders, 'ad', None) or str(slot.ders_id),
            'ders_kisa_ad': (getattr(slot.ders, 'kisa_ad', None) or '').strip(),
            'ogretmen_id': slot.ogretmen_id,
            'ogretmen_ad': _person_ad(slot.ogretmen),
            'start_time': _fmt_time(slot.baslangic),
            'end_time': _fmt_time(slot.bitis),
            'durum': None,
            'durum_display': None,
            'oturum_turu': None,
            'oturum_turu_display': None,
            'session_date': day.isoformat(),
        }

    oturum_qs = (
        BirebirDersOturumu.objects.filter(
            kurum_id=kurum_id,
            session_date=day,
            is_active=True,
        )
        .select_related('ogrenci', 'ders', 'ogretmen', 'program')
    )
    if sube_id:
        oturum_qs = oturum_qs.filter(sube_id=sube_id)

    for o in oturum_qs:
        if o.source_slot_id:
            key = f'slot:{o.source_slot_id}'
        else:
            key = f'oturum:{o.id}'
        rows_by_key[key] = {
            'kind': 'oturum',
            'oturum_id': o.id,
            'program_id': o.program_id,
            'slot_id': o.source_slot_id,
            'ogrenci_id': o.ogrenci_id,
            'ogrenci_ad': _person_ad(o.ogrenci),
            'ders_id': o.ders_id,
            'ders_ad': getattr(o.ders, 'ad', None) or str(o.ders_id),
            'ders_kisa_ad': (getattr(o.ders, 'kisa_ad', None) or '').strip(),
            'ogretmen_id': o.ogretmen_id,
            'ogretmen_ad': _person_ad(o.ogretmen),
            'start_time': _fmt_time(o.start_time),
            'end_time': _fmt_time(o.end_time),
            'durum': o.durum,
            'durum_display': o.get_durum_display(),
            'oturum_turu': o.oturum_turu,
            'oturum_turu_display': o.get_oturum_turu_display(),
            'session_date': day.isoformat(),
        }

    items = sorted(
        rows_by_key.values(),
        key=lambda r: (r['start_time'] or '', r['ogrenci_ad'] or '', r.get('oturum_id') or 0),
    )
    return {
        'date': day.isoformat(),
        'count': len(items),
        'items': items,
    }


def counts_by_date(
    *,
    kurum_id: int,
    sube_id: Optional[int],
    year: int,
) -> dict[str, int]:
    """Yıl içindeki her gün için etkilenen ders sayısı (merge mantığıyla)."""
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)

    # weekday → list of (slot_id, program window)
    slots_by_weekday: dict[int, list] = defaultdict(list)
    slot_qs = (
        BirebirHaftalikSlot.objects.filter(
            aktif=True,
            program__kurum_id=kurum_id,
            program__durum=ProgramDurumu.AKTIF,
            program__baslangic_tarihi__lte=year_end,
        )
        .filter(Q(program__bitis_tarihi__isnull=True) | Q(program__bitis_tarihi__gte=year_start))
        .select_related('program')
    )
    if sube_id:
        slot_qs = slot_qs.filter(program__sube_id=sube_id)

    for slot in slot_qs.iterator():
        slots_by_weekday[slot.gun].append(slot)

    # oturum counts keyed by date → set of merge keys
    keys_by_date: dict[str, set[str]] = defaultdict(set)

    oturum_qs = BirebirDersOturumu.objects.filter(
        kurum_id=kurum_id,
        is_active=True,
        session_date__year=year,
    ).only('id', 'session_date', 'source_slot_id')
    if sube_id:
        oturum_qs = oturum_qs.filter(sube_id=sube_id)

    for o in oturum_qs.iterator():
        day_iso = o.session_date.isoformat()
        if o.source_slot_id:
            keys_by_date[day_iso].add(f'slot:{o.source_slot_id}')
        else:
            keys_by_date[day_iso].add(f'oturum:{o.id}')

    # Fill planned slots for every day of year that matches weekday
    cur = year_start
    while cur <= year_end:
        day_iso = cur.isoformat()
        for slot in slots_by_weekday.get(_weekday(cur), []):
            if _slot_covers_day(slot, slot.program, cur):
                keys_by_date[day_iso].add(f'slot:{slot.id}')
        cur += timedelta(days=1)

    return {d: len(keys) for d, keys in keys_by_date.items() if keys}


def cevre_aktif_dates(
    *,
    kurum_id: int,
    year: int,
) -> set[date]:
    qs = Event.objects.filter(
        kurum_id=kurum_id,
        kaynak_modul=CEVRE_MODUL,
        is_deleted=False,
        kaynak_id__startswith=f'CEVRE-{year}-',
    ).only('kaynak_id', 'baslangic')
    out: set[date] = set()
    for ev in qs:
        kid = ev.kaynak_id or ''
        if kid.startswith('CEVRE-'):
            try:
                out.add(date.fromisoformat(kid[6:16]))
            except ValueError:
                if ev.baslangic:
                    out.add(ev.baslangic.date())
        elif ev.baslangic:
            out.add(ev.baslangic.date())
    return out


def is_cevre_active(kurum_id: int, day: date) -> bool:
    return Event.objects.filter(
        kurum_id=kurum_id,
        kaynak_modul=CEVRE_MODUL,
        kaynak_id=_cevre_kaynak_id(day),
        is_deleted=False,
    ).exists()


@transaction.atomic
def set_cevre_tatil(
    *,
    kurum_id: int,
    base_date: date | str,
    side: str,
    aktif: bool,
    user_id: Optional[int] = None,
) -> dict:
    if isinstance(base_date, str):
        base_date = date.fromisoformat(base_date[:10])
    target = cevre_target_date(base_date, side)
    kaynak_id = _cevre_kaynak_id(target)
    uid = user_id or 0

    if not aktif:
        CalendarIntegrationService().remove_event(kurum_id, CEVRE_MODUL, kaynak_id)
        # remove_event only soft-deletes non-deleted; also clear any leftover
        Event.objects.filter(
            kurum_id=kurum_id,
            kaynak_modul=CEVRE_MODUL,
            kaynak_id=kaynak_id,
            is_deleted=False,
        ).update(is_deleted=True)
        return {
            'base_date': base_date.isoformat(),
            'side': side,
            'date': target.isoformat(),
            'aktif': False,
            'kaynak_id': kaynak_id,
        }

    integration = CalendarIntegrationService()
    event_type = integration._resolve_event_type(kurum_id, EventCategory.TATIL)
    if not event_type:
        raise OzelDersError('TATIL etkinlik türü bulunamadı.', 'event_type', 400)

    start_dt = datetime.combine(target, time.min, tzinfo=TZ)
    end_dt = datetime.combine(target, time(23, 59, 59), tzinfo=TZ)
    existing = (
        Event.objects.filter(
            kurum_id=kurum_id,
            kaynak_modul=CEVRE_MODUL,
            kaynak_id=kaynak_id,
        )
        .order_by('-updated_at')
        .first()
    )
    data = {
        'event_type_id': event_type.id,
        'baslik': f'Özel ders tatili ({target.isoformat()})',
        'aciklama': f'Resmi tatil çevresi — {base_date.isoformat()} ({side})',
        'baslangic': start_dt,
        'bitis': end_dt,
        'tum_gun': True,
        'kaynak_modul': CEVRE_MODUL,
        'kaynak_id': kaynak_id,
        'sube_id': None,
        'renk': '#78716C',
        'is_deleted': False,
        'deleted_at': None,
        'durum': EventStatus.SCHEDULED,
    }
    if existing:
        data['updated_by'] = uid
        integration.repo.update(existing, data)
    else:
        data['kurum_id'] = kurum_id
        data['created_by'] = uid
        integration.repo.create(data)

    return {
        'base_date': base_date.isoformat(),
        'side': side,
        'date': target.isoformat(),
        'aktif': True,
        'kaynak_id': kaynak_id,
    }
