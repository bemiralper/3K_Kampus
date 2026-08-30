"""Öğrenci dersinin tatil gününe denk gelişi + tatil/devam kararı."""
from __future__ import annotations

from datetime import date, datetime

from django.db import transaction
from django.db.models import Q

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    BirebirOgrenciProgrami,
    OturumDurumu,
    OturumTuru,
    ProgramDurumu,
)
from apps.ozel_ders.services.conflict_service import (
    check_all_for_occurrence,
    is_holiday,
    iter_dates_for_weekday,
    list_holidays,
)
from apps.ozel_ders.services.errors import OzelDersError

ATTENDED = {OturumDurumu.ISLENDI, OturumDurumu.ONLINE}


def _parse_date(value) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        return date.fromisoformat(value.strip()[:10])
    raise OzelDersError('Geçersiz tarih.', 'date')


def _person_ad(obj) -> str:
    if obj is None:
        return ''
    ad = getattr(obj, 'tam_ad', None)
    if ad:
        return str(ad)
    return f'{getattr(obj, "ad", "")} {getattr(obj, "soyad", "")}'.strip()


def _active_slots(*, ogrenci_id: int, kurum_id: int, sube_id: int, ders_id: int | None = None):
    programs = BirebirOgrenciProgrami.objects.filter(
        kurum_id=kurum_id,
        ogrenci_id=ogrenci_id,
        durum=ProgramDurumu.AKTIF,
    )
    if sube_id:
        programs = programs.filter(sube_id=sube_id)
    program_ids = list(programs.values_list('id', flat=True))
    qs = BirebirHaftalikSlot.objects.filter(
        program_id__in=program_ids,
        aktif=True,
    ).select_related('program', 'ders', 'ogretmen')
    if ders_id:
        qs = qs.filter(ders_id=ders_id)
    return list(qs)


def holiday_map(kurum_id: int, sube_id: int, start: date, end: date) -> dict[str, dict]:
    return {h['date']: h for h in list_holidays(kurum_id, sube_id, start, end)}


def build_tatil_hits(
    *,
    ogrenci_id: int,
    kurum_id: int,
    sube_id: int,
    start: date,
    end: date,
    ders_id: int | None = None,
) -> list[dict]:
    """Şablon tekrarlarının tatil gününe denk gelenleri."""
    holidays = holiday_map(kurum_id, sube_id, start, end)
    slots = _active_slots(
        ogrenci_id=ogrenci_id, kurum_id=kurum_id, sube_id=sube_id, ders_id=ders_id,
    )
    session_qs = BirebirDersOturumu.objects.filter(
        kurum_id=kurum_id,
        ogrenci_id=ogrenci_id,
        is_active=True,
        session_date__gte=start,
        session_date__lte=end,
    )
    if sube_id:
        session_qs = session_qs.filter(sube_id=sube_id)
    if ders_id:
        session_qs = session_qs.filter(ders_id=ders_id)
    sessions = list(
        session_qs.only('id', 'ders_id', 'session_date', 'start_time', 'durum', 'source_slot_id', 'sube_id')
    )

    by_day_ders: dict[tuple[str, int], list] = {}
    for o in sessions:
        by_day_ders.setdefault((o.session_date.isoformat(), o.ders_id), []).append(o)

    hits: list[dict] = []
    seen: set[tuple[str, int, int]] = set()
    for slot in slots:
        slot_start = slot.baslangic_tarihi or slot.program.baslangic_tarihi
        slot_end = slot.bitis_tarihi or slot.program.bitis_tarihi or end
        range_start = max(start, slot_start)
        range_end = min(end, slot_end)
        if range_end < range_start:
            continue
        for day in iter_dates_for_weekday(range_start, range_end, slot.gun):
            iso = day.isoformat()
            info = holidays.get(iso)
            holiday_day = bool(info) or is_holiday(kurum_id, sube_id, day)
            if not holiday_day:
                continue
            key = (iso, slot.ders_id, slot.id)
            if key in seen:
                continue
            seen.add(key)
            matches = by_day_ders.get((iso, slot.ders_id), [])
            oturum = next(
                (o for o in matches if o.source_slot_id == slot.id),
                matches[0] if matches else None,
            )
            skipped = is_holiday(kurum_id, sube_id, day) and oturum is None
            attended = bool(oturum and oturum.durum in ATTENDED)
            title = (info or {}).get('title') or 'Tatil'
            hits.append({
                'slot_id': slot.id,
                'ders_id': slot.ders_id,
                'ders_ad': getattr(slot.ders, 'ad', '') or '',
                'tarih': iso,
                'tarih_label': day.strftime('%d.%m.%Y'),
                'saat': f"{slot.baslangic.strftime('%H:%M')}–{slot.bitis.strftime('%H:%M')}",
                'ogretmen_ad': _person_ad(slot.ogretmen),
                'tatil_baslik': title,
                'holiday_key': (info or {}).get('holiday_key') or '',
                'tatil_source': (info or {}).get('source') or '',
                'tatil_mode': 'tatil' if skipped else 'devam',
                'oturum_id': oturum.id if oturum else None,
                'can_toggle_tatil': not attended,
            })
    hits.sort(key=lambda r: (r['tarih'], r['saat'], r['ders_ad']))
    return hits


@transaction.atomic
def set_ogrenci_ders_tatil(
    *,
    ogrenci_id: int,
    ders_id: int,
    kurum_id: int,
    sube_id: int,
    day: date | str,
    mode: str,
    user=None,
) -> dict:
    """Bu öğrencinin bu dersindeki tatil gününü tatil veya devam yap."""
    day = _parse_date(day)
    mode = (mode or '').strip().lower()
    if mode not in ('tatil', 'devam'):
        raise OzelDersError('mode tatil veya devam olmalı.', 'mode')

    slots = [
        s for s in _active_slots(
            ogrenci_id=ogrenci_id, kurum_id=kurum_id, sube_id=sube_id, ders_id=ders_id,
        )
        if s.gun == day.isoweekday()
    ]
    slots = [
        s for s in slots
        if (s.baslangic_tarihi or s.program.baslangic_tarihi) <= day
        and (s.bitis_tarihi or s.program.bitis_tarihi or day) >= day
    ]
    if not slots:
        raise OzelDersError('Bu tarihte bu ders için şablon yok.', 'not_found', 404)

    holidays = holiday_map(kurum_id, sube_id, day, day)
    if day.isoformat() not in holidays and not is_holiday(kurum_id, sube_id, day):
        # Devam edilmiş (oturum var) tatil gününü geri tatil yapmak için oturum yeter.
        has_session = BirebirDersOturumu.objects.filter(
            kurum_id=kurum_id,
            ogrenci_id=ogrenci_id,
            ders_id=ders_id,
            session_date=day,
        ).exists()
        if not has_session:
            raise OzelDersError('Bu tarih tatil günü değil.', 'not_holiday')

    created = 0
    restored = 0
    skipped = 0

    if mode == 'devam':
        for slot in slots:
            existing = (
                BirebirDersOturumu.objects
                .filter(source_slot=slot, session_date=day)
                .order_by('-is_active', '-id')
                .first()
            )
            if existing:
                if existing.durum in ATTENDED and existing.is_active:
                    skipped += 1
                    continue
                if not existing.is_active or existing.durum == OturumDurumu.IPTAL:
                    existing.is_active = True
                    existing.durum = OturumDurumu.PLANLANDI
                    existing.save(update_fields=['is_active', 'durum'])
                    restored += 1
                else:
                    skipped += 1
                continue
            check_all_for_occurrence(
                ogretmen_id=slot.ogretmen_id,
                ogrenci_id=ogrenci_id,
                oda_id=slot.oda_id,
                kurum_id=kurum_id,
                sube_id=sube_id,
                session_date=day,
                start=slot.baslangic,
                end=slot.bitis,
                skip_holiday=False,
            )
            BirebirDersOturumu.objects.create(
                program=slot.program,
                source_slot=slot,
                kurum_id=kurum_id,
                sube_id=sube_id,
                egitim_yili_id=slot.program.egitim_yili_id,
                session_date=day,
                start_time=slot.baslangic,
                end_time=slot.bitis,
                ogrenci_id=ogrenci_id,
                ders_id=slot.ders_id,
                ogretmen_id=slot.ogretmen_id,
                oda_id=slot.oda_id,
                oturum_turu=OturumTuru.OZEL,
                durum=OturumDurumu.PLANLANDI,
                created_by=user if user and getattr(user, 'is_authenticated', False) else None,
            )
            created += 1
        label = 'Ders işlenecek (devam)'
    else:
        qs = BirebirDersOturumu.objects.filter(
            Q(source_slot__in=slots) | Q(source_slot__isnull=True, ders_id=ders_id),
            kurum_id=kurum_id,
            ogrenci_id=ogrenci_id,
            ders_id=ders_id,
            session_date=day,
            is_active=True,
            oturum_turu=OturumTuru.OZEL,
        )
        for oturum in qs:
            if oturum.durum in ATTENDED:
                raise OzelDersError(
                    'İşlenmiş ders tatil yapılamaz.',
                    'attended',
                )
            oturum.is_active = False
            oturum.save(update_fields=['is_active'])
            skipped += 1
        label = 'Ders tatil olarak atlandı'

    return {
        'date': day.isoformat(),
        'ders_id': ders_id,
        'mode': mode,
        'created': created,
        'restored': restored,
        'updated': skipped,
        'message': label,
    }
