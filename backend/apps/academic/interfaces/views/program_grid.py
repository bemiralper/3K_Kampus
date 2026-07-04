"""
Program Grid Views

Grid Engine API'leri ve ProgramGridCell CRUD.
"""

from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.academic.domain import WeeklyCycle, ProgramGridCell
from apps.academic.interfaces.sube_context import (
    gate_weekly_cycle_drf,
    mandatory_academic_context_drf,
)
from apps.academic.services.grid_engine import (
    GridEngine,
    generate_preview,
    generate_cells,
    get_grid_matrix,
)
from apps.academic.interfaces.serializers import (
    ProgramGridCellSerializer,
    ProgramGridCellListSerializer,
    GridPreviewSerializer,
    GridGenerateInputSerializer,
)


# ============================================
# Grid Engine API
# ============================================

@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def grid_generate_preview_api(request):
    """
    Grid önizlemesi oluştur.
    
    POST body:
    {
        "schedule_template_id": 1,
        "weekly_cycle_id": 1
    }
    
    Returns:
        Grid önizleme verisi (days × lesson slots)
    """
    serializer = GridGenerateInputSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    weekly_cycle_id = serializer.validated_data['weekly_cycle_id']

    _, _, gate_err = gate_weekly_cycle_drf(request, weekly_cycle_id)
    if gate_err:
        return gate_err
    
    try:
        result = generate_preview(weekly_cycle_id)
    except WeeklyCycle.DoesNotExist:
        return Response(
            {'detail': 'Haftalık döngü bulunamadı.'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    return Response({
        'schedule_template_id': result.schedule_template_id,
        'schedule_template_name': result.schedule_template_name,
        'weekly_cycle_id': result.weekly_cycle_id,
        'weekly_cycle_name': result.weekly_cycle_name,
        'total_days': result.total_days,
        'total_slots': result.total_slots,
        'total_cells': result.total_cells,
        'cells': [
            {
                'weekly_day_id': cell.weekly_day_id,
                'weekly_day_name': cell.weekly_day_name,
                'day_of_week': cell.day_of_week,
                'timeslot_id': cell.timeslot_id,
                'timeslot_name': cell.timeslot_name,
                'start_time': cell.start_time,
                'end_time': cell.end_time,
                'order': cell.order,
            }
            for cell in result.cells
        ]
    })


@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def grid_generate_create_api(request):
    """
    Grid hücrelerini oluştur.
    
    POST body:
    {
        "weekly_cycle_id": 1,
        "overwrite": false  // true ise mevcut hücreleri sil ve yeniden oluştur
    }
    
    Returns:
        Oluşturma sonucu
    """
    serializer = GridGenerateInputSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    weekly_cycle_id = serializer.validated_data['weekly_cycle_id']
    overwrite = serializer.validated_data.get('overwrite', False)

    _, _, gate_err = gate_weekly_cycle_drf(request, weekly_cycle_id)
    if gate_err:
        return gate_err
    
    try:
        result = generate_cells(weekly_cycle_id, overwrite=overwrite)
    except WeeklyCycle.DoesNotExist:
        return Response(
            {'detail': 'Haftalık döngü bulunamadı.'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    return Response({
        'schedule_template_id': result.schedule_template_id,
        'weekly_cycle_id': result.weekly_cycle_id,
        'created_count': result.created_count,
        'skipped_count': result.skipped_count,
        'message': f'{result.created_count} hücre oluşturuldu, {result.skipped_count} hücre atlandı.'
    }, status=status.HTTP_201_CREATED)


@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def grid_matrix_api(request, cycle_pk):
    """
    Grid matrisini getir.
    
    Returns:
        {
            'days': [...],
            'slots': [...],
            'matrix': {...}
        }
    """
    _, _, gate_err = gate_weekly_cycle_drf(request, cycle_pk)
    if gate_err:
        return gate_err

    try:
        matrix = get_grid_matrix(cycle_pk)
    except WeeklyCycle.DoesNotExist:
        return Response(
            {'detail': 'Haftalık döngü bulunamadı.'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    return Response(matrix)


@csrf_exempt
@api_view(['DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def grid_clear_api(request, cycle_pk):
    """
    Bir döngüye ait tüm grid hücrelerini sil.
    """
    _, weekly_cycle, gate_err = gate_weekly_cycle_drf(request, cycle_pk)
    if gate_err:
        return gate_err

    weekly_cycle = WeeklyCycle.objects.select_related(
        'schedule_template'
    ).get(pk=cycle_pk, is_active=True)

    engine = GridEngine(weekly_cycle)
    deleted_count = engine.clear_cells()
    
    return Response({
        'deleted_count': deleted_count,
        'message': f'{deleted_count} hücre silindi.'
    })


# ============================================
# ProgramGridCell CRUD
# ============================================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def program_grid_cell_list_api(request):
    """
    Grid hücrelerini listele.
    
    Query params:
        - weekly_cycle_id (required)
        - status (optional): EMPTY, LOCKED, FILLED, etc.
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
    
    queryset = ProgramGridCell.objects.filter(
        weekly_cycle_id=cycle_id
    ).select_related(
        'schedule_template', 'weekly_cycle', 'weekly_day', 'timeslot'
    ).order_by('weekly_day__order', 'timeslot__order')
    
    # Filter by status if provided
    cell_status = request.query_params.get('status')
    if cell_status:
        queryset = queryset.filter(status=cell_status)
    
    serializer = ProgramGridCellListSerializer(queryset, many=True)
    return Response(serializer.data)


@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def program_grid_cell_detail_api(request, pk):
    """
    Grid hücresi detayı.
    """
    try:
        cell = ProgramGridCell.objects.select_related(
            'schedule_template', 'weekly_cycle', 'weekly_day', 'timeslot'
        ).get(pk=pk)
    except ProgramGridCell.DoesNotExist:
        return Response(
            {'detail': 'Grid hücresi bulunamadı.'},
            status=status.HTTP_404_NOT_FOUND
        )

    _, _, gate_err = gate_weekly_cycle_drf(request, cell.weekly_cycle_id)
    if gate_err:
        return gate_err
    
    serializer = ProgramGridCellSerializer(cell)
    return Response(serializer.data)


@csrf_exempt
@api_view(['PUT', 'PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def program_grid_cell_update_api(request, pk):
    """
    Grid hücresi güncelle.
    
    Örnek: Status değiştir, lesson/teacher/classroom ata.
    """
    try:
        cell = ProgramGridCell.objects.get(pk=pk)
    except ProgramGridCell.DoesNotExist:
        return Response(
            {'detail': 'Grid hücresi bulunamadı.'},
            status=status.HTTP_404_NOT_FOUND
        )

    _, _, gate_err = gate_weekly_cycle_drf(request, cell.weekly_cycle_id)
    if gate_err:
        return gate_err
    
    # Update allowed fields
    allowed_fields = ['status', 'lesson_id', 'teacher_id', 'classroom_id', 'room_id']
    update_data = {k: v for k, v in request.data.items() if k in allowed_fields}
    
    for field, value in update_data.items():
        setattr(cell, field, value)
    
    cell.save(update_fields=list(update_data.keys()) if update_data else None)
    
    serializer = ProgramGridCellSerializer(cell)
    return Response(serializer.data)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def program_grid_cell_bulk_update_api(request):
    """
    Grid hücrelerini toplu güncelle.
    
    POST body:
    {
        "cell_ids": [1, 2, 3],
        "status": "LOCKED"
    }
    """
    cell_ids = request.data.get('cell_ids', [])
    new_status = request.data.get('status')
    
    if not cell_ids:
        return Response(
            {'detail': 'cell_ids listesi zorunludur.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if not new_status:
        return Response(
            {'detail': 'status alanı zorunludur.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err
    
    updated_count = ProgramGridCell.objects.filter(
        id__in=cell_ids,
        schedule_template__sube_id=ctx['sube_id'],
    ).update(status=new_status)
    
    return Response({
        'updated_count': updated_count,
        'message': f'{updated_count} hücre güncellendi.'
    })
