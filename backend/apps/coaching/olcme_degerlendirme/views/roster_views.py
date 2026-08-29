"""Sınav katılımcı, salon, oturma, yoklama ve çıktı endpoint'leri."""
from io import BytesIO

from django.db import transaction
from django.http import HttpResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..interfaces.sube_context import get_exam_or_response, mandatory_olcme_context
from ..models import ExamParticipant, ExamRoom
from ..services.exam_roster import (
    add_manual_participant,
    apply_explicit_seating,
    apply_seating,
    assign_participant_to_room,
    assign_participant_to_seat,
    create_exam_sessions,
    enrich_participants,
    mark_seat_notified,
    move_participant_to_session,
    place_unassigned,
    replace_audiences,
    replace_auto_participants,
    replace_rooms,
    resolve_exam_candidates,
    seating_capacity_error,
    serialize_participant,
)
from ..services.exam_schedule_groups import attach_groups_to_candidates
from ..views import CsrfExemptSessionAuthentication
from shared.context import get_secili_egitim_yili_id


def _int_list(raw) -> list[int]:
    if raw is None:
        return []
    if isinstance(raw, str):
        raw = [x for x in raw.split(',') if x.strip()]
    out = []
    for v in raw:
        try:
            out.append(int(v))
        except (TypeError, ValueError):
            continue
    return list(dict.fromkeys(out))


def _max_session_count(exam) -> int:
    sessions = list(exam.exam_sessions.order_by('id'))
    if not sessions:
        return ExamParticipant.objects.filter(exam=exam).count()
    return max(
        (ExamParticipant.objects.filter(exam=exam, exam_session=s).count() for s in sessions),
        default=0,
    )


def apply_roster_payload(exam, data: dict) -> dict:
    """Create/update sonrası kitle, oda, otomatik/manuel katılımcı ve oturma."""
    if data.get('sessions') and not exam.exam_sessions.exists():
        create_exam_sessions(exam, data.get('sessions') or [])
        from .exam_views import _sync_exam_date_from_sessions
        _sync_exam_date_from_sessions(exam)

    sinif_ids = _int_list(data.get('sinif_ids'))
    if sinif_ids:
        exam.siniflar.set(sinif_ids)
    else:
        sinif_ids = list(exam.siniflar.values_list('id', flat=True))

    audience = data.get('audience') or []
    seviye_ids = _int_list(data.get('sinif_seviyesi_ids'))
    paket_ids = _int_list(data.get('deneme_paketi_ids'))
    if audience:
        replace_audiences(exam, audience)
    elif seviye_ids or paket_ids:
        rows = []
        if seviye_ids and paket_ids:
            for sev in seviye_ids:
                for pak in paket_ids:
                    rows.append({'sinif_seviyesi_id': sev, 'deneme_paketi_id': pak})
        else:
            rows.extend({'sinif_seviyesi_id': sev} for sev in seviye_ids)
            rows.extend({'deneme_paketi_id': pak} for pak in paket_ids)
        replace_audiences(exam, rows)
    if not seviye_ids:
        seviye_ids = [
            a.sinif_seviyesi_id for a in exam.audiences.all() if a.sinif_seviyesi_id
        ]
    if not paket_ids:
        paket_ids = [
            a.deneme_paketi_id for a in exam.audiences.all() if a.deneme_paketi_id
        ]

    rooms_payload = data.get('rooms')
    if rooms_payload is not None:
        rooms = replace_rooms(exam, rooms_payload)
    else:
        rooms = list(exam.rooms.order_by('order', 'id'))

    candidates = resolve_exam_candidates(
        kurum_id=exam.kurum_id,
        sube_id=exam.sube_id,
        egitim_yili_id=exam.egitim_yili_id,
        sinif_ids=sinif_ids,
        seviye_ids=seviye_ids,
        paket_ids=paket_ids,
    )
    removed = _int_list(data.get('removed_auto_ids'))
    replace_auto_participants(exam, candidates, removed_ids=removed)

    for sid in _int_list(data.get('manual_student_ids')):
        add_manual_participant(exam, sid)

    seating_mode = data.get('seating_mode')
    assignments = data.get('seat_assignments')
    seating = None
    count = _max_session_count(exam)
    if rooms and count:
        err = seating_capacity_error(count, rooms)
        if err:
            return {'ok': False, 'error': err}
    sessions = list(exam.exam_sessions.order_by('order', 'id'))
    if assignments and len(sessions) <= 1:
        seating = apply_explicit_seating(
            exam, assignments, exam_session=sessions[0] if sessions else None,
        )
    elif seating_mode and rooms:
        seating = apply_seating(exam, mode=seating_mode)
        if not seating.get('ok'):
            return seating
    elif rooms:
        seating = place_unassigned(exam)

    return {'ok': True, 'seating': seating, 'participant_count': ExamParticipant.objects.filter(exam=exam).count()}


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def preview_participants(request):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return err
    ey_id = get_secili_egitim_yili_id(request)
    recs = resolve_exam_candidates(
        kurum_id=ctx['kurum_id'],
        sube_id=ctx['sube_id'],
        egitim_yili_id=ey_id,
        sinif_ids=_int_list(request.data.get('sinif_ids')),
        seviye_ids=_int_list(request.data.get('sinif_seviyesi_ids')),
        paket_ids=_int_list(request.data.get('deneme_paketi_ids')),
    )
    attach_groups_to_candidates(recs, sube_id=ctx['sube_id'], egitim_yili_id=ey_id)
    return Response({
        'count': len(recs),
        'students': [r.as_dict() for r in recs],
    })


@api_view(['GET', 'PUT'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_audience(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    if request.method == 'PUT':
        replace_audiences(exam, request.data.get('audience') or request.data.get('items') or [])
    rows = list(exam.audiences.select_related('sinif_seviyesi', 'deneme_paketi'))
    return Response([
        {
            'id': a.id,
            'sinif_seviyesi_id': a.sinif_seviyesi_id,
            'sinif_seviyesi': getattr(a.sinif_seviyesi, 'ad', '') if a.sinif_seviyesi_id else '',
            'deneme_paketi_id': a.deneme_paketi_id,
            'deneme_paketi': getattr(a.deneme_paketi, 'ad', '') if a.deneme_paketi_id else '',
        }
        for a in rows
    ])


@api_view(['GET', 'POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_participants(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    if request.method == 'POST':
        with transaction.atomic():
            result = apply_roster_payload(exam, request.data)
            if not result.get('ok'):
                return Response({'error': result.get('error')}, status=400)
    parts = list(
        ExamParticipant.objects.filter(exam=exam)
        .select_related('student', 'room', 'sinif_seviyesi', 'exam_session')
        .order_by('exam_session__order', 'room__order', 'seat_no', 'id')
    )
    rows = enrich_participants(exam, [serialize_participant(p) for p in parts])
    return Response({
        'count': len(rows),
        'participants': rows,
        'rooms': [
            {'id': r.id, 'name': r.name, 'capacity': r.capacity, 'order': r.order}
            for r in exam.rooms.order_by('order', 'id')
        ],
        'sessions': [
            {
                'id': s.id,
                'name': s.name,
                'order': s.order,
                'session_date': s.session_date,
                'start_time': s.start_time,
                'end_time': s.end_time,
                'schedule_preference': s.schedule_preference,
                'schedule_preference_display': s.get_schedule_preference_display(),
            }
            for s in exam.exam_sessions.order_by('order', 'id')
        ],
    })


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_participant_add(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    student_id = request.data.get('student_id')
    try:
        student_id = int(student_id)
    except (TypeError, ValueError):
        return Response({'error': 'Öğrenci seçin.'}, status=400)
    from apps.ogrenci.domain.models import Ogrenci
    if not Ogrenci.objects.filter(
        pk=student_id, aktif_mi=True, kurum_id=exam.kurum_id, sube_id=exam.sube_id,
    ).exists():
        return Response({'error': 'Bu öğrenci bu şubede değil.'}, status=400)
    session_id = request.data.get('exam_session_id')
    try:
        session_id = int(session_id) if session_id not in (None, '') else None
    except (TypeError, ValueError):
        session_id = None
    room_id = request.data.get('room_id')
    seat_raw = request.data.get('seat_no')
    target_room = None
    target_seat = None
    if room_id not in (None, '') or seat_raw not in (None, ''):
        try:
            target_room = ExamRoom.objects.filter(exam=exam, pk=int(room_id)).first()
            target_seat = int(seat_raw)
        except (TypeError, ValueError):
            target_room = None
            target_seat = None
        if not target_room or not target_seat:
            return Response({'error': 'Salon ve sıra seçin.'}, status=400)

    existing = list(
        ExamParticipant.objects.filter(exam=exam, student_id=student_id)
        .select_related('student', 'room', 'sinif_seviyesi', 'exam_session')
    )
    in_current = next(
        (row for row in existing if row.exam_session_id == session_id),
        None,
    )
    if in_current:
        return Response({'error': 'Bu öğrenci bu oturumda zaten var.'}, status=400)
    other = next((row for row in existing if row.exam_session_id != session_id), None)
    if other:
        target = None
        if session_id:
            target = exam.exam_sessions.filter(pk=session_id).first()
            if not target:
                return Response({'error': 'Oturum bulunamadı.'}, status=400)
        p, err_msg = move_participant_to_session(
            other, target, room=target_room, seat_no=target_seat,
        )
        if not p:
            return Response({'error': err_msg or 'Oturum değiştirilemedi.'}, status=400)
        if err_msg:
            return Response({'error': err_msg}, status=400)
    else:
        p, err_msg = add_manual_participant(exam, student_id, exam_session=session_id)
        if err_msg:
            return Response({'error': err_msg}, status=400)
        if p and target_room and target_seat:
            seat_err = assign_participant_to_seat(p, target_room, target_seat)
            if seat_err:
                if not p.room_id:
                    p.delete()
                return Response({'error': seat_err}, status=400)
        elif p and not p.room_id:
            for room in exam.rooms.order_by('order', 'id'):
                if assign_participant_to_room(p, room) is None:
                    break
    row = enrich_participants(exam, [serialize_participant(
        ExamParticipant.objects.select_related(
            'student', 'room', 'sinif_seviyesi', 'exam_session',
        ).get(pk=p.pk)
    )])[0]
    return Response(row, status=201)


@api_view(['PATCH', 'DELETE'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_participant_detail(request, exam_pk, participant_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    try:
        p = ExamParticipant.objects.select_related(
            'student', 'room', 'sinif_seviyesi', 'exam_session',
        ).get(
            pk=participant_pk, exam=exam,
        )
    except ExamParticipant.DoesNotExist:
        return Response({'error': 'Katılımcı bulunamadı.'}, status=404)

    if request.method == 'DELETE':
        p.delete()
        return Response(status=204)

    if 'exam_session_id' in request.data:
        raw = request.data.get('exam_session_id')
        try:
            sid = int(raw) if raw not in (None, '') else None
        except (TypeError, ValueError):
            return Response({'error': 'Oturum seçin.'}, status=400)
        target = exam.exam_sessions.filter(pk=sid).first() if sid else None
        if sid and not target:
            return Response({'error': 'Oturum bulunamadı.'}, status=400)
        moved, move_err = move_participant_to_session(p, target)
        if not moved:
            return Response({'error': move_err or 'Oturum değiştirilemedi.'}, status=400)
        return Response(enrich_participants(exam, [serialize_participant(
            ExamParticipant.objects.select_related(
                'student', 'room', 'sinif_seviyesi', 'exam_session',
            ).get(pk=moved.pk)
        )])[0])

    attendance = request.data.get('attendance')
    if attendance is not None:
        if attendance not in ('', 'present', 'absent'):
            return Response({'error': 'Geçersiz yoklama değeri.'}, status=400)
        p.attendance = attendance
    if 'room_id' in request.data:
        rid = request.data.get('room_id')
        if rid in (None, ''):
            p.room = None
            p.seat_no = None
            p.desk_no = ''
        else:
            room = ExamRoom.objects.filter(exam=exam, pk=rid).first()
            if not room:
                return Response({'error': 'Salon bulunamadı.'}, status=400)
            if 'seat_no' not in request.data:
                err = assign_participant_to_room(p, room)
                if err:
                    return Response({'error': err}, status=400)
                return Response(enrich_participants(exam, [serialize_participant(
                    ExamParticipant.objects.select_related(
                        'student', 'room', 'sinif_seviyesi', 'exam_session',
                    ).get(pk=p.pk)
                )])[0])
            p.room = room
    if 'seat_no' in request.data:
        raw = request.data.get('seat_no')
        p.seat_no = int(raw) if raw not in (None, '') else None
        p.desk_no = str(p.seat_no) if p.seat_no else ''
    p.save()
    return Response(enrich_participants(exam, [serialize_participant(
        ExamParticipant.objects.select_related(
            'student', 'room', 'sinif_seviyesi', 'exam_session',
        ).get(pk=p.pk)
    )])[0])


@api_view(['GET', 'PUT'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_rooms(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    if request.method == 'PUT':
        payload = request.data.get('rooms')
        if payload is None and isinstance(request.data, list):
            payload = request.data
        if not isinstance(payload, list):
            return Response({'error': 'Salon listesi geçersiz.'}, status=400)
        replace_rooms(exam, payload)
    rooms = list(exam.rooms.order_by('order', 'id'))
    count = _max_session_count(exam)
    cap = sum(r.capacity for r in rooms)
    return Response({
        'rooms': [
            {'id': r.id, 'name': r.name, 'capacity': r.capacity, 'order': r.order}
            for r in rooms
        ],
        'participant_count': count,
        'total_capacity': cap,
        'warning': seating_capacity_error(count, rooms),
    })


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_seating(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    only_unassigned = bool(request.data.get('only_unassigned'))
    session_id = request.data.get('exam_session_id')
    try:
        session_id = int(session_id) if session_id not in (None, '') else None
    except (TypeError, ValueError):
        session_id = None
    session = None
    if session_id:
        session = exam.exam_sessions.filter(pk=session_id).first()
        if not session:
            return Response({'error': 'Oturum bulunamadı.'}, status=400)
    if only_unassigned:
        result = place_unassigned(exam, session)
    else:
        mode = request.data.get('mode') or 'shuffle'
        if mode not in ('sequential', 'shuffle', 'cross'):
            return Response({'error': 'Geçersiz yerleştirme modu.'}, status=400)
        result = apply_seating(exam, mode=mode, exam_session=session)
    if not result.get('ok'):
        return Response({'error': result.get('error')}, status=400)
    return Response(result)


def _ordered_participants(exam):
    parts = list(
        ExamParticipant.objects.filter(exam=exam)
        .select_related('student', 'room', 'sinif_seviyesi')
        .order_by('room__order', 'seat_no', 'id')
    )
    return enrich_participants(exam, [serialize_participant(p) for p in parts])


def _xlsx_response(exam, rows, filename: str, kind: str):
    from openpyxl import Workbook
    wb = Workbook()
    wb.remove(wb.active)
    by_room: dict[str, list] = {}
    for r in rows:
        key = r.get('room_name') or 'Salonsuz'
        by_room.setdefault(key, []).append(r)
    if not by_room:
        by_room['Salonsuz'] = []
    for room_name, items in by_room.items():
        ws = wb.create_sheet(title=room_name[:31])
        ws.append([exam.name, kind])
        if kind == 'yoklama':
            ws.append(['Sıra', 'Öğrenci No', 'Ad Soyad', 'Sınıf', 'TC', 'Telefon', 'Geldi', 'Gelmedi'])
            for r in items:
                present = (r.get('attendance') or '') == 'present'
                absent = (r.get('attendance') or '') == 'absent'
                ws.append([
                    r.get('seat_no') or '',
                    r.get('okul_no') or '',
                    r['full_name'],
                    r.get('sinif') or '',
                    r.get('tc_kimlik_no') or '',
                    r.get('telefon') or '',
                    '✓' if present else '',
                    '✓' if absent else '',
                ])
        elif kind == 'salon':
            ws.append(['Sıra', 'Öğrenci', 'Sınıf', 'No'])
            for r in items:
                ws.append([
                    r.get('seat_no') or '',
                    f"{r['full_name']} — {r.get('sinif') or '—'} — No: {r.get('okul_no') or '—'}",
                    r.get('sinif') or '',
                    r.get('okul_no') or '',
                ])
        else:
            ws.append(['Sıra', 'Öğrenci'])
            for r in items:
                ws.append([r.get('seat_no') or '', r['full_name']])
    buf = BytesIO()
    wb.save(buf)
    resp = HttpResponse(
        buf.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    resp['Content-Disposition'] = f'attachment; filename="{filename}"'
    return resp


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_roster_export(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    kind = request.query_params.get('kind') or 'yoklama'
    if kind not in ('yoklama', 'salon', 'oturma'):
        return Response({'error': 'Geçersiz çıktı türü.'}, status=400)
    rows = _ordered_participants(exam)
    return _xlsx_response(exam, rows, f'{exam.name}-{kind}.xlsx', kind)


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_participant_search(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    q = (request.query_params.get('q') or '').strip()
    if len(q) < 2:
        return Response([])
    from apps.ogrenci.domain.models import Ogrenci
    session_id = request.query_params.get('exam_session_id')
    try:
        session_id = int(session_id) if session_id not in (None, '') else None
    except (TypeError, ValueError):
        session_id = None
    parts = list(
        ExamParticipant.objects.filter(exam=exam)
        .select_related('exam_session', 'room')
    )
    in_current = {
        p.student_id for p in parts
        if p.exam_session_id == session_id
    }
    others_by_student: dict[int, list] = {}
    for p in parts:
        if p.student_id in in_current:
            continue
        others_by_student.setdefault(p.student_id, []).append(p)

    qs = Ogrenci.objects.filter(
        aktif_mi=True, kurum_id=exam.kurum_id, sube_id=exam.sube_id,
    ).exclude(pk__in=in_current).filter(Q_name(q))[:20]

    def _other_payload(p):
        sess = p.exam_session
        return {
            'participant_id': p.id,
            'exam_session_id': p.exam_session_id,
            'exam_session_name': sess.name if sess else '',
            'schedule_preference': sess.schedule_preference if sess else '',
            'schedule_preference_display': (
                sess.get_schedule_preference_display() if sess else ''
            ),
            'room_name': p.room.name if p.room_id else '',
            'seat_no': p.seat_no,
        }

    items = []
    for o in qs:
        others = others_by_student.get(o.id) or []
        primary = others[0] if others else None
        items.append({
            'id': o.id,
            'full_name': f'{o.ad} {o.soyad}'.strip(),
            'ad': o.ad,
            'soyad': o.soyad,
            'in_other_session': bool(primary),
            'other_session': _other_payload(primary) if primary else None,
            'other_session_count': len(others),
        })
    return Response(items)


def Q_name(q):
    from django.db.models import Q
    return Q(ad__icontains=q) | Q(soyad__icontains=q) | Q(tc_kimlik_no__icontains=q)


SINAV_NOTIFY_EVENTS = frozenset({'sinav.hatirlatma', 'sinav.yoklama'})
HATIRLATMA_EVENT = 'sinav.hatirlatma'


def _fmt_time(value):
    return value.strftime('%H:%M') if value else '—'


def _exam_schedule(exam, session=None):
    if session is None:
        session = exam.exam_sessions.order_by('order', 'id').first()
    date = exam.exam_date
    start = end = None
    if session:
        date = session.session_date or date
        start = session.start_time
        end = session.end_time
    tarih = date.strftime('%d.%m.%Y') if date else '—'
    return {
        'sinav_tarihi': tarih,
        'baslama_saati': _fmt_time(start),
        'bitis_saati': _fmt_time(end),
        'tarih': tarih,
    }


def _hatirlatma_ctx(exam, p, *, veli_ad='', schedule=None):
    salon = p.room.name if p.room_id else '—'
    sira = str(p.seat_no or '—')
    ctx = {
        'ogrenci_ad': f'{p.student.ad} {p.student.soyad}'.strip(),
        'veli_ad': veli_ad,
        'sinav_adi': exam.name,
        'sinav_ad': exam.name,
        'sinav_salonu': salon,
        'salon_ad': salon,
        'sira_no': sira,
        'sira': sira,
        'kurum_ad': getattr(getattr(exam, 'kurum', None), 'ad', '') or '',
    }
    ctx.update(schedule or _exam_schedule(exam, getattr(p, 'exam_session', None)))
    return ctx


def _mask_phone(phone: str) -> str:
    p = (phone or '').strip()
    if len(p) < 4:
        return p
    return f'{p[:3]}***{p[-2:]}'


def _hatirlatma_rows(exam, participant_ids: list[int], *, opt_in_category='duyuru'):
    from apps.communication.application.contact_resolver import ContactResolver
    from apps.ogrenci.application.veli_contact import list_outbound_veliler

    qs = ExamParticipant.objects.filter(exam=exam).select_related(
        'student', 'room', 'exam_session',
    )
    if participant_ids:
        qs = qs.filter(pk__in=participant_ids)
    rows = []
    for p in qs:
        st = p.student
        ctx = _hatirlatma_ctx(exam, p)
        recipients = []
        for veli, phone in list_outbound_veliler(st):
            skip = ''
            if not ContactResolver.veli_allows_outbound(veli, opt_in_category):
                skip = 'Veli bu bildirim türünü kabul etmemiş'
            recipients.append({
                'recipient_type': 'veli',
                'veli_id': veli.id,
                'display_name': getattr(veli, 'tam_ad', None) or f'{veli.ad} {veli.soyad}'.strip(),
                'telefon': _mask_phone(phone),
                'skip_reason': skip,
            })
        if not any(r['recipient_type'] == 'veli' for r in recipients):
            recipients.append({
                'recipient_type': 'veli',
                'veli_id': None,
                'display_name': '',
                'telefon': '',
                'skip_reason': 'Veli telefonu bulunamadı',
            })
        student_phone = (st.telefon or '').strip()
        recipients.append({
            'recipient_type': 'ogrenci',
            'veli_id': None,
            'display_name': f'{st.ad} {st.soyad}'.strip(),
            'telefon': _mask_phone(student_phone) if student_phone else '',
            'skip_reason': '' if student_phone else 'Öğrenci telefonu bulunamadı',
        })
        rows.append({
            'participant_id': p.id,
            'student_id': st.pk,
            'full_name': f'{st.ad} {st.soyad}'.strip(),
            'salon_ad': ctx['salon_ad'],
            'sinav_salonu': ctx['sinav_salonu'],
            'sira': ctx['sira'],
            'sira_no': ctx['sira_no'],
            'attendance': p.attendance or '',
            'recipients': recipients,
        })
    return rows


def _notify_event_or_error(raw):
    key = (raw or HATIRLATMA_EVENT).strip()
    if key not in SINAV_NOTIFY_EVENTS:
        return None, Response({'error': 'Geçersiz bildirim olayı.'}, status=400)
    from apps.communication.application.notification_events import get_event
    event = get_event(key)
    if event is None:
        return None, Response({'error': 'Geçersiz bildirim olayı.'}, status=400)
    return event, None


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_hatirlatma_preview(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    event, err_resp = _notify_event_or_error(request.data.get('event_key'))
    if err_resp:
        return err_resp
    ids = _int_list(request.data.get('participant_ids'))
    return Response({
        'event_key': event.key,
        'event_label': event.label,
        'students': _hatirlatma_rows(exam, ids, opt_in_category=event.opt_in_category),
    })


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_hatirlatma_send(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    from apps.communication.application.communication_service import MessageSource
    from apps.communication.application.integration_hooks import SOURCE_SINAV
    from apps.communication.application.notification_dispatcher import (
        NotificationRecipient,
        dispatch_event,
    )
    from apps.ogrenci.domain.models import OgrenciVeli

    event, err_resp = _notify_event_or_error(request.data.get('event_key'))
    if err_resp:
        return err_resp
    ids = _int_list(request.data.get('participant_ids'))
    include_student = bool(request.data.get('include_student'))
    selected_veli = set(_int_list(request.data.get('veli_ids')))
    sent = 0
    skipped = 0
    errors = []
    for row in _hatirlatma_rows(exam, ids, opt_in_category=event.opt_in_category):
        p = ExamParticipant.objects.select_related('student', 'room', 'exam_session').get(pk=row['participant_id'])
        row_sent = False
        for item in row['recipients']:
            if item['recipient_type'] == 'veli':
                if not item['veli_id'] or item['veli_id'] not in selected_veli:
                    continue
                if item['skip_reason']:
                    skipped += 1
                    errors.append(f"{item['display_name']}: {item['skip_reason']}")
                    continue
                veli = OgrenciVeli.objects.filter(id=item['veli_id']).first()
                if not veli:
                    skipped += 1
                    continue
                ctx = _hatirlatma_ctx(exam, p, veli_ad=item['display_name'])
                result = dispatch_event(
                    exam.kurum_id,
                    event.key,
                    recipient=NotificationRecipient.veli(veli.id),
                    context=ctx,
                    source=MessageSource(
                        module=SOURCE_SINAV,
                        ref_id=f'{event.key}:{exam.id}:{p.id}:veli:{veli.id}',
                    ),
                    sube_id=exam.sube_id,
                    sent_by_user_id=getattr(request.user, 'id', None),
                )
                if result and result.success:
                    sent += 1
                    row_sent = True
                else:
                    skipped += 1
                    errors.append(item['display_name'] or 'Veli')
            elif item['recipient_type'] == 'ogrenci' and include_student:
                if item['skip_reason']:
                    skipped += 1
                    continue
                ctx = _hatirlatma_ctx(exam, p)
                result = dispatch_event(
                    exam.kurum_id,
                    event.key,
                    recipient=NotificationRecipient.ogrenci(p.student_id),
                    context=ctx,
                    source=MessageSource(
                        module=SOURCE_SINAV,
                        ref_id=f'{event.key}:{exam.id}:{p.id}:ogrenci',
                    ),
                    sube_id=exam.sube_id,
                    sent_by_user_id=getattr(request.user, 'id', None),
                )
                if result and result.success:
                    sent += 1
                    row_sent = True
                else:
                    skipped += 1
        if row_sent and event.key == HATIRLATMA_EVENT:
            mark_seat_notified(p)
    return Response({'sent': sent, 'skipped': skipped, 'errors': errors})
