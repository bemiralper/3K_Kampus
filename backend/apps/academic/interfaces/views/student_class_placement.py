"""
StudentClassPlacement API Views

Öğrenci Sınıf Yerleşimi CRUD + Bulk Assign API'leri

ENTEGRASYON NOTLARI:
# TODO: Yoklama modülü StudentClassPlacement üzerinden çalışır
# TODO: Ders Programı öğrenci görünümü bu yerleşime göre filtrelenir
# TODO: Sınav planlama sınıf listelerini buradan çeker
"""
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.academic.domain.student_class_placement import PlacementType, StudentClassPlacement
from apps.academic.interfaces.sube_context import (
    filter_by_sube_id,
    gate_sinif_drf,
    mandatory_academic_context_drf,
)
from apps.academic.services.student_class_placement_service import (
    StudentClassPlacementService,
    StudentClassPlacementValidationError
)
from apps.academic.services.active_academic_year import (
    get_active_academic_year,
    ActiveAcademicYearError
)
from apps.academic.interfaces.serializers.student_class_placement import (
    StudentClassPlacementListSerializer,
    StudentClassPlacementCreateSerializer,
    StudentClassPlacementUpdateSerializer,
    StudentClassPlacementDetailSerializer,
    PlacementTypeSerializer,
    BulkAssignSerializer,
    BulkAssignResultSerializer,
)


# ==================== AKTİF EĞİTİM YILI ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def active_academic_year_api(request):
    """
    GET /api/academic/student-class-placements/active-year/
    
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


# ==================== YERLEŞİM TÜRLERİ ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def placement_types_api(request):
    """
    GET /api/academic/student-class-placements/types/
    
    Yerleşim türü seçeneklerini döndürür.
    """
    types = [
        {'value': choice[0], 'label': choice[1]}
        for choice in PlacementType.choices
    ]
    _, err = mandatory_academic_context_drf(request)
    if err:
        return err
    return Response({'types': types})


# ==================== LİSTELEME ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def student_class_placement_list_api(request):
    """
    GET /api/academic/student-class-placements/
    
    Query params:
    - classroom_id: Sınıf ID
    - term_id: Dönem ID
    - group_id: Grup ID
    - student_id: Öğrenci ID
    
    Aktif eğitim yılı otomatik filtrelenir.
    En az bir filtre gereklidir (classroom_id veya term_id).
    """
    try:
        ctx, err = mandatory_academic_context_drf(request)
        if err:
            return err

        service = StudentClassPlacementService()
        
        classroom_id = request.query_params.get('classroom_id')
        term_id = request.query_params.get('term_id')
        group_id = request.query_params.get('group_id')
        student_id = request.query_params.get('student_id')

        if classroom_id:
            _, _, gate_err = gate_sinif_drf(request, int(classroom_id))
            if gate_err:
                return gate_err
        
        # Filtreleme
        if classroom_id and term_id:
            placements = service.list_by_classroom_and_term(int(classroom_id), int(term_id))
        elif classroom_id:
            placements = service.list_by_classroom(int(classroom_id))
        elif term_id:
            placements = service.list_by_term(int(term_id))
        elif group_id:
            placements = service.list_by_group(int(group_id))
        elif student_id:
            placements = service.list_by_student(int(student_id))
        else:
            return Response(
                {'error': 'En az classroom_id, term_id, group_id veya student_id parametresi gerekli.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        placements = filter_by_sube_id(placements, ctx['sube_id'], field_path='classroom__sube_id')
        
        serializer = StudentClassPlacementListSerializer(placements, many=True)
        return Response({
            'count': placements.count(),
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
def student_class_placement_detail_api(request, placement_id):
    """
    GET /api/academic/student-class-placements/{id}/
    
    Yerleşim detayı
    """
    try:
        try:
            placement = StudentClassPlacement.objects.select_related('classroom').get(
                pk=placement_id, is_active=True,
            )
        except StudentClassPlacement.DoesNotExist:
            return Response(
                {'error': 'Yerleşim bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        _, _, gate_err = gate_sinif_drf(request, placement.classroom_id)
        if gate_err:
            return gate_err
        
        serializer = StudentClassPlacementDetailSerializer(placement)
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
def student_class_placement_create_api(request):
    """
    POST /api/academic/student-class-placements/create/
    
    Yeni yerleşim oluştur.
    academic_year otomatik atanır.
    
    Body:
    {
        "term_id": 1,
        "student_id": 1,
        "classroom_id": 1,
        "group_id": null,  // opsiyonel
        "placement_type": "PRIMARY",
        "start_date": null,  // opsiyonel
        "end_date": null,  // opsiyonel
        "notes": null  // opsiyonel
    }
    """
    try:
        classroom_id = request.data.get('classroom_id')
        if classroom_id:
            _, _, gate_err = gate_sinif_drf(request, classroom_id)
            if gate_err:
                return gate_err

        serializer = StudentClassPlacementCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        service = StudentClassPlacementService()
        placement = service.create(serializer.validated_data)
        
        result_serializer = StudentClassPlacementDetailSerializer(placement)
        return Response(result_serializer.data, status=status.HTTP_201_CREATED)
        
    except StudentClassPlacementValidationError as e:
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
@api_view(['PUT'])
@authentication_classes([])
@permission_classes([AllowAny])
def student_class_placement_update_api(request, placement_id):
    """
    PUT /api/academic/student-class-placements/{id}/update/
    
    Yerleşim güncelle.
    student_id ve academic_year değiştirilemez.
    
    Body:
    {
        "classroom_id": 2,
        "group_id": 1,
        "placement_type": "TRANSFER",
        "start_date": "2025-09-01",
        "end_date": null,
        "notes": "Sınıf değişikliği"
    }
    """
    try:
        try:
            placement = StudentClassPlacement.objects.get(pk=placement_id, is_active=True)
        except StudentClassPlacement.DoesNotExist:
            return Response(
                {'error': 'Yerleşim bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        _, _, gate_err = gate_sinif_drf(request, placement.classroom_id)
        if gate_err:
            return gate_err

        serializer = StudentClassPlacementUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        new_classroom_id = serializer.validated_data.get('classroom_id')
        if new_classroom_id:
            _, _, new_gate_err = gate_sinif_drf(request, new_classroom_id)
            if new_gate_err:
                return new_gate_err
        
        service = StudentClassPlacementService()
        placement = service.update(placement_id, serializer.validated_data)
        
        result_serializer = StudentClassPlacementDetailSerializer(placement)
        return Response(result_serializer.data)
        
    except StudentClassPlacementValidationError as e:
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
def student_class_placement_delete_api(request, placement_id):
    """
    DELETE /api/academic/student-class-placements/{id}/delete/
    
    Yerleşim sil (soft delete).
    """
    try:
        try:
            placement = StudentClassPlacement.objects.get(pk=placement_id, is_active=True)
        except StudentClassPlacement.DoesNotExist:
            return Response(
                {'error': 'Yerleşim bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        _, _, gate_err = gate_sinif_drf(request, placement.classroom_id)
        if gate_err:
            return gate_err

        service = StudentClassPlacementService()
        service.delete(placement_id)
        
        return Response({'success': True, 'message': 'Yerleşim silindi.'})
        
    except StudentClassPlacementValidationError as e:
        return Response(
            {'error': e.message, 'field': e.field},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ==================== TOPLU YERLEŞİM ====================

@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def bulk_assign_api(request):
    """
    POST /api/academic/student-class-placements/bulk-assign/
    
    Toplu öğrenci yerleşimi.
    Upsert mantığı: mevcut yerleşim varsa güncelle, yoksa oluştur.
    
    Body:
    {
        "term_id": 1,
        "classroom_id": 1,
        "group_id": null,  // opsiyonel
        "student_ids": [1, 2, 3, 4, 5],
        "placement_type": "PRIMARY"
    }
    
    Response:
    {
        "created": [1, 2, 3],  // Oluşturulan yerleşim ID'leri
        "updated": [4],  // Güncellenen yerleşim ID'leri
        "skipped": [[5, "Sınıf kapasitesi dolu"]],  // Atlanan öğrenciler
        "errors": [],  // Hatalı öğrenciler
        "summary": {
            "total": 5,
            "created_count": 3,
            "updated_count": 1,
            "skipped_count": 1,
            "error_count": 0
        }
    }
    """
    try:
        serializer = BulkAssignSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        data = serializer.validated_data

        _, _, gate_err = gate_sinif_drf(request, data['classroom_id'])
        if gate_err:
            return gate_err

        service = StudentClassPlacementService()
        
        result = service.bulk_assign(
            term_id=data['term_id'],
            classroom_id=data['classroom_id'],
            student_ids=data['student_ids'],
            group_id=data.get('group_id'),
            placement_type=data.get('placement_type', PlacementType.PRIMARY)
        )
        
        response_data = {
            'created': result.created,
            'updated': result.updated,
            'skipped': result.skipped,
            'errors': result.errors,
            'summary': {
                'total': len(data['student_ids']),
                'created_count': len(result.created),
                'updated_count': len(result.updated),
                'skipped_count': len(result.skipped),
                'error_count': len(result.errors),
            }
        }
        
        return Response(response_data, status=status.HTTP_200_OK)
        
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


# ==================== HELPER DATA ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def helper_data_api(request):
    """
    GET /api/academic/student-class-placements/helper-data/
    
    Frontend için yardımcı veriler:
    - Dönemler (aktif yıl)
    - Sınıflar (aktif yıl)
    - Öğrenciler (aktif)
    - Yerleşim türleri
    """
    try:
        ctx, err = mandatory_academic_context_drf(request)
        if err:
            return err

        active_year = get_active_academic_year()
        
        # Dönemler
        from apps.term.domain.models import Term
        terms = Term.objects.filter(
            egitim_yili=active_year,
            is_active=True
        ).order_by('order_no').values('id', 'name', 'code')
        
        # Sınıflar
        from apps.sinif.domain.models import Sinif
        classrooms = Sinif.objects.filter(
            egitim_yili=active_year,
            aktif_mi=True,
            sube_id=ctx['sube_id'],
        ).order_by('ad').values('id', 'ad', 'kod', 'kapasite')
        
        # Öğrenciler (aktif olanlar)
        from apps.ogrenci.domain.models import Ogrenci
        students = Ogrenci.objects.filter(
            aktif_mi=True
        ).order_by('ad', 'soyad').values('id', 'ad', 'soyad', 'ogrenci_no')
        
        # Yerleşim türleri
        placement_types = [
            {'value': choice[0], 'label': choice[1]}
            for choice in PlacementType.choices
        ]
        
        return Response({
            'academic_year': {
                'id': active_year.id,
                'yil_str': str(active_year),
            },
            'terms': list(terms),
            'classrooms': list(classrooms),
            'students': list(students),
            'placement_types': placement_types,
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
