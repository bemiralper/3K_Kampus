"""
ClassLessonPlan API Views

Sınıf Ders Planı CRUD API'leri
"""
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.authentication import SessionAuthentication
from apps.academic.interfaces.permissions import AcademicModulePermission
from rest_framework.response import Response

from apps.academic.interfaces.sube_context import (
    filter_by_sube_id,
    gate_class_lesson_plan_drf,
    gate_ders_drf,
    gate_sinif_drf,
    gate_term_drf,
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
from apps.academic.services.lesson_session_service import log_schedule_change
from apps.academic.domain.schedule_change_log import ScheduleChangeAction


def _log_plan_change(*, action, summary, detail=None, term_id=None, user=None):
    """SDP aksiyonlarını değişiklik günlüğüne yazar; hata olursa ana akışı bozmaz."""
    try:
        term = None
        if term_id:
            from apps.term.domain.models import Term
            term = Term.objects.filter(id=term_id).first()
        log_schedule_change(
            action=action,
            summary=summary[:500],
            detail=detail or {},
            term=term,
            user=user,
        )
    except Exception:
        pass
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
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
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


# ==================== PLANLAMA BAĞLAMI ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def class_lesson_plan_context_api(request):
    """
    GET /api/academic/class-lesson-plan/context/

    Aktif eğitim yılı + şube için sınıf ve dönem listesi.
    Eğitim paketleri / öğrenci paketleri buraya bağlanmaz.
    """
    try:
        ctx, err = mandatory_academic_context_drf(request)
        if err:
            return err

        service = ClassLessonPlanService()
        data = service.build_planning_context(
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            context_egitim_yili_id=ctx.get('egitim_yili_id'),
        )
        return Response(data)
    except ActiveAcademicYearError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def class_lesson_plan_ders_options_api(request):
    """
    GET /api/academic/class-lesson-plan/ders-options/?classroom_id=

    Sınıf seviye/alanına göre Eğitim Tanımları ders adayları.
    """
    try:
        ctx, err = mandatory_academic_context_drf(request)
        if err:
            return err

        classroom_id = request.query_params.get('classroom_id')
        if not classroom_id:
            return Response(
                {'error': 'classroom_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _, _, gate_err = gate_sinif_drf(request, int(classroom_id))
        if gate_err:
            return gate_err

        service = ClassLessonPlanService()
        rows = service.list_ders_options_for_classroom(
            classroom_id=int(classroom_id),
            sube_id=ctx['sube_id'],
        )
        return Response({'count': len(rows), 'results': rows})
    except ClassLessonPlanValidationError as e:
        return Response(
            {'error': e.message, 'field': e.field},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except ActiveAcademicYearError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ==================== LİSTELEME ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
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
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
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
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
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

        term = serializer.validated_data.get('term')
        sinif = serializer.validated_data.get('sinif')
        ders = serializer.validated_data.get('ders')
        if term:
            _, _, gate_err = gate_term_drf(request, term.id)
            if gate_err:
                return gate_err
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
            'term_id': term.id if term else None,
            'sinif_id': sinif.id if sinif else None,
            'ders_id': ders.id if ders else None,
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

        _log_plan_change(
            action=ScheduleChangeAction.PLAN_CREATE,
            summary=f'“{plan.sinif.ad}” sınıfına “{plan.ders.ad}” dersi eklendi.',
            detail={'plan_id': plan.id, 'sinif_id': plan.sinif_id, 'ders_id': plan.ders_id},
            term_id=plan.term_id,
            user=request.user,
        )

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
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
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
                      'is_double_block', 'priority', 'preferred_room_type',
                      'gorunen_ad', 'notes']:
            if field in serializer.validated_data:
                if field == 'ogretmen':
                    update_data['ogretmen_id'] = serializer.validated_data[field].id if serializer.validated_data[field] else None
                else:
                    update_data[field] = serializer.validated_data[field]
        
        service.update(plan_id, update_data)
        updated_plan = service.get_by_id(plan_id)
        
        # Liste alanlarıyla dön (ders_gorunen_ad vb.) — FE satırı yerinde günceller
        response_serializer = ClassLessonPlanListSerializer(updated_plan)
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
@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def class_lesson_plan_bulk_delete_api(request):
    """
    POST /api/academic/class-lesson-plan/bulk-delete/
    Body: { "ids": [1, 2, 3] }
    """
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err

    ids_raw = request.data.get('ids') or []
    if not isinstance(ids_raw, list) or not ids_raw:
        return Response({'error': 'ids listesi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        plan_ids = [int(x) for x in ids_raw]
    except (TypeError, ValueError):
        return Response({'error': 'Geçersiz ids.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        deleted = ClassLessonPlanService().bulk_delete(
            plan_ids, sube_id=ctx['sube_id'],
        )
        _log_plan_change(
            action=ScheduleChangeAction.PLAN_DELETE,
            summary=f'{deleted} ders planı toplu olarak silindi.',
            detail={'plan_ids': plan_ids, 'deleted_count': deleted},
            user=request.user,
        )
        return Response({'deleted_count': deleted})
    except ClassLessonPlanValidationError as e:
        return Response(
            {'error': e.message, 'field': e.field},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['DELETE'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def class_lesson_plan_delete_api(request, plan_id):
    """
    DELETE /api/academic/class-lesson-plan/{id}/delete/
    
    Soft delete - is_active = False
    """
    try:
        _, plan, gate_err = gate_class_lesson_plan_drf(request, plan_id)
        if gate_err:
            return gate_err

        service = ClassLessonPlanService()
        service.delete(plan_id)

        _log_plan_change(
            action=ScheduleChangeAction.PLAN_DELETE,
            summary=f'“{plan.sinif.ad}” sınıfından “{plan.ders.ad}” dersi kaldırıldı.',
            detail={'plan_id': plan_id, 'sinif_id': plan.sinif_id, 'ders_id': plan.ders_id},
            term_id=plan.term_id,
            user=request.user,
        )

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


# ==================== ALANDAN DOLDUR ====================

@csrf_exempt
@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def class_lesson_plan_seed_from_alan_api(request):
    """
    POST /api/academic/class-lesson-plan/seed-from-alan/
    Body: { classroom_id, term_id, default_weekly_hours? }
    """
    try:
        ctx, err = mandatory_academic_context_drf(request)
        if err:
            return err

        try:
            classroom_id = int(request.data.get('classroom_id'))
            term_id = int(request.data.get('term_id'))
        except (TypeError, ValueError):
            return Response(
                {'error': 'classroom_id ve term_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _, _, gate_err = gate_sinif_drf(request, classroom_id)
        if gate_err:
            return gate_err
        _, _, gate_err = gate_term_drf(request, term_id)
        if gate_err:
            return gate_err

        hours = request.data.get('default_weekly_hours', 2)
        try:
            hours = int(hours)
        except (TypeError, ValueError):
            hours = 2

        service = ClassLessonPlanService()
        result = service.seed_from_alan(
            classroom_id=classroom_id,
            term_id=term_id,
            sube_id=ctx['sube_id'],
            default_weekly_hours=hours,
        )
        if result['created_count']:
            _log_plan_change(
                action=ScheduleChangeAction.PLAN_SEED,
                summary=f'“{result["alan_ad"]}” alanından {result["created_count"]} ders planı oluşturuldu.',
                detail={
                    'classroom_id': classroom_id,
                    'alan_id': result['alan_id'],
                    'created_count': result['created_count'],
                    'skipped_existing': result['skipped_existing'],
                },
                term_id=term_id,
                user=request.user,
            )
        serializer = ClassLessonPlanListSerializer(result['plans'], many=True)
        return Response({
            'alan_id': result['alan_id'],
            'alan_ad': result['alan_ad'],
            'created_count': result['created_count'],
            'skipped_existing': result['skipped_existing'],
            'candidate_count': result['candidate_count'],
            'plans': serializer.data,
        }, status=status.HTTP_201_CREATED if result['created_count'] else status.HTTP_200_OK)

    except ClassLessonPlanValidationError as e:
        return Response(
            {'error': e.message, 'field': e.field},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except ActiveAcademicYearError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ==================== SINIFA KOPYALA ====================

@csrf_exempt
@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def class_lesson_plan_copy_api(request):
    """
    POST /api/academic/class-lesson-plan/copy/
    Body: {
      source_classroom_id, term_id, target_classroom_ids[],
      copy_teachers?, mode?
    }
    """
    try:
        ctx, err = mandatory_academic_context_drf(request)
        if err:
            return err

        try:
            source_id = int(request.data.get('source_classroom_id'))
            term_id = int(request.data.get('term_id'))
        except (TypeError, ValueError):
            return Response(
                {'error': 'source_classroom_id ve term_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        targets_raw = request.data.get('target_classroom_ids') or []
        if not isinstance(targets_raw, list) or not targets_raw:
            return Response(
                {'error': 'target_classroom_ids listesi gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            target_ids = [int(x) for x in targets_raw]
        except (TypeError, ValueError):
            return Response(
                {'error': 'Geçersiz target_classroom_ids.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _, _, gate_err = gate_sinif_drf(request, source_id)
        if gate_err:
            return gate_err
        for tid in target_ids:
            _, _, gate_err = gate_sinif_drf(request, tid)
            if gate_err:
                return gate_err
        _, _, gate_err = gate_term_drf(request, term_id)
        if gate_err:
            return gate_err

        service = ClassLessonPlanService()
        result = service.copy_to_classrooms(
            source_classroom_id=source_id,
            term_id=term_id,
            target_classroom_ids=target_ids,
            sube_id=ctx['sube_id'],
            copy_teachers=bool(request.data.get('copy_teachers')),
            mode=str(request.data.get('mode') or 'skip_existing'),
        )
        if result['created_count'] or result['updated_count']:
            _log_plan_change(
                action=ScheduleChangeAction.PLAN_COPY,
                summary=(
                    f'{len(target_ids)} sınıfa kopyalama: '
                    f'{result["created_count"]} yeni, {result["updated_count"]} güncellendi, '
                    f'{result["skipped_count"]} atlandı.'
                ),
                detail={
                    'source_classroom_id': source_id,
                    'target_classroom_ids': target_ids,
                    'created_count': result['created_count'],
                    'updated_count': result['updated_count'],
                    'skipped_count': result['skipped_count'],
                },
                term_id=term_id,
                user=request.user,
            )
        return Response(result)

    except ClassLessonPlanValidationError as e:
        return Response(
            {'error': e.message, 'field': e.field},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except ActiveAcademicYearError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ==================== ÖZET ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
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
        from apps.sinif.application.placement_helpers import placement_counts_for_term
        from apps.term.domain.models import Term
        
        try:
            sinif = Sinif.objects.select_related('sinif_seviyesi', 'alan').get(id=classroom_id)
            term = Term.objects.get(id=term_id)
        except (Sinif.DoesNotExist, Term.DoesNotExist):
            return Response(
                {'error': 'Sınıf veya dönem bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Dönem bazlı yerleştirme sayısı — yıllık `sinif.mevcutluk` ile karışmasın
        # (öğrenci dönem içinde sınıf değiştirmişse bu iki sayı farklı olabilir).
        ogrenci_sayisi = placement_counts_for_term(term_id, [classroom_id]).get(classroom_id, 0)

        return Response({
            'classroom_id': classroom_id,
            'classroom_name': sinif.ad,
            'classroom_seviye': sinif.sinif_seviyesi.ad if sinif.sinif_seviyesi_id else None,
            'classroom_alan': sinif.alan.ad if sinif.alan_id else None,
            'ogrenci_sayisi': ogrenci_sayisi,
            'term_id': term_id,
            'term_name': term.name,
            'schedule_locked': term.schedule_locked,
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
