"""
ClassLessonPlan API Views

Sınıf Ders Planı CRUD API'leri
"""
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.academic.interfaces.sube_context import (
    filter_by_sube_id,
    gate_class_lesson_plan_drf,
    gate_ders_drf,
    gate_sinif_drf,
    mandatory_academic_context_drf,
)
from apps.academic.services.class_lesson_plan_service import (
    ClassLessonPlanService,
    ClassLessonPlanValidationError
)
from apps.academic.services.active_academic_year import (
    get_active_academic_year,
    ActiveAcademicYearError
)
from apps.academic.interfaces.serializers.class_lesson_plan import (
    ClassLessonPlanListSerializer,
    ClassLessonPlanCreateSerializer,
    ClassLessonPlanUpdateSerializer,
    ClassLessonPlanDetailSerializer,
    ActiveAcademicYearSerializer,
)


# ==================== AKTİF EĞİTİM YILI ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def active_academic_year_api(request):
    """
    GET /api/academic/class-lesson-plan/active-year/
    
    Aktif eğitim yılını döndürür.
    Frontend bu bilgiyi badge olarak gösterir.
    """
    try:
        _, err = mandatory_academic_context_drf(request)
        if err:
            return err

        year = get_active_academic_year()
        data = {
            'id': year.id,
            'yil_str': str(year),
            'baslangic_yil': year.baslangic_yil,
            'bitis_yil': year.bitis_yil,
        }
        return Response(data)
    except ActiveAcademicYearError as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )


# ==================== LİSTELEME ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def class_lesson_plan_list_api(request):
    """
    GET /api/academic/class-lesson-plan/
    
    Query params:
    - classroom_id: Sınıf ID (zorunlu değil)
    - term_id: Dönem ID (zorunlu değil)
    - teacher_id: Öğretmen ID (zorunlu değil)
    - all: "true" ise tüm planları döndürür
    
    Aktif eğitim yılı otomatik filtrelenir.
    """
    try:
        ctx, err = mandatory_academic_context_drf(request)
        if err:
            return err

        service = ClassLessonPlanService()
        
        classroom_id = request.query_params.get('classroom_id')
        term_id = request.query_params.get('term_id')
        teacher_id = request.query_params.get('teacher_id')
        fetch_all = request.query_params.get('all', '').lower() == 'true'

        if classroom_id:
            _, _, gate_err = gate_sinif_drf(request, int(classroom_id))
            if gate_err:
                return gate_err
        
        # Filtreleme
        if classroom_id and term_id:
            plans = service.list_by_classroom_and_term(
                int(classroom_id), 
                int(term_id)
            )
        elif classroom_id:
            plans = service.list_by_classroom(int(classroom_id))
        elif term_id:
            plans = service.list_by_term(int(term_id))
        elif teacher_id:
            plans = service.list_by_teacher(int(teacher_id))
        elif fetch_all:
            # Tüm planları çek (aktif eğitim yılı için)
            plans = service.list_all()
        else:
            # Hiç filtre yoksa hata
            return Response(
                {'error': 'En az classroom_id, term_id veya all=true parametresi gerekli.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        plans = filter_by_sube_id(plans, ctx['sube_id'], field_path='sinif__sube_id')
        
        serializer = ClassLessonPlanListSerializer(plans, many=True)
        return Response({
            'count': plans.count(),
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
def class_lesson_plan_detail_api(request, plan_id):
    """
    GET /api/academic/class-lesson-plan/{id}/
    
    Plan detayı
    """
    try:
        _, plan, gate_err = gate_class_lesson_plan_drf(request, plan_id)
        if gate_err:
            return gate_err

        serializer = ClassLessonPlanDetailSerializer(plan)
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
def class_lesson_plan_create_api(request):
    """
    POST /api/academic/class-lesson-plan/create/
    
    Yeni ders planı oluştur.
    egitim_yili otomatik atanır.
    
    Body:
    {
        "term": 1,
        "sinif": 1,
        "ders": 1,
        "ogretmen": 1,  // opsiyonel
        "weekly_hours": 4,
        "credit": 3,
        "is_mandatory": true,
        "is_double_block": false,
        "priority": 1,
        "preferred_room_type": null,
        "notes": null
    }
    """
    try:
        serializer = ClassLessonPlanCreateSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                {'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        sinif = serializer.validated_data.get('sinif')
        ders = serializer.validated_data.get('ders')
        if sinif:
            _, _, gate_err = gate_sinif_drf(request, sinif.id)
            if gate_err:
                return gate_err
        if ders:
            _, _, gate_err = gate_ders_drf(request, ders.id)
            if gate_err:
                return gate_err
        
        service = ClassLessonPlanService()
        
        # Serializer validated_data'yı servise gönder
        data = {
            'term_id': serializer.validated_data.get('term').id if serializer.validated_data.get('term') else None,
            'sinif_id': serializer.validated_data.get('sinif').id if serializer.validated_data.get('sinif') else None,
            'ders_id': serializer.validated_data.get('ders').id if serializer.validated_data.get('ders') else None,
            'ogretmen_id': serializer.validated_data.get('ogretmen').id if serializer.validated_data.get('ogretmen') else None,
            'weekly_hours': serializer.validated_data.get('weekly_hours'),
            'credit': serializer.validated_data.get('credit', 0),
            'is_mandatory': serializer.validated_data.get('is_mandatory', True),
            'is_double_block': serializer.validated_data.get('is_double_block', False),
            'priority': serializer.validated_data.get('priority', 1),
            'preferred_room_type': serializer.validated_data.get('preferred_room_type'),
            'notes': serializer.validated_data.get('notes'),
        }
        
        plan = service.create(data)
        
        response_serializer = ClassLessonPlanDetailSerializer(plan)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
        
    except ClassLessonPlanValidationError as e:
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
def class_lesson_plan_update_api(request, plan_id):
    """
    PUT/PATCH /api/academic/class-lesson-plan/{id}/update/
    
    Ders planı güncelle.
    """
    try:
        _, plan, gate_err = gate_class_lesson_plan_drf(request, plan_id)
        if gate_err:
            return gate_err

        serializer = ClassLessonPlanUpdateSerializer(
            plan, 
            data=request.data, 
            partial=request.method == 'PATCH'
        )
        
        if not serializer.is_valid():
            return Response(
                {'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Güncelleme verilerini hazırla
        service = ClassLessonPlanService()
        update_data = {}
        for field in ['ogretmen', 'weekly_hours', 'credit', 'is_mandatory',
                      'is_double_block', 'priority', 'preferred_room_type', 'notes']:
            if field in serializer.validated_data:
                if field == 'ogretmen':
                    update_data['ogretmen_id'] = serializer.validated_data[field].id if serializer.validated_data[field] else None
                else:
                    update_data[field] = serializer.validated_data[field]
        
        updated_plan = service.update(plan_id, update_data)
        
        response_serializer = ClassLessonPlanDetailSerializer(updated_plan)
        return Response(response_serializer.data)
        
    except ClassLessonPlanValidationError as e:
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
def class_lesson_plan_delete_api(request, plan_id):
    """
    DELETE /api/academic/class-lesson-plan/{id}/delete/
    
    Soft delete - is_active = False
    """
    try:
        _, _, gate_err = gate_class_lesson_plan_drf(request, plan_id)
        if gate_err:
            return gate_err

        service = ClassLessonPlanService()
        service.delete(plan_id)
        
        return Response(
            {'message': 'Plan başarıyla silindi.'},
            status=status.HTTP_200_OK
        )
        
    except ClassLessonPlanValidationError as e:
        return Response(
            {'error': e.message},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ==================== ÖZET ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def class_lesson_plan_summary_api(request, classroom_id, term_id):
    """
    GET /api/academic/class-lesson-plan/summary/{classroom_id}/{term_id}/
    
    Sınıf ders planı özeti
    """
    try:
        _, _, gate_err = gate_sinif_drf(request, classroom_id)
        if gate_err:
            return gate_err

        service = ClassLessonPlanService()
        plans = service.list_by_classroom_and_term(classroom_id, term_id)
        
        total_hours = service.get_total_weekly_hours(classroom_id, term_id)
        lessons_with_teacher = plans.filter(ogretmen__isnull=False).count()
        lessons_without_teacher = plans.filter(ogretmen__isnull=True).count()
        
        # Sınıf ve dönem bilgisi
        from apps.sinif.domain.models import Sinif
        from apps.term.domain.models import Term
        
        try:
            sinif = Sinif.objects.get(id=classroom_id)
            term = Term.objects.get(id=term_id)
        except (Sinif.DoesNotExist, Term.DoesNotExist):
            return Response(
                {'error': 'Sınıf veya dönem bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        return Response({
            'classroom_id': classroom_id,
            'classroom_name': sinif.ad,
            'term_id': term_id,
            'term_name': term.name,
            'total_lessons': plans.count(),
            'total_weekly_hours': total_hours,
            'lessons_with_teacher': lessons_with_teacher,
            'lessons_without_teacher': lessons_without_teacher,
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
