"""
Manuel Ödev Atama - API Views
"""
import json

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.authentication import SessionAuthentication
from rest_framework.parsers import JSONParser, FormParser, MultiPartParser
from django.http import HttpResponse
from django.db.models import Q, Count, Prefetch, F
from django.db import transaction
from django.utils import timezone

from .models import (
    ManualAssignment,
    AssignmentLesson,
    AssignmentTask,
    AssignmentPackage,
    AssignmentPackageItem,
)


def _resolve_assignment_pdf_filename(pk, kurum_id, notify_type: str) -> str:
    from .assignment_notify_utils import build_assignment_pdf_filename

    assignment = ManualAssignment.objects.select_related('student').filter(
        id=pk,
        student__kurum_id=kurum_id,
        is_active=True,
    ).first()
    if assignment:
        return build_assignment_pdf_filename(assignment, notify_type)
    fallback = 'Odev-Raporu' if notify_type == 'report' else 'Odev-Plani'
    return f'{fallback}-{pk}.pdf'
from .serializers import (
    ManualAssignmentListSerializer,
    ManualAssignmentDetailSerializer,
    ManualAssignmentCreateSerializer,
    ManualAssignmentDeletedSerializer,
    AssignmentLessonSerializer,
    AssignmentTaskSerializer,
    StudentResourceFilterSerializer,
    AssignmentPackageListSerializer,
    AssignmentPackageDetailSerializer,
    AssignmentPackageWriteSerializer,
)
from apps.coaching.services.coach_access import (
    filter_manual_assignments,
    filter_by_assignment_scope,
    user_can_access_student,
    is_resource_admin,
)
from apps.coaching.interfaces.sube_context import (
    assert_coaching_student_sube_access,
    filter_queryset_by_student_sube,
    mandatory_coaching_context,
)
from .lock_utils import CONTROL_LOCK_MESSAGE, is_assignment_control_locked
from shared.context import get_secili_kurum_id

VALID_NON_SUBMISSION_REASONS = frozenset(
    choice[0]
    for choice in ManualAssignment._meta.get_field('non_submission_reason').choices
)

KONTROL_BADGE_STATUSES = (
    ManualAssignment.Status.ASSIGNED,
    ManualAssignment.Status.IN_PROGRESS,
    ManualAssignment.Status.OVERDUE,
)


def control_lock_response(assignment):
    """Kontrol günü kilidi aktifse 403 Response döner."""
    if is_assignment_control_locked(assignment):
        return Response({
            'success': False,
            'error': CONTROL_LOCK_MESSAGE,
        }, status=status.HTTP_403_FORBIDDEN)
    return None


def reset_task_evaluation(task):
    """Görev değerlendirme alanlarını sıfırla ve kaydet."""
    task.completion_status = 'PENDING'
    task.task_completion_percent = 0
    task.evaluated_at = None
    task.completed_at = None
    task.completed_question_count = 0
    task.completed_page_count = 0
    task.status = AssignmentTask.TaskStatus.NOT_STARTED
    task.save()


def update_assignment_completion_from_tasks(assignment):
    """Ödevin toplam tamamlanma yüzdesini ve durumunu görevlere göre güncelle."""
    from django.db.models import Count, Q

    from .completion_utils import compute_weighted_completion_percent

    tasks = AssignmentTask.objects.filter(lesson_block__assignment=assignment)
    stats = tasks.aggregate(
        total=Count('id'),
        evaluated=Count('id', filter=~Q(completion_status='PENDING')),
    )

    total = stats['total'] or 0
    evaluated = stats['evaluated'] or 0

    assignment.completion_percent = compute_weighted_completion_percent(tasks)
    prior_status = assignment.status

    if evaluated > 0 and assignment.status in ['ASSIGNED', 'OVERDUE']:
        assignment.status = ManualAssignment.Status.IN_PROGRESS

    if evaluated == total and total > 0:
        assignment.status = ManualAssignment.Status.COMPLETED
        if not assignment.completed_date:
            assignment.completed_date = timezone.now()
        assignment.save()

        if prior_status != ManualAssignment.Status.COMPLETED:
            pass  # WhatsApp gönderimi manuel "Gönder" butonu ile yapılır

        from .services.progress_sync import sync_source_assignment_progress
        sync_source_assignment_progress(assignment)
        return
    elif assignment.status == ManualAssignment.Status.COMPLETED:
        assignment.completed_date = None
        if evaluated > 0:
            assignment.status = ManualAssignment.Status.IN_PROGRESS
        elif assignment.due_date and assignment.due_date < timezone.now():
            assignment.status = ManualAssignment.Status.OVERDUE
        else:
            assignment.status = ManualAssignment.Status.ASSIGNED

    assignment.save()

    from .services.progress_sync import sync_source_assignment_progress

    sync_source_assignment_progress(assignment)


def _notify_assignment_pdf_whatsapp(assignment):
    try:
        from apps.communication.application.integration_hooks import send_assignment_report_pdf

        kurum_id = assignment.student.kurum_id
        send_assignment_report_pdf(kurum_id, assignment.id)
    except Exception as e:
        import logging
        logging.getLogger('communication.integration').error(
            f'Ödev PDF WhatsApp bildirim hatası: {e}'
        )


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """CSRF kontrolünü devre dışı bırakan SessionAuthentication."""
    def enforce_csrf(self, request):
        return  # CSRF kontrolü yapma


def _resource_book_zorluk_display(resource):
    if resource.zorluk_min is not None and resource.zorluk_max is not None:
        return f"{resource.zorluk_min}-{resource.zorluk_max}"
    if resource.zorluk_min is not None:
        return f"{resource.zorluk_min}+"
    if resource.zorluk_max is not None:
        return f"0-{resource.zorluk_max}"
    return None


def serialize_pool_resource_book(resource):
    """Öğrenci havuzundaki ResourceBook → API dict (güncel şema)."""
    book_type = resource.book_type
    ders = resource.ders
    sinif_seviyesi = resource.sinif_seviyesi
    book_type_kod = book_type.kod if book_type else None
    book_type_ad = book_type.ad if book_type else None

    return {
        'id': resource.id,
        'ad': resource.ad,
        'kod': resource.kod,
        'ders_id': resource.ders_id,
        'ders_ad': ders.ad if ders else None,
        'sinif_seviyesi_id': resource.sinif_seviyesi_id,
        'sinif_seviyesi_ad': sinif_seviyesi.ad if sinif_seviyesi else None,
        'book_type_id': resource.book_type_id,
        'book_type': book_type_kod,
        'book_type_display': book_type_ad,
        'book_type_renk': book_type.renk if book_type else None,
        'yayinevi': resource.yayinevi or '',
        'yazar': resource.yazar or '',
        'yayin_yili': resource.yayin_yili,
        'zorluk_min': resource.zorluk_min,
        'zorluk_max': resource.zorluk_max,
        'zorluk_display': _resource_book_zorluk_display(resource),
        # Eski istemciler için geriye dönük alias'lar
        'kaynak_turu': book_type_kod,
        'kaynak_turu_display': book_type_ad,
    }


class ManualAssignmentViewSet(viewsets.ModelViewSet):
    """
    Manuel Ödev Atama ViewSet
    
    list: GET /api/coaching/manual-assignments/assignments/
    retrieve: GET /api/coaching/manual-assignments/assignments/{id}/
    create: POST /api/coaching/manual-assignments/assignments/
    update: PUT /api/coaching/manual-assignments/assignments/{id}/
    partial_update: PATCH /api/coaching/manual-assignments/assignments/{id}/
    delete: DELETE /api/coaching/manual-assignments/assignments/{id}/
    
    Custom Actions:
    - student_assignments: Öğrenciye ait ödevler
    - coach_assignments: Koça ait ödevler
    - student_resources: Öğrenci kaynak havuzu filtreleme
    - assign: Taslaktan ödev atama
    - update_risk_status: Risk durumu güncelleme
    """
    
    queryset = ManualAssignment.objects.all()
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ManualAssignmentListSerializer
        elif self.action == 'create':
            return ManualAssignmentCreateSerializer
        return ManualAssignmentDetailSerializer
    
    def get_queryset(self):
        queryset = ManualAssignment.objects.select_related(
            'coach', 'student'
        ).prefetch_related(
            Prefetch(
                'lessons',
                queryset=AssignmentLesson.objects.select_related(
                    'lesson', 'resource_book'
                ).prefetch_related('tasks')
            )
        ).filter(is_active=True)

        queryset = filter_manual_assignments(queryset, self.request.user)

        ctx = getattr(self, '_coaching_ctx', None)
        if ctx:
            queryset = filter_queryset_by_student_sube(queryset, ctx['sube_id'])

        # Filtreler
        student_id = self.request.query_params.get('student_id')
        coach_id = self.request.query_params.get('coach_id')
        status_filter = self.request.query_params.get('status')
        risk_status = self.request.query_params.get('risk_status')
        
        if student_id:
            queryset = queryset.filter(student_id=student_id)
        
        if coach_id:
            # Öğrenci geçmişi görünümünde varsayılan: tüm koçların kayıtları
            filter_by_coach = self.request.query_params.get('filter_by_coach', 'false')
            if not student_id or filter_by_coach.lower() in ['true', '1', 'yes']:
                queryset = queryset.filter(coach_id=coach_id)
        
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        if risk_status:
            queryset = queryset.filter(risk_status=risk_status)
        
        return queryset.order_by('-created_at')

    def get_object(self):
        obj = super().get_object()
        gate = assert_coaching_student_sube_access(
            self.request, obj.student.kurum_id, obj.student.sube_id,
        )
        if gate:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(detail=gate.data.get('error', 'Forbidden'))
        return obj

    def list(self, request, *args, **kwargs):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        self._coaching_ctx = ctx

        from apps.student_resources.services.overdue_status import (
            refresh_manual_assignment_overdue,
        )

        refresh_manual_assignment_overdue()
        return super().list(request, *args, **kwargs)
    
    def create(self, request, *args, **kwargs):
        """Ödev oluştur"""
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        self._coaching_ctx = ctx

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        student = serializer.validated_data.get('student')
        if student:
            gate = assert_coaching_student_sube_access(request, student.kurum_id, student.sube_id)
            if gate:
                return gate
        assignment = serializer.save()
        
        # Detay serializer ile dön
        detail_serializer = ManualAssignmentDetailSerializer(assignment)

        # ── Takvim Entegrasyonu ──
        self._sync_to_calendar(assignment, request.user.id)

        # WhatsApp gönderimi manuel "Gönder" butonu ile yapılır
        
        return Response({
            'success': True,
            'data': detail_serializer.data,
            'message': 'Ödev başarıyla oluşturuldu.'
        }, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        """Ödev güncelle"""
        instance = self.get_object()
        locked = control_lock_response(instance)
        if locked:
            return locked
        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        assignment = serializer.save()

        # ── Takvim Entegrasyonu ──
        self._sync_to_calendar(assignment, request.user.id)
        
        return Response({
            'success': True,
            'data': ManualAssignmentDetailSerializer(assignment).data,
            'message': 'Ödev başarıyla güncellendi.'
        })
    
    def destroy(self, request, *args, **kwargs):
        """Ödev sil (soft delete) — silme sebebi zorunlu."""
        deletion_reason = (request.data.get('deletion_reason') or '').strip()
        if len(deletion_reason) < 10:
            return Response({
                'success': False,
                'error': 'Silme sebebi en az 10 karakter olmalıdır.',
            }, status=status.HTTP_400_BAD_REQUEST)

        instance = self.get_object()
        locked = control_lock_response(instance)
        if locked:
            return locked

        instance.is_active = False
        instance.deleted_at = timezone.now()
        instance.deleted_by = request.user
        instance.deletion_reason = deletion_reason
        instance.save(update_fields=[
            'is_active', 'deleted_at', 'deleted_by', 'deletion_reason', 'updated_at',
        ])

        # ── Takvimden kaldır ──
        self._remove_from_calendar(instance)

        return Response({
            'success': True,
            'message': 'Ödev başarıyla silindi.'
        })

    def _sync_to_calendar(self, assignment, user_id):
        """Ödevi takvime senkronize et"""
        try:
            kurum_id = self._get_kurum_id()
            if kurum_id and assignment.due_date:
                from apps.takvim.application.integration_service import CalendarIntegrationService
                CalendarIntegrationService().sync_assignment(kurum_id, assignment, user_id)
        except Exception as e:
            import logging
            logging.getLogger('takvim.integration').error(f'Ödev takvim sync hatası: {e}')

    @staticmethod
    def _notify_assignment_whatsapp(assignment, user_id):
        try:
            from apps.communication.application.integration_hooks import notify_assignment
            kurum_id = assignment.student.kurum_id
            notify_assignment(kurum_id, assignment.id, sent_by_user_id=user_id)
        except Exception as e:
            import logging
            logging.getLogger('communication.integration').error(
                f'Ödev WhatsApp bildirim hatası: {e}'
            )

    def _remove_from_calendar(self, assignment):
        """Ödevi takvimden kaldır"""
        try:
            kurum_id = self._get_kurum_id()
            if kurum_id:
                from apps.takvim.application.integration_service import CalendarIntegrationService, KaynakModul
                CalendarIntegrationService().remove_event(kurum_id, KaynakModul.ODEV, str(assignment.id))
        except Exception as e:
            import logging
            logging.getLogger('takvim.integration').error(f'Ödev takvim remove hatası: {e}')

    def _get_kurum_id(self):
        """Seçili kurum ID (header, middleware, session veya varsayılan)."""
        return get_secili_kurum_id(self.request)

    def get_permissions(self):
        if self.action in ('report', 'retrieve'):
            print_token = (
                self.request.headers.get('X-Print-Token')
                or self.request.query_params.get('print_token')
            )
            if print_token:
                return [AllowAny()]
        return super().get_permissions()

    def _get_assignment_for_print_token(self, pk, *, expected_type: str | None = None):
        """Normal oturum veya print token ile ödev kaydı."""
        print_token = (
            self.request.headers.get('X-Print-Token')
            or self.request.query_params.get('print_token')
        )
        if print_token:
            from .print_token import validate_print_token

            payload = validate_print_token(print_token)
            if not payload or int(payload['assignment_id']) != int(pk):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Geçersiz print token.')
            if expected_type and payload.get('notify_type') != expected_type:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Print token türü uyuşmuyor.')
            assignment = ManualAssignment.objects.filter(
                id=pk,
                is_active=True,
                student__kurum_id=payload['kurum_id'],
            ).select_related('coach', 'student').prefetch_related(
                Prefetch(
                    'lessons',
                    queryset=AssignmentLesson.objects.select_related(
                        'lesson', 'resource_book'
                    ).prefetch_related('tasks'),
                )
            ).first()
            if not assignment:
                from rest_framework.exceptions import NotFound
                raise NotFound('Ödev bulunamadı.')
            return assignment
        return self.get_object()

    def _get_assignment_for_report(self, pk):
        return self._get_assignment_for_print_token(pk, expected_type='report')

    def retrieve(self, request, *args, **kwargs):
        print_token = (
            request.headers.get('X-Print-Token')
            or request.query_params.get('print_token')
        )
        if print_token:
            instance = self._get_assignment_for_print_token(kwargs['pk'], expected_type='plan')
            serializer = self.get_serializer(instance)
            return Response({'success': True, 'data': serializer.data})
        return super().retrieve(request, *args, **kwargs)
    
    @action(detail=False, methods=['get'])
    def student_assignments(self, request):
        """
        Öğrenciye ait tüm ödevler
        GET /api/coaching/manual-assignments/student_assignments/?student_id={id}
        """
        from apps.student_resources.services.overdue_status import (
            refresh_manual_assignment_overdue,
        )

        refresh_manual_assignment_overdue()

        student_id = request.query_params.get('student_id')
        if not student_id:
            return Response({
                'success': False,
                'error': 'student_id parametresi gerekli'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        assignments = self.get_queryset().filter(student_id=student_id)
        serializer = ManualAssignmentListSerializer(assignments, many=True)
        
        # İstatistikler
        stats = {
            'total': assignments.count(),
            'draft': assignments.filter(status=ManualAssignment.Status.DRAFT).count(),
            'assigned': assignments.filter(status=ManualAssignment.Status.ASSIGNED).count(),
            'in_progress': assignments.filter(status=ManualAssignment.Status.IN_PROGRESS).count(),
            'completed': assignments.filter(status=ManualAssignment.Status.COMPLETED).count(),
            'overdue': assignments.filter(status=ManualAssignment.Status.OVERDUE).count(),
            'at_risk': assignments.filter(risk_status=ManualAssignment.RiskStatus.AT_RISK).count(),
        }
        
        return Response({
            'success': True,
            'data': serializer.data,
            'stats': stats
        })
    
    @action(detail=False, methods=['get'])
    def coach_assignments(self, request):
        """
        Koça ait tüm ödevler
        GET /api/coaching/manual-assignments/coach_assignments/
        """
        from apps.student_resources.services.overdue_status import (
            refresh_manual_assignment_overdue,
        )

        refresh_manual_assignment_overdue()

        coach = request.user
        assignments = self.get_queryset().filter(coach=coach)
        serializer = ManualAssignmentListSerializer(assignments, many=True)
        
        return Response({
            'success': True,
            'data': serializer.data,
            'count': assignments.count()
        })

    @action(detail=False, methods=['get'])
    def kontrol_badge(self, request):
        """
        Sidebar Ödev Kontrol badge sayıları (geciken + bekleyen kontrol).
        GET /api/coaching/manual-assignments/assignments/kontrol_badge/
        """
        from apps.student_resources.services.overdue_status import (
            refresh_manual_assignment_overdue,
        )

        refresh_manual_assignment_overdue()

        queryset = self.get_queryset().filter(status__in=KONTROL_BADGE_STATUSES)
        overdue = queryset.filter(status=ManualAssignment.Status.OVERDUE).count()
        pending = queryset.filter(
            status__in=(
                ManualAssignment.Status.ASSIGNED,
                ManualAssignment.Status.IN_PROGRESS,
            )
        ).count()

        return Response({
            'success': True,
            'data': {
                'count': queryset.count(),
                'overdue': overdue,
                'pending': pending,
            },
        })

    @action(detail=False, methods=['get'])
    def deleted_assignments(self, request):
        """
        Silinmiş ödev arşivi (yalnızca admin).
        GET /api/coaching/manual-assignments/assignments/deleted_assignments/
        """
        if not is_resource_admin(request.user):
            return Response({
                'success': False,
                'error': 'Bu listeye erişim yetkiniz yok.',
            }, status=status.HTTP_403_FORBIDDEN)

        queryset = ManualAssignment.objects.filter(
            is_active=False,
        ).select_related(
            'student', 'coach', 'deleted_by',
        ).order_by('-deleted_at')

        queryset = filter_manual_assignments(queryset, request.user)
        serializer = ManualAssignmentDeletedSerializer(queryset, many=True)

        return Response({
            'success': True,
            'data': serializer.data,
            'count': queryset.count(),
        })
    
    @action(detail=False, methods=['get'])
    def content_task_history(self, request):
        """
        Öğrencinin daha önce verilen görevlerin content bazlı geçmişi.
        GET /api/coaching/manual-assignments/assignments/content_task_history/?student_id={id}
        
        Döndürür: content_id → {completion_status, task_completion_percent, completed_question_count, assignment_title, ...}
        Aynı content birden fazla ödevde varsa EN SON (en güncel) durumu döner.
        Eski ödev raporları ETKİLENMEZ — sadece frontend bilgi amaçlı kullanır.
        """
        student_id = request.query_params.get('student_id')
        if not student_id:
            return Response({
                'success': False,
                'error': 'student_id parametresi gerekli'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Bu öğrencinin aktif, DRAFT olmayan ödevlerindeki tüm görevleri çek
        tasks = AssignmentTask.objects.filter(
            lesson_block__assignment__student_id=student_id,
            lesson_block__assignment__is_active=True,
            content__isnull=False,  # Sadece content bağlı görevler
        ).exclude(
            lesson_block__assignment__status=ManualAssignment.Status.DRAFT
        ).select_related(
            'lesson_block__assignment',
            'content'
        ).order_by('lesson_block__assignment__created_at')  # Eskiden yeniye
        
        # content_id bazlı grupla — aynı content birden fazla ödevde varsa
        # Sadece DEĞERLENDİRİLMİŞ görevleri dikkate al (PENDING olanlarda henüz değerlendirme yok)
        # En son değerlendirilen durumu al
        history = {}
        for task in tasks:
            cid = task.content_id
            assignment = task.lesson_block.assignment
            
            # PENDING = henüz değerlendirilmemiş, bunu atla (eğer daha önce değerlendirilmiş varsa)
            if task.completion_status == 'PENDING':
                # Eğer bu content için daha önce bir kayıt yoksa yine de ekle (ama PENDING olarak)
                if cid not in history:
                    history[cid] = {
                        'content_id': cid,
                        'completion_status': task.completion_status,
                        'task_completion_percent': task.task_completion_percent,
                        'completed_question_count': task.completed_question_count or 0,
                        'question_count': task.question_count or 0,
                        'assignment_id': assignment.id,
                        'assignment_title': assignment.title,
                        'assignment_status': assignment.status,
                        'evaluated_at': task.evaluated_at.isoformat() if task.evaluated_at else None,
                    }
                continue
            
            # Değerlendirilmiş görev — her zaman güncelle (eskiden yeniye sıralı olduğu için en son kalır)
            history[cid] = {
                'content_id': cid,
                'completion_status': task.completion_status,
                'task_completion_percent': task.task_completion_percent,
                'completed_question_count': task.completed_question_count or 0,
                'question_count': task.question_count or 0,
                'assignment_id': assignment.id,
                'assignment_title': assignment.title,
                'assignment_status': assignment.status,
                'evaluated_at': task.evaluated_at.isoformat() if task.evaluated_at else None,
            }
        
        return Response({
            'success': True,
            'data': history,
            'count': len(history)
        })

    @action(detail=False, methods=['post'])
    def student_resources(self, request):
        """
        Öğrenci Kaynak Havuzu Filtreleme
        POST /api/coaching/manual-assignments/student_resources/
        
        Body: {
            "student_id": 1,
            "lesson_id": 2  (optional),
            "resource_type": "SORU_BANKASI"  (optional)
        }
        """
        serializer = StudentResourceFilterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        student_id = serializer.validated_data['student_id']
        lesson_id = serializer.validated_data.get('lesson_id')
        resource_type = serializer.validated_data.get('resource_type')
        publisher = serializer.validated_data.get('publisher')

        if not user_can_access_student(request.user, student_id):
            return Response({
                'success': False,
                'error': 'Bu öğrenciye erişim yetkiniz yok.'
            }, status=status.HTTP_403_FORBIDDEN)

        # Öğrencinin kaynak havuzundan kaynakları getir
        from apps.student_resources.models import StudentResourceAssignment
        from apps.resources.models import ResourceBook
        from apps.resources.scoping import filter_books_for_request

        # Öğrenciye atanmış kaynaklar
        assigned_resources = StudentResourceAssignment.objects.filter(
            student_id=student_id,
            is_active=True
        ).values_list('resource_book_id', flat=True)

        resources = filter_books_for_request(
            ResourceBook.objects.filter(
                id__in=assigned_resources,
                aktif_mi=True
            ).select_related('ders', 'book_type', 'sinif_seviyesi'),
            request,
        )

        if lesson_id:
            resources = resources.filter(ders_id=lesson_id)

        from apps.student_resources.filters import filter_resource_books_by_type_publisher
        resources = filter_resource_books_by_type_publisher(
            resources,
            resource_type=resource_type,
            publisher=publisher,
        )

        resources_data = [serialize_pool_resource_book(resource) for resource in resources]

        return Response({
            'success': True,
            'data': resources_data,
            'count': len(resources_data)
        })
    
    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        """
        Taslak ödevi öğrenciye ata
        POST /api/coaching/manual-assignments/{id}/assign/
        """
        assignment = self.get_object()
        
        if assignment.status != ManualAssignment.Status.DRAFT:
            return Response({
                'success': False,
                'error': 'Sadece taslak ödevler atanabilir'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Durumu güncelle
        assignment.status = ManualAssignment.Status.ASSIGNED
        assignment.risk_status = ManualAssignment.RiskStatus.PENDING_START
        assignment.assigned_date = timezone.now()
        assignment.save()
        
        # ── Takvim Entegrasyonu — Atanan ödev takvime eklenir ──
        self._sync_to_calendar(assignment, request.user.id)
        
        return Response({
            'success': True,
            'data': ManualAssignmentDetailSerializer(assignment).data,
            'message': 'Ödev başarıyla atandı'
        })
    
    @action(detail=True, methods=['post'])
    def update_risk_status(self, request, pk=None):
        """
        Risk durumu güncelle
        POST /api/coaching/manual-assignments/{id}/update_risk_status/
        Body: {"risk_status": "AT_RISK"}
        """
        assignment = self.get_object()
        locked = control_lock_response(assignment)
        if locked:
            return locked
        risk_status = request.data.get('risk_status')
        
        if not risk_status or risk_status not in dict(ManualAssignment.RiskStatus.choices):
            return Response({
                'success': False,
                'error': 'Geçersiz risk durumu'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        assignment.risk_status = risk_status
        assignment.save()
        
        return Response({
            'success': True,
            'data': ManualAssignmentDetailSerializer(assignment).data,
            'message': 'Risk durumu güncellendi'
        })
    
    @action(detail=True, methods=['post'])
    def postpone(self, request, pk=None):
        """
        \u00d6devi ertele
        POST /api/coaching/manual-assignments/{id}/postpone/
        Body: {"new_due_date": "2026-03-01T23:59:00Z", "reason": "..."}
        """
        assignment = self.get_object()
        locked = control_lock_response(assignment)
        if locked:
            return locked
        new_due_date = request.data.get('new_due_date')
        reason = request.data.get('reason', '')
        
        if not new_due_date:
            return Response({
                'success': False,
                'error': 'Yeni teslim tarihi gerekli'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Geçmiş tarih kontrolü
        from datetime import datetime
        try:
            parsed_date = datetime.fromisoformat(new_due_date.replace('Z', '+00:00'))
            if parsed_date.date() <= timezone.now().date():
                return Response({
                    'success': False,
                    'error': 'Yeni teslim tarihi bugünden sonra olmalıdır'
                }, status=status.HTTP_400_BAD_REQUEST)
        except (ValueError, AttributeError):
            return Response({
                'success': False,
                'error': 'Geçersiz tarih formatı'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if assignment.postpone_count >= assignment.max_postpone:
            return Response({
                'success': False,
                'error': f'Bu \u00f6dev en fazla {assignment.max_postpone} kez ertelenebilir'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Orijinal tarihi kaydet (ilk ertelemede)
        if not assignment.original_due_date:
            assignment.original_due_date = assignment.due_date
        
        assignment.due_date = new_due_date
        assignment.postpone_count += 1
        assignment.postpone_reason = reason
        
        # E\u011fer s\u00fcresi ge\u00e7mi\u015fse durumu g\u00fcncelle
        if assignment.status == ManualAssignment.Status.OVERDUE:
            assignment.status = ManualAssignment.Status.ASSIGNED
        
        assignment.save()
        
        return Response({
            'success': True,
            'data': ManualAssignmentDetailSerializer(assignment).data,
            'message': f'Ödev ertelendi ({assignment.postpone_count}/{assignment.max_postpone})'
        })
    
    @action(detail=True, methods=['post'])
    def update_late_note(self, request, pk=None):
        """
        Geç teslim notu ekle/güncelle
        POST /api/coaching/manual-assignments/{id}/update_late_note/
        Body: {"late_submission_note": "Hastalık nedeniyle..."}
        """
        assignment = self.get_object()
        locked = control_lock_response(assignment)
        if locked:
            return locked
        note = request.data.get('late_submission_note', '')
        assignment.late_submission_note = note
        assignment.save(update_fields=['late_submission_note', 'updated_at'])
        
        return Response({
            'success': True,
            'data': ManualAssignmentDetailSerializer(assignment).data,
            'message': 'Geç teslim notu güncellendi'
        })
    
    @action(detail=True, methods=['post'])
    def mark_all_not_done(self, request, pk=None):
        """
        Tüm görevleri Yapmadı olarak işaretle (öğrenci gelmedi / ödev getirilmedi)
        POST /api/coaching/manual-assignments/{id}/mark_all_not_done/
        Body: {"reason": "NOT_BROUGHT", "note": "..."}
        """
        assignment = self.get_object()
        locked = control_lock_response(assignment)
        if locked:
            return locked
        reason = request.data.get('reason', 'OTHER')
        if not reason:
            reason = 'OTHER'
        if reason not in VALID_NON_SUBMISSION_REASONS:
            return Response({
                'success': False,
                'error': (
                    'Geçersiz ödev getirilmeme sebebi. '
                    f'Geçerli değerler: {", ".join(sorted(VALID_NON_SUBMISSION_REASONS))}'
                ),
            }, status=status.HTTP_400_BAD_REQUEST)

        note = request.data.get('note', '')
        
        # Tüm görevleri NOT_DONE yap
        tasks = AssignmentTask.objects.filter(lesson_block__assignment=assignment)
        updated = tasks.update(
            completion_status='NOT_DONE',
            task_completion_percent=0,
            completed_question_count=0,
            completed_page_count=0,
            status=AssignmentTask.TaskStatus.NOT_DONE,
            completed_at=None,
            evaluated_at=timezone.now(),
        )
        
        # Assignment'a sebep ve notu kaydet
        assignment.non_submission_reason = reason
        assignment.non_submission_note = note
        assignment.completion_percent = 0
        assignment.status = ManualAssignment.Status.COMPLETED
        assignment.completed_date = timezone.now()
        assignment.save(update_fields=[
            'non_submission_reason', 'non_submission_note',
            'completion_percent', 'status', 'completed_date', 'updated_at'
        ])
        
        return Response({
            'success': True,
            'data': ManualAssignmentDetailSerializer(assignment).data,
            'message': f'Tüm görevler ({updated} adet) Yapmadı olarak işaretlendi'
        })

    @action(detail=True, methods=['post'])
    def reset_all_tasks(self, request, pk=None):
        """
        Tüm değerlendirilmiş görevleri sıfırla.
        POST /api/coaching/manual-assignments/assignments/{id}/reset_all_tasks/
        """
        assignment = self.get_object()
        locked = control_lock_response(assignment)
        if locked:
            return locked

        tasks = AssignmentTask.objects.filter(
            lesson_block__assignment=assignment,
        ).exclude(completion_status='PENDING')

        reset_count = 0
        with transaction.atomic():
            for task in tasks:
                reset_task_evaluation(task)
                reset_count += 1

            update_fields = []
            if assignment.non_submission_reason:
                assignment.non_submission_reason = ''
                update_fields.append('non_submission_reason')
            if assignment.non_submission_note:
                assignment.non_submission_note = ''
                update_fields.append('non_submission_note')
            if update_fields:
                update_fields.append('updated_at')
                assignment.save(update_fields=update_fields)

            update_assignment_completion_from_tasks(assignment)

        return Response({
            'success': True,
            'data': ManualAssignmentDetailSerializer(assignment).data,
            'reset_count': reset_count,
            'message': f'{reset_count} görev sıfırlandı.',
        })
    
    @action(detail=True, methods=['get'])
    def report(self, request, pk=None):
        """
        Ödev sonuç raporu verileri (zenginleştirilmiş)
        GET /api/coaching/manual-assignments/{id}/report/
        
        İçerir:
        - Ödev detay verisi + report_summary
        - overall_stats: Öğrencinin TÜM ödev istatistikleri
        - topic_cumulative: Aynı konudan tüm ödevlerdeki kümülatif soru/sayfa
        - lesson_cumulative: Ders bazlı kümülatif istatistik
        - recent_trend: Son 8 ödevin tamamlanma trendi
        """
        from collections import defaultdict
        from django.db.models import Sum, Avg, F

        from .completion_utils import (
            build_assignment_outcome_stats,
            compute_weighted_completion_percent,
        )

        assignment = self._get_assignment_for_report(pk)
        update_assignment_completion_from_tasks(assignment)
        assignment.refresh_from_db()
        detail_data = ManualAssignmentDetailSerializer(assignment).data
        
        # ═══ 1) Öğrencinin TÜM ödevlerinden genel istatistik ═══
        all_assignments = ManualAssignment.objects.filter(
            student=assignment.student,
            is_active=True
        ).exclude(status='DRAFT')
        
        all_tasks = AssignmentTask.objects.filter(
            lesson_block__assignment__in=all_assignments
        ).select_related('lesson_block')

        tasks_by_assignment = defaultdict(list)
        for task in all_tasks:
            tasks_by_assignment[task.lesson_block.assignment_id].append(task)

        all_assignments_list = list(all_assignments)
        total_assignments = len(all_assignments_list)
        completed_assignments = sum(
            1 for a in all_assignments_list if a.status == 'COMPLETED'
        )
        total_tasks_all = all_tasks.count()
        done_tasks_all = all_tasks.filter(completion_status='DONE').count()
        partial_tasks_all = all_tasks.filter(completion_status='PARTIAL').count()
        not_done_tasks_all = all_tasks.filter(completion_status='NOT_DONE').count()
        pending_tasks_all = all_tasks.filter(completion_status='PENDING').count()

        total_questions_all = sum(t.question_count or 0 for t in all_tasks)
        completed_questions_all = sum(t.completed_question_count or 0 for t in all_tasks)
        total_pages_all = sum(t.page_count or 0 for t in all_tasks)
        completed_pages_all = sum(t.completed_page_count or 0 for t in all_tasks)

        avg_completion = compute_weighted_completion_percent(all_tasks)

        outcome_stats = build_assignment_outcome_stats(
            all_assignments_list, tasks_by_assignment
        )

        overall_stats = {
            'total_assignments': total_assignments,
            'completed_assignments': completed_assignments,
            'in_progress_assignments': sum(
                1 for a in all_assignments_list if a.status == 'IN_PROGRESS'
            ),
            'overdue_assignments': sum(
                1 for a in all_assignments_list if a.status == 'OVERDUE'
            ),
            **outcome_stats,
            'total_tasks_all': total_tasks_all,
            'done_tasks_all': done_tasks_all,
            'partial_tasks_all': partial_tasks_all,
            'not_done_tasks_all': not_done_tasks_all,
            'pending_tasks_all': pending_tasks_all,
            'total_questions_all': total_questions_all,
            'completed_questions_all': completed_questions_all,
            'total_pages_all': total_pages_all,
            'completed_pages_all': completed_pages_all,
            'overall_completion_percent': avg_completion,
            'assignment_completion_percent': round(
                (completed_assignments / total_assignments * 100)
                if total_assignments > 0 else 0
            ),
            'question_completion_percent_all': round(
                (completed_questions_all / total_questions_all * 100)
                if total_questions_all > 0 else 0
            ),
        }
        
        # ═══ 2) Konu bazlı kümülatif istatistik ═══
        # Bu ödevdeki her konu için, o konudan o güne kadar toplam ne kadar çözülmüş
        current_lessons = AssignmentLesson.objects.filter(assignment=assignment)
        topic_cumulative = []
        
        for lesson in current_lessons:
            # Bu konuyla aynı topic_name'e sahip tüm ödevlerdeki görevleri bul
            topic = lesson.topic_name
            ders_id = lesson.lesson_id
            
            if not topic and not ders_id:
                continue
            
            # Aynı ders + konu kombinasyonundaki TÜM görevler (tüm ödevlerden)
            filter_q = Q(
                lesson_block__assignment__student=assignment.student,
                lesson_block__assignment__is_active=True,
            )
            # Konu ve/veya ders filtresi
            if topic:
                filter_q &= Q(lesson_block__topic_name=topic)
            if ders_id:
                filter_q &= Q(lesson_block__lesson_id=ders_id)
            
            cumulative_tasks = AssignmentTask.objects.filter(filter_q)
            
            cum_total_q = sum(t.question_count or 0 for t in cumulative_tasks)
            cum_done_q = sum(t.completed_question_count or 0 for t in cumulative_tasks)
            cum_total_p = sum(t.page_count or 0 for t in cumulative_tasks)
            cum_done_p = sum(t.completed_page_count or 0 for t in cumulative_tasks)
            cum_task_count = cumulative_tasks.count()
            cum_done_task_count = cumulative_tasks.filter(completion_status='DONE').count()
            cum_assignment_count = cumulative_tasks.values('lesson_block__assignment').distinct().count()
            
            # Bu ödevdeki konu istatistikleri
            current_tasks = lesson.tasks.all()
            cur_total_q = sum(t.question_count or 0 for t in current_tasks)
            cur_done_q = sum(t.completed_question_count or 0 for t in current_tasks)
            cur_total_p = sum(t.page_count or 0 for t in current_tasks)
            cur_done_p = sum(t.completed_page_count or 0 for t in current_tasks)
            
            topic_cumulative.append({
                'lesson_id': lesson.id,
                'lesson_name': lesson.lesson.ad if lesson.lesson else '',
                'topic_name': topic or '',
                'resource_book_name': lesson.resource_book.ad if lesson.resource_book else '',
                # Bu ödevdeki
                'current_total_questions': cur_total_q,
                'current_completed_questions': cur_done_q,
                'current_total_pages': cur_total_p,
                'current_completed_pages': cur_done_p,
                # Kümülatif (tüm ödevlerden)
                'cumulative_total_questions': cum_total_q,
                'cumulative_completed_questions': cum_done_q,
                'cumulative_total_pages': cum_total_p,
                'cumulative_completed_pages': cum_done_p,
                'cumulative_task_count': cum_task_count,
                'cumulative_done_task_count': cum_done_task_count,
                'cumulative_assignment_count': cum_assignment_count,
                'cumulative_completion_percent': round(
                    (cum_done_q / cum_total_q * 100) if cum_total_q > 0 else
                    (cum_done_p / cum_total_p * 100) if cum_total_p > 0 else
                    (cum_done_task_count / cum_task_count * 100) if cum_task_count > 0 else 0
                ),
            })
        
        # ═══ 3) Ders bazlı kümülatif istatistik (toplam) ═══
        lesson_cumulative = {}
        for tc in topic_cumulative:
            lname = tc['lesson_name']
            if lname not in lesson_cumulative:
                lesson_cumulative[lname] = {
                    'lesson_name': lname,
                    'total_questions': 0,
                    'completed_questions': 0,
                    'total_pages': 0,
                    'completed_pages': 0,
                    'total_topics': 0,
                }
            lesson_cumulative[lname]['total_questions'] += tc['cumulative_total_questions']
            lesson_cumulative[lname]['completed_questions'] += tc['cumulative_completed_questions']
            lesson_cumulative[lname]['total_pages'] += tc['cumulative_total_pages']
            lesson_cumulative[lname]['completed_pages'] += tc['cumulative_completed_pages']
            lesson_cumulative[lname]['total_topics'] += 1
        
        for v in lesson_cumulative.values():
            v['question_completion_percent'] = round(
                (v['completed_questions'] / v['total_questions'] * 100) if v['total_questions'] > 0 else 0
            )
        
        # ═══ 4) Son 8 ödevin tamamlanma trendi ═══
        recent_assignments = all_assignments.exclude(
            status='DRAFT'
        ).order_by('-created_at')[:8]
        
        recent_trend = []
        for ra in reversed(list(recent_assignments)):
            ra_tasks = AssignmentTask.objects.filter(lesson_block__assignment=ra)
            ra_total = ra_tasks.count()
            ra_done = ra_tasks.filter(completion_status='DONE').count()
            ra_total_q = sum(t.question_count or 0 for t in ra_tasks)
            ra_done_q = sum(t.completed_question_count or 0 for t in ra_tasks)
            
            recent_trend.append({
                'id': ra.id,
                'title': ra.title,
                'assigned_date': ra.assigned_date.isoformat() if ra.assigned_date else None,
                'due_date': ra.due_date.isoformat() if ra.due_date else None,
                'status': ra.status,
                'completion_percent': ra.completion_percent,
                'total_tasks': ra_total,
                'done_tasks': ra_done,
                'total_questions': ra_total_q,
                'completed_questions': ra_done_q,
                'is_current': ra.id == assignment.id,
            })
        
        return Response({
            'success': True,
            'data': detail_data,
            'overall_stats': overall_stats,
            'topic_cumulative': topic_cumulative,
            'lesson_cumulative': list(lesson_cumulative.values()),
            'recent_trend': recent_trend,
        })

    @action(detail=True, methods=['get'], url_path='notify-preview')
    def notify_preview(self, request, pk=None):
        """Ödev planı / rapor gönderim önizlemesi."""
        notify_type = (request.query_params.get('type') or 'plan').strip().lower()
        if notify_type not in ('plan', 'report'):
            return Response({'success': False, 'error': 'type plan veya report olmalı.'}, status=400)

        kurum_id = self._get_kurum_id()
        if not kurum_id:
            return Response({'success': False, 'error': 'Kurum seçilmedi.'}, status=400)

        try:
            from .notification_service import AssignmentNotificationService

            preview = AssignmentNotificationService().preview(kurum_id, int(pk), notify_type)
        except ValueError as exc:
            return Response({'success': False, 'error': str(exc)}, status=400)

        return Response({
            'success': True,
            'data': {
                'notify_type': preview.notify_type,
                'assignment_id': preview.assignment_id,
                'assignment_title': preview.assignment_title,
                'student_name': preview.student_name,
                'pdf_title': preview.pdf_title,
                'recipients': [
                    {
                        'recipient_type': r.recipient_type,
                        'ogrenci_id': r.ogrenci_id,
                        'veli_id': r.veli_id,
                        'display_name': r.display_name,
                        'telefon': r.telefon,
                        'body': r.body,
                        'skip_reason': r.skip_reason,
                        'send_count': r.send_count,
                        'last_sent_at': r.last_sent_at,
                        'send_history': r.send_history,
                    }
                    for r in preview.recipients
                ],
            },
        })

    @action(detail=True, methods=['get'], url_path='report-pdf')
    def report_pdf(self, request, pk=None):
        """Sunucu tarafı: gerçek React print route → PDF."""
        kurum_id = self._get_kurum_id()
        if not kurum_id:
            return Response({'success': False, 'error': 'Kurum seçilmedi.'}, status=400)

        orientation = (request.query_params.get('orientation') or 'portrait').strip().lower()
        if orientation not in ('portrait', 'landscape'):
            orientation = 'portrait'

        try:
            from .report_pdf_service import render_assignment_report_pdf

            pdf_bytes = render_assignment_report_pdf(
                int(pk),
                kurum_id,
                orientation=orientation,
            )
        except RuntimeError as exc:
            return Response({'success': False, 'error': str(exc)}, status=400)

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = _resolve_assignment_pdf_filename(pk, kurum_id, 'report')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    @action(detail=True, methods=['post'], url_path='render-report-pdf')
    def render_report_pdf(self, request, pk=None):
        """Ekran HTML'inden vektörel PDF üretir."""
        report_html = request.data.get('report_html')
        if not isinstance(report_html, str) or not report_html.strip():
            return Response({'success': False, 'error': 'report_html gerekli.'}, status=400)
        try:
            from apps.communication.application.html_to_pdf import render_html_to_pdf

            pdf_bytes = render_html_to_pdf(report_html.strip())
        except RuntimeError as exc:
            return Response({'success': False, 'error': str(exc)}, status=400)

        notify_type = (request.data.get('notify_type') or 'report').strip().lower()
        filename = _resolve_assignment_pdf_filename(pk, self._get_kurum_id(), notify_type)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    @action(
        detail=True,
        methods=['post'],
        url_path='notify-send',
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def notify_send(self, request, pk=None):
        """Seçili veli / öğrenciye ödev planı veya rapor PDF gönder."""
        data = request.data
        notify_type = (data.get('notify_type') or data.get('type') or 'plan').strip().lower()
        if notify_type not in ('plan', 'report'):
            return Response({'success': False, 'error': 'notify_type plan veya report olmalı.'}, status=400)

        kurum_id = self._get_kurum_id()
        if not kurum_id:
            return Response({'success': False, 'error': 'Kurum seçilmedi.'}, status=400)

        veli_ids_raw = data.get('veli_ids') or '[]'
        if isinstance(veli_ids_raw, str):
            try:
                veli_ids = json.loads(veli_ids_raw)
            except json.JSONDecodeError:
                veli_ids = []
        elif isinstance(veli_ids_raw, list):
            veli_ids = veli_ids_raw
        else:
            veli_ids = []

        include_student = data.get('include_student') in (True, 'true', '1', 1)
        pdf_bytes = None
        pdf_filename = None
        orientation = (data.get('orientation') or 'portrait').strip().lower()
        if orientation not in ('portrait', 'landscape'):
            orientation = 'portrait'

        uploaded = request.FILES.get('pdf')
        if uploaded:
            pdf_bytes = uploaded.read()
            if len(pdf_bytes) < 2500 or not pdf_bytes.startswith(b'%PDF'):
                return Response(
                    {'success': False, 'error': 'Geçersiz veya boş PDF dosyası.'},
                    status=400,
                )
            pdf_filename = uploaded.name or _resolve_assignment_pdf_filename(pk, kurum_id, notify_type)
        elif notify_type == 'report':
            try:
                from .report_pdf_service import render_assignment_report_pdf

                pdf_bytes = render_assignment_report_pdf(
                    int(pk),
                    kurum_id,
                    orientation=orientation,
                )
                pdf_filename = _resolve_assignment_pdf_filename(pk, kurum_id, 'report')
            except RuntimeError as exc:
                return Response({'success': False, 'error': str(exc)}, status=400)
            except Exception as exc:
                import logging
                logging.getLogger(__name__).exception(
                    'Report PDF generation failed for assignment %s', pk,
                )
                return Response(
                    {'success': False, 'error': f'PDF oluşturulamadı: {exc}'},
                    status=400,
                )
        elif notify_type == 'plan':
            try:
                from .report_pdf_service import render_assignment_plan_pdf

                pdf_bytes = render_assignment_plan_pdf(
                    int(pk),
                    kurum_id,
                    orientation=orientation,
                )
                pdf_filename = _resolve_assignment_pdf_filename(pk, kurum_id, 'plan')
            except RuntimeError as exc:
                return Response({'success': False, 'error': str(exc)}, status=400)
            except Exception as exc:
                import logging
                logging.getLogger(__name__).exception(
                    'Plan PDF generation failed for assignment %s', pk,
                )
                return Response(
                    {'success': False, 'error': f'PDF oluşturulamadı: {exc}'},
                    status=400,
                )

        try:
            from .notification_service import AssignmentNotificationService

            result = AssignmentNotificationService().send(
                kurum_id,
                int(pk),
                notify_type,
                veli_ids=[int(v) for v in veli_ids if v],
                include_student=include_student,
                sent_by_user_id=request.user.id if request.user.is_authenticated else None,
                force_resend=True,
                pdf_bytes=pdf_bytes,
                pdf_filename=pdf_filename,
                orientation=orientation,
            )
        except ValueError as exc:
            return Response({'success': False, 'error': str(exc)}, status=400)

        if result['sent'] == 0 and result.get('errors'):
            return Response({
                'success': False,
                'error': result['errors'][0],
                'data': result,
            }, status=400)

        if result.get('errors') and result['sent'] > 0:
            return Response({
                'success': True,
                'data': result,
                'warning': result['errors'][0],
            })

        return Response({'success': True, 'data': result})


class AssignmentLessonViewSet(viewsets.ModelViewSet):
    """Ders Bloğu ViewSet"""
    queryset = AssignmentLesson.objects.all()
    serializer_class = AssignmentLessonSerializer
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset().select_related(
            'assignment', 'lesson', 'resource_book'
        ).prefetch_related('tasks')

        queryset = filter_by_assignment_scope(
            queryset,
            self.request.user,
            assignment_prefix='assignment',
        )

        assignment_id = self.request.query_params.get('assignment_id')
        if assignment_id:
            queryset = queryset.filter(assignment_id=assignment_id)

        return queryset.order_by('order')


class AssignmentTaskViewSet(viewsets.ModelViewSet):
    """Görev ViewSet"""
    queryset = AssignmentTask.objects.all()
    serializer_class = AssignmentTaskSerializer
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset().select_related('lesson_block')

        queryset = filter_by_assignment_scope(
            queryset,
            self.request.user,
            assignment_prefix='lesson_block__assignment',
        )

        lesson_id = self.request.query_params.get('lesson_id')
        if lesson_id:
            queryset = queryset.filter(lesson_block_id=lesson_id)
        
        return queryset.order_by('order')
    
    @action(detail=True, methods=['post'])
    def mark_completed(self, request, pk=None):
        """
        Görevi tamamlandı olarak işaretle
        POST /api/coaching/assignment-tasks/{id}/mark_completed/
        """
        task = self.get_object()
        locked = control_lock_response(task.lesson_block.assignment)
        if locked:
            return locked
        actual_duration = (
            request.data['actual_duration_minutes']
            if 'actual_duration_minutes' in request.data
            else None
        )
        self._apply_task_completion_status(
            task,
            'DONE',
            actual_duration_minutes=actual_duration,
        )
        task.save()
        self._update_assignment_completion(task.lesson_block.assignment)

        return Response({
            'success': True,
            'data': AssignmentTaskSerializer(task).data,
            'message': 'G\u00f6rev tamamland\u0131 olarak i\u015faretlendi'
        })
    
    @action(detail=True, methods=['post'])
    def update_task_status(self, request, pk=None):
        """
        G\u00f6rev tamamlanma durumunu g\u00fcncelle (Yapt\u0131/Yapmad\u0131/Eksik)
        POST /api/coaching/manual-assignments/tasks/{id}/update_task_status/
        Body: {
            "completion_status": "DONE" | "NOT_DONE" | "PARTIAL",
            "task_completion_percent": 70,  (PARTIAL i\u00e7in, %10 dilimler)
            "coach_evaluation_note": "iyi \u00e7al\u0131\u015fm\u0131\u015f"
        }
        """
        task = self.get_object()
        locked = control_lock_response(task.lesson_block.assignment)
        if locked:
            return locked
        completion_status = request.data.get('completion_status')
        
        valid_statuses = ['DONE', 'NOT_DONE', 'PARTIAL']
        if not completion_status or completion_status not in valid_statuses:
            return Response({
                'success': False,
                'error': 'Ge\u00e7ersiz tamamlanma durumu. DONE, NOT_DONE veya PARTIAL olmal\u0131.'
            }, status=status.HTTP_400_BAD_REQUEST)

        note = request.data.get('coach_evaluation_note', '')
        self._apply_task_completion_status(
            task,
            completion_status,
            task_completion_percent=request.data.get('task_completion_percent'),
            coach_evaluation_note=note if note else None,
        )
        task.save()
        self._update_assignment_completion(task.lesson_block.assignment)
        
        return Response({
            'success': True,
            'data': AssignmentTaskSerializer(task).data,
            'message': f'G\u00f6rev durumu g\u00fcncellendi: {task.get_completion_status_display()}'
        })

    @action(detail=True, methods=['post'])
    def reset_task_status(self, request, pk=None):
        """
        Görev değerlendirmesini sıfırla (PENDING).
        POST /api/coaching/manual-assignments/tasks/{id}/reset_task_status/
        """
        task = self.get_object()
        locked = control_lock_response(task.lesson_block.assignment)
        if locked:
            return locked

        if task.completion_status == 'PENDING':
            return Response({
                'success': False,
                'error': 'Görev zaten değerlendirilmemiş durumda.',
            }, status=status.HTTP_400_BAD_REQUEST)

        reset_task_evaluation(task)
        update_assignment_completion_from_tasks(task.lesson_block.assignment)

        return Response({
            'success': True,
            'data': AssignmentTaskSerializer(task).data,
            'message': 'Görev değerlendirmesi sıfırlandı.',
        })

    @action(detail=True, methods=['post', 'patch'])
    def evaluation_note(self, request, pk=None):
        """
        Koç değerlendirme notunu güncelle (durum değiştirmeden).
        PATCH/POST /api/coaching/manual-assignments/tasks/{id}/evaluation_note/
        Body: {"coach_evaluation_note": "..."}
        """
        task = self.get_object()
        locked = control_lock_response(task.lesson_block.assignment)
        if locked:
            return locked
        note = request.data.get('coach_evaluation_note', '')
        task.coach_evaluation_note = note
        task.save(update_fields=['coach_evaluation_note', 'updated_at'])

        return Response({
            'success': True,
            'data': AssignmentTaskSerializer(task).data,
            'message': 'Değerlendirme notu kaydedildi.',
        })

    def _apply_task_completion_status(
        self,
        task,
        completion_status,
        *,
        task_completion_percent=None,
        coach_evaluation_note=None,
        actual_duration_minutes=None,
    ):
        """G\u00f6rev tamamlanma alanlar\u0131n\u0131 tek yerden g\u00fcncelle (kaydetmez)."""
        task.completion_status = completion_status
        task.evaluated_at = timezone.now()

        if coach_evaluation_note:
            task.coach_evaluation_note = coach_evaluation_note

        if completion_status == 'DONE':
            task.task_completion_percent = 100
            task.status = AssignmentTask.TaskStatus.COMPLETED
            task.completed_at = timezone.now()
            task.completed_question_count = task.question_count
            task.completed_page_count = task.page_count

        elif completion_status == 'NOT_DONE':
            task.task_completion_percent = 0
            task.status = AssignmentTask.TaskStatus.NOT_DONE
            task.completed_at = None
            task.completed_question_count = 0
            task.completed_page_count = 0

        elif completion_status == 'PARTIAL':
            pct = task_completion_percent if task_completion_percent is not None else 50
            pct = max(10, min(90, round(pct / 10) * 10))
            task.task_completion_percent = pct
            task.status = AssignmentTask.TaskStatus.PARTIAL
            task.completed_at = None

            if task.question_count:
                task.completed_question_count = round(task.question_count * pct / 100)
            else:
                task.completed_question_count = None

            if task.page_count:
                task.completed_page_count = round(task.page_count * pct / 100)
            else:
                task.completed_page_count = None

        if actual_duration_minutes is not None:
            task.actual_duration_minutes = actual_duration_minutes
    
    def _update_assignment_completion(self, assignment):
        """Ödevin toplam tamamlanma yüzdesini güncelle."""
        update_assignment_completion_from_tasks(assignment)


class AssignmentPackageViewSet(viewsets.ModelViewSet):
    """
    Ödev Paketi ViewSet

    list: GET /api/coaching/manual-assignments/packages/
    retrieve: GET /api/coaching/manual-assignments/packages/{id}/
    create: POST /api/coaching/manual-assignments/packages/
    update: PUT /api/coaching/manual-assignments/packages/{id}/
    partial_update: PATCH /api/coaching/manual-assignments/packages/{id}/
    delete: DELETE /api/coaching/manual-assignments/packages/{id}/

    Custom Actions:
    - duplicate: Paketi kopyala
    - increment_usage: Kullanım sayısını artır
    """

    queryset = AssignmentPackage.objects.all()
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return AssignmentPackageListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return AssignmentPackageWriteSerializer
        return AssignmentPackageDetailSerializer

    def get_queryset(self):
        queryset = AssignmentPackage.objects.prefetch_related('items').filter(is_active=True)
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return queryset.order_by('-updated_at')
        return queryset.filter(created_by=user).order_by('-updated_at')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        package = serializer.save()
        return Response({
            'success': True,
            'data': AssignmentPackageDetailSerializer(package).data,
            'message': 'Ödev paketi başarıyla oluşturuldu.',
        }, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        package = serializer.save()
        return Response({
            'success': True,
            'data': AssignmentPackageDetailSerializer(package).data,
            'message': 'Ödev paketi başarıyla güncellendi.',
        })

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        return Response({
            'success': True,
            'message': 'Ödev paketi başarıyla silindi.',
        })

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Paketi ve kalemlerini kopyala."""
        source = self.get_object()
        with transaction.atomic():
            new_package = AssignmentPackage.objects.create(
                name=f'{source.name} (Kopya)',
                description=source.description,
                ders_ad=source.ders_ad,
                sinif_seviyesi=source.sinif_seviyesi,
                usage_count=0,
                is_active=True,
                created_by=request.user,
            )
            for item in source.items.all():
                AssignmentPackageItem.objects.create(
                    package=new_package,
                    book_id=item.book_id,
                    book_name=item.book_name,
                    content_id=item.content_id,
                    content_name=item.content_name,
                    content_type=item.content_type,
                    topic_name=item.topic_name,
                    unit_name=item.unit_name,
                    question_count=item.question_count,
                    page_start=item.page_start,
                    page_end=item.page_end,
                    order=item.order,
                )
        return Response({
            'success': True,
            'data': AssignmentPackageDetailSerializer(new_package).data,
            'message': 'Ödev paketi başarıyla kopyalandı.',
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def increment_usage(self, request, pk=None):
        """Paket kullanım sayısını bir artır."""
        package = self.get_object()
        AssignmentPackage.objects.filter(pk=package.pk).update(usage_count=F('usage_count') + 1)
        package.refresh_from_db()
        return Response({
            'success': True,
            'data': AssignmentPackageDetailSerializer(package).data,
            'message': 'Kullanım sayısı güncellendi.',
        })
