from __future__ import annotations

from datetime import datetime, date, time
from typing import Any, Optional

from django.db import transaction

from apps.ozel_ders.domain.models import BirebirHaftalikSlot, BirebirOgrenciProgrami
from apps.ozel_ders.services.conflict_service import validate_slot_window
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services.program_service import get_program


def serialize_slot(s: BirebirHaftalikSlot) -> dict:
    ders = s.ders
    ders_ad = getattr(ders, 'ad', None) or str(s.ders_id)
    ders_kisa = (getattr(ders, 'kisa_ad', None) or '').strip()
    return {
        'id': s.id,
        'program': s.program_id,
        'gun': s.gun,
        'baslangic': s.baslangic.strftime('%H:%M'),
        'bitis': s.bitis.strftime('%H:%M'),
        'sure_dk': s.resolved_sure_dk(),
        'ders': s.ders_id,
        'ders_ad': ders_ad,
        'ders_kisa_ad': ders_kisa,
        'ogretmen': s.ogretmen_id,
        'ogretmen_ad': getattr(s.ogretmen, 'tam_ad', str(s.ogretmen_id)),
        'oda': s.oda_id,
        'oda_ad': s.oda.ad if s.oda_id else None,
        'aktif': s.aktif,
        'baslangic_tarihi': s.baslangic_tarihi.isoformat() if s.baslangic_tarihi else None,
        'bitis_tarihi': s.bitis_tarihi.isoformat() if s.bitis_tarihi else None,
    }


def _parse_time(value) -> time:
    if isinstance(value, time):
        return value
    if isinstance(value, str):
        for fmt in ('%H:%M:%S', '%H:%M'):
            try:
                return datetime.strptime(value, fmt).time()
            except ValueError:
                continue
    raise OzelDersError('Geçersiz saat formatı.', 'time')


def _slot_overlap(a_start: time, a_end: time, b_start: time, b_end: time) -> bool:
    return a_start < b_end and a_end > b_start


def _check_template_conflicts(
    program: BirebirOgrenciProgrami,
    *,
    gun: int,
    baslangic: time,
    bitis: time,
    ogretmen_id: int,
    oda_id: Optional[int],
    exclude_id: Optional[int] = None,
    exclude_ids: Optional[list[int]] = None,
) -> None:
    """Aynı program + diğer aktif program şablonlarıyla öğretmen/öğrenci/oda çakışması."""
    excluded = set(exclude_ids or [])
    if exclude_id:
        excluded.add(exclude_id)

    # Aynı öğrencinin diğer program slotları
    other_slots = BirebirHaftalikSlot.objects.filter(
        aktif=True,
        gun=gun,
        program__ogrenci_id=program.ogrenci_id,
        program__durum='AKTIF',
    ).exclude(program_id=program.id)
    if excluded:
        other_slots = other_slots.exclude(pk__in=excluded)
    for s in other_slots:
        if _slot_overlap(baslangic, bitis, s.baslangic, s.bitis):
            raise OzelDersError(
                f'Öğrenci şablon çakışması (slot #{s.pk}).',
                'student_template_conflict',
            )

    # Aynı program içi
    same = program.slots.filter(aktif=True, gun=gun)
    if excluded:
        same = same.exclude(pk__in=excluded)
    for s in same:
        if _slot_overlap(baslangic, bitis, s.baslangic, s.bitis):
            raise OzelDersError(
                f'Program içi saat çakışması (slot #{s.pk}).',
                'program_slot_conflict',
            )

    # Öğretmen — tüm aktif programlar
    teacher_slots = BirebirHaftalikSlot.objects.filter(
        aktif=True,
        gun=gun,
        ogretmen_id=ogretmen_id,
        program__durum='AKTIF',
        program__kurum_id=program.kurum_id,
    )
    if excluded:
        teacher_slots = teacher_slots.exclude(pk__in=excluded)
    for s in teacher_slots:
        if s.program_id == program.id:
            continue
        if _slot_overlap(baslangic, bitis, s.baslangic, s.bitis):
            raise OzelDersError(
                f'Öğretmen şablon çakışması (slot #{s.pk}).',
                'teacher_template_conflict',
            )

    if oda_id:
        room_slots = BirebirHaftalikSlot.objects.filter(
            aktif=True,
            gun=gun,
            oda_id=oda_id,
            program__durum='AKTIF',
            program__kurum_id=program.kurum_id,
        )
        if excluded:
            room_slots = room_slots.exclude(pk__in=excluded)
        for s in room_slots:
            if s.program_id == program.id:
                continue
            if _slot_overlap(baslangic, bitis, s.baslangic, s.bitis):
                raise OzelDersError(
                    f'Derslik şablon çakışması (slot #{s.pk}).',
                    'room_template_conflict',
                )


def list_slots(program_id: int, *, kurum_id: int, sube_id: int) -> list[dict]:
    program = get_program(program_id, kurum_id=kurum_id, sube_id=sube_id)
    slots = program.slots.select_related('ders', 'ogretmen', 'oda').all()
    return [serialize_slot(s) for s in slots]


@transaction.atomic
def create_slot(
    program_id: int,
    data: dict[str, Any],
    *,
    kurum_id: int,
    sube_id: int,
) -> BirebirHaftalikSlot:
    program = get_program(program_id, kurum_id=kurum_id, sube_id=sube_id)
    gun = int(data.get('gun') or 0)
    if gun < 1 or gun > 7:
        raise OzelDersError('Gün 1-7 arasında olmalı.', 'gun')
    baslangic = _parse_time(data.get('baslangic'))
    bitis = _parse_time(data.get('bitis'))
    validate_slot_window(baslangic, bitis)
    if not data.get('ders_id'):
        raise OzelDersError('Ders seçimi zorunlu.', 'ders_id')
    if not data.get('ogretmen_id'):
        raise OzelDersError('Öğretmen seçimi zorunlu.', 'ogretmen_id')

    sure_dk = int(data.get('sure_dk') or 0)
    if not sure_dk:
        start_dt = datetime.combine(date.today(), baslangic)
        end_dt = datetime.combine(date.today(), bitis)
        sure_dk = max(int((end_dt - start_dt).total_seconds() // 60), 0)

    _check_template_conflicts(
        program,
        gun=gun,
        baslangic=baslangic,
        bitis=bitis,
        ogretmen_id=data['ogretmen_id'],
        oda_id=data.get('oda_id'),
    )

    return BirebirHaftalikSlot.objects.create(
        program=program,
        gun=gun,
        baslangic=baslangic,
        bitis=bitis,
        sure_dk=sure_dk,
        ders_id=data['ders_id'],
        ogretmen_id=data['ogretmen_id'],
        oda_id=data.get('oda_id'),
        aktif=data.get('aktif', True),
        baslangic_tarihi=data.get('baslangic_tarihi'),
        bitis_tarihi=data.get('bitis_tarihi'),
    )


@transaction.atomic
def update_slot(
    slot_id: int,
    data: dict[str, Any],
    *,
    kurum_id: int,
    sube_id: int,
) -> BirebirHaftalikSlot:
    try:
        slot = BirebirHaftalikSlot.objects.select_related('program').get(
            pk=slot_id,
            program__kurum_id=kurum_id,
            program__sube_id=sube_id,
        )
    except BirebirHaftalikSlot.DoesNotExist:
        raise OzelDersError('Slot bulunamadı.', 'not_found', 404)

    gun = int(data['gun']) if 'gun' in data else slot.gun
    baslangic = _parse_time(data['baslangic']) if 'baslangic' in data else slot.baslangic
    bitis = _parse_time(data['bitis']) if 'bitis' in data else slot.bitis
    validate_slot_window(baslangic, bitis)
    ogretmen_id = data.get('ogretmen_id', slot.ogretmen_id)
    oda_id = data['oda_id'] if 'oda_id' in data else slot.oda_id

    _check_template_conflicts(
        slot.program,
        gun=gun,
        baslangic=baslangic,
        bitis=bitis,
        ogretmen_id=ogretmen_id,
        oda_id=oda_id,
        exclude_id=slot.id,
    )

    slot.gun = gun
    slot.baslangic = baslangic
    slot.bitis = bitis
    if 'sure_dk' in data:
        slot.sure_dk = int(data['sure_dk'] or 0)
    elif 'baslangic' in data or 'bitis' in data:
        start_dt = datetime.combine(date.today(), baslangic)
        end_dt = datetime.combine(date.today(), bitis)
        slot.sure_dk = max(int((end_dt - start_dt).total_seconds() // 60), 0)
    if 'ders_id' in data:
        slot.ders_id = data['ders_id']
    slot.ogretmen_id = ogretmen_id
    slot.oda_id = oda_id
    if 'aktif' in data:
        slot.aktif = bool(data['aktif'])
    if 'baslangic_tarihi' in data:
        slot.baslangic_tarihi = data['baslangic_tarihi']
    if 'bitis_tarihi' in data:
        slot.bitis_tarihi = data['bitis_tarihi']
    slot.save()
    return slot


@transaction.atomic
def delete_slot(slot_id: int, *, kurum_id: int, sube_id: int) -> None:
    try:
        slot = BirebirHaftalikSlot.objects.get(
            pk=slot_id,
            program__kurum_id=kurum_id,
            program__sube_id=sube_id,
        )
    except BirebirHaftalikSlot.DoesNotExist:
        raise OzelDersError('Slot bulunamadı.', 'not_found', 404)
    slot.aktif = False
    slot.save(update_fields=['aktif', 'updated_at'])


@transaction.atomic
def swap_slots(
    slot_a_id: int,
    slot_b_id: int,
    *,
    kurum_id: int,
    sube_id: int,
) -> tuple[BirebirHaftalikSlot, BirebirHaftalikSlot]:
    """İki aktif dersin gün/saatini atomik olarak yer değiştir."""
    try:
        a = BirebirHaftalikSlot.objects.select_related('program').get(
            pk=slot_a_id,
            program__kurum_id=kurum_id,
            program__sube_id=sube_id,
            aktif=True,
        )
        b = BirebirHaftalikSlot.objects.select_related('program').get(
            pk=slot_b_id,
            program__kurum_id=kurum_id,
            program__sube_id=sube_id,
            aktif=True,
        )
    except BirebirHaftalikSlot.DoesNotExist:
        raise OzelDersError('Ders bulunamadı.', 'not_found', 404)

    if a.id == b.id:
        raise OzelDersError('Aynı ders yer değiştiremez.', 'swap_same')

    if a.program_id != b.program_id:
        raise OzelDersError('Yalnızca aynı program içindeki dersler yer değiştirebilir.', 'swap_program')

    a_gun, a_start, a_end, a_sure = a.gun, a.baslangic, a.bitis, a.sure_dk
    b_gun, b_start, b_end, b_sure = b.gun, b.baslangic, b.bitis, b.sure_dk
    both = [a.id, b.id]

    # A → B'nin yeri
    _check_template_conflicts(
        a.program,
        gun=b_gun,
        baslangic=b_start,
        bitis=b_end,
        ogretmen_id=a.ogretmen_id,
        oda_id=a.oda_id,
        exclude_ids=both,
    )
    # B → A'nın yeri
    _check_template_conflicts(
        b.program,
        gun=a_gun,
        baslangic=a_start,
        bitis=a_end,
        ogretmen_id=b.ogretmen_id,
        oda_id=b.oda_id,
        exclude_ids=both,
    )

    a.gun, a.baslangic, a.bitis, a.sure_dk = b_gun, b_start, b_end, b_sure
    b.gun, b.baslangic, b.bitis, b.sure_dk = a_gun, a_start, a_end, a_sure
    a.save()
    b.save()
    return a, b
