"""Ödeme belgesi WhatsApp notify API."""
from __future__ import annotations

import json

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.odeme_takip.application.notification_service import OdemeNotificationService
from apps.odeme_takip.interfaces.sube_context import (
    assert_tahsilat_record_access,
    gate_sozlesme_pk,
)
from apps.odeme_takip.permissions import ODEME_TAKIP_PERMISSIONS

from shared.context import get_secili_kurum_id


def _serialize_preview(preview) -> dict:
    return {
        'notify_type': preview.notify_type,
        'entity_id': preview.entity_id,
        'sozlesme_id': preview.sozlesme_id,
        'sozlesme_no': preview.sozlesme_no,
        'student_name': preview.student_name,
        'pdf_title': preview.pdf_title,
        'extra_label': preview.extra_label,
        'recipients': [
            {
                'recipient_type': r.recipient_type,
                'ogrenci_id': r.ogrenci_id,
                'veli_id': r.veli_id,
                'display_name': r.display_name,
                'telefon': r.telefon,
                'body': r.body,
                'skip_reason': r.skip_reason,
                'send_count': r.send_count,
                'last_sent_at': r.last_sent_at,
                'send_history': r.send_history,
            }
            for r in preview.recipients
        ],
    }


def _parse_veli_ids(data) -> list[int]:
    veli_ids_raw = data.get('veli_ids') or '[]'
    if isinstance(veli_ids_raw, str):
        try:
            veli_ids = json.loads(veli_ids_raw)
        except json.JSONDecodeError:
            veli_ids = []
    elif isinstance(veli_ids_raw, list):
        veli_ids = veli_ids_raw
    else:
        veli_ids = []
    return [int(v) for v in veli_ids if v is not None]


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def sozlesme_notify_preview(request, pk):
    notify_type = (request.query_params.get('type') or 'plan').strip().lower()
    kurum_id = get_secili_kurum_id(request) or request.GET.get('kurum_id')
    if not kurum_id:
        return Response({'success': False, 'error': 'Kurum seçilmedi.'}, status=400)

    _, err = gate_sozlesme_pk(request, pk)
    if err:
        return err

    try:
        preview = OdemeNotificationService().preview_sozlesme(int(kurum_id), int(pk), notify_type)
    except ValueError as exc:
        return Response({'success': False, 'error': str(exc)}, status=400)

    return Response({'success': True, 'data': _serialize_preview(preview)})


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def sozlesme_notify_send(request, pk):
    data = request.data
    notify_type = (data.get('notify_type') or data.get('type') or 'plan').strip().lower()
    kurum_id = get_secili_kurum_id(request) or data.get('kurum_id')
    if not kurum_id:
        return Response({'success': False, 'error': 'Kurum seçilmedi.'}, status=400)

    _, err = gate_sozlesme_pk(request, pk)
    if err:
        return err

    veli_ids = _parse_veli_ids(data)
    include_student = data.get('include_student') in (True, 'true', '1', 1)

    try:
        result = OdemeNotificationService().send_sozlesme(
            int(kurum_id),
            int(pk),
            notify_type,
            veli_ids=veli_ids,
            include_student=include_student,
            sent_by_user_id=request.user.id if request.user.is_authenticated else None,
        )
    except ValueError as exc:
        return Response({'success': False, 'error': str(exc)}, status=400)
    except RuntimeError as exc:
        return Response({'success': False, 'error': str(exc)}, status=400)

    return Response({'success': True, 'data': result})


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def tahsilat_notify_preview(request, pk):
    kurum_id = get_secili_kurum_id(request) or request.GET.get('kurum_id')
    if not kurum_id:
        return Response({'success': False, 'error': 'Kurum seçilmedi.'}, status=400)

    from apps.odeme_takip.domain.models import Tahsilat

    try:
        tahsilat = Tahsilat.objects.select_related('sozlesme').get(pk=pk)
    except Tahsilat.DoesNotExist:
        return Response({'success': False, 'error': 'Tahsilat bulunamadı.'}, status=404)

    err = assert_tahsilat_record_access(request, tahsilat)
    if err:
        return err

    try:
        preview = OdemeNotificationService().preview_tahsilat(int(kurum_id), int(pk))
    except ValueError as exc:
        return Response({'success': False, 'error': str(exc)}, status=400)

    return Response({'success': True, 'data': _serialize_preview(preview)})


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def tahsilat_notify_send(request, pk):
    data = request.data
    kurum_id = get_secili_kurum_id(request) or data.get('kurum_id')
    if not kurum_id:
        return Response({'success': False, 'error': 'Kurum seçilmedi.'}, status=400)

    from apps.odeme_takip.domain.models import Tahsilat

    try:
        tahsilat = Tahsilat.objects.select_related('sozlesme').get(pk=pk)
    except Tahsilat.DoesNotExist:
        return Response({'success': False, 'error': 'Tahsilat bulunamadı.'}, status=404)

    err = assert_tahsilat_record_access(request, tahsilat)
    if err:
        return err

    veli_ids = _parse_veli_ids(data)
    include_student = data.get('include_student') in (True, 'true', '1', 1)

    try:
        result = OdemeNotificationService().send_tahsilat(
            int(kurum_id),
            int(pk),
            veli_ids=veli_ids,
            include_student=include_student,
            sent_by_user_id=request.user.id if request.user.is_authenticated else None,
        )
    except ValueError as exc:
        return Response({'success': False, 'error': str(exc)}, status=400)
    except RuntimeError as exc:
        return Response({'success': False, 'error': str(exc)}, status=400)

    return Response({'success': True, 'data': result})
