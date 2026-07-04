"""
ClassroomGroup API Views

Sınıf Alt Grubu CRUD API'leri
"""
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.academic.services.classroom_group_service import (
    ClassroomGroupService,
    ClassroomGroupValidationError
)
from apps.academic.domain.classroom_group import ClassroomGroup
from apps.academic.interfaces.sube_context import (
    filter_by_sube_id,
    gate_sinif_drf,
    mandatory_academic_context_drf,
)
from apps.academic.interfaces.serializers.classroom_group import (
    ClassroomGroupListSerializer,
    ClassroomGroupCreateSerializer,
    ClassroomGroupUpdateSerializer,
    ClassroomGroupDetailSerializer,
)


# ==================== LİSTELEME ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def classroom_group_list_api(request):
    """
    GET /api/academic/classroom-groups/
    
    Query params:
    - classroom_id: Sınıf ID (zorunlu değil)
    
    Sınıfa göre grupları listeler.
    classroom_id yoksa tüm aktif grupları döndürür.
    """
    try:
        ctx, err = mandatory_academic_context_drf(request)
        if err:
            return err

        service = ClassroomGroupService()
        
        classroom_id = request.query_params.get('classroom_id')

        if classroom_id:
            _, _, gate_err = gate_sinif_drf(request, int(classroom_id))
            if gate_err:
                return gate_err
            groups = service.list_by_classroom(int(classroom_id))
        else:
            groups = service.list_all()

        groups = filter_by_sube_id(groups, ctx['sube_id'], field_path='classroom__sube_id')
        
        serializer = ClassroomGroupListSerializer(groups, many=True)
        return Response({
            'count': groups.count(),
            'results': serializer.data
        })
        
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ==================== DETAY ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def classroom_group_detail_api(request, group_id):
    """
    GET /api/academic/classroom-groups/{id}/
    
    Grup detayı
    """
    try:
        try:
            group = ClassroomGroup.objects.select_related('classroom').get(pk=group_id, is_active=True)
        except ClassroomGroup.DoesNotExist:
            return Response(
                {'error': 'Grup bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        _, _, gate_err = gate_sinif_drf(request, group.classroom_id)
        if gate_err:
            return gate_err
        
        serializer = ClassroomGroupDetailSerializer(group)
        return Response(serializer.data)
        
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ==================== OLUŞTURMA ====================

@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def classroom_group_create_api(request):
    """
    POST /api/academic/classroom-groups/create/
    
    Yeni grup oluştur.
    
    Body:
    {
        "classroom_id": 1,
        "name": "A Grubu",
        "capacity": 15  // opsiyonel
    }
    """
    try:
        classroom_id = request.data.get('classroom_id')
        if classroom_id:
            _, _, gate_err = gate_sinif_drf(request, classroom_id)
            if gate_err:
                return gate_err

        serializer = ClassroomGroupCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        service = ClassroomGroupService()
        group = service.create(serializer.validated_data)
        
        result_serializer = ClassroomGroupDetailSerializer(group)
        return Response(result_serializer.data, status=status.HTTP_201_CREATED)
        
    except ClassroomGroupValidationError as e:
        return Response(
            {'error': e.message, 'field': e.field},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ==================== GÜNCELLEME ====================

@csrf_exempt
@api_view(['PUT'])
@authentication_classes([])
@permission_classes([AllowAny])
def classroom_group_update_api(request, group_id):
    """
    PUT /api/academic/classroom-groups/{id}/update/
    
    Grup güncelle.
    
    Body:
    {
        "name": "B Grubu",
        "capacity": 20
    }
    """
    try:
        try:
            group = ClassroomGroup.objects.get(pk=group_id, is_active=True)
        except ClassroomGroup.DoesNotExist:
            return Response(
                {'error': 'Grup bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        _, _, gate_err = gate_sinif_drf(request, group.classroom_id)
        if gate_err:
            return gate_err

        serializer = ClassroomGroupUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        service = ClassroomGroupService()
        group = service.update(group_id, serializer.validated_data)
        
        result_serializer = ClassroomGroupDetailSerializer(group)
        return Response(result_serializer.data)
        
    except ClassroomGroupValidationError as e:
        return Response(
            {'error': e.message, 'field': e.field},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ==================== SİLME ====================

@csrf_exempt
@api_view(['DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def classroom_group_delete_api(request, group_id):
    """
    DELETE /api/academic/classroom-groups/{id}/delete/
    
    Grup sil (soft delete).
    """
    try:
        try:
            group = ClassroomGroup.objects.get(pk=group_id, is_active=True)
        except ClassroomGroup.DoesNotExist:
            return Response(
                {'error': 'Grup bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        _, _, gate_err = gate_sinif_drf(request, group.classroom_id)
        if gate_err:
            return gate_err

        service = ClassroomGroupService()
        service.delete(group_id)
        
        return Response({'success': True, 'message': 'Grup silindi.'})
        
    except ClassroomGroupValidationError as e:
        return Response(
            {'error': e.message, 'field': e.field},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
