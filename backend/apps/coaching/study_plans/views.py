from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.coaching.services.coach_access import filter_by_student_scope, user_can_access_student
from apps.coaching.interfaces.sube_context import (
    assert_coaching_student_sube_access,
    filter_queryset_by_student_sube,
    mandatory_coaching_context,
)
from apps.ogrenci.domain.models import Ogrenci
from shared.context import get_secili_kurum_id

from .engine import (
    StudyPlanError,
    build_draft,
    locked_day_plans,
    monday_of,
    persist_draft,
    preview_payload,
    remaining_units_after_lock,
    week_end_of,
)
from .models import StudyProgram, StudyTemplate
from .serializers import (
    GenerateRequestSerializer,
    StudyLeftoverSerializer,
    StudyProgramDetailSerializer,
    StudyProgramListSerializer,
    StudyTemplateSerializer,
)
from .services import build_summary, ensure_builtin_templates


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return


def _student_or_error(request, student_id):
    student = get_object_or_404(Ogrenci, pk=student_id)
    gate = assert_coaching_student_sube_access(request, student.kurum_id, student.sube_id)
    if gate:
        return None, gate
    if not user_can_access_student(request.user, student.id):
        return None, Response(
            {'error': 'Bu öğrenciye erişim yetkiniz yok.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return student, None


class StudyTemplateViewSet(viewsets.ModelViewSet):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StudyTemplateSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        kurum_id = get_secili_kurum_id(self.request)
        qs = StudyTemplate.objects.all()
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        return qs.annotate(usage_count=Count('programs')).order_by('scenario', 'name')

    def list(self, request, *args, **kwargs):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        from apps.kurum.domain.models import Kurum
        kurum = get_object_or_404(Kurum, pk=ctx['kurum_id'])
        ensure_builtin_templates(kurum, created_by=request.user)
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        from apps.kurum.domain.models import Kurum
        kurum = get_object_or_404(Kurum, pk=ctx['kurum_id'])
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(kurum=kurum, created_by=request.user, is_builtin=False)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='preview')
    def preview(self, request, pk=None):
        template = self.get_object()
        student_id = request.data.get('student_id')
        week_start = request.data.get('week_start')
        if not student_id or not week_start:
            return Response(
                {'error': 'student_id ve week_start gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        student, err = _student_or_error(request, student_id)
        if err:
            return err
        ser = GenerateRequestSerializer(data={
            'student_id': student.id,
            'week_start': week_start,
            'template_id': template.id,
            'include_homework': request.data.get('include_homework', True),
            'honor_availability': request.data.get('honor_availability', True),
        })
        ser.is_valid(raise_exception=True)
        try:
            draft = build_draft(
                student_id=student.id,
                week_start=ser.validated_data['week_start'],
                template=template,
                include_homework=ser.validated_data['include_homework'],
                honor_availability=ser.validated_data['honor_availability'],
                lock_past=False,
            )
        except StudyPlanError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(preview_payload(draft, template))


class StudyProgramViewSet(viewsets.ReadOnlyModelViewSet):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = StudyProgram.objects.select_related(
            'student', 'coach', 'template',
        ).prefetch_related(
            'days__slots__lesson',
            'days__slots__source_assignment',
            'leftovers',
        )
        ctx = getattr(self, '_coaching_ctx', None)
        if ctx:
            qs = filter_queryset_by_student_sube(qs, ctx['sube_id'])
        qs = filter_by_student_scope(qs, self.request.user, student_field='student_id')
        student_id = self.request.query_params.get('student_id')
        if student_id:
            qs = qs.filter(student_id=student_id)
        week_start = self.request.query_params.get('week_start')
        if week_start:
            qs = qs.filter(week_start=week_start)
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return StudyProgramListSerializer
        return StudyProgramDetailSerializer

    def get_object(self):
        obj = super().get_object()
        gate = assert_coaching_student_sube_access(
            self.request, obj.student.kurum_id, obj.student.sube_id,
        )
        if gate:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(detail=gate.data.get('error', 'Forbidden'))
        if not user_can_access_student(self.request.user, obj.student_id):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(detail='Bu öğrenciye erişim yetkiniz yok.')
        return obj

    def list(self, request, *args, **kwargs):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        self._coaching_ctx = ctx
        student_id = request.query_params.get('student_id')
        if student_id and not user_can_access_student(request.user, student_id):
            return Response(
                {'error': 'Bu öğrenciye erişim yetkiniz yok.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        ser = GenerateRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        student, err = _student_or_error(request, ser.validated_data['student_id'])
        if err:
            return err
        template = get_object_or_404(
            StudyTemplate,
            pk=ser.validated_data['template_id'],
            kurum_id=student.kurum_id,
        )
        week_start = monday_of(ser.validated_data['week_start'])
        existing = StudyProgram.objects.filter(student=student, week_start=week_start).first()
        if existing:
            return Response(
                {
                    'error': 'Bu öğrenci için bu hafta zaten bir program var.',
                    'already_exists': True,
                    'program_id': existing.id,
                    'program': StudyProgramDetailSerializer(existing, context={'request': request}).data,
                },
                status=status.HTTP_409_CONFLICT,
            )
        try:
            draft = build_draft(
                student_id=student.id,
                week_start=week_start,
                template=template,
                include_homework=ser.validated_data['include_homework'],
                honor_availability=ser.validated_data['honor_availability'],
                lock_past=False,
            )
        except StudyPlanError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        program = persist_draft(
            student=student,
            coach=request.user,
            template=template,
            draft=draft,
        )
        program = StudyProgram.objects.prefetch_related(
            'days__slots__lesson',
            'days__slots__source_assignment',
            'leftovers',
        ).select_related('student', 'coach', 'template').get(pk=program.pk)
        return Response(
            StudyProgramDetailSerializer(program, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='regenerate')
    def regenerate(self, request, pk=None):
        program = self.get_object()
        today = timezone.localdate()
        if program.week_end < today:
            return Response(
                {'error': 'Geçmiş hafta salt okunur; yeniden üretilemez.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        template_id = request.data.get('template_id') or program.template_id
        template = get_object_or_404(StudyTemplate, pk=template_id)
        lock_past = request.data.get('lock_past', True)
        honor = request.data.get('honor_availability', True)
        include_homework = request.data.get('include_homework', True)
        locked = locked_day_plans(program, today) if lock_past else []
        try:
            draft = build_draft(
                student_id=program.student_id,
                week_start=program.week_start,
                template=template,
                include_homework=include_homework,
                honor_availability=honor,
                today=today,
                lock_past=lock_past,
                locked_days=locked,
            )
            if locked:
                draft.units = remaining_units_after_lock(draft.units, locked)
                from .engine import autofit_day_caps, distribute_units
                open_days = [d for d in draft.days if not d.is_locked]
                for day in open_days:
                    day.slots = []
                autofit_day_caps(open_days, draft.units, template)
                for day in open_days:
                    day.remaining_tests = day.cap_tests
                    day.remaining_questions = day.cap_questions
                    day.remaining_minutes = day.cap_minutes
                    day.remaining_slots = day.cap_slots
                draft.leftovers = distribute_units(
                    draft.units, draft.days, template.strategy, template.respect_due_date,
                )
        except StudyPlanError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        keep_ids = set(
            program.days.filter(day_date__lt=today).values_list('id', flat=True)
        ) if lock_past else set()
        persist_draft(
            student=program.student,
            coach=request.user,
            template=template,
            draft=draft,
            program=program,
            keep_day_ids=keep_ids,
        )
        if lock_past:
            program.days.filter(day_date__lt=today).update(is_locked=True)
        program = StudyProgram.objects.prefetch_related(
            'days__slots__lesson',
            'days__slots__source_assignment',
            'leftovers',
        ).select_related('student', 'coach', 'template').get(pk=program.pk)
        return Response(StudyProgramDetailSerializer(program, context={'request': request}).data)

    @action(detail=True, methods=['get'], url_path='summary')
    def summary(self, request, pk=None):
        program = self.get_object()
        return Response(build_summary(program))

    @action(detail=True, methods=['get'], url_path='leftovers')
    def leftovers(self, request, pk=None):
        program = self.get_object()
        return Response(StudyLeftoverSerializer(program.leftovers.all(), many=True).data)


class StudyPlanSourceViewSet(viewsets.ViewSet):
    """Ödev havuzu — salt okunur veri kaynağı."""

    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'], url_path='homework-pool')
    def homework_pool(self, request):
        from .engine import collect_homework_units, monday_of, week_end_of

        student_id = request.query_params.get('student_id')
        week_start = request.query_params.get('week_start')
        if not student_id:
            return Response({'error': 'student_id gerekli.'}, status=status.HTTP_400_BAD_REQUEST)
        student, err = _student_or_error(request, student_id)
        if err:
            return err
        start = monday_of(timezone.localdate())
        if week_start:
            from datetime import date as date_cls
            start = monday_of(date_cls.fromisoformat(week_start))
        units = collect_homework_units(student.id, start, week_end_of(start))
        return Response([
            {
                'assignment_id': u.source_assignment_id,
                'lesson_id': u.source_lesson_id,
                'task_id': u.source_task_id,
                'title': u.title,
                'lesson_name': u.lesson_name,
                'topic_name': u.topic_name,
                'resource_name': u.resource_name,
                'tests': u.tests,
                'questions': u.questions,
                'minutes': u.minutes,
                'priority': u.priority,
                'due_date': u.due_date.isoformat() if u.due_date else None,
            }
            for u in units
        ])
