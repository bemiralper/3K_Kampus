"""
Weekly Cycle Views

WeeklyCycle ve WeeklyDay için CRUD API'leri.
"""

from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.academic.domain import WeeklyCycle, WeeklyDay, DayOfWeek
from apps.academic.interfaces.sube_context import (
    filter_by_sube_id,
    gate_schedule_template_drf,
    gate_weekly_cycle_drf,
    gate_weekly_day_drf,
    mandatory_academic_context_drf,
)
from apps.academic.interfaces.serializers import (
    WeeklyCycleListSerializer,
    WeeklyCycleDetailSerializer,
    WeeklyCycleCreateSerializer,
    WeeklyCycleUpdateSerializer,
    WeeklyDaySerializer,
    WeeklyDayCreateSerializer,
    WeeklyDayUpdateSerializer,
)


# ============================================
# Weekly Cycle CRUD
# ============================================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_cycle_list_api(request):
    """
    Tüm haftalık döngüleri listele.
    Optional query param: schedule_template_id
    """
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err

    queryset = WeeklyCycle.objects.filter(is_active=True).select_related('schedule_template')
    queryset = filter_by_sube_id(queryset, ctx['sube_id'], field_path='schedule_template__sube_id')

    template_id = request.query_params.get('schedule_template_id')
    if template_id:
        _, _, gate_err = gate_schedule_template_drf(request, template_id)
        if gate_err:
            return gate_err
        queryset = queryset.filter(schedule_template_id=template_id)
    
    queryset = queryset.order_by('schedule_template__name', 'name')
    serializer = WeeklyCycleListSerializer(queryset, many=True)
    return Response(serializer.data)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_cycle_create_api(request):
    """
    Yeni haftalık döngü oluştur.
    Opsiyonel: create_default_days=true ise varsayılan günler oluşturulur.
    """
    template_id = request.data.get('schedule_template')
    if template_id:
        _, _, gate_err = gate_schedule_template_drf(request, template_id)
        if gate_err:
            return gate_err

    serializer = WeeklyCycleCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    weekly_cycle = serializer.save()
    
    # Create default days if requested
    create_default_days = request.data.get('create_default_days', False)
    if create_default_days:
        _create_default_weekdays(weekly_cycle)
    
    result_serializer = WeeklyCycleDetailSerializer(weekly_cycle)
    return Response(result_serializer.data, status=status.HTTP_201_CREATED)


@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_cycle_detail_api(request, pk):
    """
    Haftalık döngü detayını getir (günleri ile birlikte).
    """
    _, weekly_cycle, gate_err = gate_weekly_cycle_drf(request, pk)
    if gate_err:
        return gate_err

    weekly_cycle = WeeklyCycle.objects.select_related('schedule_template').prefetch_related(
        'weekly_days'
    ).get(pk=pk, is_active=True)

    serializer = WeeklyCycleDetailSerializer(weekly_cycle)
    return Response(serializer.data)


@csrf_exempt
@api_view(['PUT', 'PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_cycle_update_api(request, pk):
    """
    Haftalık döngü güncelle.
    """
    _, weekly_cycle, gate_err = gate_weekly_cycle_drf(request, pk)
    if gate_err:
        return gate_err

    weekly_cycle = WeeklyCycle.objects.get(pk=pk)

    serializer = WeeklyCycleUpdateSerializer(
        weekly_cycle,
        data=request.data,
        partial=request.method == 'PATCH'
    )
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    weekly_cycle = serializer.save()
    result_serializer = WeeklyCycleDetailSerializer(weekly_cycle)
    return Response(result_serializer.data)


@csrf_exempt
@api_view(['DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_cycle_delete_api(request, pk):
    """
    Haftalık döngü soft delete.
    """
    _, weekly_cycle, gate_err = gate_weekly_cycle_drf(request, pk)
    if gate_err:
        return gate_err

    weekly_cycle = WeeklyCycle.objects.get(pk=pk)

    # Soft delete - deactivate related days and cycle
    weekly_cycle.weekly_days.update(is_active=False)
    weekly_cycle.is_active = False
    weekly_cycle.save(update_fields=['is_active'])
    
    return Response(status=status.HTTP_204_NO_CONTENT)


# ============================================
# Weekly Day CRUD
# ============================================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_day_list_api(request):
    """
    Belirli bir haftalık döngüye ait günleri listele.
    Required query param: weekly_cycle_id
    """
    cycle_id = request.query_params.get('weekly_cycle_id')
    if not cycle_id:
        return Response(
            {'detail': 'weekly_cycle_id parametresi zorunludur.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    _, _, gate_err = gate_weekly_cycle_drf(request, cycle_id)
    if gate_err:
        return gate_err
    
    queryset = WeeklyDay.objects.filter(
        weekly_cycle_id=cycle_id,
        is_active=True
    ).order_by('order')
    
    serializer = WeeklyDaySerializer(queryset, many=True)
    return Response(serializer.data)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_day_create_api(request):
    """
    Yeni gün oluştur.
    """
    cycle_id = request.data.get('weekly_cycle')
    if cycle_id:
        _, _, gate_err = gate_weekly_cycle_drf(request, cycle_id)
        if gate_err:
            return gate_err

    serializer = WeeklyDayCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    weekly_day = serializer.save()
    result_serializer = WeeklyDaySerializer(weekly_day)
    return Response(result_serializer.data, status=status.HTTP_201_CREATED)


@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_day_detail_api(request, pk):
    """
    Gün detayını getir.
    """
    _, _, gate_err = gate_weekly_day_drf(request, pk)
    if gate_err:
        return gate_err

    weekly_day = WeeklyDay.objects.select_related('weekly_cycle').get(pk=pk, is_active=True)

    serializer = WeeklyDaySerializer(weekly_day)
    return Response(serializer.data)


@csrf_exempt
@api_view(['PUT', 'PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_day_update_api(request, pk):
    """
    Gün güncelle.
    """
    _, _, gate_err = gate_weekly_day_drf(request, pk)
    if gate_err:
        return gate_err

    weekly_day = WeeklyDay.objects.get(pk=pk)

    serializer = WeeklyDayUpdateSerializer(
        weekly_day,
        data=request.data,
        partial=request.method == 'PATCH'
    )
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    weekly_day = serializer.save()
    result_serializer = WeeklyDaySerializer(weekly_day)
    return Response(result_serializer.data)


@csrf_exempt
@api_view(['DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_day_delete_api(request, pk):
    """
    Gün soft delete.
    """
    _, _, gate_err = gate_weekly_day_drf(request, pk)
    if gate_err:
        return gate_err

    weekly_day = WeeklyDay.objects.get(pk=pk)

    weekly_day.is_active = False
    weekly_day.save(update_fields=['is_active'])
    
    return Response(status=status.HTTP_204_NO_CONTENT)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def weekly_day_create_defaults_api(request, cycle_pk):
    """
    Bir haftalık döngü için varsayılan iş günlerini oluştur (Pzt-Cum).
    """
    _, weekly_cycle, gate_err = gate_weekly_cycle_drf(request, cycle_pk)
    if gate_err:
        return gate_err

    weekly_cycle = WeeklyCycle.objects.get(pk=cycle_pk, is_active=True)

    # Check if days already exist
    existing_days = weekly_cycle.weekly_days.filter(is_active=True).count()
    if existing_days > 0:
        return Response(
            {'detail': 'Bu döngüde zaten günler mevcut.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    created_days = _create_default_weekdays(weekly_cycle)
    serializer = WeeklyDaySerializer(created_days, many=True)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


# ============================================
# Helper Functions
# ============================================

def _create_default_weekdays(weekly_cycle):
    """
    Varsayılan iş günleri oluştur (Pazartesi - Cuma).
    """
    default_days = [
        (DayOfWeek.MONDAY, 'Pazartesi', 1),
        (DayOfWeek.TUESDAY, 'Salı', 2),
        (DayOfWeek.WEDNESDAY, 'Çarşamba', 3),
        (DayOfWeek.THURSDAY, 'Perşembe', 4),
        (DayOfWeek.FRIDAY, 'Cuma', 5),
    ]
    
    created_days = []
    for day_of_week, name, order in default_days:
        day = WeeklyDay.objects.create(
            weekly_cycle=weekly_cycle,
            day_of_week=day_of_week,
            name=name,
            order=order,
            is_active=True
        )
        created_days.append(day)
    
    return created_days
