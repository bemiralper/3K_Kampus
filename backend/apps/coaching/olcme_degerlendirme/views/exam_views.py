"""
Ölçme & Değerlendirme — Exam Views
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from ..models import Exam, ExamSection, ExamSessionModel
from ..serializers.exam import (
    ExamListSerializer,
    ExamDetailSerializer,
    ExamCreateSerializer,
    ExamUpdateSerializer,
    ExamSectionSerializer,
    ExamSessionSerializer,
)
from ..services.exam_templates import (
    get_template_sections,
    get_template_sub_sections,
    get_default_duration,
    create_sections_from_template,
    ensure_sub_sections,
    _auto_link_subjects,
)
from shared.context import get_secili_kurum_id, get_secili_egitim_yili_id
from ..interfaces.sube_context import (
    assert_olcme_exam_access,
    mandatory_olcme_context,
    resolve_mandatory_olcme_sube,
)
from ..views import CsrfExemptSessionAuthentication


class ExamViewSet(viewsets.ModelViewSet):
    """Sınav CRUD + yardımcı action'lar."""

    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def _apply_tenant_scope(self, qs):
        ctx = getattr(self, '_olcme_ctx', None)
        if ctx:
            qs = qs.filter(kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'])
        return qs

    def get_queryset(self):
        qs = Exam.objects.filter(is_active=True).select_related(
            'kurum', 'sube', 'egitim_yili',
            'deneme_hizmeti', 'deneme_paketi',
            'linked_tyt_exam',
        ).prefetch_related('siniflar', 'sections', 'exam_sessions')

        qs = self._apply_tenant_scope(qs)

        # Filtreler
        exam_type = self.request.query_params.get('exam_type')
        if exam_type:
            qs = qs.filter(exam_type=exam_type)

        exam_status = self.request.query_params.get('status')
        if exam_status:
            qs = qs.filter(status=exam_status)

        is_template = self.request.query_params.get('is_template')
        if is_template is not None:
            qs = qs.filter(is_template=is_template in ('true', '1', 'True'))

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)

        return qs

    def get_object(self):
        obj = super().get_object()
        err = assert_olcme_exam_access(self.request, obj)
        if err:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(detail=err.data.get('error', 'Forbidden'))
        return obj

    def list(self, request, *args, **kwargs):
        ctx, err = mandatory_olcme_context(request)
        if err:
            return err
        self._olcme_ctx = ctx
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        ctx, err = mandatory_olcme_context(request)
        if err:
            return err
        self._olcme_ctx = ctx
        return super().create(request, *args, **kwargs)

    def get_serializer_class(self):
        if self.action == 'list':
            return ExamListSerializer
        if self.action == 'create':
            return ExamCreateSerializer
        if self.action in ('update', 'partial_update'):
            return ExamUpdateSerializer
        return ExamDetailSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        exam = serializer.save()

        # ── Takvim Entegrasyonu ──
        self._sync_to_calendar(exam, request.user.id)

        try:
            from apps.gorev.application.rule_engine import hook_exam_created
            hook_exam_created(exam)
        except Exception:
            pass

        return Response(
            ExamDetailSerializer(exam).data,
            status=status.HTTP_201_CREATED,
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_publish = old_instance.result_publish_date
        old_status = old_instance.status
        exam = serializer.save()
        self._sync_to_calendar(exam, self.request.user.id)
        self._notify_exam_results_if_published(exam, old_publish, old_status)

    @staticmethod
    def _notify_exam_results_if_published(exam, old_publish, old_status):
        newly_published = bool(
            exam.result_publish_date
            and exam.result_publish_date != old_publish
        ) or (
            exam.status in ('COMPLETED', 'RESULTS_UPLOADED')
            and exam.status != old_status
        )
        if not newly_published or not exam.kurum_id:
            return
        try:
            from apps.gorev.application.rule_engine import hook_exam_results_published
            hook_exam_results_published(exam)
        except Exception:
            pass
        try:
            from apps.communication.application.integration_hooks import notify_exam_result
            notify_exam_result(
                exam.kurum_id,
                exam.id,
            )
        except Exception as e:
            import logging
            logging.getLogger('communication.integration').error(
                f'Sınav sonuç WhatsApp bildirim hatası: {e}'
            )

    def perform_destroy(self, instance):
        kurum_id = instance.kurum_id
        self._remove_from_calendar(kurum_id, instance.id)
        instance.is_active = False
        instance.save(update_fields=['is_active'])

    def _sync_to_calendar(self, exam, user_id):
        """Sınavı takvime senkronize et"""
        try:
            if exam.kurum_id and exam.exam_date:
                from apps.takvim.application.integration_service import CalendarIntegrationService
                CalendarIntegrationService().sync_exam(exam.kurum_id, exam, user_id)
        except Exception as e:
            import logging
            logging.getLogger('takvim.integration').error(f'Exam takvim sync hatası: {e}')

    def _remove_from_calendar(self, kurum_id, exam_id):
        """Sınavı takvimden kaldır"""
        try:
            if kurum_id:
                from apps.takvim.application.integration_service import CalendarIntegrationService, KaynakModul
                CalendarIntegrationService().remove_event(kurum_id, KaynakModul.OLCME, str(exam_id))
        except Exception as e:
            import logging
            logging.getLogger('takvim.integration').error(f'Exam takvim remove hatası: {e}')

    # ── BÖLÜM YÖNETİMİ ──────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='add_section')
    def add_section(self, request, pk=None):
        exam = self.get_object()
        data = request.data.copy()
        data['exam'] = exam.id
        section = ExamSection.objects.create(
            exam=exam,
            name=data.get('name', ''),
            order=data.get('order', exam.section_count),
            question_start=data.get('question_start', 1),
            question_end=data.get('question_end', 1),
        )
        return Response(ExamDetailSerializer(exam).data)

    @action(detail=True, methods=['post'], url_path='remove_section')
    def remove_section(self, request, pk=None):
        exam = self.get_object()
        section_id = request.data.get('section_id')
        ExamSection.objects.filter(exam=exam, id=section_id).delete()
        return Response(ExamDetailSerializer(exam).data)

    @action(detail=True, methods=['post'], url_path='update_section')
    def update_section(self, request, pk=None):
        """Bölüm bilgilerini güncelle (soru aralığı, isim, subject vb.)."""
        exam = self.get_object()
        section_id = request.data.get('section_id')
        try:
            section = ExamSection.objects.get(exam=exam, id=section_id)
        except ExamSection.DoesNotExist:
            return Response({'error': 'Bölüm bulunamadı.'}, status=404)

        if 'name' in request.data:
            section.name = request.data['name']
        if 'question_start' in request.data:
            section.question_start = int(request.data['question_start'])
        if 'question_end' in request.data:
            section.question_end = int(request.data['question_end'])
        if 'order' in request.data:
            section.order = int(request.data['order'])
        if 'subject' in request.data:
            section.subject_id = request.data['subject'] or None
        section.save()
        return Response(ExamDetailSerializer(exam).data)

    @action(detail=True, methods=['post'], url_path='reorder_sections')
    def reorder_sections(self, request, pk=None):
        exam = self.get_object()
        section_ids = request.data.get('section_ids', [])
        for idx, sid in enumerate(section_ids):
            ExamSection.objects.filter(exam=exam, id=sid).update(order=idx)
        return Response(ExamDetailSerializer(exam).data)

    @action(detail=True, methods=['post'], url_path='apply_template')
    def apply_template(self, request, pk=None):
        exam = self.get_object()
        exam.sections.all().delete()
        create_sections_from_template(exam)
        return Response({
            'message': 'Şablon uygulandı.',
            'data': ExamDetailSerializer(exam).data,
        })

    @action(detail=True, methods=['post'], url_path='ensure_sub_sections')
    def ensure_sub_sections_action(self, request, pk=None):
        """Mevcut ana bölümlere eksik alt bölümleri ekler."""
        exam = self.get_object()
        created = ensure_sub_sections(exam)
        return Response({
            'message': f'{len(created)} alt bölüm eklendi.',
            'data': ExamDetailSerializer(exam).data,
        })

    @action(detail=True, methods=['post'], url_path='link_subjects')
    def link_subjects_action(self, request, pk=None):
        """
        Mevcut sınav bölümlerine müfredat derslerini (Subject) otomatik bağlar.
        Zaten subject bağlı olan bölümlere dokunmaz.
        """
        exam = self.get_object()
        from ..models.exam import ExamSection
        all_sections = list(ExamSection.objects.filter(exam=exam))
        _auto_link_subjects(exam, all_sections)

        linked_count = ExamSection.objects.filter(
            exam=exam, subject__isnull=False
        ).count()
        return Response({
            'message': f'{linked_count} bölüme müfredat dersi bağlandı.',
            'data': ExamDetailSerializer(exam).data,
        })

    @action(detail=True, methods=['post'], url_path='update_status')
    def update_status(self, request, pk=None):
        """Sınav durumunu günceller."""
        exam = self.get_object()
        new_status = request.data.get('status')
        valid = [c[0] for c in Exam.Status.choices]
        if new_status not in valid:
            return Response(
                {'error': f'Geçersiz durum. Geçerli: {valid}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        exam.status = new_status
        exam.save(update_fields=['status'])
        return Response(ExamDetailSerializer(exam).data)

    # ── OTURUM YÖNETİMİ ─────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='add_session')
    def add_session(self, request, pk=None):
        exam = self.get_object()
        serializer = ExamSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = ExamSessionModel.objects.create(
            exam=exam,
            name=serializer.validated_data.get('name', ''),
            order=serializer.validated_data.get('order', exam.session_count),
            session_date=serializer.validated_data.get('session_date'),
            start_time=serializer.validated_data.get('start_time'),
            end_time=serializer.validated_data.get('end_time'),
            duration_minutes=serializer.validated_data.get('duration_minutes'),
            schedule_preference=serializer.validated_data.get(
                'schedule_preference', 'FARKETMEZ',
            ),
            description=serializer.validated_data.get('description', ''),
        )
        section_objs = serializer.validated_data.get('sections', [])
        if section_objs:
            session.sections.set(section_objs)
        return Response(
            ExamDetailSerializer(exam).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='remove_session')
    def remove_session(self, request, pk=None):
        exam = self.get_object()
        session_id = request.data.get('session_id')
        ExamSessionModel.objects.filter(exam=exam, id=session_id).delete()
        return Response(ExamDetailSerializer(exam).data)

    @action(detail=True, methods=['post'], url_path='update_session')
    def update_session(self, request, pk=None):
        exam = self.get_object()
        session_id = request.data.get('session_id')
        try:
            session = ExamSessionModel.objects.get(exam=exam, id=session_id)
        except ExamSessionModel.DoesNotExist:
            return Response(
                {'error': 'Oturum bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        for field in ('name', 'order', 'session_date', 'start_time', 'end_time',
                      'duration_minutes', 'schedule_preference', 'description'):
            if field in request.data:
                setattr(session, field, request.data[field])
        session.save()

        section_ids = request.data.get('section_ids')
        if section_ids is not None:
            sections = ExamSection.objects.filter(exam=exam, id__in=section_ids)
            session.sections.set(sections)

        return Response(ExamDetailSerializer(exam).data)

    # ── ŞABLON BİLGİLERİ ────────────────────────────────────────────────────

    @action(detail=False, methods=['get'], url_path='templates')
    def templates(self, request):
        """Her sınav türü için şablon bilgisi (ana + alt bölümler dahil)."""
        data = {}
        for choice in Exam.ExamType.choices:
            key = choice[0]
            sections = get_template_sections(key)
            sub_sections = get_template_sub_sections(key)
            data[key] = {
                'label': choice[1],
                'duration': get_default_duration(key),
                'sections': sections,
                'sub_sections': sub_sections,
            }
        return Response(data)

    # ── LOOKUP ENDPOINTLERİ ──────────────────────────────────────────────────

    @action(detail=False, methods=['get'], url_path='siniflar')
    def siniflar(self, request):
        """Aktif tenant'a ait sınıf listesi."""
        from apps.sinif.domain.models import Sinif

        ctx, err = mandatory_olcme_context(request)
        if err:
            return err

        ey_id = get_secili_egitim_yili_id(request)
        qs = Sinif.objects.filter(
            aktif_mi=True,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        ).select_related('sinif_seviyesi')
        if ey_id:
            qs = qs.filter(egitim_yili_id=ey_id)

        data = list(qs.values(
            'id', 'ad', 'kod',
            'sinif_seviyesi__id', 'sinif_seviyesi__ad',
        ).order_by('ad'))
        # Düzleştir
        result = []
        for d in data:
            result.append({
                'id': d['id'],
                'ad': d['ad'],
                'kod': d['kod'],
                'seviye_id': d['sinif_seviyesi__id'],
                'seviye_ad': d['sinif_seviyesi__ad'] or '',
            })
        return Response(result)

    @action(detail=False, methods=['get'], url_path='deneme-hizmetleri')
    def deneme_hizmetleri(self, request):
        """Aktif deneme türündeki ek hizmetler."""
        from apps.egitim_paketleri.models import EkHizmet

        ctx, err = mandatory_olcme_context(request)
        if err:
            return err

        qs = EkHizmet.objects.filter(
            hizmet_turu='deneme',
            aktif_mi=True,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        )

        data = list(qs.values('id', 'ad', 'kod').order_by('ad'))
        return Response(data)

    @action(detail=False, methods=['get'], url_path='deneme-paketleri')
    def deneme_paketleri(self, request):
        """Aktif deneme paketleri."""
        from apps.egitim_paketleri.models import Deneme

        ctx, err = mandatory_olcme_context(request)
        if err:
            return err

        qs = Deneme.objects.filter(
            aktif_mi=True,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        )

        data = list(qs.values('id', 'ad', 'kod', 'deneme_sayisi').order_by('ad'))
        return Response(data)

    @action(detail=False, methods=['get'], url_path='sinif-seviyeleri')
    def sinif_seviyeleri(self, request):
        """Sınıf seviyesi listesi (9, 10, 11, 12 gibi)."""
        from apps.egitim_tanimlari.models import SinifSeviyesi
        data = list(
            SinifSeviyesi.objects.all()
            .values('id', 'ad', 'kod')
            .order_by('ad')
        )
        return Response(data)

    # ── KİLİT ────────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def lock(self, request, pk=None):
        exam = self.get_object()
        exam.is_locked = True
        exam.save(update_fields=['is_locked'])
        return Response({'message': 'Sınav kilitlendi.'})

    @action(detail=True, methods=['post'])
    def unlock(self, request, pk=None):
        exam = self.get_object()
        exam.is_locked = False
        exam.save(update_fields=['is_locked'])
        return Response({'message': 'Kilit kaldırıldı.'})

    # ── TYT SINAV LİSTESİ (AYT BAĞLANTISI İÇİN) ─────────────────────────────

    @action(detail=False, methods=['get'], url_path='tyt-exams')
    def tyt_exams(self, request):
        """
        AYT sınavına bağlanabilecek TYT sınavlarını listele.
        Sonuç yüklenmiş TYT sınavları döner.
        """
        ctx, err = mandatory_olcme_context(request)
        if err:
            return err

        ey_id = get_secili_egitim_yili_id(request)
        qs = Exam.objects.filter(
            exam_type='YKS_TYT',
            is_active=True,
            status__in=['RESULTS_UPLOADED', 'COMPLETED'],
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        ).select_related('kurum', 'sube', 'egitim_yili')

        if ey_id:
            qs = qs.filter(egitim_yili_id=ey_id)

        data = []
        for exam in qs.order_by('-exam_date', '-created_at'):
            # Zaten başka bir AYT'ye bağlı mı?
            already_linked = hasattr(exam, 'linked_ayt_exam') and exam.linked_ayt_exam is not None
            data.append({
                'id': exam.id,
                'name': exam.name,
                'exam_date': str(exam.exam_date) if exam.exam_date else None,
                'status': exam.status,
                'already_linked': already_linked,
            })
        return Response(data)

    @action(detail=True, methods=['post'], url_path='link-tyt')
    def link_tyt(self, request, pk=None):
        """
        AYT sınavına bir TYT sınavı bağla.
        POST body: { "tyt_exam_id": 123 }  veya { "tyt_exam_id": null } (bağlantıyı kaldır)
        """
        exam = self.get_object()
        if exam.exam_type != 'YKS_AYT':
            return Response(
                {'error': 'Bu işlem sadece AYT sınavları için geçerlidir.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tyt_exam_id = request.data.get('tyt_exam_id')

        if tyt_exam_id is None:
            # Bağlantıyı kaldır
            exam.linked_tyt_exam = None
            exam.save(update_fields=['linked_tyt_exam'])
            return Response({
                'message': 'TYT bağlantısı kaldırıldı.',
                'data': ExamDetailSerializer(exam).data,
            })

        tyt_exam = Exam.objects.filter(
            pk=tyt_exam_id,
            exam_type='YKS_TYT',
            kurum_id=exam.kurum_id,
            sube_id=exam.sube_id,
        ).first()
        if not tyt_exam:
            return Response(
                {'error': 'TYT sınavı bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        exam.linked_tyt_exam = tyt_exam
        exam.save(update_fields=['linked_tyt_exam'])
        return Response({
            'message': f'TYT sınavı bağlandı: {tyt_exam.name}',
            'data': ExamDetailSerializer(exam).data,
        })

    # ── KOPYALAMA ────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def copy(self, request, pk=None):
        original = self.get_object()
        ctx, err = mandatory_olcme_context(request)
        if err:
            return err
        new_name = request.data.get('name', f'{original.name} (Kopya)')
        exam = Exam.objects.create(
            name=new_name,
            exam_type=original.exam_type,
            description=original.description,
            duration_minutes=original.duration_minutes,
            wrong_answer_count=original.wrong_answer_count,
            per_section_penalty=original.per_section_penalty,
            score_coefficients=original.score_coefficients,
            booklet_type=original.booklet_type,
            booklet_auto_detect=original.booklet_auto_detect,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            egitim_yili=original.egitim_yili,
        )
        # Sınıf kopyalama
        exam.siniflar.set(original.siniflar.all())
        # Bölüm kopyalama (ana + alt bölümler)
        parent_map: dict[int, ExamSection] = {}  # orijinal id → yeni section
        for section in original.sections.filter(is_sub_section=False).order_by('order'):
            new_section = ExamSection.objects.create(
                exam=exam,
                name=section.name,
                order=section.order,
                question_start=section.question_start,
                question_end=section.question_end,
                subject=section.subject,
            )
            parent_map[section.id] = new_section
        # Alt bölümleri kopyala
        for sub in original.sections.filter(is_sub_section=True).order_by('order'):
            new_parent = parent_map.get(sub.parent_section_id)
            ExamSection.objects.create(
                exam=exam,
                name=sub.name,
                order=sub.order,
                question_start=sub.question_start,
                question_end=sub.question_end,
                is_sub_section=True,
                parent_section=new_parent,
                subject=sub.subject,
            )
        return Response(
            ExamDetailSerializer(exam).data,
            status=status.HTTP_201_CREATED,
        )
