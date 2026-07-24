"""Ders programı toplu dışa aktarma API."""
from __future__ import annotations

from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.academic.interfaces.sube_context import (
    gate_sinif_drf,
    gate_term_drf,
    mandatory_academic_context_drf,
)
from apps.academic.services.schedule_export_service import (
    COLOR_BY_MODES,
    TEACHER_DISPLAY_MODES,
    ScheduleExportError,
    apply_teacher_display,
    build_classroom_schedule_payload,
    export_schedule_csv,
    export_schedule_xlsx,
)
from apps.sinif.domain.models import Sinif


@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def schedule_export_api(request):
    """
    GET /api/academic/schedule/export/
    ?term_id=&version_id=&classroom_ids=1,2&all=1
    &export_format=csv|xlsx|json&layout=stacked|per_class_sheet
    &teacher_display=full|initials|hidden
    &color_by=ders|ogretmen|none
    Not: DRF `format` query'si renderer seçimiyle çakışır; bu yüzden export_format kullanılır.
    """
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err

    try:
        term_id = int(request.query_params.get('term_id'))
    except (TypeError, ValueError):
        return Response({'error': 'term_id zorunludur.'}, status=400)

    _, _, gate_err = gate_term_drf(request, term_id)
    if gate_err:
        return gate_err

    version_id = request.query_params.get('version_id')
    try:
        version_id = int(version_id) if version_id else None
    except (TypeError, ValueError):
        return Response({'error': 'Geçersiz version_id.'}, status=400)

    all_flag = str(request.query_params.get('all') or '').lower() in ('1', 'true', 'yes')
    ids_raw = request.query_params.get('classroom_ids') or ''

    if all_flag:
        classroom_ids = list(
            Sinif.objects.filter(
                sube_id=ctx['sube_id'],
                aktif_mi=True,
            ).order_by('ad').values_list('id', flat=True)
        )
    else:
        try:
            classroom_ids = [int(x) for x in ids_raw.split(',') if x.strip()]
        except ValueError:
            return Response({'error': 'Geçersiz classroom_ids.'}, status=400)

    if not classroom_ids:
        return Response({'error': 'En az bir sınıf seçin veya all=1 kullanın.'}, status=400)

    for cid in classroom_ids:
        _, _, gate_err = gate_sinif_drf(request, cid)
        if gate_err:
            return gate_err

    fmt = (
        request.query_params.get('export_format')
        or request.query_params.get('file_format')
        or 'xlsx'
    ).lower()
    layout = (request.query_params.get('layout') or 'stacked').lower()
    if layout not in ('stacked', 'per_class_sheet'):
        layout = 'stacked'

    teacher_display = (request.query_params.get('teacher_display') or 'full').lower()
    if teacher_display not in TEACHER_DISPLAY_MODES:
        teacher_display = 'full'

    color_by = (request.query_params.get('color_by') or 'ders').lower()
    if color_by not in COLOR_BY_MODES:
        color_by = 'ders'

    try:
        payload = build_classroom_schedule_payload(
            term_id=term_id,
            version_id=version_id,
            classroom_ids=classroom_ids,
            sube_id=ctx['sube_id'],
        )
        payload = apply_teacher_display(payload, teacher_display)
    except ScheduleExportError as e:
        return Response({'error': e.message, 'field': e.field}, status=400)

    # Okunabilir dosya adı: DersProgrami_YazKursu (boşluk/özel karakter temizlenir)
    term_slug = (payload['term']['name'] or 'Donem').replace(' ', '')
    filename = f'DersProgrami_{term_slug}'

    if fmt == 'json':
        return Response(payload)

    if fmt == 'csv':
        return export_schedule_csv(payload, filename=filename)

    if fmt == 'xlsx':
        return export_schedule_xlsx(
            payload, filename=filename, layout=layout, color_by=color_by,
        )

    return Response({'error': 'export_format csv, xlsx veya json olmalı.'}, status=400)
