"""
Ders Operasyonları API — oturum, yoklama, ücret, revizyon.
"""
from __future__ import annotations

from datetime import date, timedelta

from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.authentication import SessionAuthentication
from apps.academic.interfaces.permissions import (
    AcademicModulePermission,
    ClassPeriodAttendancePermission,
    user_can_access_classroom_attendance,
    user_can_write_academic,
)
from rest_framework.response import Response

from apps.academic.interfaces.sube_context import (
    gate_lesson_session_drf,
    gate_sinif_drf,
    mandatory_academic_context_drf,
)
from apps.academic.services.lesson_session_service import (
    LessonSessionError,
    create_session,
    get_or_build_student_roster,
    list_change_logs,
    list_sessions,
    materialize_sessions_for_date,
    pay_summary,
    save_student_attendance,
    serialize_session,
    set_teacher_attendance,
    transition_session,
)
from apps.academic.domain.lesson_session import LessonSession, SessionKind, SessionStatus
from apps.academic.domain.lesson_attendance import StudentAttendanceStatus
from apps.academic.domain.class_period_attendance import (
    ClassPeriodAttendanceSession,
    ClassPeriodCode,
    ClassAttendanceNotifySource,
)
from apps.academic.services.class_period_attendance_service import (
    build_coach_period_attendance_context,
    get_or_build_period_roster,
    list_period_sessions_for_date,
    save_period_attendance,
    serialize_period_session,
)
from apps.academic.application.class_attendance_notify_service import (
    ClassAttendanceNotificationService,
)
from apps.personel.domain.models import Personel


def _parse_date(value, field='date'):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise LessonSessionError(f'Geçersiz tarih ({field}). YYYY-MM-DD kullanın.', field) from exc


def _err(exc: LessonSessionError):
    body = {'error': exc.message}
    if exc.field:
        body['field'] = exc.field
    return Response(body, status=status.HTTP_400_BAD_REQUEST)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def lesson_session_materialize_api(request):
    """POST /api/academic/lesson-sessions/materialize/"""
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err
    try:
        term_id = int(request.data.get('term_id'))
    except (TypeError, ValueError):
        return Response({'error': 'term_id zorunludur.'}, status=400)
    try:
        session_date = _parse_date(request.data.get('date') or date.today().isoformat())
        version_id = request.data.get('version_id')
        weekly_cycle_id = request.data.get('weekly_cycle_id')
        classroom_id = request.data.get('classroom_id')
        result = materialize_sessions_for_date(
            term_id=term_id,
            session_date=session_date,
            version_id=int(version_id) if version_id else None,
            weekly_cycle_id=int(weekly_cycle_id) if weekly_cycle_id else None,
            classroom_id=int(classroom_id) if classroom_id else None,
            sube_id=ctx['sube_id'],
            user=request.user,
        )
        return Response(result, status=status.HTTP_201_CREATED if result['created_count'] else status.HTTP_200_OK)
    except LessonSessionError as e:
        return _err(e)
    except Exception as e:
        return Response({'error': str(e)}, status=500)


@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def lesson_session_list_api(request):
    """GET /api/academic/lesson-sessions/"""
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err
    try:
        term_id = int(request.query_params.get('term_id'))
    except (TypeError, ValueError):
        return Response({'error': 'term_id zorunludur.'}, status=400)

    try:
        rows = list_sessions(
            term_id=term_id,
            session_date=_parse_date(request.query_params.get('date'), 'date'),
            date_from=_parse_date(request.query_params.get('date_from'), 'date_from'),
            date_to=_parse_date(request.query_params.get('date_to'), 'date_to'),
            version_id=int(request.query_params['version_id']) if request.query_params.get('version_id') else None,
            classroom_id=int(request.query_params['classroom_id']) if request.query_params.get('classroom_id') else None,
            teacher_id=int(request.query_params['teacher_id']) if request.query_params.get('teacher_id') else None,
            session_kind=request.query_params.get('session_kind') or None,
            status=request.query_params.get('status') or None,
            sube_id=ctx['sube_id'],
        )
        return Response({'sessions': rows, 'count': len(rows)})
    except LessonSessionError as e:
        return _err(e)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def lesson_session_create_api(request):
    """POST /api/academic/lesson-sessions/create/"""
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err
    data = dict(request.data)
    if data.get('sinif_id'):
        _, _, gate = gate_sinif_drf(request, data['sinif_id'])
        if gate:
            return gate
    try:
        session = create_session(data=data, user=request.user)
        session = LessonSession.objects.select_related(
            'ders', 'ogretmen', 'sinif', 'timeslot', 'substitute_ogretmen', 'private_student',
        ).get(pk=session.id)
        return Response(serialize_session(session), status=status.HTTP_201_CREATED)
    except LessonSessionError as e:
        return _err(e)


@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def lesson_session_detail_api(request, pk):
    ctx, session, err = gate_lesson_session_drf(request, pk)
    if err:
        return err
    data = serialize_session(session)
    data['roster'] = get_or_build_student_roster(session)
    return Response(data)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def lesson_session_action_api(request, pk, action):
    """POST .../lesson-sessions/<id>/<action>/  action in start|complete|cancel|no_show"""
    _, _, err = gate_lesson_session_drf(request, pk)
    if err:
        return err
    try:
        session = transition_session(
            session_id=pk,
            action=action,
            user=request.user,
            cancel_reason=request.data.get('cancel_reason') or '',
        )
        session = LessonSession.objects.select_related(
            'ders', 'ogretmen', 'sinif', 'timeslot', 'substitute_ogretmen', 'private_student',
        ).get(pk=session.id)
        return Response(serialize_session(session))
    except LessonSessionError as e:
        return _err(e)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def lesson_teacher_attendance_api(request, pk):
    _, _, err = gate_lesson_session_drf(request, pk)
    if err:
        return err
    try:
        session = set_teacher_attendance(
            session_id=pk,
            status=request.data.get('status'),
            substitute_ogretmen_id=request.data.get('substitute_ogretmen_id'),
            user=request.user,
        )
        session = LessonSession.objects.select_related(
            'ders', 'ogretmen', 'sinif', 'timeslot', 'substitute_ogretmen', 'private_student',
        ).get(pk=session.id)
        return Response(serialize_session(session))
    except LessonSessionError as e:
        return _err(e)


@csrf_exempt
@api_view(['GET', 'POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def lesson_student_attendance_api(request, pk):
    _, session, err = gate_lesson_session_drf(request, pk)
    if err:
        return err

    if request.method == 'GET':
        return Response({
            'session': serialize_session(
                LessonSession.objects.select_related(
                    'ders', 'ogretmen', 'sinif', 'timeslot', 'substitute_ogretmen', 'private_student',
                ).get(pk=pk)
            ),
            'roster': get_or_build_student_roster(session),
            'status_options': [
                {'value': v, 'label': l} for v, l in StudentAttendanceStatus.choices
            ],
        })

    try:
        records = request.data.get('records') or []
        roster = save_student_attendance(
            session_id=pk,
            records=records,
            user=request.user,
        )
        return Response({'roster': roster, 'saved': len(records)})
    except LessonSessionError as e:
        return _err(e)


@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def lesson_pay_summary_api(request):
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err
    try:
        term_id = int(request.query_params.get('term_id'))
    except (TypeError, ValueError):
        return Response({'error': 'term_id zorunludur.'}, status=400)

    today = date.today()
    date_from = _parse_date(request.query_params.get('date_from')) or today.replace(day=1)
    date_to = _parse_date(request.query_params.get('date_to')) or today
    teacher_id = request.query_params.get('teacher_id')
    try:
        data = pay_summary(
            term_id=term_id,
            date_from=date_from,
            date_to=date_to,
            teacher_id=int(teacher_id) if teacher_id else None,
            sube_id=ctx['sube_id'],
        )
        return Response(data)
    except LessonSessionError as e:
        return _err(e)


@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def schedule_revision_list_api(request):
    _, err = mandatory_academic_context_drf(request)
    if err:
        return err
    term_id = request.query_params.get('term_id')
    version_id = request.query_params.get('version_id')
    limit = int(request.query_params.get('limit') or 100)
    rows = list_change_logs(
        term_id=int(term_id) if term_id else None,
        version_id=int(version_id) if version_id else None,
        limit=min(limit, 500),
    )
    return Response({'logs': rows, 'count': len(rows)})


@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def lesson_operations_meta_api(request):
    """Filtre seçenekleri — tür/durum enumları + öğretmen / ders listesi."""
    from apps.egitim_tanimlari.models import Ders

    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err
    teachers = list(
        Personel.objects.filter(
            aktif_mi=True,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        ).order_by('ad', 'soyad').values('id', 'ad', 'soyad')[:300]
    )
    ders_qs = Ders.objects.filter(aktif_mi=True, kurum_id=ctx['kurum_id'])
    dersler = list(
        ders_qs.filter(sube_id=ctx['sube_id']).order_by('ad').values('id', 'ad', 'kod', 'kisa_ad')[:500]
    )
    if not dersler:
        dersler = list(ders_qs.order_by('ad').values('id', 'ad', 'kod', 'kisa_ad')[:500])
    return Response({
        'session_kinds': [{'value': v, 'label': l} for v, l in SessionKind.choices],
        'session_statuses': [{'value': v, 'label': l} for v, l in SessionStatus.choices],
        'student_attendance_statuses': [
            {'value': v, 'label': l} for v, l in StudentAttendanceStatus.choices
        ],
        'period_codes': [{'value': v, 'label': l} for v, l in ClassPeriodCode.choices],
        'teachers': [
            {'id': t['id'], 'name': f"{t['ad']} {t['soyad']}".strip()} for t in teachers
        ],
        'dersler': [
            {
                'id': d['id'],
                'ad': d['ad'],
                'kod': d['kod'] or '',
                'kisa_ad': (d.get('kisa_ad') or '').strip(),
            }
            for d in dersler
        ],
    })


def _forbid_classroom(request, classroom_id: int):
    if user_can_access_classroom_attendance(request.user, classroom_id):
        return None
    return Response({'error': 'Bu sınıfa erişim yok.'}, status=403)


def _forbid_coach_notify(request, source_type: str, source_id: int):
    """Koç yalnızca kendi sınıflarının günlük yoklama bildirimini gönderir."""
    if user_can_write_academic(request.user):
        return None
    if source_type != ClassAttendanceNotifySource.PERIOD:
        return Response(
            {'error': 'Koç portalı yalnızca günlük sınıf yoklaması bildirimi gönderebilir.'},
            status=403,
        )
    try:
        session = ClassPeriodAttendanceSession.objects.only('sinif_id').get(
            pk=source_id, is_active=True,
        )
    except ClassPeriodAttendanceSession.DoesNotExist:
        return Response({'error': 'Oturum bulunamadı.'}, status=404)
    return _forbid_classroom(request, session.sinif_id)


@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([ClassPeriodAttendancePermission])
def class_period_attendance_coach_context_api(request):
    """GET /api/academic/class-period-attendance/coach-context/"""
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err
    return Response(build_coach_period_attendance_context(
        user=request.user,
        kurum_id=ctx['kurum_id'],
        sube_id=ctx['sube_id'],
    ))


@csrf_exempt
@api_view(['GET', 'POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([ClassPeriodAttendancePermission])
def class_period_attendance_list_api(request):
    """GET/POST /api/academic/class-period-attendance/ — günlük sabah/öğleden sonra."""
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err
    try:
        term_id = int(request.data.get('term_id') or request.query_params.get('term_id'))
        classroom_id = int(
            request.data.get('classroom_id') or request.query_params.get('classroom_id')
        )
    except (TypeError, ValueError):
        return Response({'error': 'term_id ve classroom_id zorunludur.'}, status=400)

    denied = _forbid_classroom(request, classroom_id)
    if denied:
        return denied

    raw_date = request.data.get('date') or request.query_params.get('date')
    try:
        session_date = _parse_date(raw_date) or date.today()
    except LessonSessionError as e:
        return _err(e)

    version_raw = request.data.get('version_id') or request.query_params.get('version_id')
    version_id = int(version_raw) if version_raw else None
    ensure = request.method == 'POST' or str(
        request.query_params.get('ensure') or '',
    ).lower() in ('1', 'true', 'yes')

    try:
        data = list_period_sessions_for_date(
            term_id=term_id,
            session_date=session_date,
            classroom_id=classroom_id,
            version_id=version_id,
            user=request.user,
            ensure=ensure,
        )
        return Response(data)
    except LessonSessionError as e:
        return _err(e)
    except Exception:
        return Response({
            'date': session_date.isoformat(),
            'classroom_id': classroom_id,
            'periods': [],
            'sessions': [],
            'info': (
                'Bu sınıfın seçilen günde programda dersi yok veya günlük yoklama '
                'şu an kullanılamıyor. Ders programını kontrol edin.'
            ),
            'yoklama_kapali': True,
        })


@csrf_exempt
@api_view(['GET', 'POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([ClassPeriodAttendancePermission])
def class_period_student_attendance_api(request, pk):
    """GET/POST /api/academic/class-period-attendance/<id>/student-attendance/"""
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err
    try:
        session = ClassPeriodAttendanceSession.objects.select_related('sinif').get(
            pk=pk, is_active=True,
        )
    except ClassPeriodAttendanceSession.DoesNotExist:
        return Response({'error': 'Oturum bulunamadı.'}, status=404)

    # Şube izolasyonu
    sube_id = ctx.get('sube_id')
    if sube_id and session.sinif_id and getattr(session.sinif, 'sube_id', None) not in (None, sube_id):
        return Response({'error': 'Bu oturuma erişim yok.'}, status=403)
    denied = _forbid_classroom(request, session.sinif_id)
    if denied:
        return denied

    if request.method == 'GET':
        return Response({
            'session': serialize_period_session(session),
            'roster': get_or_build_period_roster(session),
            'status_options': [
                {'value': v, 'label': l} for v, l in StudentAttendanceStatus.choices
            ],
        })

    try:
        records = request.data.get('records') or []
        roster = save_period_attendance(
            session_id=pk,
            records=records,
            user=request.user,
        )
        return Response({'roster': roster, 'saved': len(records)})
    except LessonSessionError as e:
        return _err(e)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([ClassPeriodAttendancePermission])
def class_attendance_notify_preview_api(request):
    """POST /api/academic/class-attendance/notify/preview/"""
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err
    source_type = (request.data.get('source_type') or '').upper()
    try:
        source_id = int(request.data.get('source_id'))
    except (TypeError, ValueError):
        return Response({'error': 'source_id zorunludur.'}, status=400)
    if source_type not in ClassAttendanceNotifySource.values:
        return Response({'error': 'source_type LESSON veya PERIOD olmalı.'}, status=400)
    denied = _forbid_coach_notify(request, source_type, source_id)
    if denied:
        return denied

    recipient_types = request.data.get('recipient_types') or ['VELI']
    try:
        preview = ClassAttendanceNotificationService().preview(
            ctx['kurum_id'],
            source_type=source_type,
            source_id=source_id,
            recipient_types=recipient_types,
        )
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)

    return Response({
        'source_type': preview.source_type,
        'source_id': preview.source_id,
        'oturum_ad': preview.oturum_ad,
        'pending_count': preview.pending_count,
        'recipients': [
            {
                'ogrenci_id': r.ogrenci_id,
                'ogrenci_ad': r.ogrenci_ad,
                'recipient_type': r.recipient_type,
                'recipient_id': r.recipient_id,
                'recipient_ad': r.recipient_ad,
                'telefon': r.telefon,
                'event_key': r.event_key,
                'status': r.status,
                'body': r.body,
                'skip_reason': r.skip_reason,
            }
            for r in preview.recipients
        ],
    })


@csrf_exempt
@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([ClassPeriodAttendancePermission])
def class_attendance_notify_send_api(request):
    """POST /api/academic/class-attendance/notify/send/"""
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err
    source_type = (request.data.get('source_type') or '').upper()
    try:
        source_id = int(request.data.get('source_id'))
    except (TypeError, ValueError):
        return Response({'error': 'source_id zorunludur.'}, status=400)
    if source_type not in ClassAttendanceNotifySource.values:
        return Response({'error': 'source_type LESSON veya PERIOD olmalı.'}, status=400)
    denied = _forbid_coach_notify(request, source_type, source_id)
    if denied:
        return denied

    recipient_types = request.data.get('recipient_types') or ['VELI']
    force = bool(request.data.get('force_resend'))
    try:
        result = ClassAttendanceNotificationService().send(
            ctx['kurum_id'],
            source_type=source_type,
            source_id=source_id,
            recipient_types=recipient_types,
            sent_by_user_id=getattr(request.user, 'id', None),
            force_resend=force,
        )
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)

    return Response({
        'sent': result.sent,
        'skipped': result.skipped,
        'errors': result.errors,
    })
