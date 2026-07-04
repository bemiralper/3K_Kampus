"""
LessonTeacherPool API Views

Branş Öğretmen Havuzu CRUD API'leri
"""
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.academic.services.lesson_teacher_pool_service import (
    LessonTeacherPoolService,
    LessonTeacherPoolValidationError
)
from apps.academic.interfaces.sube_context import (
    filter_by_sube_id,
    gate_ders_drf,
    gate_lesson_teacher_pool_drf,
    mandatory_academic_context_drf,
)
from apps.academic.services.active_academic_year import (
    get_active_academic_year,
    ActiveAcademicYearError
)
from apps.academic.interfaces.serializers.lesson_teacher_pool import (
    LessonTeacherPoolListSerializer,
    LessonTeacherPoolCreateSerializer,
    LessonTeacherPoolUpdateSerializer,
    LessonTeacherPoolDetailSerializer,
)


# ==================== LİSTELEME ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def lesson_teacher_pool_list_api(request):
    """
    GET /api/academic/lesson-teacher-pool/
    
    Query params:
    - lesson_id: Ders ID (opsiyonel)
    - teacher_id: Öğretmen ID (opsiyonel)
    
    Aktif eğitim yılı otomatik filtrelenir.
    Parametre verilmezse tüm aktif kayıtlar döner.
    """
    try:
        ctx, err = mandatory_academic_context_drf(request)
        if err:
            return err

        service = LessonTeacherPoolService()
        
        lesson_id = request.query_params.get('lesson_id')
        teacher_id = request.query_params.get('teacher_id')

        if lesson_id:
            _, _, gate_err = gate_ders_drf(request, int(lesson_id))
            if gate_err:
                return gate_err
        
        # Filtreleme
        if lesson_id:
            pools = service.filter_by_lesson(int(lesson_id))
        elif teacher_id:
            pools = service.filter_by_teacher(int(teacher_id))
        else:
            pools = service.get_all()

        pools = filter_by_sube_id(pools, ctx['sube_id'], field_path='ders__sube_id')
        
        serializer = LessonTeacherPoolListSerializer(pools, many=True)
        return Response({
            'count': pools.count(),
            'results': serializer.data
        })
        
    except ActiveAcademicYearError as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )
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
def lesson_teacher_pool_detail_api(request, pool_id):
    """
    GET /api/academic/lesson-teacher-pool/{id}/
    
    Havuz detayı
    """
    try:
        _, pool, gate_err = gate_lesson_teacher_pool_drf(request, pool_id)
        if gate_err:
            return gate_err
        
        serializer = LessonTeacherPoolDetailSerializer(pool)
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
def lesson_teacher_pool_create_api(request):
    """
    POST /api/academic/lesson-teacher-pool/
    
    Yeni havuz kaydı oluştur.
    egitim_yili otomatik olarak aktif yıl atanır.
    
    Body:
    {
        "ders_id": 1,
        "ogretmen_id": 1,
        "is_primary": false,
        "max_weekly_load": 20,
        "notes": "..."
    }
    """
    try:
        ders_id = request.data.get('ders_id')
        if ders_id:
            _, _, gate_err = gate_ders_drf(request, ders_id)
            if gate_err:
                return gate_err

        serializer = LessonTeacherPoolCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        service = LessonTeacherPoolService()
        pool = service.create(serializer.validated_data)
        
        response_serializer = LessonTeacherPoolDetailSerializer(pool)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED
        )
        
    except LessonTeacherPoolValidationError as e:
        return Response(
            {'error': e.message, 'field': e.field},
            status=status.HTTP_400_BAD_REQUEST
        )
    except ActiveAcademicYearError as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ==================== GÜNCELLEME ====================

@csrf_exempt
@api_view(['PUT', 'PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def lesson_teacher_pool_update_api(request, pool_id):
    """
    PUT/PATCH /api/academic/lesson-teacher-pool/{id}/
    
    Havuz kaydını güncelle.
    
    Body:
    {
        "is_primary": true,
        "max_weekly_load": 25,
        "notes": "..."
    }
    """
    try:
        _, _, gate_err = gate_lesson_teacher_pool_drf(request, pool_id)
        if gate_err:
            return gate_err

        serializer = LessonTeacherPoolUpdateSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        service = LessonTeacherPoolService()
        pool = service.update(pool_id, serializer.validated_data)
        
        if not pool:
            return Response(
                {'error': 'Havuz kaydı bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        response_serializer = LessonTeacherPoolDetailSerializer(pool)
        return Response(response_serializer.data)
        
    except LessonTeacherPoolValidationError as e:
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
def lesson_teacher_pool_delete_api(request, pool_id):
    """
    DELETE /api/academic/lesson-teacher-pool/{id}/
    
    Havuz kaydını soft delete yap.
    """
    try:
        _, _, gate_err = gate_lesson_teacher_pool_drf(request, pool_id)
        if gate_err:
            return gate_err

        service = LessonTeacherPoolService()
        success = service.delete(pool_id)
        
        if not success:
            return Response(
                {'error': 'Havuz kaydı bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        return Response(
            {'message': 'Havuz kaydı başarıyla silindi.'},
            status=status.HTTP_200_OK
        )
        
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
