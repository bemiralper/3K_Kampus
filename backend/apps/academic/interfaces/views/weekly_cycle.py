"""
Çalışma Takvimi (WeeklyCycle) Views
"""

import json

from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.academic.domain import WeeklyCycle, WeeklyDay, DayOfWeek
from apps.academic.interfaces.sube_context import (
    assert_academic_sube_access,
    mandatory_academic_context,
    mandatory_academic_context_drf,
)
from apps.academic.interfaces.serializers.weekly_cycle import (
    WeeklyCycleListSerializer,
    WeeklyCycleDetailSerializer,
    WeeklyCycleCreateSerializer,
    WeeklyCycleUpdateSerializer,
    WeeklyDaySerializer,
    WeeklyDayUpdateSerializer,
    WeeklyDayPlanInputSerializer,
    save_weekly_plan,
)


def _get_cycle_or_404(cycle_id, *, active_only=False):
    qs = WeeklyCycle.objects.filter(pk=cycle_id)
    if active_only:
        qs = qs.filter(is_active=True)
    return qs.first()


def _gate_cycle(request, cycle_id, *, active_only=False):
    ctx, err = mandatory_academic_context(request)
    if err:
        return None, None, err

    cycle = _get_cycle_or_404(cycle_id, active_only=active_only)
    if not cycle:
        return None, None, JsonResponse({'success': False, 'error': 'Çalışma takvimi bulunamadı.'}, status=404)

    kurum_id = cycle.kurum_id or (cycle.schedule_template.kurum_id if cycle.schedule_template_id else None)
    sube_id = cycle.sube_id or (cycle.schedule_template.sube_id if cycle.schedule_template_id else None)
    gate = assert_academic_sube_access(request, kurum_id, sube_id, allow_null_sube=True)
    if gate:
        return None, None, gate
    return ctx, cycle, None


@csrf_exempt
@require_http_methods(["GET"])
def weekly_cycle_list_api(request):
    """GET /api/academic/weekly-cycles/"""
    ctx, err = mandatory_academic_context(request)
    if err:
        return err

    queryset = WeeklyCycle.objects.filter(
        kurum_id=ctx['kurum_id'],
        sube_id=ctx['sube_id'],
    ).select_related('schedule_template').prefetch_related(
        'weekly_days__schedule_template',
    ).order_by('-is_active', '-is_default', 'name')

    data = WeeklyCycleListSerializer(queryset, many=True).data
    return JsonResponse({'success': True, 'data': data, 'count': len(data)})


@csrf_exempt
@require_http_methods(["POST"])
def weekly_cycle_create_api(request):
    """POST /api/academic/weekly-cycles/create/"""
    ctx, err = mandatory_academic_context(request)
    if err:
        return err

    try:
        body = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    body.setdefault('kurum', ctx['kurum_id'])
    body.setdefault('sube', ctx['sube_id'])

    serializer = WeeklyCycleCreateSerializer(data=body)
    if not serializer.is_valid():
        return JsonResponse({'success': False, 'errors': serializer.errors}, status=400)

    try:
        cycle = serializer.save()
    except Exception as e:
        from django.db import IntegrityError
        if isinstance(e, IntegrityError) and 'unique_work_calendar_name' in str(e):
            return JsonResponse({
                'success': False,
                'error': f'"{body.get("name", "")}" adında aktif bir çalışma takvimi zaten var.',
            }, status=400)
        raise
    return JsonResponse({
        'success': True,
        'message': 'Çalışma takvimi oluşturuldu.',
        'data': WeeklyCycleDetailSerializer(cycle).data,
    }, status=201)


@csrf_exempt
@require_http_methods(["GET"])
def weekly_cycle_detail_api(request, pk):
    """GET /api/academic/weekly-cycles/<id>/"""
    ctx, cycle, gate_err = _gate_cycle(request, pk)
    if gate_err:
        return gate_err

    cycle = WeeklyCycle.objects.select_related('schedule_template').prefetch_related(
        'weekly_days__schedule_template',
    ).get(pk=cycle.pk)

    return JsonResponse({
        'success': True,
        'data': WeeklyCycleDetailSerializer(cycle).data,
    })


@csrf_exempt
@require_http_methods(["PUT", "PATCH"])
def weekly_cycle_update_api(request, pk):
    """PUT/PATCH /api/academic/weekly-cycles/<id>/update/"""
    ctx, cycle, gate_err = _gate_cycle(request, pk)
    if gate_err:
        return gate_err

    try:
        body = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    serializer = WeeklyCycleUpdateSerializer(cycle, data=body, partial=(request.method == 'PATCH'))
    if not serializer.is_valid():
        return JsonResponse({'success': False, 'errors': serializer.errors}, status=400)

    cycle = serializer.save()
    return JsonResponse({
        'success': True,
        'message': 'Çalışma takvimi güncellendi.',
        'data': WeeklyCycleDetailSerializer(cycle).data,
    })


@csrf_exempt
@require_http_methods(["DELETE"])
def weekly_cycle_delete_api(request, pk):
    """DELETE /api/academic/weekly-cycles/<id>/delete/"""
    ctx, cycle, gate_err = _gate_cycle(request, pk)
    if gate_err:
        return gate_err

    if cycle.is_active:
        cycle.soft_delete()
        return JsonResponse({
            'success': True,
            'action': 'deactivated',
            'message': 'Çalışma takvimi pasif yapıldı.',
        })

    try:
        cycle.hard_delete()
    except ValueError as exc:
        return JsonResponse({'success': False, 'error': str(exc)}, status=400)

    return JsonResponse({
        'success': True,
        'action': 'deleted',
        'message': 'Çalışma takvimi kalıcı olarak silindi.',
    })


@csrf_exempt
@require_http_methods(["POST"])
def weekly_cycle_copy_api(request, pk):
    """POST /api/academic/weekly-cycles/<id>/copy/"""
    ctx, cycle, gate_err = _gate_cycle(request, pk)
    if gate_err:
        return gate_err

    try:
        body = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        body = {}

    copy_name = (body.get('name') or f'{cycle.name} (Kopya)').strip()
    base_name = copy_name
    suffix = 2
    while WeeklyCycle.objects.filter(
        kurum_id=cycle.kurum_id,
        sube_id=cycle.sube_id,
        name__iexact=copy_name,
        is_active=True,
    ).exists():
        copy_name = f'{base_name} {suffix}'
        suffix += 1

    new_cycle = WeeklyCycle.objects.create(
        kurum_id=cycle.kurum_id,
        sube_id=cycle.sube_id,
        name=copy_name,
        description=cycle.description,
        is_active=True,
        is_default=False,
        color=cycle.color,
        icon=cycle.icon,
        program_tipi=cycle.program_tipi,
    )

    for day in cycle.weekly_days.all().order_by('order'):
        WeeklyDay.objects.create(
            weekly_cycle=new_cycle,
            day_of_week=day.day_of_week,
            name=day.name,
            order=day.order,
            is_active=day.is_active,
            schedule_template_id=day.schedule_template_id if day.is_active else None,
            note=day.note,
        )

    return JsonResponse({
        'success': True,
        'message': 'Çalışma takvimi kopyalandı.',
        'data': WeeklyCycleDetailSerializer(new_cycle).data,
    }, status=201)


@csrf_exempt
@require_http_methods(["GET"])
def weekly_cycle_usage_api(request, pk):
    """GET /api/academic/weekly-cycles/<id>/usage/"""
    ctx, cycle, gate_err = _gate_cycle(request, pk)
    if gate_err:
        return gate_err

    from apps.academic.domain.schedule_version import ScheduleVersion

    versions = ScheduleVersion.objects.filter(
        weekly_cycle=cycle,
    ).select_related('term', 'egitim_yili').order_by('-updated_at')

    data = [{
        'id': v.id,
        'name': v.name,
        'is_active_version': v.is_active,
        'term_name': v.term.name if v.term_id else None,
        'egitim_yili_name': str(v.egitim_yili) if v.egitim_yili_id else None,
    } for v in versions]

    return JsonResponse({'success': True, 'data': data, 'count': len(data)})


@csrf_exempt
@require_http_methods(["PUT", "PATCH"])
def weekly_cycle_plan_save_api(request, pk):
    """PUT /api/academic/weekly-cycles/<id>/plan/ — haftalık gün planını kaydet."""
    ctx, cycle, gate_err = _gate_cycle(request, pk)
    if gate_err:
        return gate_err

    try:
        body = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    days_raw = body.get('days', [])
    day_serializer = WeeklyDayPlanInputSerializer(data=days_raw, many=True)
    if not day_serializer.is_valid():
        return JsonResponse({'success': False, 'errors': day_serializer.errors}, status=400)

    try:
        from rest_framework.exceptions import ValidationError
        save_weekly_plan(cycle, day_serializer.validated_data, sube_id=ctx['sube_id'])
    except ValidationError as exc:
        detail = exc.detail
        if isinstance(detail, dict):
            first = next(iter(detail.values()))
            msg = first[0] if isinstance(first, list) else str(first)
        else:
            msg = str(detail)
        return JsonResponse({'success': False, 'error': msg}, status=400)

    cycle.refresh_from_db()
    return JsonResponse({
        'success': True,
        'message': 'Haftalık plan kaydedildi.',
        'data': WeeklyCycleDetailSerializer(cycle).data,
    })


# ---- DRF endpoints (legacy weekly day CRUD) ----

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_day_list_api(request):
    cycle_id = request.query_params.get('weekly_cycle_id')
    if not cycle_id:
        return Response({'detail': 'weekly_cycle_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

    _, _, gate_err = _gate_cycle_drf(request, cycle_id)
    if gate_err:
        return gate_err

    queryset = WeeklyDay.objects.filter(weekly_cycle_id=cycle_id).order_by('order')
    return Response(WeeklyDaySerializer(queryset, many=True).data)


def _gate_cycle_drf(request, cycle_id, *, active_only=False):
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return None, None, err

    cycle = _get_cycle_or_404(cycle_id, active_only=active_only)
    if not cycle:
        return None, None, Response({'detail': 'Çalışma takvimi bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

    kurum_id = cycle.kurum_id or (cycle.schedule_template.kurum_id if cycle.schedule_template_id else None)
    sube_id = cycle.sube_id or (cycle.schedule_template.sube_id if cycle.schedule_template_id else None)
    from apps.academic.interfaces.sube_context import assert_academic_sube_access_drf
    gate = assert_academic_sube_access_drf(request, kurum_id, sube_id, allow_null_sube=True)
    if gate:
        return None, None, gate
    return ctx, cycle, None


@csrf_exempt
@api_view(['PATCH', 'PUT'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_day_update_api(request, pk):
    try:
        day = WeeklyDay.objects.select_related('weekly_cycle').get(pk=pk)
    except WeeklyDay.DoesNotExist:
        return Response({'detail': 'Gün kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

    _, _, gate_err = _gate_cycle_drf(request, day.weekly_cycle_id)
    if gate_err:
        return gate_err

    serializer = WeeklyDayUpdateSerializer(day, data=request.data, partial=(request.method == 'PATCH'))
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    day = serializer.save()
    return Response(WeeklyDaySerializer(day).data)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_day_create_defaults_api(request, cycle_pk):
    _, cycle, gate_err = _gate_cycle_drf(request, cycle_pk)
    if gate_err:
        return gate_err

    if cycle.weekly_days.exists():
        return Response({'detail': 'Bu takvimde zaten günler mevcut.'}, status=status.HTTP_400_BAD_REQUEST)

    created = cycle.create_default_days()
    return Response(WeeklyDaySerializer(created, many=True).data, status=status.HTTP_201_CREATED)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_day_create_api(request):
    return Response({'detail': 'Haftalık plan kaydı için /weekly-cycles/<id>/plan/ kullanın.'}, status=400)


@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_day_detail_api(request, pk):
    try:
        day = WeeklyDay.objects.get(pk=pk)
    except WeeklyDay.DoesNotExist:
        return Response({'detail': 'Gün kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(WeeklyDaySerializer(day).data)


@csrf_exempt
@api_view(['DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_day_delete_api(request, pk):
    try:
        day = WeeklyDay.objects.get(pk=pk)
    except WeeklyDay.DoesNotExist:
        return Response({'detail': 'Gün kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    day.is_active = False
    day.schedule_template_id = None
    day.save(update_fields=['is_active', 'schedule_template_id', 'updated_at'])
    return Response(status=status.HTTP_204_NO_CONTENT)
