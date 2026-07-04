"""
Çalışma Programı - Views (DRF ViewSets)
"""
from rest_framework import viewsets, status, permissions
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import models
from django.shortcuts import get_object_or_404

from .models import (
    WeeklyProgram, ProgramDay, ProgramBlock,
    DailyFeedback, Badge,
)
from .serializers import (
    WeeklyProgramListSerializer,
    WeeklyProgramDetailSerializer,
    WeeklyProgramCreateSerializer,
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
from apps.coaching.services.coach_access import user_can_access_student
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
            'days__feedback',
            'badges',
        )
        ctx = getattr(self, '_coaching_ctx', None)
        if ctx:
            qs = filter_queryset_by_student_sube(qs, ctx['sube_id'])
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

    def perform_update(self, serializer):
        program = serializer.save()
        program.refresh_from_db()
        self._sync_to_calendar(program, self.request.user.id)

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
        """Mevcut haftayı şablon olarak kaydet."""
        program = self.get_object()
        name = request.data.get('name', f'Şablon — {program.week_start}')
        program.is_template = True
        program.template_name = name
        program.save(update_fields=['is_template', 'template_name', 'updated_at'])
        return Response({'id': program.id, 'template_name': name})

    # ── POST /programs/{id}/apply-template/ ──
    @action(detail=True, methods=['post'], url_path='apply-template')
    def apply_template(self, request, pk=None):
        """Bir şablonu mevcut programa uygula — blokları kopyala."""
        program = self.get_object()
        template_id = request.data.get('template_id')
        if not template_id:
            return Response({'error': 'template_id gerekli.'}, status=status.HTTP_400_BAD_REQUEST)

        template = get_object_or_404(WeeklyProgram, id=template_id, is_template=True)

        # Mevcut blokları sil
        ProgramBlock.objects.filter(day__program=program).delete()

        for tday in template.days.all():
            try:
                target_day = program.days.get(weekday=tday.weekday)
            except ProgramDay.DoesNotExist:
                continue

            for tblock in tday.blocks.all():
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
        serializer = WeeklyProgramDetailSerializer(program)
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
            status__in=['ASSIGNED', 'IN_PROGRESS', 'DRAFT'],
        ).select_related('coach').prefetch_related('lessons__lesson', 'lessons__resource_book')

        if lesson_id:
            qs = qs.filter(lessons__lesson_id=lesson_id)

        # Programa atanmış mı? — (assignment_id, source_lesson_id) tuple bazlı
        planned_pairs = set()
        if program_id:
            for row in ProgramBlock.objects.filter(
                day__program_id=program_id,
                source_assignment__isnull=False,
            ).values_list('source_assignment_id', 'source_lesson_id'):
                planned_pairs.add(row)  # (assignment_id, lesson_id|None)

        items = []
        for a in qs:
            lessons = list(a.lessons.all())
            if not lessons:
                # Dersi olmayan ödev → yine de göster
                q_count = AssignmentTask.objects.filter(
                    lesson_block__assignment=a
                ).aggregate(s=models.Sum('question_count'))['s'] or 0
                items.append({
                    'id': a.id,
                    'title': a.title,
                    'status': a.status,
                    'status_display': a.get_status_display(),
                    'priority': a.priority,
                    'priority_display': a.get_priority_display(),
                    'lesson_name': None,
                    'topic_name': '',
                    'resource_name': '',
                    'question_count': q_count,
                    'due_date': a.due_date,
                    'coach_name': a.coach.get_full_name() if a.coach else None,
                    'is_planned': (a.id, None) in planned_pairs,
                    'lesson_id': None,
                })
            else:
                for lesson in lessons:
                    l_q_count = AssignmentTask.objects.filter(
                        lesson_block=lesson
                    ).aggregate(s=models.Sum('question_count'))['s'] or 0
                    # is_planned: (assignment_id, lesson.id) veya (assignment_id, None)
                    # Split sonrası source_lesson None olabilir, bu yüzden her iki şekilde kontrol et
                    is_planned = (
                        (a.id, lesson.id) in planned_pairs
                        or (a.id, None) in planned_pairs
                    )
                    items.append({
                        'id': a.id,
                        'title': a.title,
                        'status': a.status,
                        'status_display': a.get_status_display(),
                        'priority': a.priority,
                        'priority_display': a.get_priority_display(),
                        'lesson_name': lesson.lesson.ad if lesson.lesson else None,
                        'topic_name': lesson.topic_name or '',
                        'resource_name': lesson.resource_book.ad if lesson.resource_book else '',
                        'question_count': l_q_count,
                        'due_date': a.due_date,
                        'coach_name': a.coach.get_full_name() if a.coach else None,
                        'is_planned': is_planned,
                        'lesson_id': lesson.id,
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
