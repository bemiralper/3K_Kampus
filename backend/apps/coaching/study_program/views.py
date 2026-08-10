"""
Çalışma Programı - Views (DRF ViewSets)
"""
import json

from django.http import HttpResponse
from django.db import models
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status, permissions
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import (
    WeeklyProgram, ProgramDay, ProgramBlock,
    DailyFeedback, Badge,
)
from .serializers import (
    WeeklyProgramListSerializer,
    WeeklyProgramDetailSerializer,
    WeeklyProgramCreateSerializer,
    WeeklyProgramUpdateSerializer,
    ProgramDaySerializer,
    ProgramBlockSerializer,
    ProgramBlockCreateSerializer,
    DailyFeedbackSerializer,
    BadgeSerializer,
    HomeworkPoolItemSerializer,
    AutoDistributeRequestSerializer,
    SplitBlockRequestSerializer,
)
from . import services
from apps.coaching.services.coach_access import filter_by_student_scope, user_can_access_student
from apps.coaching.interfaces.sube_context import (
    assert_coaching_student_sube_access,
    filter_queryset_by_student_sube,
    mandatory_coaching_context,
)
from shared.context import get_secili_kurum_id


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """CSRF doğrulaması yapmayan SessionAuthentication."""
    def enforce_csrf(self, request):
        return  # CSRF kontrolünü atla


# ═══════════════════════════════════════
# Weekly Program
# ═══════════════════════════════════════

class WeeklyProgramViewSet(viewsets.ModelViewSet):
    """Haftalık çalışma programı CRUD + özel aksiyonlar."""
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = WeeklyProgram.objects.select_related('student', 'coach').prefetch_related(
            'days__blocks__lesson',
            'days__blocks__source_assignment',
            'days__blocks__source_lesson__lesson',
            'days__feedback',
            'badges',
        )
        ctx = getattr(self, '_coaching_ctx', None)
        if ctx:
            qs = filter_queryset_by_student_sube(qs, ctx['sube_id'])
        qs = filter_by_student_scope(qs, self.request.user, student_field='student_id')
        # Filtreler
        student_id = self.request.query_params.get('student_id')
        if student_id:
            qs = qs.filter(student_id=student_id)

        is_template = self.request.query_params.get('is_template')
        if is_template is not None:
            qs = qs.filter(is_template=is_template.lower() == 'true')

        week_start = self.request.query_params.get('week_start')
        if week_start:
            qs = qs.filter(week_start=week_start)

        # Bir tarihi kapsayan programları bul (for_date parametresi)
        for_date = self.request.query_params.get('for_date')
        if for_date:
            qs = qs.filter(week_start__lte=for_date, week_end__gte=for_date)

        # Tamamlanmamış programları filtrele
        incomplete = self.request.query_params.get('incomplete')
        if incomplete and incomplete.lower() == 'true':
            qs = qs.filter(completion_percent__lt=100)

        return qs

    def get_serializer_class(self):
        if self.action == 'create':
            return WeeklyProgramCreateSerializer
        if self.action in ('update', 'partial_update'):
            return WeeklyProgramUpdateSerializer
        if self.action in ('list',):
            return WeeklyProgramListSerializer
        return WeeklyProgramDetailSerializer

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
                {'detail': 'Bu öğrenciye erişim yetkiniz yok.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        """Program oluştur ve detay serializer ile dön."""
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        self._coaching_ctx = ctx

        create_ser = self.get_serializer(data=request.data)
        create_ser.is_valid(raise_exception=True)

        student = create_ser.validated_data['student']
        gate = assert_coaching_student_sube_access(request, student.kurum_id, student.sube_id)
        if gate:
            return gate
        if not user_can_access_student(request.user, student.id):
            return Response(
                {'detail': 'Bu öğrenciye erişim yetkiniz yok.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Aynı öğrenci + hafta zaten varsa mevcut programı dön
        week_start = create_ser.validated_data['week_start']
        existing = WeeklyProgram.objects.filter(
            student=student, week_start=week_start, is_template=False
        ).first()
        if existing:
            detail_ser = WeeklyProgramDetailSerializer(existing, context={'request': request})
            return Response(detail_ser.data, status=status.HTTP_200_OK)

        program = create_ser.save()
        # Oluşturulan programı days + badges ile birlikte döndür
        program.refresh_from_db()
        detail_ser = WeeklyProgramDetailSerializer(program, context={'request': request})

        # ── Takvim Entegrasyonu ──
        self._sync_to_calendar(program, request.user.id)

        return Response(detail_ser.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """PATCH/PUT sonrası günler yenilenmiş detay serializer döndür."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        program = serializer.save()
        program.refresh_from_db()
        self._sync_to_calendar(program, request.user.id)
        program = self.get_queryset().get(pk=program.pk)
        detail = WeeklyProgramDetailSerializer(program, context={'request': request})
        return Response(detail.data)

    def perform_destroy(self, instance):
        """Programı sil ve takvimden kaldır"""
        try:
            kurum_id = self._get_kurum_id()
            if kurum_id:
                from apps.takvim.application.integration_service import CalendarIntegrationService, KaynakModul
                CalendarIntegrationService().remove_event(kurum_id, KaynakModul.CALISMA_PROGRAMI, str(instance.id))
        except Exception:
            pass
        instance.delete()

    def _get_kurum_id(self):
        """Seçili kurum ID (header, middleware, session veya varsayılan)."""
        return get_secili_kurum_id(self.request)

    def _sync_to_calendar(self, program, user_id):
        """Çalışma programını takvime senkronize et"""
        try:
            kurum_id = self._get_kurum_id()
            if kurum_id and not program.is_template:
                from apps.takvim.application.integration_service import CalendarIntegrationService
                CalendarIntegrationService().sync_weekly_program(kurum_id, program, user_id)
        except Exception as e:
            import logging
            logging.getLogger('takvim.integration').error(f'Çalışma programı takvim sync hatası: {e}')

    # ── POST /programs/{id}/reset/ ──
    @action(detail=True, methods=['post'], url_path='reset')
    def reset_program(self, request, pk=None):
        """Programdaki tüm blokları sil — en başa dön."""
        program = self.get_object()
        count = ProgramBlock.objects.filter(day__program=program).delete()[0]
        for day in program.days.all():
            day.refresh_stats()
        program.refresh_stats()
        detail_ser = WeeklyProgramDetailSerializer(program, context={'request': request})
        return Response({
            'deleted': count,
            'program': detail_ser.data,
        })

    # ── POST /programs/{id}/auto-distribute/ ──
    @action(detail=True, methods=['post'], url_path='auto-distribute')
    def auto_distribute(self, request, pk=None):
        """Dengeli Dağıt butonu."""
        program = self.get_object()
        ser = AutoDistributeRequestSerializer(data={
            'program_id': program.id,
            'assignment_ids': request.data.get('assignment_ids', []),
        })
        ser.is_valid(raise_exception=True)
        result = services.auto_distribute(
            program,
            assignment_ids=ser.validated_data.get('assignment_ids') or None,
        )
        return Response(result, status=status.HTTP_200_OK)

    # ── POST /programs/{id}/redistribute/ ──
    @action(detail=True, methods=['post'], url_path='redistribute')
    def redistribute(self, request, pk=None):
        """Mevcut blokları dengeli şekilde yeniden dağıt."""
        program = self.get_object()
        result = services.redistribute_existing_blocks(program)
        detail_ser = WeeklyProgramDetailSerializer(program, context={'request': request})
        return Response({
            **result,
            'program': detail_ser.data,
        })

    # ── GET /programs/{id}/summary/ ──
    @action(detail=True, methods=['get'], url_path='summary')
    def summary(self, request, pk=None):
        """Haftalık özet kartı."""
        program = self.get_object()
        data = services.weekly_summary(program)
        return Response(data)

    # ── GET /programs/{id}/plan-pdf/ ──
    @action(detail=True, methods=['get'], url_path='plan-pdf')
    def plan_pdf(self, request, pk=None):
        """Sunucu tarafı çalışma programı PDF."""
        kurum_id = self._get_kurum_id()
        if not kurum_id:
            return Response({'success': False, 'error': 'Kurum seçilmedi.'}, status=400)

        program = self.get_object()
        try:
            from .pdf_service import render_study_program_pdf, study_program_pdf_filename

            pdf_bytes = render_study_program_pdf(program)
            filename = study_program_pdf_filename(program)
        except Exception as exc:
            return Response({'success': False, 'error': f'PDF oluşturulamadı: {exc}'}, status=400)

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    # ── GET /programs/{id}/notify-preview/ ──
    @action(detail=True, methods=['get'], url_path='notify-preview')
    def notify_preview(self, request, pk=None):
        """Çalışma programı WhatsApp gönderim önizlemesi."""
        kurum_id = self._get_kurum_id()
        if not kurum_id:
            return Response({'success': False, 'error': 'Kurum seçilmedi.'}, status=400)

        self.get_object()  # erişim kontrolü
        try:
            from .notify_service import StudyProgramNotifyService

            preview = StudyProgramNotifyService().preview(kurum_id, int(pk))
        except ValueError as exc:
            return Response({'success': False, 'error': str(exc)}, status=400)

        return Response({
            'success': True,
            'data': {
                'program_id': preview.program_id,
                'student_name': preview.student_name,
                'week_label': preview.week_label,
                'pdf_title': preview.pdf_title,
                'send_mode': preview.send_mode,
                'meta_template_veli': preview.meta_template_veli,
                'meta_template_ogrenci': preview.meta_template_ogrenci,
                'recipients': [
                    {
                        'recipient_type': r.recipient_type,
                        'ogrenci_id': r.ogrenci_id,
                        'veli_id': r.veli_id,
                        'display_name': r.display_name,
                        'telefon': r.telefon,
                        'body': r.body,
                        'skip_reason': r.skip_reason,
                    }
                    for r in preview.recipients
                ],
            },
        })

    # ── POST /programs/{id}/notify-send/ ──
    @action(
        detail=True,
        methods=['post'],
        url_path='notify-send',
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def notify_send(self, request, pk=None):
        """Seçili veli / öğrenciye çalışma programı PDF gönder."""
        kurum_id = self._get_kurum_id()
        if not kurum_id:
            return Response({'success': False, 'error': 'Kurum seçilmedi.'}, status=400)

        self.get_object()  # erişim kontrolü
        data = request.data

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
        uploaded = request.FILES.get('pdf')
        if uploaded:
            pdf_bytes = uploaded.read()
            if len(pdf_bytes) < 2500 or not pdf_bytes.startswith(b'%PDF'):
                return Response(
                    {'success': False, 'error': 'Geçersiz veya boş PDF dosyası.'},
                    status=400,
                )
            pdf_filename = uploaded.name or f'calisma-programi-{pk}.pdf'

        try:
            from .notify_service import StudyProgramNotifyService

            result = StudyProgramNotifyService().send(
                kurum_id,
                int(pk),
                veli_ids=[int(x) for x in veli_ids if str(x).isdigit() or isinstance(x, int)],
                include_student=include_student,
                sent_by_user_id=getattr(request.user, 'id', None),
                pdf_bytes=pdf_bytes,
                pdf_filename=pdf_filename,
            )
        except ValueError as exc:
            return Response({'success': False, 'error': str(exc)}, status=400)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).exception('Study program notify failed for %s', pk)
            return Response({'success': False, 'error': f'Gönderim başarısız: {exc}'}, status=400)

        return Response({'success': True, 'data': result})

    # ── POST /programs/{id}/calculate-badges/ ──
    @action(detail=True, methods=['post'], url_path='calculate-badges')
    def calculate_badges(self, request, pk=None):
        """Rozet hesaplama tetikle."""
        program = self.get_object()
        new_codes = services.calculate_badges(program)
        return Response({'new_badges': new_codes})

    # ── POST /programs/{id}/save-as-template/ ──
    @action(detail=True, methods=['post'], url_path='save-as-template')
    def save_as_template(self, request, pk=None):
        """Mevcut programı kopyalayarak şablon oluştur (canlı programı bozmaz)."""
        program = self.get_object()
        name = request.data.get('name', f'Şablon — {program.week_start}')

        template = WeeklyProgram.objects.create(
            student=program.student,
            coach=program.coach,
            week_start=program.week_start,
            week_end=program.week_end,
            coach_note=program.coach_note,
            is_template=True,
            template_name=name,
        )
        for day in program.days.order_by('day_date'):
            new_day = ProgramDay.objects.create(
                program=template,
                day_date=day.day_date,
                weekday=day.weekday,
                coach_note=day.coach_note,
            )
            for block in day.blocks.order_by('order'):
                ProgramBlock.objects.create(
                    day=new_day,
                    lesson=block.lesson,
                    title=block.title,
                    topic_name=block.topic_name,
                    resource_name=block.resource_name,
                    block_type=block.block_type,
                    goal_type=block.goal_type,
                    question_count=block.question_count,
                    estimated_duration_minutes=block.estimated_duration_minutes,
                    priority=block.priority,
                    order=block.order,
                    color=block.color,
                )
            new_day.refresh_stats()
        template.refresh_stats()
        return Response({'id': template.id, 'template_name': name}, status=status.HTTP_201_CREATED)

    # ── POST /programs/{id}/apply-template/ ──
    @action(detail=True, methods=['post'], url_path='apply-template')
    def apply_template(self, request, pk=None):
        """Bir şablonu mevcut programa uygula — blokları gün sırasına göre kopyala."""
        program = self.get_object()
        template_id = request.data.get('template_id')
        if not template_id:
            return Response({'error': 'template_id gerekli.'}, status=status.HTTP_400_BAD_REQUEST)

        template = get_object_or_404(WeeklyProgram, id=template_id, is_template=True)

        # Mevcut blokları sil
        ProgramBlock.objects.filter(day__program=program).delete()

        # Esnek aralıklarda weekday çakışabilir; günleri tarih sırasıyla eşle
        template_days = list(template.days.order_by('day_date'))
        program_days = list(program.days.order_by('day_date'))

        for tday, target_day in zip(template_days, program_days):
            for tblock in tday.blocks.order_by('order'):
                ProgramBlock.objects.create(
                    day=target_day,
                    lesson=tblock.lesson,
                    title=tblock.title,
                    topic_name=tblock.topic_name,
                    resource_name=tblock.resource_name,
                    block_type=tblock.block_type,
                    goal_type=tblock.goal_type,
                    question_count=tblock.question_count,
                    estimated_duration_minutes=tblock.estimated_duration_minutes,
                    priority=tblock.priority,
                    order=tblock.order,
                    color=tblock.color,
                )
            target_day.refresh_stats()

        program.refresh_stats()
        serializer = WeeklyProgramDetailSerializer(program, context={'request': request})
        return Response(serializer.data)

    # ── GET /programs/homework-pool/?student_id=X ──
    @action(detail=False, methods=['get'], url_path='homework-pool')
    def homework_pool(self, request):
        """Sol panel — ödev havuzu. ManualAssignment'lardan beslenir."""
        from apps.coaching.assignment_manual.models import ManualAssignment, AssignmentTask

        student_id = request.query_params.get('student_id')
        if not student_id:
            return Response({'error': 'student_id gerekli.'}, status=status.HTTP_400_BAD_REQUEST)

        # Filtreler
        lesson_id = request.query_params.get('lesson_id')
        status_filter = request.query_params.get('status')  # 'unplanned' özel
        program_id = request.query_params.get('program_id')

        qs = ManualAssignment.objects.filter(
            student_id=student_id,
            is_active=True,
            status__in=['ASSIGNED', 'IN_PROGRESS', 'DRAFT', 'OVERDUE'],
        ).select_related('coach').prefetch_related('lessons__lesson', 'lessons__resource_book')

        if lesson_id:
            qs = qs.filter(lessons__lesson_id=lesson_id)

        # Programa atanmış soru sayıları — (assignment_id, source_lesson_id)
        # Bölünmüş parçadan biri silinince kalan soru havuza döner.
        planned_pairs = set()
        planned_q_map = {}
        if program_id:
            for row in (
                ProgramBlock.objects.filter(
                    day__program_id=program_id,
                    source_assignment__isnull=False,
                )
                .values('source_assignment_id', 'source_lesson_id')
                .annotate(planned_q=models.Sum('question_count'))
            ):
                key = (row['source_assignment_id'], row['source_lesson_id'])
                planned_pairs.add(key)
                planned_q_map[key] = row['planned_q'] or 0

        def _pool_planned_state(assignment_id, source_lesson_id, total_q):
            """(is_planned, display_question_count) — kalan soruya göre."""
            has_blocks = (assignment_id, source_lesson_id) in planned_pairs
            planned_q = planned_q_map.get((assignment_id, source_lesson_id), 0)

            if not has_blocks and source_lesson_id is not None:
                # Eski tek blok (source_lesson=None): tüm dersleri tamamen planlı say
                if (assignment_id, None) in planned_pairs:
                    has_lesson_specific = any(
                        aid == assignment_id and lid is not None
                        for aid, lid in planned_pairs
                    )
                    if not has_lesson_specific:
                        return True, total_q

            if total_q <= 0:
                # Soru bilgisi yoksa blok varlığına göre
                return has_blocks, total_q

            remaining = max(0, total_q - planned_q)
            if remaining <= 0:
                return True, total_q
            # Kısmen planlıysa havuzda kalan soru sayısı görünsün
            return False, remaining if has_blocks else total_q

        from apps.coaching.assignment_manual.title_utils import strip_completion_title_suffix

        items = []
        for a in qs:
            clean_title = strip_completion_title_suffix(a.title) or a.title
            lessons = list(a.lessons.all())
            if not lessons:
                # Dersi olmayan ödev → yine de göster
                q_count = AssignmentTask.objects.filter(
                    lesson_block__assignment=a
                ).aggregate(s=models.Sum('question_count'))['s'] or 0
                is_planned, display_q = _pool_planned_state(a.id, None, q_count)
                items.append({
                    'id': a.id,
                    'title': clean_title,
                    'status': a.status,
                    'status_display': a.get_status_display(),
                    'priority': a.priority,
                    'priority_display': a.get_priority_display(),
                    'lesson_name': None,
                    'topic_name': '',
                    'resource_name': '',
                    'question_count': display_q,
                    'assigned_date': a.assigned_date,
                    'due_date': a.due_date,
                    'coach_name': a.coach.get_full_name() if a.coach else None,
                    'is_planned': is_planned,
                    'lesson_id': None,
                    'ders_id': None,
                })
            else:
                for lesson in lessons:
                    l_q_count = AssignmentTask.objects.filter(
                        lesson_block=lesson
                    ).aggregate(s=models.Sum('question_count'))['s'] or 0
                    is_planned, display_q = _pool_planned_state(a.id, lesson.id, l_q_count)
                    items.append({
                        'id': a.id,
                        'title': clean_title,
                        'status': a.status,
                        'status_display': a.get_status_display(),
                        'priority': a.priority,
                        'priority_display': a.get_priority_display(),
                        'lesson_name': lesson.lesson.ad if lesson.lesson else None,
                        'topic_name': lesson.topic_name or '',
                        'resource_name': lesson.resource_book.ad if lesson.resource_book else '',
                        'question_count': display_q,
                        'assigned_date': a.assigned_date,
                        'due_date': a.due_date,
                        'coach_name': a.coach.get_full_name() if a.coach else None,
                        'is_planned': is_planned,
                        'lesson_id': lesson.id,
                        'ders_id': lesson.lesson_id,
                    })

        # status_filter == 'unplanned' → sadece planlanmamışları döndür
        if status_filter == 'unplanned' and program_id:
            items = [i for i in items if not i['is_planned']]

        serializer = HomeworkPoolItemSerializer(items, many=True)
        return Response(serializer.data)


# ═══════════════════════════════════════
# Program Block
# ═══════════════════════════════════════

class ProgramBlockViewSet(viewsets.ModelViewSet):
    """Çalışma bloğu CRUD + sıralama + tamamlanma."""
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ProgramBlockSerializer

    def get_queryset(self):
        qs = ProgramBlock.objects.select_related('day', 'lesson')
        day_id = self.request.query_params.get('day_id')
        if day_id:
            qs = qs.filter(day_id=day_id)
        program_id = self.request.query_params.get('program_id')
        if program_id:
            qs = qs.filter(day__program_id=program_id)
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ProgramBlockCreateSerializer
        return ProgramBlockSerializer

    def perform_create(self, serializer):
        block = serializer.save()
        block.day.refresh_stats()
        block.day.program.refresh_stats()

    def perform_update(self, serializer):
        """
        Çalışma / hedef türü güncellenince aynı ödev parçalarına da uygula.
        Eşleşme: aynı program + source_lesson; yoksa source_assignment (+ lesson).
        """
        old_day_id = serializer.instance.day_id
        block = serializer.save()
        changed = serializer.validated_data
        if ('block_type' in changed) or ('goal_type' in changed):
            siblings = ProgramBlock.objects.filter(
                day__program_id=block.day.program_id,
            ).exclude(pk=block.pk)
            if block.source_lesson_id:
                siblings = siblings.filter(source_lesson_id=block.source_lesson_id)
            elif block.source_assignment_id and block.lesson_id:
                siblings = siblings.filter(
                    source_assignment_id=block.source_assignment_id,
                    lesson_id=block.lesson_id,
                )
            elif block.source_assignment_id:
                siblings = siblings.filter(
                    source_assignment_id=block.source_assignment_id,
                    topic_name=block.topic_name,
                )
            else:
                siblings = ProgramBlock.objects.none()

            update_fields = {}
            if 'block_type' in changed:
                update_fields['block_type'] = block.block_type
            if 'goal_type' in changed:
                update_fields['goal_type'] = block.goal_type
            if update_fields:
                siblings.update(**update_fields)

        if block.day_id != old_day_id:
            old_day = ProgramDay.objects.filter(id=old_day_id).first()
            if old_day:
                old_day.refresh_stats()
        block.day.refresh_stats()
        block.day.program.refresh_stats()

    def perform_destroy(self, instance):
        day = instance.day
        instance.delete()
        day.refresh_stats()
        day.program.refresh_stats()

    # ── POST /blocks/{id}/toggle-complete/ ──
    @action(detail=True, methods=['post'], url_path='toggle-complete')
    def toggle_complete(self, request, pk=None):
        block = self.get_object()
        block.is_completed = not block.is_completed
        if block.is_completed:
            from django.utils import timezone
            block.completed_at = timezone.now()
            block.actual_duration = request.data.get('actual_duration')
        else:
            block.completed_at = None
        block.save()
        block.day.refresh_stats()
        block.day.program.refresh_stats()
        return Response(ProgramBlockSerializer(block).data)

    # ── POST /blocks/reorder/ ──
    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """
        Sürükle-bırak sıralama + gün değiştirme.
        Body: { items: [{ block_id, day_id, order }, ...] }
        """
        items = request.data.get('items', [])
        affected_days = set()

        for item in items:
            try:
                block = ProgramBlock.objects.get(id=item['block_id'])
                old_day_id = block.day_id
                block.day_id = item['day_id']
                block.order = item['order']
                block.save(update_fields=['day_id', 'order', 'updated_at'])
                affected_days.add(old_day_id)
                affected_days.add(item['day_id'])
            except ProgramBlock.DoesNotExist:
                continue

        # Etkilenen günleri güncelle
        for day in ProgramDay.objects.filter(id__in=affected_days):
            day.refresh_stats()
            day.program.refresh_stats()

        return Response({'updated': len(items)})

    # ── POST /blocks/{id}/split-to-days/ ──
    @action(detail=True, methods=['post'], url_path='split-to-days')
    def split_to_days(self, request, pk=None):
        """
        Bir bloğu birden fazla güne böl.
        Body: { day_ids: [1,2,3], question_counts: [10,10,10] }
        question_counts verilmezse soru sayısı eşit dağıtılır.
        """
        block = self.get_object()
        ser = SplitBlockRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        day_ids = ser.validated_data['day_ids']
        q_counts = ser.validated_data.get('question_counts')
        titles = ser.validated_data.get('titles')

        total_q = block.question_count or 0
        n = len(day_ids)

        # Soru dağılımı
        if q_counts:
            # Toplam eşleşmeli
            if sum(q_counts) != total_q and total_q > 0:
                return Response(
                    {'error': f'Soru toplamı ({sum(q_counts)}) orijinal ile ({total_q}) eşleşmiyor.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            # Eşit dağıt
            base = total_q // n if n else 0
            remainder = total_q % n if n else 0
            q_counts = [base + (1 if i < remainder else 0) for i in range(n)]

        # Süre dağılımı
        total_dur = block.estimated_duration_minutes or 0
        dur_base = total_dur // n if n else 0
        dur_rem = total_dur % n if n else 0
        durations = [dur_base + (1 if i < dur_rem else 0) for i in range(n)]

        created_blocks = []
        for idx, day_id in enumerate(day_ids):
            try:
                day = ProgramDay.objects.get(id=day_id)
            except ProgramDay.DoesNotExist:
                continue

            part_title = (
                titles[idx] if titles
                else f"{block.title} ({idx + 1}/{n})"
            )

            new_block = ProgramBlock.objects.create(
                day=day,
                source_assignment=block.source_assignment,
                source_task=block.source_task,
                source_lesson=block.source_lesson,
                lesson=block.lesson,
                title=part_title,
                topic_name=block.topic_name,
                resource_name=block.resource_name,
                block_type=block.block_type,
                goal_type=block.goal_type,
                question_count=q_counts[idx],
                estimated_duration_minutes=durations[idx] or None,
                priority=block.priority,
                order=day.blocks.count(),
                color=block.color,
            )
            created_blocks.append(new_block)
            day.refresh_stats()

        # Orijinal bloğu sil
        old_day = block.day
        block.delete()
        old_day.refresh_stats()
        old_day.program.refresh_stats()

        return Response({
            'split_count': len(created_blocks),
            'blocks': ProgramBlockSerializer(created_blocks, many=True).data,
        })

    # ── POST /blocks/{id}/move/ ──
    @action(detail=True, methods=['post'], url_path='move')
    def move(self, request, pk=None):
        """Bloğu başka güne taşı."""
        block = self.get_object()
        new_day_id = request.data.get('day_id')
        if not new_day_id:
            return Response({'error': 'day_id gerekli.'}, status=status.HTTP_400_BAD_REQUEST)

        old_day = block.day
        new_day = get_object_or_404(ProgramDay, id=new_day_id)

        block.day = new_day
        block.order = new_day.blocks.count()
        block.save(update_fields=['day_id', 'order', 'updated_at'])

        old_day.refresh_stats()
        new_day.refresh_stats()
        old_day.program.refresh_stats()

        return Response(ProgramBlockSerializer(block).data)


# ═══════════════════════════════════════
# Program Day (coach_note güncellemesi için)
# ═══════════════════════════════════════

class ProgramDayViewSet(viewsets.GenericViewSet):
    """ProgramDay — coach_note güncelleme."""
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ProgramDaySerializer
    queryset = ProgramDay.objects.all()

    def partial_update(self, request, pk=None):
        """PATCH /days/{id}/ — sadece coach_note güncellenebilir."""
        day = self.get_object()
        coach_note = request.data.get('coach_note')
        if coach_note is not None:
            day.coach_note = coach_note
            day.save(update_fields=['coach_note', 'updated_at'])
        return Response(ProgramDaySerializer(day).data)


# ═══════════════════════════════════════
# Daily Feedback
# ═══════════════════════════════════════

class DailyFeedbackViewSet(viewsets.ModelViewSet):
    """Günlük mini yorum CRUD."""
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DailyFeedbackSerializer

    def get_queryset(self):
        qs = DailyFeedback.objects.select_related('day')
        program_id = self.request.query_params.get('program_id')
        if program_id:
            qs = qs.filter(day__program_id=program_id)
        return qs


# ═══════════════════════════════════════
# Badge
# ═══════════════════════════════════════

class BadgeViewSet(viewsets.ReadOnlyModelViewSet):
    """Rozet listesi (read-only)."""
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = BadgeSerializer

    def get_queryset(self):
        qs = Badge.objects.select_related('student', 'program')
        student_id = self.request.query_params.get('student_id')
        if student_id:
            qs = qs.filter(student_id=student_id)
        program_id = self.request.query_params.get('program_id')
        if program_id:
            qs = qs.filter(program_id=program_id)
        return qs
