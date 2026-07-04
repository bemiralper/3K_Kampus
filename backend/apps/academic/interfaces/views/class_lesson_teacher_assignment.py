"""
ClassLessonTeacherAssignment API Views

Sınıf Ders Çoklu Öğretmen Ataması CRUD API'leri
"""
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.academic.domain.class_lesson_teacher_assignment import TeacherRole, ClassLessonTeacherAssignment
from apps.academic.interfaces.sube_context import (
    filter_by_sube_id,
    gate_class_lesson_plan_drf,
    gate_sinif_drf,
    mandatory_academic_context_drf,
)
from apps.academic.services.class_lesson_teacher_assignment_service import (
    ClassLessonTeacherAssignmentService,
    ClassLessonTeacherAssignmentValidationError
)
from apps.academic.services.active_academic_year import (
    get_active_academic_year,
    ActiveAcademicYearError
)
from apps.academic.interfaces.serializers.class_lesson_teacher_assignment import (
    ClassLessonTeacherAssignmentListSerializer,
    ClassLessonTeacherAssignmentCreateSerializer,
    ClassLessonTeacherAssignmentUpdateSerializer,
    ClassLessonTeacherAssignmentDetailSerializer,
    TeacherRoleSerializer,
)


# ==================== ROL SEÇENEKLERİ ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def teacher_roles_api(request):
    """
    GET /api/academic/class-lesson-teachers/roles/
    
    Öğretmen rol seçeneklerini döndürür.
    """
    roles = TeacherRoleSerializer.get_roles()
    _, err = mandatory_academic_context_drf(request)
    if err:
        return err
    return Response({'roles': roles})


# ==================== LİSTELEME ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def class_lesson_teacher_assignment_list_api(request):
    """
    GET /api/academic/class-lesson-teachers/
    
    Query params:
    - plan_id: Sınıf Ders Planı ID (opsiyonel)
    - teacher_id: Öğretmen ID (opsiyonel)
    - classroom_id: Sınıf ID (opsiyonel)
    - role: Rol (opsiyonel) - PRIMARY, SECONDARY, ASSISTANT, CO_TEACHER, SUBSTITUTE
    
    Aktif eğitim yılı otomatik filtrelenir.
    Parametre verilmezse tüm aktif kayıtlar döner.
    """
    try:
        ctx, err = mandatory_academic_context_drf(request)
        if err:
            return err

        service = ClassLessonTeacherAssignmentService()
        
        plan_id = request.query_params.get('plan_id')
        teacher_id = request.query_params.get('teacher_id')
        classroom_id = request.query_params.get('classroom_id')
        role = request.query_params.get('role')

        if plan_id:
            _, _, gate_err = gate_class_lesson_plan_drf(request, int(plan_id))
            if gate_err:
                return gate_err
        elif classroom_id:
            _, _, gate_err = gate_sinif_drf(request, int(classroom_id))
            if gate_err:
                return gate_err
        
        # Filtreleme
        if plan_id:
            assignments = service.filter_by_class_lesson_plan(int(plan_id))
        elif teacher_id:
            assignments = service.filter_by_teacher(int(teacher_id))
        elif classroom_id:
            assignments = service.filter_by_classroom(int(classroom_id))
        elif role:
            assignments = service.filter_by_role(role)
        else:
            assignments = service.get_all()

        assignments = filter_by_sube_id(
            assignments, ctx['sube_id'], field_path='class_lesson_plan__sinif__sube_id',
        )
        
        serializer = ClassLessonTeacherAssignmentListSerializer(assignments, many=True)
        return Response({
            'count': assignments.count(),
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
def class_lesson_teacher_assignment_detail_api(request, assignment_id):
    """
    GET /api/academic/class-lesson-teachers/{id}/
    
    Atama detayı
    """
    try:
        try:
            assignment = ClassLessonTeacherAssignment.objects.select_related(
                'class_lesson_plan',
            ).get(pk=assignment_id, is_active=True)
        except ClassLessonTeacherAssignment.DoesNotExist:
            return Response(
                {'error': 'Atama kaydı bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        _, _, gate_err = gate_class_lesson_plan_drf(request, assignment.class_lesson_plan_id)
        if gate_err:
            return gate_err
        
        serializer = ClassLessonTeacherAssignmentDetailSerializer(assignment)
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
def class_lesson_teacher_assignment_create_api(request):
    """
    POST /api/academic/class-lesson-teachers/
    
    Yeni atama kaydı oluştur.
    egitim_yili otomatik olarak aktif yıl atanır.
    
    Body:
    {
        "class_lesson_plan_id": 1,
        "ogretmen_id": 1,
        "role": "PRIMARY",
        "priority": 1,
        "max_hours_for_class": 4,
        "notes": "..."
    }
    """
    try:
        plan_id = request.data.get('class_lesson_plan_id')
        if plan_id:
            _, _, gate_err = gate_class_lesson_plan_drf(request, plan_id)
            if gate_err:
                return gate_err

        serializer = ClassLessonTeacherAssignmentCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        service = ClassLessonTeacherAssignmentService()
        assignment = service.create(serializer.validated_data)
        
        response_serializer = ClassLessonTeacherAssignmentDetailSerializer(assignment)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED
        )
        
    except ClassLessonTeacherAssignmentValidationError as e:
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
def class_lesson_teacher_assignment_update_api(request, assignment_id):
    """
    PUT/PATCH /api/academic/class-lesson-teachers/{id}/
    
    Atama kaydını güncelle.
    
    Body:
    {
        "role": "SECONDARY",
        "priority": 2,
        "max_hours_for_class": 2,
        "notes": "..."
    }
    """
    try:
        try:
            assignment = ClassLessonTeacherAssignment.objects.get(pk=assignment_id, is_active=True)
        except ClassLessonTeacherAssignment.DoesNotExist:
            return Response(
                {'error': 'Atama kaydı bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        _, _, gate_err = gate_class_lesson_plan_drf(request, assignment.class_lesson_plan_id)
        if gate_err:
            return gate_err

        serializer = ClassLessonTeacherAssignmentUpdateSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        service = ClassLessonTeacherAssignmentService()
        assignment = service.update(assignment_id, serializer.validated_data)
        
        if not assignment:
            return Response(
                {'error': 'Atama kaydı bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        response_serializer = ClassLessonTeacherAssignmentDetailSerializer(assignment)
        return Response(response_serializer.data)
        
    except ClassLessonTeacherAssignmentValidationError as e:
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
def class_lesson_teacher_assignment_delete_api(request, assignment_id):
    """
    DELETE /api/academic/class-lesson-teachers/{id}/
    
    Atama kaydını soft delete yap.
    """
    try:
        try:
            assignment = ClassLessonTeacherAssignment.objects.get(pk=assignment_id, is_active=True)
        except ClassLessonTeacherAssignment.DoesNotExist:
            return Response(
                {'error': 'Atama kaydı bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        _, _, gate_err = gate_class_lesson_plan_drf(request, assignment.class_lesson_plan_id)
        if gate_err:
            return gate_err

        service = ClassLessonTeacherAssignmentService()
        success = service.delete(assignment_id)
        
        if not success:
            return Response(
                {'error': 'Atama kaydı bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        return Response(
            {'message': 'Atama kaydı başarıyla silindi.'},
            status=status.HTTP_200_OK
        )
        
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
