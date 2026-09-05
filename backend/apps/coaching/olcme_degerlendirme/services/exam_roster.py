"""Sınav katılımcı çözümleme, oturma ve salon kapasitesi."""
from __future__ import annotations

import random
from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from ..models import ExamAudience, ExamParticipant, ExamRoom, ExamSessionModel
from .exam_schedule_groups import (
    HAFTA_ICI,
    attach_groups_to_candidates,
    student_matches_session,
)


@dataclass
class CandidateRec:
    student_id: int
    ad: str
    soyad: str
    tc: str = ''
    okul_no: str = ''
    sinif: str = ''
    sinif_seviyesi_id: int | None = None
    sinif_seviyesi: str = ''
    deneme_paketi_id: int | None = None
    source: str = 'auto'
    schedule_group: str = HAFTA_ICI

    @property
    def full_name(self) -> str:
        return f'{self.ad} {self.soyad}'.strip()

    def as_dict(self) -> dict:
        return {
            'student_id': self.student_id,
            'ad': self.ad,
            'soyad': self.soyad,
            'full_name': self.full_name,
            'tc_kimlik_no': self.tc,
            'okul_no': self.okul_no,
            'sinif': self.sinif,
            'sinif_seviyesi_id': self.sinif_seviyesi_id,
            'sinif_seviyesi': self.sinif_seviyesi,
            'deneme_paketi_id': self.deneme_paketi_id,
            'source': self.source,
            'schedule_group': self.schedule_group,
        }


def _ids(*values) -> list[int]:
    out = []
    for v in values:
        try:
            n = int(v)
        except (TypeError, ValueError):
            continue
        if n > 0:
            out.append(n)
    return list(dict.fromkeys(out))


def _deneme_ogrenci_ids(paket_ids: list[int], egitim_yili_id: int | None) -> set[int]:
    from apps.ogrenci.domain.models import OgrenciEgitimPaketi, OgrenciEkHizmet

    if not paket_ids:
        return set()
    from_ep = set(
        OgrenciEgitimPaketi.objects.filter(
            paket_turu='deneme', paket_id__in=paket_ids, aktif_mi=True,
        ).values_list('ogrenci_id', flat=True)
    )
    eh_qs = OgrenciEkHizmet.objects.filter(aktif_mi=True).filter(
        Q(ek_hizmet__deneme_paketi_id__in=paket_ids)
        | Q(ek_hizmet__hizmet_turu='deneme', ek_hizmet__deneme_paketi_id__in=paket_ids)
    )
    if egitim_yili_id:
        eh_qs = eh_qs.filter(Q(egitim_yili_id=egitim_yili_id) | Q(egitim_yili_id__isnull=True))
    from_eh = set(eh_qs.values_list('ogrenci_id', flat=True))
    return from_ep | from_eh


def _kayit_base(kurum_id, sube_id, egitim_yili_id):
    from apps.ogrenci.domain.models import OgrenciKayit

    qs = OgrenciKayit.objects.filter(
        aktif_mi=True,
        ogrenci__aktif_mi=True,
        kurum_id=kurum_id,
        sube_id=sube_id,
    ).select_related('ogrenci', 'sinif', 'sinif_seviyesi', 'sinif__sinif_seviyesi')
    if egitim_yili_id:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    return qs


def _seviye_of(kayit) -> int | None:
    if kayit.sinif_id and getattr(kayit.sinif, 'sinif_seviyesi_id', None):
        return kayit.sinif.sinif_seviyesi_id
    return kayit.sinif_seviyesi_id or None


def _seviye_ad(kayit) -> str:
    if kayit.sinif_id and getattr(kayit.sinif, 'sinif_seviyesi', None):
        return kayit.sinif.sinif_seviyesi.ad or ''
    if kayit.sinif_seviyesi_id:
        return getattr(kayit.sinif_seviyesi, 'ad', '') or ''
    return ''


def _to_rec(kayit, *, paket_id=None, source='auto') -> CandidateRec:
    ogr = kayit.ogrenci
    return CandidateRec(
        student_id=ogr.pk,
        ad=(ogr.ad or '').strip(),
        soyad=(ogr.soyad or '').strip(),
        tc=(ogr.tc_kimlik_no or '').strip(),
        okul_no=(kayit.okul_no or '').strip(),
        sinif=getattr(kayit.sinif, 'ad', '') or '',
        sinif_seviyesi_id=_seviye_of(kayit),
        sinif_seviyesi=_seviye_ad(kayit),
        deneme_paketi_id=paket_id,
        source=source,
    )


def _deneme_ogrenci_ids_cached(paket_ids, yil_id, cache: dict) -> set[int]:
    key = (tuple(paket_ids), yil_id)
    if key not in cache:
        cache[key] = _deneme_ogrenci_ids(list(paket_ids), yil_id)
    return cache[key]


def resolve_exam_candidates(
    *,
    kurum_id: int,
    sube_id: int,
    egitim_yili_id: int | None,
    sinif_ids: Iterable[int] | None = None,
    seviye_ids: Iterable[int] | None = None,
    paket_ids: Iterable[int] | None = None,
) -> list[CandidateRec]:
    sinif_ids = _ids(*(sinif_ids or []))
    seviye_ids = _ids(*(seviye_ids or []))
    paket_ids = _ids(*(paket_ids or []))
    if not sinif_ids and not seviye_ids and not paket_ids:
        return []

    kayitlar = list(_kayit_base(kurum_id, sube_id, egitim_yili_id))
    cache: dict = {}
    all_holders = _deneme_ogrenci_ids_cached(paket_ids, egitim_yili_id, cache) if paket_ids else set()
    from apps.egitim_paketleri.models import Deneme

    paket_seviye_map: dict[int, set[int]] = {}
    if paket_ids:
        for d in Deneme.objects.filter(pk__in=paket_ids).prefetch_related('sinif_seviyeleri'):
            paket_seviye_map[d.pk] = set(d.sinif_seviyeleri.values_list('id', flat=True))

    per_paket = {pid: _deneme_ogrenci_ids_cached([pid], egitim_yili_id, cache) for pid in paket_ids}

    by_id: dict[int, CandidateRec] = {}

    for kayit in kayitlar:
        ogr_id = kayit.ogrenci_id
        sev = _seviye_of(kayit)
        matched = False
        paket_id = None

        if sinif_ids and kayit.sinif_id in sinif_ids:
            matched = True
        if seviye_ids and not paket_ids and sev in seviye_ids:
            matched = True
        if paket_ids and ogr_id in all_holders:
            for pid in paket_ids:
                if ogr_id in per_paket[pid]:
                    paket_id = pid
                    break
            if seviye_ids:
                if sev in seviye_ids:
                    matched = True
                elif sev is None:
                    allowed = paket_seviye_map.get(paket_id or 0, set())
                    if not allowed or allowed & set(seviye_ids):
                        matched = True
            else:
                matched = True

        if matched:
            by_id.setdefault(ogr_id, _to_rec(kayit, paket_id=paket_id))

    recs = list(by_id.values())
    recs.sort(key=lambda r: (r.soyad.lower(), r.ad.lower(), r.student_id))
    return recs


def participant_student_ids(exam) -> set[int]:
    return set(
        ExamParticipant.objects.filter(exam=exam).values_list('student_id', flat=True)
    )


def exam_has_participants(exam) -> bool:
    return ExamParticipant.objects.filter(exam=exam).exists()


def _session_key(p: ExamParticipant):
    return (p.student_id, p.exam_session_id)


def replace_auto_participants(exam, candidates: list[CandidateRec], *, keep_manual=True, removed_ids=None) -> list[ExamParticipant]:
    removed_ids = set(removed_ids or [])
    attach_groups_to_candidates(
        candidates, sube_id=exam.sube_id, egitim_yili_id=exam.egitim_yili_id,
    )
    sessions = list(exam.exam_sessions.order_by('order', 'id'))
    existing = {
        _session_key(p): p
        for p in ExamParticipant.objects.filter(exam=exam)
    }
    keep: set[tuple[int, int | None]] = set()
    created = []

    targets: list[tuple[CandidateRec, int | None]] = []
    if sessions:
        for session in sessions:
            for rec in candidates:
                if rec.student_id in removed_ids:
                    continue
                if student_matches_session(rec.schedule_group, session.schedule_preference):
                    targets.append((rec, session.id))
    else:
        for rec in candidates:
            if rec.student_id in removed_ids:
                continue
            targets.append((rec, None))

    for rec, session_id in targets:
        key = (rec.student_id, session_id)
        keep.add(key)
        if key in existing:
            p = existing[key]
            if p.source == ExamParticipant.Source.MANUAL:
                continue
            p.sinif_seviyesi_id = rec.sinif_seviyesi_id
            p.deneme_paketi_id = rec.deneme_paketi_id
            p.save(update_fields=['sinif_seviyesi', 'deneme_paketi', 'updated_at'])
            continue
        created.append(ExamParticipant(
            exam=exam,
            student_id=rec.student_id,
            exam_session_id=session_id,
            source=ExamParticipant.Source.AUTO,
            sinif_seviyesi_id=rec.sinif_seviyesi_id,
            deneme_paketi_id=rec.deneme_paketi_id,
            attendance=ExamParticipant.Attendance.PRESENT,
        ))
    if created:
        ExamParticipant.objects.bulk_create(created)

    stale = [
        p.pk for key, p in existing.items()
        if p.source == ExamParticipant.Source.AUTO and key not in keep
    ]
    if stale:
        ExamParticipant.objects.filter(pk__in=stale).delete()
    return list(
        ExamParticipant.objects.filter(exam=exam)
        .select_related('student', 'room', 'sinif_seviyesi', 'exam_session')
    )


@transaction.atomic
def replace_rooms(exam, rooms_payload: list[dict]) -> list[ExamRoom]:
    """İsim takası unique constraint'i bozmasın diye önce geçici ad, sonra asıl ad."""
    if not isinstance(rooms_payload, list):
        rooms_payload = []
    keep_ids = []
    pending: list[tuple[ExamRoom, str]] = []
    for i, raw in enumerate(rooms_payload):
        if not isinstance(raw, dict):
            continue
        name = (raw.get('name') or f'Salon {i + 1}').strip() or f'Salon {i + 1}'
        try:
            cap = max(1, int(raw.get('capacity') or 30))
        except (TypeError, ValueError):
            cap = 30
        pk = raw.get('id')
        room = None
        if pk:
            try:
                room = ExamRoom.objects.filter(exam=exam, pk=int(pk)).first()
            except (TypeError, ValueError):
                room = None
        if room:
            room.capacity = cap
            room.order = i
            room.name = f'__tmp_{exam.pk}_{room.pk}'
            room.save(update_fields=['name', 'capacity', 'order'])
        else:
            room = ExamRoom.objects.create(
                exam=exam, name=f'__tmp_new_{exam.pk}_{i}', capacity=cap, order=i,
            )
        pending.append((room, name))
        keep_ids.append(room.pk)
    ExamRoom.objects.filter(exam=exam).exclude(pk__in=keep_ids).delete()
    used = set()
    for room, name in pending:
        final = name
        n = 2
        while final.casefold() in used:
            final = f'{name} {n}'
            n += 1
        used.add(final.casefold())
        room.name = final
        room.save(update_fields=['name'])
    return list(exam.rooms.order_by('order', 'id'))


def seating_capacity_error(participant_count: int, rooms: list[ExamRoom]) -> str | None:
    total = sum(r.capacity for r in rooms)
    if participant_count > total:
        need = participant_count - total
        return (
            f'{participant_count} öğrenci için toplam salon kapasitesi {total} kişi. '
            f'{need} kişilik ek kapasite gerekiyor.'
        )
    return None


def _session_filter(exam_session):
    if exam_session is None:
        return {'exam_session__isnull': True}
    sid = exam_session if isinstance(exam_session, int) else exam_session.pk
    return {'exam_session_id': sid}


def seat_is_locked(p: ExamParticipant) -> bool:
    return bool(p.notified_at and p.room_id and p.seat_no)


def seat_is_stale(p: ExamParticipant) -> bool:
    if not p.notified_at:
        return False
    return p.room_id != p.notified_room_id or p.seat_no != p.notified_seat_no


def mark_seat_notified(p: ExamParticipant) -> None:
    p.notified_at = timezone.now()
    p.notified_room_id = p.room_id
    p.notified_seat_no = p.seat_no
    p.save(update_fields=['notified_at', 'notified_room_id', 'notified_seat_no', 'updated_at'])


def next_free_seat(exam, room: ExamRoom, exam_session=None) -> int | None:
    qs = ExamParticipant.objects.filter(
        exam=exam, room=room, seat_no__isnull=False, **_session_filter(exam_session),
    )
    taken = set(qs.values_list('seat_no', flat=True))
    for n in range(1, (room.capacity or 0) + 1):
        if n not in taken:
            return n
    return None


def assign_participant_to_seat(p: ExamParticipant, room: ExamRoom, seat_no) -> str | None:
    """Öğrenciyi belirtilen salon ve sıraya koyar. Doluysa veya geçersizse hata döner."""
    try:
        seat = int(seat_no)
    except (TypeError, ValueError):
        return 'Geçerli bir sıra seçin.'
    cap = room.capacity or 0
    if seat < 1 or seat > cap:
        return f'Sıra 1–{cap} arasında olmalı.'
    taken = ExamParticipant.objects.filter(
        exam=p.exam, room=room, seat_no=seat, **_session_filter(p.exam_session_id),
    ).exclude(pk=p.pk).exists()
    if taken:
        return f'{room.name} sıra {seat} dolu.'
    p.room = room
    p.seat_no = seat
    p.desk_no = str(seat)
    p.save(update_fields=['room', 'seat_no', 'desk_no', 'updated_at'])
    return None


def assign_participant_to_room(p: ExamParticipant, room: ExamRoom) -> str | None:
    """Öğrenciyi salondaki ilk boş sıraya koyar. Doluysa hata metni döner."""
    if p.room_id == room.pk and p.seat_no:
        return None
    seat = next_free_seat(p.exam, room, p.exam_session_id)
    if seat is None:
        return f'{room.name} dolu ({room.capacity} kişilik).'
    return assign_participant_to_seat(p, room, seat)


def move_participant_to_session(p: ExamParticipant, target_session, *, room=None, seat_no=None):
    """Katılımcıyı başka oturuma taşır; eski sıra boş kalır. Yeni oturumda yer verir."""
    target_id = target_session.pk if target_session is not None else None
    if p.exam_session_id == target_id:
        if room and seat_no:
            return p, assign_participant_to_seat(p, room, seat_no)
        if room:
            return p, assign_participant_to_room(p, room)
        return p, None
    clash = ExamParticipant.objects.filter(
        exam=p.exam, student_id=p.student_id, exam_session_id=target_id,
    ).exclude(pk=p.pk).exists()
    if clash:
        return None, 'Bu öğrenci bu oturumda zaten var.'
    p.exam_session_id = target_id
    p.source = ExamParticipant.Source.MANUAL
    p.room = None
    p.seat_no = None
    p.desk_no = ''
    p.save(update_fields=['exam_session', 'source', 'room', 'seat_no', 'desk_no', 'updated_at'])
    if room and seat_no:
        return p, assign_participant_to_seat(p, room, seat_no)
    rooms = [room] if room else list(p.exam.rooms.order_by('order', 'id'))
    for item in rooms:
        if item and assign_participant_to_room(p, item) is None:
            break
    return p, None


def place_unassigned(exam, exam_session=None) -> dict:
    """Salon/sıra verilmemiş öğrencileri mevcut boş sıralara koyar; oturanlara dokunmaz."""
    if exam_session is None and exam.exam_sessions.exists():
        placed = unplaced = 0
        last = {'ok': True, 'placed': 0, 'unplaced': 0, 'mode': 'unassigned'}
        for sess in exam.exam_sessions.order_by('order', 'id'):
            last = place_unassigned(exam, sess)
            if not last.get('ok'):
                return last
            placed += last.get('placed') or 0
            unplaced += last.get('unplaced') or 0
        last['placed'] = placed
        last['unplaced'] = unplaced
        return last

    rooms = list(exam.rooms.order_by('order', 'id'))
    sf = _session_filter(exam_session)
    unassigned = list(
        ExamParticipant.objects.filter(exam=exam, room__isnull=True, **sf)
        .select_related('student')
        .order_by('id')
    )
    if not unassigned:
        return {'ok': True, 'placed': 0, 'unplaced': 0, 'mode': 'unassigned'}
    free = sum(
        max(0, r.capacity - ExamParticipant.objects.filter(exam=exam, room=r, **sf).count())
        for r in rooms
    )
    if len(unassigned) > free:
        return {
            'ok': False,
            'error': (
                f'{len(unassigned)} atamasız öğrenci için {free} boş sıra var. '
                f'Önce salon kapasitesini artırın.'
            ),
        }
    placed = 0
    idx = 0
    for room in rooms:
        while idx < len(unassigned):
            seat = next_free_seat(exam, room, exam_session)
            if seat is None:
                break
            p = unassigned[idx]
            p.room = room
            p.seat_no = seat
            p.desk_no = str(seat)
            p.save(update_fields=['room', 'seat_no', 'desk_no', 'updated_at'])
            placed += 1
            idx += 1
    return {
        'ok': True,
        'placed': placed,
        'unplaced': max(0, len(unassigned) - placed),
        'mode': 'unassigned',
    }


def apply_seating(exam, *, mode: str = 'shuffle', only_unassigned: bool = False, exam_session=None) -> dict:
    if only_unassigned:
        return place_unassigned(exam, exam_session)

    if exam_session is None and exam.exam_sessions.exists():
        placed = unplaced = 0
        last = {'ok': True, 'placed': 0, 'unplaced': 0, 'mode': mode}
        for sess in exam.exam_sessions.order_by('order', 'id'):
            last = apply_seating(exam, mode=mode, exam_session=sess)
            if not last.get('ok'):
                return last
            placed += last.get('placed') or 0
            unplaced += last.get('unplaced') or 0
        last['placed'] = placed
        last['unplaced'] = unplaced
        return last

    rooms = list(exam.rooms.order_by('order', 'id'))
    sf = _session_filter(exam_session)
    parts = list(
        ExamParticipant.objects.filter(exam=exam, **sf).select_related('student', 'sinif_seviyesi')
    )
    err = seating_capacity_error(len(parts), rooms)
    if err:
        return {'ok': False, 'error': err}

    locked = [p for p in parts if seat_is_locked(p)]
    locked_ids = {p.pk for p in locked}
    movable = [p for p in parts if p.pk not in locked_ids]

    ExamParticipant.objects.filter(exam=exam, **sf).exclude(pk__in=locked_ids).update(
        room=None, seat_no=None, desk_no='',
    )

    if mode == 'cross':
        buckets: dict[str, list] = defaultdict(list)
        for p in movable:
            key = str(p.sinif_seviyesi_id or p.deneme_paketi_id or 'x')
            buckets[key].append(p)
        for b in buckets.values():
            random.shuffle(b)
        ordered = []
        while any(buckets.values()):
            for key in list(buckets.keys()):
                if buckets[key]:
                    ordered.append(buckets[key].pop())
        movable = ordered
    elif mode == 'sequential':
        movable.sort(key=lambda p: ((p.student.soyad or ''), (p.student.ad or ''), p.pk))
    else:
        random.shuffle(movable)

    taken: dict[int, set[int]] = defaultdict(set)
    for p in locked:
        taken[p.room_id].add(p.seat_no)

    idx = 0
    for room in rooms:
        for seat in range(1, room.capacity + 1):
            if seat in taken[room.pk]:
                continue
            if idx >= len(movable):
                break
            p = movable[idx]
            p.room = room
            p.seat_no = seat
            p.desk_no = str(seat)
            p.save(update_fields=['room', 'seat_no', 'desk_no', 'updated_at'])
            idx += 1
        if idx >= len(movable):
            break

    return {
        'ok': True,
        'placed': idx + len(locked),
        'unplaced': max(0, len(movable) - idx),
        'locked': len(locked),
        'mode': mode,
    }


def apply_explicit_seating(exam, assignments: list[dict], exam_session=None) -> dict:
    """Sihirbazda onaylanan salon/sıra düzenini kaydet."""
    rooms = list(exam.rooms.order_by('order', 'id'))
    by_name = {r.name: r for r in rooms}
    by_index = {i: r for i, r in enumerate(rooms)}
    sf = _session_filter(exam_session)
    locked_ids = {
        p.pk for p in ExamParticipant.objects.filter(exam=exam, **sf)
        if seat_is_locked(p)
    }
    ExamParticipant.objects.filter(exam=exam, **sf).exclude(pk__in=locked_ids).update(
        room=None, seat_no=None, desk_no='',
    )
    placed = 0
    for raw in assignments or []:
        try:
            sid = int(raw.get('student_id'))
        except (TypeError, ValueError):
            continue
        qs = ExamParticipant.objects.filter(exam=exam, student_id=sid, **sf)
        p = qs.first()
        if not p or p.pk in locked_ids:
            continue
        room = None
        if raw.get('room_id'):
            room = next((r for r in rooms if r.pk == int(raw['room_id'])), None)
        elif raw.get('room_index') is not None:
            try:
                room = by_index.get(int(raw['room_index']))
            except (TypeError, ValueError):
                room = None
        elif raw.get('room_name'):
            room = by_name.get(str(raw['room_name']))
        seat = raw.get('seat_no')
        try:
            seat = int(seat) if seat not in (None, '') else None
        except (TypeError, ValueError):
            seat = None
        p.room = room
        p.seat_no = seat
        p.desk_no = str(seat) if seat else ''
        p.save(update_fields=['room', 'seat_no', 'desk_no', 'updated_at'])
        placed += 1
    return {'ok': True, 'placed': placed, 'mode': 'explicit'}


def replace_audiences(exam, rows: list[dict]) -> None:
    ExamAudience.objects.filter(exam=exam).delete()
    seen = set()
    to_create = []
    for raw in rows or []:
        sev = raw.get('sinif_seviyesi_id') or raw.get('sinif_seviyesi')
        pak = raw.get('deneme_paketi_id') or raw.get('deneme_paketi')
        try:
            sev = int(sev) if sev else None
        except (TypeError, ValueError):
            sev = None
        try:
            pak = int(pak) if pak else None
        except (TypeError, ValueError):
            pak = None
        key = (sev, pak)
        if key in seen:
            continue
        seen.add(key)
        to_create.append(ExamAudience(exam=exam, sinif_seviyesi_id=sev, deneme_paketi_id=pak))
    if to_create:
        ExamAudience.objects.bulk_create(to_create)


def serialize_participant(p: ExamParticipant) -> dict:
    st = p.student
    return {
        'id': p.id,
        'student_id': st.pk,
        'ad': st.ad,
        'soyad': st.soyad,
        'full_name': f'{st.ad} {st.soyad}'.strip(),
        'tc_kimlik_no': (st.tc_kimlik_no or '').strip(),
        'telefon': (st.telefon or '').strip(),
        'email': (st.email or '').strip(),
        'veli_ad_soyad': (st.veli_ad_soyad or '').strip(),
        'veli_telefon': (st.veli_telefon or '').strip(),
        'okul_no': '',
        'sinif': '',
        'sinif_seviyesi_id': p.sinif_seviyesi_id,
        'sinif_seviyesi': getattr(p.sinif_seviyesi, 'ad', '') if p.sinif_seviyesi_id else '',
        'deneme_paketi_id': p.deneme_paketi_id,
        'source': p.source,
        'room_id': p.room_id,
        'room_name': p.room.name if p.room_id else '',
        'seat_no': p.seat_no,
        'desk_no': p.desk_no,
        'attendance': p.attendance or '',
        'seat_locked': seat_is_locked(p),
        'seat_stale': seat_is_stale(p),
        'notified_at': p.notified_at.isoformat() if p.notified_at else None,
        'notified_seat_no': p.notified_seat_no,
        'exam_session_id': p.exam_session_id,
        'exam_session_name': p.exam_session.name if p.exam_session_id else '',
        'schedule_preference': (
            p.exam_session.schedule_preference if p.exam_session_id else ''
        ),
    }


def create_exam_sessions(exam, rows: list[dict]) -> list[ExamSessionModel]:
    """Sihirbaz create gövdesindeki oturumları yazar (yalnızca boşsa)."""
    if exam.exam_sessions.exists():
        return list(exam.exam_sessions.order_by('order', 'id'))
    created = []
    for i, raw in enumerate(rows or []):
        if not isinstance(raw, dict):
            continue
        name = (raw.get('name') or f'{i + 1}. Oturum').strip() or f'{i + 1}. Oturum'
        pref = (raw.get('schedule_preference') or 'FARKETMEZ').strip() or 'FARKETMEZ'
        if pref not in {c.value for c in ExamSessionModel.SchedulePreference}:
            pref = 'FARKETMEZ'

        def _empty(val):
            return None if val in (None, '') else val

        session = ExamSessionModel(
            exam=exam,
            name=name,
            order=int(raw.get('order') or i),
            session_date=_empty(raw.get('session_date')),
            start_time=_empty(raw.get('start_time')),
            end_time=_empty(raw.get('end_time')),
            duration_minutes=_empty(raw.get('duration_minutes')),
            schedule_preference=pref,
            description=(raw.get('description') or '').strip(),
        )
        try:
            if session.duration_minutes not in (None, ''):
                session.duration_minutes = int(session.duration_minutes)
        except (TypeError, ValueError):
            session.duration_minutes = None
        created.append(session)
    if created:
        ExamSessionModel.objects.bulk_create(created)
    return list(exam.exam_sessions.order_by('order', 'id'))


def add_manual_participant(exam, student_id: int, exam_session=None) -> tuple[ExamParticipant | None, str | None]:
    """Öğrenciyi verilen (veya eşleşen) oturuma manuel ekler."""
    from apps.ogrenci.domain.models import OgrenciKayit
    from .exam_schedule_groups import resolve_student_groups

    kayit = OgrenciKayit.objects.filter(
        ogrenci_id=student_id, aktif_mi=True, kurum_id=exam.kurum_id, sube_id=exam.sube_id,
    ).select_related('sinif', 'sinif_seviyesi', 'sinif__sinif_seviyesi').first()
    sev_id = _seviye_of(kayit) if kayit else None
    groups = resolve_student_groups(
        sube_id=exam.sube_id,
        egitim_yili_id=exam.egitim_yili_id,
        student_seviye_ids={student_id: sev_id},
    )
    group = groups.get(student_id, HAFTA_ICI)

    sessions = list(exam.exam_sessions.order_by('order', 'id'))
    if exam_session is not None:
        targets = [exam_session if not isinstance(exam_session, int) else
                   next((s for s in sessions if s.pk == exam_session), None)]
        targets = [s for s in targets if s]
        if not targets and isinstance(exam_session, int):
            return None, 'Oturum bulunamadı.'
    elif sessions:
        targets = [s for s in sessions if student_matches_session(group, s.schedule_preference)]
        if not targets:
            return None, 'Öğrencinin grubuna uygun oturum yok.'
    else:
        targets = [None]

    created_row = None
    any_new = False
    for sess in targets:
        sid = sess.pk if sess is not None else None
        p, created = ExamParticipant.objects.get_or_create(
            exam=exam, student_id=student_id, exam_session_id=sid,
            defaults={
                'source': ExamParticipant.Source.MANUAL,
                'sinif_seviyesi_id': sev_id,
                'attendance': ExamParticipant.Attendance.PRESENT,
            },
        )
        if created:
            any_new = True
            created_row = p
        elif created_row is None:
            created_row = p
    if not any_new:
        return created_row, 'Bu öğrenci zaten sınav listesinde.'
    return created_row, None


def enrich_participants(exam, rows: list[dict]) -> list[dict]:
    from apps.ogrenci.domain.models import OgrenciKayit, OgrenciVeli

    ids = [r['student_id'] for r in rows]
    kayitlar = OgrenciKayit.objects.filter(
        ogrenci_id__in=ids, aktif_mi=True,
    ).select_related('sinif', 'sinif_seviyesi', 'sinif__sinif_seviyesi')
    if exam.egitim_yili_id:
        kayitlar = kayitlar.filter(egitim_yili_id=exam.egitim_yili_id)
    by = {}
    for k in kayitlar.order_by('-id'):
        by.setdefault(k.ogrenci_id, k)

    veli_by: dict[int, OgrenciVeli] = {}
    if ids:
        for v in OgrenciVeli.objects.filter(ogrenci_id__in=ids).order_by('-varsayilan', 'id'):
            veli_by.setdefault(v.ogrenci_id, v)

    for r in rows:
        k = by.get(r['student_id'])
        if k:
            r['okul_no'] = (k.okul_no or '').strip()
            r['sinif'] = getattr(k.sinif, 'ad', '') or ''
            if not r.get('sinif_seviyesi'):
                r['sinif_seviyesi'] = _seviye_ad(k)
                r['sinif_seviyesi_id'] = _seviye_of(k)
        veli = veli_by.get(r['student_id'])
        if veli:
            r['veli_ad_soyad'] = f'{veli.ad} {veli.soyad}'.strip() or r.get('veli_ad_soyad') or ''
            r['veli_telefon'] = (veli.telefon or r.get('veli_telefon') or '').strip()
    return rows
