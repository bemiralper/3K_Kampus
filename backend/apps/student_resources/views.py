"""
Öğrenci Kaynak Havuzu - Views
Admin: Tüm öğrenciler
Koç: Sadece kendi öğrencileri
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import StudentResourceAssignment, ResourcePurchaseList, ResourcePurchaseListItem
from .filters import (
    filter_books_by_student_sinif_seviyesi,
    filter_resource_books_by_type_publisher,
    get_student_book_acquisition_map,
)
from .serializers import (
    StudentResourceAssignmentSerializer,
    StudentResourceAssignmentWriteSerializer,
    BulkAssignmentSerializer,
    BulkUpdateSerializer,
    BulkDeleteSerializer,
    ResourcePurchaseListSerializer,
    ResourcePurchaseListCreateSerializer,
    ResourcePurchaseListCreateFromLibrarySerializer,
    ResourcePurchaseListUpdateSerializer,
    ResourcePurchaseListItemSerializer,
    PurchaseListItemStatusSerializer,
)
from .list_assignment_sync import (
    create_assignment_for_list_item,
    apply_list_item_status,
    refresh_list_status,
)
from apps.coaching.services.coach_access import (
    filter_by_student_scope,
    scoped_student_ids,
    user_can_access_student,
)
from apps.student_resources.interfaces.sube_context import (
    assert_student_resource_record_sube_access,
    filter_assignments_by_student_sube,
    mandatory_student_resources_context,
)


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """CSRF kontrolünü devre dışı bırakan session authentication"""
    def enforce_csrf(self, request):
        return  # CSRF kontrolünü atla


class StudentResourceAssignmentViewSet(viewsets.ModelViewSet):
    """
    Öğrenci Kaynak Ataması ViewSet
    
    list: GET /api/student-resources/assignments/
        Query filters: student, coach, lesson, status, is_overdue, search,
        resource_type (book_type kod/ad), publisher (yayinevi icontains).
    create: POST /api/student-resources/assignments/
    retrieve: GET /api/student-resources/assignments/{id}/
    update: PUT /api/student-resources/assignments/{id}/
    destroy: DELETE /api/student-resources/assignments/{id}/
    
    Custom Actions:
    - bulk_assign: POST /api/student-resources/assignments/bulk_assign/
    - bulk_update: POST /api/student-resources/assignments/bulk_update/
    - bulk_delete: POST /api/student-resources/assignments/bulk_delete/
    - my_students: GET /api/student-resources/assignments/my_students/
    - available_resources: GET /api/student-resources/assignments/available_resources/
    """
    
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return StudentResourceAssignmentWriteSerializer
        return StudentResourceAssignmentSerializer
    
    def get_queryset(self):
        queryset = StudentResourceAssignment.objects.filter(is_active=True).select_related(
            'student', 'coach', 'lesson', 'resource_book', 'resource_book__book_type'
        )

        queryset = filter_by_student_scope(queryset, self.request.user, student_field='student_id')

        ctx = getattr(self, '_student_resources_ctx', None)
        if ctx:
            queryset = filter_assignments_by_student_sube(queryset, ctx['sube_id'])

        # Filtreler
        student_id = self.request.query_params.get('student')
        coach_id = self.request.query_params.get('coach')
        lesson_id = self.request.query_params.get('lesson')
        status_filter = self.request.query_params.get('status')
        is_overdue = self.request.query_params.get('is_overdue')
        search = self.request.query_params.get('search')
        
        if student_id:
            queryset = queryset.filter(student_id=student_id)
        
        if coach_id:
            queryset = queryset.filter(coach_id=coach_id)
        
        if lesson_id:
            queryset = queryset.filter(lesson_id=lesson_id)
        
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        if is_overdue == 'true':
            today = timezone.now().date()
            queryset = queryset.filter(
                due_date__lt=today
            ).exclude(
                status__in=[StudentResourceAssignment.Status.COMPLETED, 
                           StudentResourceAssignment.Status.CANCELLED]
            )
        
        if search:
            queryset = queryset.filter(
                Q(student__ad__icontains=search) |
                Q(student__soyad__icontains=search) |
                Q(resource_book__ad__icontains=search)
            )

        resource_type = self.request.query_params.get('resource_type')
        publisher = self.request.query_params.get('publisher')
        queryset = filter_resource_books_by_type_publisher(
            queryset,
            resource_type=resource_type or None,
            publisher=publisher or None,
            prefix='resource_book__',
        )
        
        return queryset.order_by('-assigned_at')

    def get_object(self):
        obj = super().get_object()
        gate = assert_student_resource_record_sube_access(self.request, obj.student)
        if gate:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(detail=gate.data.get('error', 'Forbidden'))
        return obj
    
    def list(self, request, *args, **kwargs):
        ctx, err = mandatory_student_resources_context(request)
        if err:
            return err
        self._student_resources_ctx = ctx

        from apps.student_resources.services.overdue_status import (
            refresh_student_resource_overdue,
        )

        refresh_student_resource_overdue()
        queryset = self.filter_queryset(self.get_queryset())
        
        # Pagination
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'success': True,
            'data': serializer.data,
            'count': len(serializer.data)
        })
    
    def create(self, request, *args, **kwargs):
        ctx, err = mandatory_student_resources_context(request)
        if err:
            return err
        self._student_resources_ctx = ctx

        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            student = serializer.validated_data.get('student')
            if student:
                gate = assert_student_resource_record_sube_access(request, student)
                if gate:
                    return gate
            # Koç olarak request.user'ı ata
            instance = serializer.save(coach=request.user if request.user.is_authenticated else None)
            output_serializer = StudentResourceAssignmentSerializer(instance)
            return Response({
                'success': True,
                'data': output_serializer.data,
                'message': 'Kaynak ataması başarıyla oluşturuldu.'
            }, status=status.HTTP_201_CREATED)
        return Response({
            'success': False,
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def update(self, request, *args, **kwargs):
        ctx, err = mandatory_student_resources_context(request)
        if err:
            return err
        self._student_resources_ctx = ctx

        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if serializer.is_valid():
            self.perform_update(serializer)
            instance.refresh_from_db()
            from apps.student_resources.services.overdue_status import (
                revert_student_resource_overdue_if_extended,
            )

            revert_student_resource_overdue_if_extended(instance)
            output_serializer = StudentResourceAssignmentSerializer(instance)
            return Response({
                'success': True,
                'data': output_serializer.data,
                'message': 'Kaynak ataması başarıyla güncellendi.'
            })
        return Response({
            'success': False,
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def destroy(self, request, *args, **kwargs):
        ctx, err = mandatory_student_resources_context(request)
        if err:
            return err
        self._student_resources_ctx = ctx

        instance = self.get_object()
        # Soft delete
        instance.is_active = False
        instance.deleted_at = timezone.now()
        instance.save()
        return Response({
            'success': True,
            'message': 'Kaynak ataması başarıyla silindi.'
        })
    
    @action(detail=False, methods=['post'])
    def bulk_assign(self, request):
        """
        Toplu Kaynak Atama
        POST /api/student-resources/assignments/bulk_assign/
        
        Body:
        {
            "student_ids": [1, 2, 3],
            "resource_book_ids": [1, 2],
            "due_date": "2026-03-01",
            "notes": "Haftalık ödev"
        }
        """
        ctx, err = mandatory_student_resources_context(request)
        if err:
            return err
        self._student_resources_ctx = ctx

        serializer = BulkAssignmentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        student_ids = serializer.validated_data['student_ids']
        resource_book_ids = serializer.validated_data['resource_book_ids']
        ownership_type = serializer.validated_data.get('ownership_type', StudentResourceAssignment.OwnershipType.TO_PURCHASE)
        due_date = serializer.validated_data.get('due_date')
        notes = serializer.validated_data.get('notes', '')
        
        # Koç yetkisi kontrolü
        coach = request.user if request.user.is_authenticated else None
        
        # Import models
        from apps.ogrenci.domain.models import Ogrenci
        from apps.resources.models import ResourceBook
        
        # Validate students (aktif şube + koç kapsamı)
        students = Ogrenci.objects.filter(
            id__in=student_ids,
            aktif_mi=True,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        )
        if students.count() != len(student_ids):
            return Response({
                'success': False,
                'error': 'Bazı öğrenciler bulunamadı, aktif değil veya bu şubeye ait değil.'
            }, status=status.HTTP_400_BAD_REQUEST)

        for sid in student_ids:
            if not user_can_access_student(request.user, sid):
                return Response({
                    'success': False,
                    'error': 'Bu öğrencilere kaynak atama yetkiniz yok.'
                }, status=status.HTTP_403_FORBIDDEN)
        
        # Validate resources
        from apps.resources.scoping import filter_books_for_request
        resources = filter_books_for_request(
            ResourceBook.objects.filter(id__in=resource_book_ids, aktif_mi=True),
            request,
        )
        if resources.count() != len(resource_book_ids):
            return Response({
                'success': False,
                'error': 'Bazı kaynaklar bulunamadı veya aktif değil.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        created_count = 0
        skipped_count = 0
        errors = []
        
        with transaction.atomic():
            for student in students:
                for resource in resources:
                    # Duplicate kontrolü
                    exists = StudentResourceAssignment.objects.filter(
                        student=student,
                        resource_book=resource,
                        is_active=True
                    ).exists()
                    
                    if exists:
                        skipped_count += 1
                        continue

                    inactive = StudentResourceAssignment.objects.filter(
                        student=student,
                        resource_book=resource,
                        is_active=False,
                    ).first()

                    try:
                        if inactive:
                            inactive.is_active = True
                            inactive.deleted_at = None
                            inactive.coach = coach
                            inactive.lesson = resource.ders
                            inactive.ownership_type = ownership_type
                            inactive.due_date = due_date
                            inactive.notes = notes
                            inactive.status = StudentResourceAssignment.Status.ASSIGNED
                            inactive.progress_percent = 0
                            inactive.completed_at = None
                            inactive.difficulty_level_snapshot = ''
                            inactive.save()
                        else:
                            StudentResourceAssignment.objects.create(
                                student=student,
                                coach=coach,
                                lesson=resource.ders,
                                resource_book=resource,
                                ownership_type=ownership_type,
                                due_date=due_date,
                                notes=notes
                            )
                        created_count += 1
                    except Exception as e:
                        errors.append(f"{student}: {str(e)}")
        
        return Response({
            'success': True,
            'data': {
                'created': created_count,
                'skipped': skipped_count,
                'errors': errors
            },
            'message': f'{created_count} atama oluşturuldu, {skipped_count} atama zaten mevcuttu.'
        })
    
    @action(detail=False, methods=['post'])
    def bulk_update(self, request):
        """
        Toplu Güncelleme
        POST /api/student-resources/assignments/bulk_update/
        """
        serializer = BulkUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        assignment_ids = serializer.validated_data['assignment_ids']
        
        # Build update dict
        update_data = {}
        if 'status' in serializer.validated_data:
            update_data['status'] = serializer.validated_data['status']
        if 'coach_id' in serializer.validated_data:
            update_data['coach_id'] = serializer.validated_data['coach_id']
        if 'due_date' in serializer.validated_data:
            update_data['due_date'] = serializer.validated_data['due_date']
        if 'notes' in serializer.validated_data:
            update_data['notes'] = serializer.validated_data['notes']
        
        if not update_data:
            return Response({
                'success': False,
                'error': 'Güncellenecek alan belirtilmedi.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        update_data['updated_at'] = timezone.now()
        
        updated_count = StudentResourceAssignment.objects.filter(
            id__in=assignment_ids,
            is_active=True
        ).update(**update_data)
        
        return Response({
            'success': True,
            'data': {'updated': updated_count},
            'message': f'{updated_count} atama güncellendi.'
        })
    
    @action(detail=False, methods=['post'])
    def bulk_delete(self, request):
        """
        Toplu Silme (Soft Delete)
        POST /api/student-resources/assignments/bulk_delete/
        """
        serializer = BulkDeleteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        assignment_ids = serializer.validated_data['assignment_ids']
        
        deleted_count = StudentResourceAssignment.objects.filter(
            id__in=assignment_ids,
            is_active=True
        ).update(
            is_active=False,
            deleted_at=timezone.now()
        )
        
        return Response({
            'success': True,
            'data': {'deleted': deleted_count},
            'message': f'{deleted_count} atama silindi.'
        })
    
    @action(detail=False, methods=['get'])
    def my_students(self, request):
        """
        Koçun öğrencilerini getir
        GET /api/student-resources/assignments/my_students/
        """
        from apps.ogrenci.domain.models import Ogrenci

        ctx, err = mandatory_student_resources_context(request)
        if err:
            return err

        students_qs = Ogrenci.objects.filter(
            aktif_mi=True,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        )
        allowed = scoped_student_ids(request.user)
        if allowed is not None:
            students_qs = students_qs.filter(id__in=allowed)

        students = students_qs.values(
            'id', 'ad', 'soyad', 'tc_kimlik_no'
        ).order_by('ad', 'soyad')[:200]

        data = [
            {
                'id': s['id'],
                'ad': s['ad'],
                'soyad': s['soyad'],
                'ogrenci_no': s['tc_kimlik_no'][:4] + '****' if s['tc_kimlik_no'] else ''
            }
            for s in students
        ]
        
        return Response({
            'success': True,
            'data': data
        })
    
    @action(detail=False, methods=['get'])
    def available_resources(self, request):
        """
        Atama için uygun kaynakları getir
        GET /api/student-resources/assignments/available_resources/?lesson_ids=1,2,3&student_ids=1,2&exclude_assigned=true
        
        Optional: resource_type, publisher (same semantics as list endpoint).
        
        exclude_assigned=true olduğunda, belirtilen öğrencilere daha önce atanmış kaynakları hariç tutar.
        """
        from apps.resources.models import ResourceBook
        from apps.resources.scoping import filter_books_for_request
        
        lesson_ids = request.query_params.get('lesson_ids', '')
        if lesson_ids:
            lesson_ids = [int(x) for x in lesson_ids.split(',') if x.isdigit()]
        
        student_ids = request.query_params.get('student_ids', '')
        if student_ids:
            student_ids = [int(x) for x in student_ids.split(',') if x.isdigit()]
        else:
            student_ids = []
        
        exclude_assigned = request.query_params.get('exclude_assigned', 'false').lower() == 'true'
        acquisition_info = request.query_params.get('acquisition_info', 'false').lower() == 'true'
        
        queryset = filter_books_for_request(
            ResourceBook.objects.filter(aktif_mi=True).select_related(
                'book_type', 'ders', 'sinif_seviyesi'
            ),
            request,
        )
        
        if lesson_ids:
            queryset = queryset.filter(ders_id__in=lesson_ids)

        queryset = filter_books_by_student_sinif_seviyesi(queryset, student_ids)

        resource_type = request.query_params.get('resource_type')
        publisher = request.query_params.get('publisher')
        queryset = filter_resource_books_by_type_publisher(
            queryset,
            resource_type=resource_type or None,
            publisher=publisher or None,
        )
        
        # Seçili öğrencilere daha önce atanmış kaynakları hariç tut
        if exclude_assigned and student_ids:
            # Tüm seçili öğrencilere atanmış kaynak ID'lerini bul
            assigned_resource_ids = StudentResourceAssignment.objects.filter(
                student_id__in=student_ids,
                is_active=True
            ).values_list('resource_book_id', flat=True).distinct()
            
            queryset = queryset.exclude(id__in=assigned_resource_ids)
        
        # Sıralama
        sort_by = request.query_params.get('sort', 'zorluk_min')
        sort_order = request.query_params.get('order', 'asc')
        
        if sort_order == 'desc':
            sort_by = f'-{sort_by}'
        
        queryset = queryset.order_by(sort_by, 'ad')
        
        acquisition_map = {}
        if acquisition_info and len(student_ids) == 1:
            acquisition_map = get_student_book_acquisition_map(student_ids[0])
        
        from apps.resources.application.kapak import resolve_book_kapak_url

        resources = queryset.values(
            'id', 'ad', 'kod',
            'ders_id', 'ders__ad',
            'book_type__ad', 'book_type__renk',
            'yayinevi', 'yayin_yili',
            'zorluk_min', 'zorluk_max',
            'toplam_sayfa',
            'kapak', 'kapak_url',
        )[:200]
        
        # Format response
        data = []
        for r in resources:
            zorluk_display = None
            if r['zorluk_min'] is not None and r['zorluk_max'] is not None:
                zorluk_display = f"{r['zorluk_min']}-{r['zorluk_max']}"
            elif r['zorluk_min'] is not None:
                zorluk_display = f"{r['zorluk_min']}+"
            elif r['zorluk_max'] is not None:
                zorluk_display = f"0-{r['zorluk_max']}"
            
            entry = {
                'id': r['id'],
                'ad': r['ad'],
                'kod': r['kod'],
                'ders_id': r['ders_id'],
                'ders_ad': r['ders__ad'],
                'book_type': r['book_type__ad'],
                'book_type_renk': r['book_type__renk'],
                'yayinevi': r['yayinevi'],
                'yayin_yili': r['yayin_yili'],
                'zorluk_min': r['zorluk_min'],
                'zorluk_max': r['zorluk_max'],
                'zorluk_display': zorluk_display,
                'toplam_sayfa': r['toplam_sayfa'],
                'kapak_url': resolve_book_kapak_url(
                    kapak_name=r.get('kapak') or None,
                    kapak_url=r.get('kapak_url') or '',
                ),
            }
            acq = acquisition_map.get(r['id'])
            if acq:
                entry.update(acq)
            else:
                entry.update({
                    'acquisition_status': None,
                    'acquisition_label': None,
                    'selectable': True,
                    'hidden': False,
                })
            data.append(entry)
        
        return Response({
            'success': True,
            'data': data
        })
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """
        İstatistikler
        GET /api/student-resources/assignments/statistics/
        """
        from django.db.models import Count, Avg
        
        queryset = self.get_queryset()
        
        stats = {
            'total': queryset.count(),
            'by_status': dict(
                queryset.values('status').annotate(count=Count('id')).values_list('status', 'count')
            ),
            'avg_progress': queryset.aggregate(avg=Avg('progress_percent'))['avg'] or 0,
            'overdue_count': queryset.filter(
                due_date__lt=timezone.now().date()
            ).exclude(
                status__in=[StudentResourceAssignment.Status.COMPLETED,
                           StudentResourceAssignment.Status.CANCELLED]
            ).count()
        }
        
        return Response({
            'success': True,
            'data': stats
        })

    @action(detail=False, methods=['get'])
    def student_list(self, request):
        """
        Öğrenci Listesi (KPI kartları ve grid için)
        GET /api/student-resources/assignments/student_list/
        
        Admin: Aktif şubedeki tüm öğrenciler
        Koç: Yalnızca kendi öğrencileri (aynı şube)
        """
        from django.db.models import Count, Avg, Case, When, IntegerField, F
        from apps.ogrenci.domain.models import Ogrenci
        from apps.student_resources.services.overdue_status import (
            refresh_student_resource_overdue,
        )

        ctx, err = mandatory_student_resources_context(request)
        if err:
            return err

        refresh_student_resource_overdue()
        today = timezone.now().date()

        allowed = scoped_student_ids(request.user)
        students_qs = Ogrenci.objects.filter(
            aktif_mi=True,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        )
        if allowed is not None:
            students_qs = students_qs.filter(id__in=allowed)

        assignment_qs = StudentResourceAssignment.objects.filter(
            is_active=True,
            student__kurum_id=ctx['kurum_id'],
            student__sube_id=ctx['sube_id'],
        )
        if allowed is not None:
            assignment_qs = assignment_qs.filter(student_id__in=allowed)

        # Öğrenci bazlı atama istatistikleri
        student_stats = assignment_qs.values('student_id').annotate(
            total_resources=Count('id'),
            completed=Count('id', filter=Q(status='COMPLETED')),
            in_progress=Count('id', filter=Q(status='IN_PROGRESS')),
            assigned=Count('id', filter=Q(status='ASSIGNED')),
            cancelled=Count('id', filter=Q(status='CANCELLED')),
            overdue=Count('id', filter=Q(status='OVERDUE')),
            avg_progress=Avg('progress_percent')
        )
        
        stats_dict = {s['student_id']: s for s in student_stats}

        students = students_qs.values(
            'id', 'ad', 'soyad', 'tc_kimlik_no', 'profil_foto'
        ).order_by('ad', 'soyad')[:200]

        assigned_student_ids = set(stats_dict.keys()) & {s['id'] for s in students}

        kpi = {
            'total_students': students_qs.filter(aktif_mi=True).count(),
            'with_resources': len(assigned_student_ids),
            'without_resources': 0,
            'with_incomplete': 0,
            'with_overdue': 0,
            'avg_completion': 0
        }
        kpi['without_resources'] = kpi['total_students'] - kpi['with_resources']

        total_progress = 0
        progress_count = 0

        data = []
        for s in students:
            stats = stats_dict.get(s['id'], {})
            total = stats.get('total_resources', 0)
            completed = stats.get('completed', 0)
            in_progress = stats.get('in_progress', 0)
            overdue = stats.get('overdue', 0)
            avg_progress = stats.get('avg_progress', 0) or 0
            
            # KPI güncelleme
            if total > 0 and completed < total:
                kpi['with_incomplete'] += 1
            if overdue > 0:
                kpi['with_overdue'] += 1
            if avg_progress > 0:
                total_progress += avg_progress
                progress_count += 1
            
            # Risk skoru: gecikme ve düşük ilerleme bazlı
            risk_score = 0
            if overdue > 0:
                risk_score += overdue * 20
            if total > 0 and avg_progress < 30:
                risk_score += 20
            
            # Profil foto URL'i
            profil_foto_url = None
            if s.get('profil_foto'):
                profil_foto_url = f"/media/{s['profil_foto']}"
            
            data.append({
                'id': s['id'],
                'ad': s['ad'],
                'soyad': s['soyad'],
                'ogrenci_no': s['tc_kimlik_no'][:4] + '****' if s['tc_kimlik_no'] else '',
                'profil_foto': profil_foto_url,
                'total_resources': total,
                'completed': completed,
                'in_progress': in_progress,
                'overdue': overdue,
                'avg_progress': round(avg_progress, 1),
                'risk_score': min(risk_score, 100),
                'has_resources': total > 0
            })
        
        if progress_count > 0:
            kpi['avg_completion'] = round(total_progress / progress_count, 1)
        
        return Response({
            'success': True,
            'data': data,
            'kpi': kpi
        })

    @action(detail=False, methods=['get'])
    def student_detail(self, request):
        """
        Öğrenci Detay (ders bazlı kaynak listesi)
        GET /api/student-resources/assignments/student_detail/?student_id=1
        
        Optional: resource_type, publisher (same semantics as list endpoint).
        """
        from django.db.models import Count, Avg
        
        ctx, err = mandatory_student_resources_context(request)
        if err:
            return err
        self._student_resources_ctx = ctx

        student_id = request.query_params.get('student_id')
        if not student_id:
            return Response({
                'success': False,
                'error': 'student_id parametresi gerekli'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not user_can_access_student(request.user, student_id):
            return Response({
                'success': False,
                'error': 'Bu öğrenciye erişim yetkiniz yok.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        from apps.ogrenci.domain.models import Ogrenci
        
        try:
            student = Ogrenci.objects.get(
                id=student_id,
                aktif_mi=True,
                kurum_id=ctx['kurum_id'],
                sube_id=ctx['sube_id'],
            )
        except Ogrenci.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Öğrenci bulunamadı'
            }, status=status.HTTP_404_NOT_FOUND)

        gate = assert_student_resource_record_sube_access(request, student)
        if gate:
            return gate
        
        # Öğrenci atamaları
        assignments = StudentResourceAssignment.objects.filter(
            student_id=student_id,
            is_active=True
        ).select_related(
            'lesson', 'resource_book', 'resource_book__book_type', 'coach'
        )
        resource_type = request.query_params.get('resource_type')
        publisher = request.query_params.get('publisher')
        assignments = filter_resource_books_by_type_publisher(
            assignments,
            resource_type=resource_type or None,
            publisher=publisher or None,
            prefix='resource_book__',
        )
        assignments = assignments.order_by('lesson__ad', 'resource_book__book_type__ad', 'resource_book__ad')
        
        today = timezone.now().date()
        
        # Özet istatistikler
        total = assignments.count()
        completed = assignments.filter(status='COMPLETED').count()
        in_progress = assignments.filter(status='IN_PROGRESS').count()
        assigned = assignments.filter(status='ASSIGNED').count()
        overdue = assignments.filter(status='OVERDUE').count()
        
        avg_progress = 0
        if total > 0:
            avg_progress = sum(a.progress_percent for a in assignments) / total
        
        # Ders bazlı gruplama
        from apps.resources.application.kapak import resolve_book_kapak_url

        lessons_dict = {}
        for a in assignments:
            lesson_id = a.lesson_id
            if lesson_id not in lessons_dict:
                lessons_dict[lesson_id] = {
                    'lesson_id': lesson_id,
                    'lesson_name': a.lesson.ad if a.lesson else 'Bilinmiyor',
                    'resources': []
                }
            
            lessons_dict[lesson_id]['resources'].append({
                'id': a.id,
                'resource_book': a.resource_book_id,
                'resource_name': a.resource_book.ad if a.resource_book else '',
                'resource_type': a.resource_book.book_type.ad if a.resource_book and a.resource_book.book_type else '',
                'resource_type_renk': a.resource_book.book_type.renk if a.resource_book and a.resource_book.book_type else '#e2e8f0',
                'resource_yayin_yili': a.resource_book.yayin_yili if a.resource_book else None,
                'resource_yayinevi': a.resource_book.yayinevi if a.resource_book else '',
                'kapak_url': resolve_book_kapak_url(a.resource_book) if a.resource_book else '',
                'difficulty_level_snapshot': a.difficulty_level_snapshot,
                'status': a.status,
                'status_display': a.get_status_display(),
                'ownership_type': a.ownership_type,
                'ownership_type_display': a.get_ownership_type_display(),
                'progress_percent': a.progress_percent,
                'assigned_at': a.assigned_at.isoformat() if a.assigned_at else None,
                'due_date': a.due_date.isoformat() if a.due_date else None,
                'completed_at': a.completed_at.isoformat() if a.completed_at else None,
                'notes': a.notes,
                'is_overdue': a.status == StudentResourceAssignment.Status.OVERDUE,
            })
        
        # Her ders için kaynak sayısı ve tamamlanma hesapla
        lessons = []
        for lesson_data in lessons_dict.values():
            resources = lesson_data['resources']
            lesson_completed = sum(1 for r in resources if r['status'] == 'COMPLETED')
            lesson_data['total'] = len(resources)
            lesson_data['completed'] = lesson_completed
            lesson_data['completion_percent'] = round((lesson_completed / len(resources)) * 100, 1) if resources else 0
            lessons.append(lesson_data)
        
        # Dersleri alfabetik sırala
        lessons.sort(key=lambda x: x['lesson_name'])
        
        # Aktif satın alma listeleri (bekleyen kalemler)
        active_lists_qs = ResourcePurchaseList.objects.filter(
            student=student,
            status__in=[
                ResourcePurchaseList.Status.DRAFT,
                ResourcePurchaseList.Status.FINALIZED,
            ],
        ).prefetch_related(
            'items',
            'items__resource_book',
            'items__assignment__resource_book',
        ).order_by('-created_at')
        active_purchase_lists = []
        for pl in active_lists_qs:
            pending_items = [
                item for item in pl.items.all()
                if item.item_status == ResourcePurchaseListItem.ItemStatus.PENDING
            ]
            if not pending_items:
                continue
            active_purchase_lists.append({
                'id': pl.id,
                'title': pl.title or pl.get_list_type_display(),
                'list_type': pl.list_type,
                'list_type_display': pl.get_list_type_display(),
                'status': pl.status,
                'items': [
                    {
                        'id': item.id,
                        'resource_name': (
                            item.book_name_snapshot
                            or (item.resource_book.ad if item.resource_book_id else '')
                            or (item.assignment.resource_book.ad if item.assignment_id else '')
                        ),
                        'kapak_url': resolve_book_kapak_url(
                            item.resource_book
                            or (item.assignment.resource_book if item.assignment_id else None)
                        ),
                        'item_status': item.item_status,
                        'item_status_display': item.get_item_status_display(),
                    }
                    for item in pending_items
                ],
            })
        
        # Profil foto URL
        profil_foto_url = None
        if student.profil_foto:
            profil_foto_url = f"/media/{student.profil_foto}"
        
        return Response({
            'success': True,
            'data': {
                'student': {
                    'id': student.id,
                    'ad': student.ad,
                    'soyad': student.soyad,
                    'full_name': f"{student.ad} {student.soyad}",
                    'profil_foto': profil_foto_url
                },
                'summary': {
                    'total_lessons': len(lessons),
                    'total_resources': total,
                    'completed': completed,
                    'in_progress': in_progress,
                    'assigned': assigned,
                    'overdue': overdue,
                    'avg_progress': round(avg_progress, 1)
                },
                'lessons': lessons,
                'active_purchase_lists': active_purchase_lists,
            }
        })


class ResourcePurchaseListViewSet(viewsets.ModelViewSet):
    """
    Satın Alma Listesi ViewSet
    Kırtasiye için satın alma listelerini yönetir
    """
    queryset = ResourcePurchaseList.objects.all()
    serializer_class = ResourcePurchaseListSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]
    
    def get_queryset(self):
        queryset = ResourcePurchaseList.objects.select_related(
            'student', 'created_by'
        ).prefetch_related('items', 'items__assignment')
        
        # Filtreleme
        student_id = self.request.query_params.get('student_id')
        if student_id:
            queryset = queryset.filter(student_id=student_id)
        
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        queryset = filter_by_student_scope(queryset, self.request.user, student_field='student_id')

        ctx = getattr(self, '_student_resources_ctx', None)
        if ctx:
            queryset = filter_assignments_by_student_sube(queryset, ctx['sube_id'])

        return queryset

    def get_object(self):
        obj = super().get_object()
        gate = assert_student_resource_record_sube_access(self.request, obj.student)
        if gate:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(detail=gate.data.get('error', 'Forbidden'))
        return obj

    def list(self, request, *args, **kwargs):
        ctx, err = mandatory_student_resources_context(request)
        if err:
            return err
        self._student_resources_ctx = ctx
        return super().list(request, *args, **kwargs)
    
    @action(detail=False, methods=['post'])
    def create_for_student(self, request):
        """
        Öğrenci için Satın Alma Listesi Oluştur
        POST /api/student-resources/purchase-lists/create_for_student/
        
        Body:
        {
            "student_id": 1,
            "assignment_ids": [1, 2, 3],  // Opsiyonel - boş ise TO_PURCHASE olanlar eklenir
            "notes": "Not",
            "stationery_name": "ABC Kırtasiye",
            "stationery_address": "..."
        }
        """
        ctx, err = mandatory_student_resources_context(request)
        if err:
            return err

        serializer = ResourcePurchaseListCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        student_id = serializer.validated_data['student_id']
        ownership_type = serializer.validated_data.get('ownership_type', StudentResourceAssignment.OwnershipType.TO_PURCHASE)
        assignment_ids = serializer.validated_data.get('assignment_ids', [])
        notes = serializer.validated_data.get('notes', '')
        title = serializer.validated_data.get('title', '')
        stationery_name = serializer.validated_data.get('stationery_name', '')
        stationery_address = serializer.validated_data.get('stationery_address', '')
        
        from apps.ogrenci.domain.models import Ogrenci
        
        try:
            student = Ogrenci.objects.get(id=student_id)
        except Ogrenci.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Öğrenci bulunamadı.'
            }, status=status.HTTP_404_NOT_FOUND)

        gate = assert_student_resource_record_sube_access(request, student)
        if gate:
            return gate

        if not user_can_access_student(request.user, student_id):
            return Response({
                'success': False,
                'error': 'Bu öğrenciye erişim yetkiniz yok.',
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Eğer assignment_ids verilmemişse, ownership_type'a göre filtrele
        if not assignment_ids:
            assignments = StudentResourceAssignment.objects.filter(
                student=student,
                is_active=True,
                ownership_type=ownership_type
            ).exclude(
                purchase_list_items__purchase_list__status__in=[
                    ResourcePurchaseList.Status.FINALIZED,
                    ResourcePurchaseList.Status.DELIVERED
                ]
            )
        else:
            assignments = StudentResourceAssignment.objects.filter(
                id__in=assignment_ids,
                student=student,
                is_active=True
            )
        
        if not assignments.exists():
            list_name = "Kırtasiye" if ownership_type == StudentResourceAssignment.OwnershipType.TO_PURCHASE else "Kurum verecek"
            return Response({
                'success': False,
                'error': f'{list_name} listesi için kaynak bulunamadı.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # List type belirle
        list_type = ResourcePurchaseList.ListType.PURCHASE if ownership_type == StudentResourceAssignment.OwnershipType.TO_PURCHASE else ResourcePurchaseList.ListType.INSTITUTION
        
        with transaction.atomic():
            purchase_list = ResourcePurchaseList.objects.create(
                student=student,
                created_by=request.user if request.user.is_authenticated else None,
                list_type=list_type,
                status=ResourcePurchaseList.Status.FINALIZED,
                finalized_at=timezone.now(),
                title=title or (
                    'Kırtasiye Satın Alma Listesi'
                    if list_type == ResourcePurchaseList.ListType.PURCHASE
                    else 'Kurum Kaynak Listesi'
                ),
                notes=notes,
                stationery_name=stationery_name,
                stationery_address=stationery_address
            )
            
            for assignment in assignments:
                ResourcePurchaseListItem.objects.create(
                    purchase_list=purchase_list,
                    assignment=assignment,
                    quantity=1,
                    item_status=ResourcePurchaseListItem.ItemStatus.PENDING,
                )
        
        result_serializer = ResourcePurchaseListSerializer(purchase_list)
        return Response({
            'success': True,
            'data': result_serializer.data,
            'message': f'{assignments.count()} kaynak içeren liste oluşturuldu.'
        })

    @action(detail=False, methods=['post'], url_path='create_from_library')
    def create_from_library(self, request):
        """
        Kaynak kütüphanesinden liste oluştur (atama gerektirmez).
        POST /api/student-resources/purchase-lists/create_from_library/
        """
        from apps.resources.models import ResourceBook
        from apps.resources.scoping import filter_books_for_request

        serializer = ResourcePurchaseListCreateFromLibrarySerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'success': False, 'error': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        from apps.ogrenci.domain.models import Ogrenci

        student_id = serializer.validated_data['student_id']
        try:
            student = Ogrenci.objects.get(id=student_id, aktif_mi=True)
        except Ogrenci.DoesNotExist:
            return Response({'success': False, 'error': 'Öğrenci bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        if not user_can_access_student(request.user, student_id):
            return Response({
                'success': False,
                'error': 'Bu öğrenciye erişim yetkiniz yok.',
            }, status=status.HTTP_403_FORBIDDEN)

        list_type = serializer.validated_data['list_type']
        default_source = serializer.validated_data.get('default_source_note', '')
        book_ids = [item['resource_book_id'] for item in serializer.validated_data['items']]

        books_qs = filter_books_for_request(
            ResourceBook.objects.filter(id__in=book_ids, aktif_mi=True).select_related('ders', 'book_type'),
            request,
        )
        books_qs = filter_books_by_student_sinif_seviyesi(books_qs, [student.id])
        books = {b.id: b for b in books_qs}

        missing = [bid for bid in book_ids if bid not in books]
        if missing:
            return Response({
                'success': False,
                'error': f'Seçilen kaynaklardan erişilemeyen veya bulunamayan ID: {missing}',
            }, status=status.HTTP_400_BAD_REQUEST)

        acquisition_map = get_student_book_acquisition_map(student.id)
        blocked = []
        for bid in book_ids:
            info = acquisition_map.get(bid)
            if info and not info.get('selectable', True):
                label = info.get('acquisition_label', 'Eklenemez')
                blocked.append(f'{books[bid].ad} ({label})')
        if blocked:
            return Response({
                'success': False,
                'error': 'Bu kitaplar zaten alınmış veya başka bir listede: ' + ', '.join(blocked),
            }, status=status.HTTP_400_BAD_REQUEST)

        default_title = (
            'Kırtasiye Satın Alma Listesi'
            if list_type == ResourcePurchaseList.ListType.PURCHASE
            else 'Kurum Kaynak Listesi'
        )

        with transaction.atomic():
            purchase_list = ResourcePurchaseList.objects.create(
                student=student,
                created_by=request.user if request.user.is_authenticated else None,
                list_type=list_type,
                status=ResourcePurchaseList.Status.FINALIZED,
                finalized_at=timezone.now(),
                title=serializer.validated_data.get('title') or default_title,
                notes=serializer.validated_data.get('notes', ''),
                stationery_name=serializer.validated_data.get('stationery_name', ''),
                stationery_address=serializer.validated_data.get('stationery_address', ''),
            )
            for item in serializer.validated_data['items']:
                book = books[item['resource_book_id']]
                lesson = book.ders
                source_note = item.get('source_note') or default_source
                assignment = create_assignment_for_list_item(
                    student, book, lesson, list_type, request.user,
                )
                ResourcePurchaseListItem.objects.create(
                    purchase_list=purchase_list,
                    assignment=assignment,
                    resource_book=book,
                    lesson=lesson,
                    quantity=item.get('quantity') or 1,
                    source_note=source_note,
                    item_status=ResourcePurchaseListItem.ItemStatus.PENDING,
                )

        result_serializer = ResourcePurchaseListSerializer(purchase_list)
        return Response({
            'success': True,
            'data': result_serializer.data,
            'message': f'{len(serializer.validated_data["items"])} kaynak içeren liste oluşturuldu.',
        })

    @action(detail=False, methods=['post'], url_path=r'items/(?P<item_id>\d+)/set_status')
    def set_item_status(self, request, item_id=None):
        """
        Liste kalemi durumunu güncelle.
        POST /api/student-resources/purchase-lists/items/{id}/set_status/
        Body: { "item_status": "RECEIVED"|"NOT_RECEIVED"|"CANCELLED" }
        """
        serializer = PurchaseListItemStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'success': False, 'error': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        try:
            item = ResourcePurchaseListItem.objects.select_related(
                'purchase_list', 'assignment', 'purchase_list__student',
            ).get(id=item_id)
        except ResourcePurchaseListItem.DoesNotExist:
            return Response({'success': False, 'error': 'Liste kalemi bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        if not user_can_access_student(request.user, item.purchase_list.student_id):
            return Response({'success': False, 'error': 'Bu öğrenciye erişim yetkiniz yok.'}, status=status.HTTP_403_FORBIDDEN)

        if item.item_status != ResourcePurchaseListItem.ItemStatus.PENDING:
            return Response({'success': False, 'error': 'Sadece bekleyen kalemler güncellenebilir.'}, status=status.HTTP_400_BAD_REQUEST)

        new_status = serializer.validated_data['item_status']
        with transaction.atomic():
            apply_list_item_status(item, new_status)

        item.refresh_from_db()
        result_serializer = ResourcePurchaseListItemSerializer(item)
        return Response({
            'success': True,
            'data': result_serializer.data,
            'message': f'Kalem durumu güncellendi: {item.get_item_status_display()}',
        })
    
    @action(detail=True, methods=['post'])
    def finalize(self, request, pk=None):
        """
        Listeyi Kesinleştir
        POST /api/student-resources/purchase-lists/{id}/finalize/
        """
        purchase_list = self.get_object()
        
        if purchase_list.status != ResourcePurchaseList.Status.DRAFT:
            return Response({
                'success': False,
                'error': 'Sadece taslak listeler kesinleştirilebilir.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        purchase_list.status = ResourcePurchaseList.Status.FINALIZED
        purchase_list.finalized_at = timezone.now()
        purchase_list.save()
        
        result_serializer = ResourcePurchaseListSerializer(purchase_list)
        return Response({
            'success': True,
            'data': result_serializer.data,
            'message': 'Liste kesinleştirildi.'
        })
    
    @action(detail=True, methods=['post'])
    def mark_delivered(self, request, pk=None):
        """
        Teslim Edildi İşaretle
        POST /api/student-resources/purchase-lists/{id}/mark_delivered/
        """
        purchase_list = self.get_object()
        
        if purchase_list.status not in [ResourcePurchaseList.Status.FINALIZED, ResourcePurchaseList.Status.DRAFT]:
            return Response({
                'success': False,
                'error': 'Bu liste teslim edildi olarak işaretlenemez.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        purchase_list.status = ResourcePurchaseList.Status.DELIVERED
        purchase_list.delivered_at = timezone.now()
        if not purchase_list.finalized_at:
            purchase_list.finalized_at = timezone.now()
        purchase_list.save()
        
        result_serializer = ResourcePurchaseListSerializer(purchase_list)
        return Response({
            'success': True,
            'data': result_serializer.data,
            'message': 'Liste teslim edildi olarak işaretlendi.'
        })
    
    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """
        PDF/HTML Çıktısı Oluştur
        GET /api/student-resources/purchase-lists/{id}/pdf/
        """
        from django.http import HttpResponse
        from apps.ogrenci.domain.models import OgrenciKayit
        from apps.coaching.models import CoachStudentAssignment
        from .pdf_utils import build_purchase_list_html, make_download_filename

        purchase_list = self.get_object()
        student = purchase_list.student
        kurum = student.kurum

        coach_name = ""
        try:
            coach_assignment = CoachStudentAssignment.objects.filter(
                student=student,
                is_primary=True,
                end_date__isnull=True,
            ).select_related('coach__teacher').first()
            if not coach_assignment:
                coach_assignment = CoachStudentAssignment.objects.filter(
                    student=student,
                    is_primary=True,
                ).select_related('coach__teacher').order_by('-start_date').first()
            if coach_assignment and coach_assignment.coach and coach_assignment.coach.teacher:
                teacher = coach_assignment.coach.teacher
                coach_name = f"{teacher.ad} {teacher.soyad}".strip()
        except Exception:
            pass

        sinif_adi = "-"
        try:
            aktif_kayit = OgrenciKayit.objects.filter(
                ogrenci=student,
                egitim_yili__aktif_mi=True,
            ).select_related('sinif').first()
            if aktif_kayit and aktif_kayit.sinif:
                sinif_adi = aktif_kayit.sinif.ad
        except Exception:
            pass

        html = build_purchase_list_html(purchase_list, student, kurum, sinif_adi, coach_name)
        filename = make_download_filename(purchase_list, student)
        response = HttpResponse(html, content_type='text/html; charset=utf-8')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    @action(detail=False, methods=['get'])
    def student_summary(self, request):
        """
        Öğrenci Satın Alma Özeti
        GET /api/student-resources/purchase-lists/student_summary/?student_id=1
        
        Öğrencinin satın alınacak kaynakları ve mevcut listeleri
        """
        student_id = request.query_params.get('student_id')
        if not student_id:
            return Response({
                'success': False,
                'error': 'student_id parametresi gerekli.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        from apps.ogrenci.domain.models import Ogrenci
        
        try:
            student = Ogrenci.objects.get(id=student_id)
        except Ogrenci.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Öğrenci bulunamadı.'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Sahiplik durumuna göre kaynakları say
        assignments = StudentResourceAssignment.objects.filter(
            student=student,
            is_active=True
        )
        
        student_owned = assignments.filter(
            ownership_type=StudentResourceAssignment.OwnershipType.STUDENT_OWNED
        ).count()
        
        to_purchase = assignments.filter(
            ownership_type=StudentResourceAssignment.OwnershipType.TO_PURCHASE
        ).count()
        
        institution_provided = assignments.filter(
            ownership_type=StudentResourceAssignment.OwnershipType.INSTITUTION_PROVIDED
        ).count()
        
        # Mevcut listeler
        purchase_lists = ResourcePurchaseList.objects.filter(
            student=student
        ).order_by('-created_at')[:5]
        
        lists_data = ResourcePurchaseListSerializer(purchase_lists, many=True).data
        
        return Response({
            'success': True,
            'data': {
                'ownership_summary': {
                    'student_owned': student_owned,
                    'to_purchase': to_purchase,
                    'institution_provided': institution_provided,
                    'total': student_owned + to_purchase + institution_provided
                },
                'recent_purchase_lists': lists_data
            }
        })
