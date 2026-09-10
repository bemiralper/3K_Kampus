"""
Cevap Anahtarı View'ları

AnswerKeyViewSet:
  - list   → Sınava ait tüm cevap anahtarları (kitapçık bazlı)
  - create → Yeni cevap anahtarı başlığı oluştur
  - detail → Tekil cevap anahtarı + items
  - delete → Sil

  Özel action'lar:
  - bulk_import → Toplu soru cevabı aktarımı (sütun yapıştır / Excel)
  - outcomes    → Kazanım listesi (ders → ünite → konu → kazanım)
"""
from __future__ import annotations

import logging
from django.db import transaction
from django.db.models import Prefetch
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from ..models import (
    Exam, ExamSection, AnswerKey, AnswerKeyItem,
    Subject, Topic, Outcome, SubOutcome,
)
from ..serializers.answer_key import (
    AnswerKeySerializer,
    AnswerKeyItemSerializer,
    BulkAnswerKeyImportSerializer,
)
from . import CsrfExemptSessionAuthentication
from ..interfaces.sube_context import get_exam_or_response, assert_olcme_exam_access

logger = logging.getLogger(__name__)


def rebuild_booklet_b_from_primary(exam) -> int:
    """
    A anahtarındaki b_question_number'dan B kitapçığını yeniden kur.
    Offset ana test başlangıcıdır (Sosyal 41, Temel Mat 61…), alt bölüm değil.
    """
    primary = (
        exam.answer_keys.filter(is_primary=True).first()
        or exam.answer_keys.exclude(booklet='B').first()
    )
    if not primary:
        return 0

    section_map = AnswerKeyViewSet._build_section_map(exam)
    max_q = max((end for _start, end, _sec in section_map), default=0)
    b_key, _ = AnswerKey.objects.get_or_create(
        exam=exam, booklet='B', defaults={'is_primary': False},
    )
    b_key.items.all().delete()

    unique: dict[int, dict] = {}
    items = primary.items.select_related('section', 'section__parent_section')
    for item in items:
        b_global = item.booklet_b_global()
        if not b_global or b_global < 1 or (max_q and b_global > max_q):
            continue
        section = AnswerKeyViewSet._find_section(section_map, b_global, fallback_last=False)
        if section is None:
            continue
        unique[b_global] = {
            'section': section,
            'question_number': b_global,
            'correct_answer': item.correct_answer,
            'is_cancelled': item.is_cancelled,
            'outcome_id': item.outcome_id,
            'sub_outcome_id': item.sub_outcome_id,
            'imported_outcome_text': item.imported_outcome_text or '',
        }

    for brow in sorted(unique.values(), key=lambda r: r['question_number']):
        AnswerKeyItem.objects.create(answer_key=b_key, **brow)
    return len(unique)


class AnswerKeyViewSet(viewsets.ModelViewSet):
    """Sınav cevap anahtarı yönetimi."""

    serializer_class = AnswerKeySerializer
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def _gate_exam(self, request, exam_pk):
        return get_exam_or_response(request, exam_pk)

    def list(self, request, *args, **kwargs):
        _, err = self._gate_exam(request, self.kwargs.get('exam_pk'))
        if err:
            return err
        from ..views.curriculum_views import relink_dump_answer_key, relink_unbound_answer_key
        for answer_key in self.filter_queryset(self.get_queryset()):
            relink_dump_answer_key(answer_key)
            relink_unbound_answer_key(answer_key)
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        _, err = self._gate_exam(request, self.kwargs.get('exam_pk'))
        if err:
            return err
        return super().create(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        _, err = self._gate_exam(request, self.kwargs.get('exam_pk'))
        if err:
            return err
        from ..views.curriculum_views import relink_dump_answer_key, relink_unbound_answer_key
        obj = self.get_object()
        relink_dump_answer_key(obj)
        relink_unbound_answer_key(obj)
        return super().retrieve(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        _, err = self._gate_exam(request, self.kwargs.get('exam_pk'))
        if err:
            return err
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        exam_id = self.kwargs.get('exam_pk')
        return (
            AnswerKey.objects
            .filter(exam_id=exam_id)
            .prefetch_related(
                'items__section',
                'items__section__subject',
                'items__outcome',
                'items__outcome__topic',
                'items__sub_outcome',
            )
            .order_by('booklet')
        )

    def perform_create(self, serializer):
        exam_id = self.kwargs['exam_pk']
        serializer.save(exam_id=exam_id)

    # ── TOPLU İÇE AKTARIM ───────────────────────────────────────────────────

    @action(detail=False, methods=['post'], url_path='bulk-import')
    def bulk_import(self, request, exam_pk=None):
        """
        Toplu cevap anahtarı aktarımı.
        """
        exam, err = get_exam_or_response(request, exam_pk)
        if err:
            return err

        ser = BulkAnswerKeyImportSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        booklet = ser.validated_data.get('booklet', '')
        items_data = ser.validated_data['items']

        # Soru numarası → bölüm eşlemesi
        section_map = self._build_section_map(exam)

        try:
            with transaction.atomic():
                # Aynı sınavdaki eski eşdeğer kayıtları temizle
                # booklet '' ve 'A' birbirinin yerine kullanılabilir
                equivalent_booklets = ['', 'A'] if booklet in ('', 'A') else [booklet]
                AnswerKey.objects.filter(
                    exam=exam, booklet__in=equivalent_booklets,
                ).exclude(booklet=booklet).delete()

                # Ana cevap anahtarı (get_or_create)
                answer_key, _ = AnswerKey.objects.get_or_create(
                    exam=exam, booklet=booklet,
                    defaults={'is_primary': booklet in ('', 'A')},
                )
                # Mevcut items sil → yeniden oluştur (upsert mantığı)
                answer_key.items.all().delete()

                # B kitapçığı items'ı da topla
                b_items = []

                # Aynı question_number birden fazla gelebilir → son gelen kazanır
                unique_items = {}
                for row in items_data:
                    unique_items[row['question_number']] = row
                items_dedup = sorted(unique_items.values(), key=lambda r: r['question_number'])

                for row in items_dedup:
                    q_num = row['question_number']
                    section = self._find_section(section_map, q_num)
                    b_q = row.get('b_question_number')

                    AnswerKeyItem.objects.create(
                        answer_key=answer_key,
                        section=section,
                        question_number=q_num,
                        correct_answer=row['correct_answer'],
                        is_cancelled=row.get('is_cancelled', False),
                        outcome_id=row.get('outcome_id'),
                        sub_outcome_id=row.get('sub_outcome_id'),
                        imported_outcome_text=row.get('imported_outcome_text', ''),
                        b_question_number=b_q,
                    )
                    if b_q is not None:
                        b_items.append(b_q)

                if b_items and booklet in ('', 'A'):
                    rebuild_booklet_b_from_primary(exam)
        except Exception as e:
            logger.exception('bulk_import transaction error')
            return Response(
                {'error': f'Veritabanı hatası: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Yanıtı serialize et
        answer_key.refresh_from_db()
        result = AnswerKeySerializer(answer_key).data

        # B kitapçığı varsa onu da ekle
        b_data = None
        if b_items and booklet in ('', 'A'):
            b_key_obj = AnswerKey.objects.filter(exam=exam, booklet='B').first()
            if b_key_obj:
                b_data = AnswerKeySerializer(b_key_obj).data

        # Otomatik status geçişi: DRAFT → ANSWER_KEY_READY
        if exam.status == 'DRAFT':
            exam.status = 'ANSWER_KEY_READY'
            exam.save(update_fields=['status'])

        return Response({
            'answer_key': result,
            'b_answer_key': b_data,
            'message': f'{len(items_data)} soru başarıyla aktarıldı.',
        }, status=status.HTTP_200_OK)

    # ── KAZANIM LİSTESİ ─────────────────────────────────────────────────────

    @action(detail=False, methods=['get'], url_path='outcomes')
    def outcomes(self, request, exam_pk=None):
        """
        Sınav türüne göre filtrelenmiş kazanım ağacı.

        GET .../answer-keys/outcomes/?exam_type=YKS_TYT
        → Subject → Unit → Topic → Outcome hiyerarşisi
        """
        exam, err = get_exam_or_response(request, exam_pk)
        if err:
            return err

        from ..services.curriculum_band import (
            resolved_band, subject_matches_band, topic_display_name, topic_matches_band,
        )
        from ..views.curriculum_views import topic_is_bulk_dump

        band = resolved_band(exam)
        linked_ids = set(
            exam.sections.exclude(subject_id=None).values_list('subject_id', flat=True)
        )
        subjects = (
            Subject.objects
            .prefetch_related(
                Prefetch(
                    'topics',
                    queryset=Topic.objects.order_by('order').prefetch_related(
                        Prefetch(
                            'outcomes',
                            queryset=Outcome.objects.filter(is_active=True).order_by('order').prefetch_related(
                                Prefetch(
                                    'sub_outcomes',
                                    queryset=SubOutcome.objects.filter(is_active=True).order_by('order'),
                                ),
                            ),
                        ),
                    ),
                ),
            )
            .order_by('order', 'name')
        )

        result = []
        for subj in subjects:
            if not subject_matches_band(subj, band) and subj.id not in linked_ids:
                continue
            topics_data = []
            for topic in subj.topics.all():
                if topic_is_bulk_dump(topic):
                    continue
                if not topic_matches_band(topic, band):
                    continue
                outcomes_data = []
                for outcome in topic.outcomes.all():
                    sub_outcomes = [
                        {'id': sub.id, 'code': sub.code, 'text': sub.text}
                        for sub in outcome.sub_outcomes.all()
                    ]
                    outcomes_data.append({
                        'id': outcome.id,
                        'code': outcome.code,
                        'text': outcome.text,
                        'sub_outcomes': sub_outcomes,
                    })
                topics_data.append({
                    'id': topic.id,
                    'code': topic.code,
                    'name': topic_display_name(topic.name),
                    'outcomes': outcomes_data,
                })
            result.append({
                'id': subj.id,
                'code': subj.code,
                'name': str(subj),
                'topics': topics_data,
            })

        return Response(result)

    # ── SORU GÜNCELLE (tekil) ────────────────────────────────────────────────

    @action(detail=True, methods=['patch'], url_path='update-item')
    def update_item(self, request, exam_pk=None, pk=None):
        """
        Tekil soru güncelle (cevap, kazanım, iptal).

        PATCH .../answer-keys/{pk}/update-item/
        { "item_id": 42, "correct_answer": "C", "outcome_id": 7, "is_cancelled": false }
        """
        answer_key = self.get_object()
        item_id = request.data.get('item_id')
        try:
            item = answer_key.items.get(pk=item_id)
        except AnswerKeyItem.DoesNotExist:
            return Response({'error': 'Soru bulunamadı.'}, status=404)

        if 'correct_answer' in request.data:
            item.correct_answer = request.data['correct_answer']
        if 'outcome_id' in request.data:
            item.outcome_id = request.data['outcome_id']
            if request.data['outcome_id'] is None and 'sub_outcome_id' not in request.data:
                item.sub_outcome_id = None
        if 'sub_outcome_id' in request.data:
            item.sub_outcome_id = request.data['sub_outcome_id']
            if item.sub_outcome_id:
                try:
                    sub = SubOutcome.objects.get(pk=item.sub_outcome_id)
                    item.outcome_id = sub.outcome_id
                except SubOutcome.DoesNotExist:
                    pass
        if 'is_cancelled' in request.data:
            item.is_cancelled = request.data['is_cancelled']
        if 'imported_outcome_text' in request.data:
            item.imported_outcome_text = request.data['imported_outcome_text']
        item.save()

        return Response(AnswerKeyItemSerializer(item).data)

    @action(detail=True, methods=['patch'], url_path='bulk-update-items')
    def bulk_update_items(self, request, exam_pk=None, pk=None):
        answer_key = self.get_object()
        payload = request.data.get('items', [])
        if not isinstance(payload, list):
            return Response({'error': 'items bir liste olmalıdır.'}, status=400)

        item_ids = [row.get('item_id') for row in payload if row.get('item_id')]
        items = {
            item.id: item
            for item in answer_key.items.filter(pk__in=item_ids)
        }
        updated = 0
        with transaction.atomic():
            for row in payload:
                item = items.get(row.get('item_id'))
                if not item:
                    continue
                if 'outcome_id' in row:
                    item.outcome_id = row['outcome_id']
                    if row['outcome_id'] is None and 'sub_outcome_id' not in row:
                        item.sub_outcome_id = None
                if 'sub_outcome_id' in row:
                    item.sub_outcome_id = row['sub_outcome_id']
                    if item.sub_outcome_id:
                        try:
                            sub = SubOutcome.objects.get(pk=item.sub_outcome_id)
                            item.outcome_id = sub.outcome_id
                        except SubOutcome.DoesNotExist:
                            pass
                if 'imported_outcome_text' in row:
                    item.imported_outcome_text = row['imported_outcome_text'] or ''
                item.save()
                updated += 1
        return Response({'updated': updated})

    @action(detail=True, methods=['post'], url_path='bulk-assign-outcomes')
    def bulk_assign_outcomes(self, request, exam_pk=None, pk=None):
        from ..views.curriculum_views import _match_single_text

        answer_key = self.get_object()
        texts = request.data.get('texts', [])
        create_if_missing = bool(request.data.get('create_if_missing', False))
        if not isinstance(texts, list):
            return Response({'error': 'texts bir liste olmalıdır.'}, status=400)

        items = list(answer_key.items.select_related('section', 'section__subject').order_by('question_number'))
        if not items:
            return Response({'error': 'Cevap anahtarında soru yok.'}, status=400)

        results = []
        created_count = 0
        matched_count = 0
        with transaction.atomic():
            for idx, item in enumerate(items):
                text = str(texts[idx]).strip() if idx < len(texts) and texts[idx] else ''
                row = {
                    'item_id': item.id,
                    'question_number': item.question_number,
                    'section_id': item.section_id,
                    'section_name': item.section.name if item.section else '',
                    'input_text': text,
                    'outcome_id': None,
                    'sub_outcome_id': None,
                    'outcome_code': None,
                    'outcome_text': None,
                    'topic_name': None,
                    'match_score': 0,
                    'match_type': None,
                    'created': False,
                }
                if not text:
                    results.append(row)
                    continue
                subject = item.section.subject if item.section else None
                match = _match_single_text(text, subject) if subject else None
                if match:
                    item.outcome_id = match['outcome_id']
                    item.sub_outcome_id = match.get('sub_outcome_id')
                    item.imported_outcome_text = text
                    item.save(update_fields=['outcome_id', 'sub_outcome_id', 'imported_outcome_text'])
                    row.update({
                        'outcome_id': match['outcome_id'],
                        'sub_outcome_id': match.get('sub_outcome_id'),
                        'outcome_code': match.get('outcome_code'),
                        'outcome_text': match.get('outcome_text'),
                        'topic_name': match.get('topic_name'),
                        'match_score': match.get('match_score') or 0,
                        'match_type': match.get('match_type'),
                    })
                    matched_count += 1
                elif create_if_missing and subject:
                    from ..services.curriculum_band import topic_display_name
                    from ..views.curriculum_views import (
                        _is_dotted_code,
                        _is_heading_code,
                        _resolve_topic_for_import,
                        topic_is_bulk_dump,
                    )

                    real_topic = _resolve_topic_for_import(subject, text)
                    if real_topic is None or topic_is_bulk_dump(real_topic):
                        item.imported_outcome_text = text
                        item.save(update_fields=['imported_outcome_text'])
                        results.append(row)
                        continue
                    title = topic_display_name(real_topic.name or '') or real_topic.name
                    if _is_heading_code(text):
                        item.outcome_id = None
                        item.sub_outcome_id = None
                        item.imported_outcome_text = text
                        item.save(update_fields=['outcome_id', 'sub_outcome_id', 'imported_outcome_text'])
                        row.update({
                            'outcome_code': text.strip().rstrip('.'),
                            'outcome_text': title,
                            'topic_name': title,
                            'match_score': 100,
                            'match_type': 'topic',
                        })
                        matched_count += 1
                        results.append(row)
                        continue
                    code = text.strip().rstrip('.')
                    if not _is_dotted_code(code):
                        code = ''
                    found = (
                        real_topic.outcomes.filter(code__iexact=code).first()
                        if code else None
                    )
                    if found is None:
                        next_order = (real_topic.outcomes.count() or 0) + 1
                        found = Outcome.objects.create(
                            topic=real_topic,
                            code=code or f'{real_topic.code}.{next_order}'.strip('.'),
                            text=text,
                            order=next_order,
                        )
                        created_count += 1
                        row['created'] = True
                    item.outcome_id = found.id
                    item.sub_outcome_id = None
                    item.imported_outcome_text = text
                    item.save(update_fields=['outcome_id', 'sub_outcome_id', 'imported_outcome_text'])
                    row.update({
                        'outcome_id': found.id,
                        'sub_outcome_id': None,
                        'outcome_code': found.code,
                        'outcome_text': found.text,
                        'topic_name': title,
                        'match_score': 100,
                        'match_type': 'created' if row.get('created') else 'outcome',
                    })
                    matched_count += 1
                else:
                    item.imported_outcome_text = text
                    item.save(update_fields=['imported_outcome_text'])
                results.append(row)

        return Response({
            'matched': matched_count,
            'created': created_count,
            'total': len(items),
            'results': results,
        })

    # ── Yardımcı ─────────────────────────────────────────────────────────────

    @staticmethod
    def _build_section_map(exam: Exam) -> list[tuple[int, int, ExamSection]]:
        """
        Soru numarası aralıklarını bölümlerle eşleştir.
        Alt bölümler varsa öncelik onlardadır; alt bölümle kapsanmayan
        aralıklar için ana bölüm kullanılır.
        """
        main_sections = list(
            exam.sections.filter(is_sub_section=False).order_by('order')
        )
        sub_sections = list(
            exam.sections.filter(is_sub_section=True).order_by('question_start')
        )

        result = []
        for main in main_sections:
            # Bu ana bölümün alt bölümlerini bul
            children = [s for s in sub_sections if s.parent_section_id == main.id]
            if not children:
                # Alt bölüm yoksa ana bölümü kullan
                result.append((main.question_start, main.question_end, main))
            else:
                # Alt bölümler ile kapsanan aralıkları ekle
                for child in children:
                    result.append((child.question_start, child.question_end, child))

        # Sıralama (question_start'a göre)
        result.sort(key=lambda x: x[0])
        return result

    @staticmethod
    def _find_section(section_map: list, question_number: int, fallback_last: bool = True):
        """Soru numarasına göre hangi bölüme ait olduğunu bul."""
        for start, end, section in section_map:
            if start <= question_number <= end:
                return section
        if fallback_last and section_map:
            return section_map[-1][2]
        if not fallback_last:
            return None
        raise ValueError(f'Soru {question_number} için bölüm bulunamadı.')
