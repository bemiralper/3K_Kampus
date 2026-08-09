"""Sınıf ders programı WhatsApp bildirimi API."""
from __future__ import annotations

from django.views.decorators.csrf import csrf_exempt
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.academic.application.schedule_notify_service import (
    ScheduleNotifyError,
    preview_classes,
    send_class_schedules,
)
from apps.academic.interfaces.sube_context import (
    gate_sinif_drf,
    gate_term_drf,
    mandatory_academic_context_drf,
)
from shared.permissions import user_has_any_permission


def _parse_int_list(raw) -> list[int]:
    if raw is None:
        return []
    if isinstance(raw, list):
        out = []
        for x in raw:
            try:
                out.append(int(x))
            except (TypeError, ValueError):
                continue
        return out
    if isinstance(raw, str):
        parts = [p.strip() for p in raw.split(',') if p.strip()]
        out = []
        for p in parts:
            try:
                out.append(int(p))
            except ValueError:
                continue
        return out
    try:
        return [int(raw)]
    except (TypeError, ValueError):
        return []


def _can_notify(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    return user_has_any_permission(
        user,
        'sistem.admin',
        'communication.manage',
        'communication.write',
        'communication.bulk',
        'egitim_tanimlari.manage',
        'sinif.manage',
    )


@csrf_exempt
@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def schedule_notify_preview_api(request):
    """POST /api/academic/schedule/notify/preview/"""
    if not _can_notify(request.user):
        return Response({'error': 'Bu işlem için iletişim yetkisi gerekli.'}, status=403)

    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err

    data = request.data if hasattr(request, 'data') else {}
    try:
        term_id = int(data.get('term_id'))
        version_id = int(data.get('version_id'))
    except (TypeError, ValueError):
        return Response({'error': 'term_id ve version_id zorunludur.'}, status=400)

    _, _, gate_err = gate_term_drf(request, term_id)
    if gate_err:
        return gate_err

    sinif_ids = _parse_int_list(data.get('sinif_ids') or data.get('classroom_ids'))
    if not sinif_ids:
        return Response({'error': 'En az bir sınıf seçin.'}, status=400)

    for cid in sinif_ids:
        _, _, gate_err = gate_sinif_drf(request, cid)
        if gate_err:
            return gate_err

    try:
        payload = preview_classes(
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            term_id=term_id,
            version_id=version_id,
            sinif_ids=sinif_ids,
        )
    except ScheduleNotifyError as exc:
        return Response({'error': exc.message, 'field': exc.field}, status=400)

    return Response(payload)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def schedule_notify_send_api(request):
    """POST /api/academic/schedule/notify/send/"""
    if not _can_notify(request.user):
        return Response({'error': 'Bu işlem için iletişim yetkisi gerekli.'}, status=403)

    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err

    data = request.data if hasattr(request, 'data') else {}
    try:
        term_id = int(data.get('term_id'))
        version_id = int(data.get('version_id'))
    except (TypeError, ValueError):
        return Response({'error': 'term_id ve version_id zorunludur.'}, status=400)

    _, _, gate_err = gate_term_drf(request, term_id)
    if gate_err:
        return gate_err

    sinif_ids = _parse_int_list(data.get('sinif_ids') or data.get('classroom_ids'))
    if not sinif_ids:
        return Response({'error': 'En az bir sınıf seçin.'}, status=400)

    for cid in sinif_ids:
        _, _, gate_err = gate_sinif_drf(request, cid)
        if gate_err:
            return gate_err

    force_ids = _parse_int_list(data.get('force_unchanged_ids'))
    send_to = data.get('send_to') or ['veli', 'ogrenci']
    if isinstance(send_to, str):
        send_to = [x.strip() for x in send_to.split(',') if x.strip()]

    try:
        payload = send_class_schedules(
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            term_id=term_id,
            version_id=version_id,
            sinif_ids=sinif_ids,
            force_unchanged_ids=force_ids,
            send_to=list(send_to),
            user=request.user,
        )
    except ScheduleNotifyError as exc:
        return Response({'error': exc.message, 'field': exc.field}, status=400)

    return Response(payload)
