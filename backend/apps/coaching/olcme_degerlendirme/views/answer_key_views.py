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
                'items__outcome',
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
                        imported_outcome_text=row.get('imported_outcome_text', ''),
                        b_question_number=b_q,
                    )

                    # B kitapçığı soru dönüşümü
                    # b_question_number bölüm-içi (1..N) → global B pozisyonu
                    # section.question_start + b_q - 1
                    if b_q is not None and section is not None:
                        b_global = section.question_start + b_q - 1
                        b_items.append({
                            'question_number': b_global,  # B kitapçığı global pozisyonu
                            'correct_answer': row['correct_answer'],
                            'is_cancelled': row.get('is_cancelled', False),
                            'outcome_id': row.get('outcome_id'),
                            'original_question_number': q_num,
                            'section': section,
                        })

                # B kitapçığı oluştur (eğer dönüşüm verisi varsa)
                if b_items and booklet in ('', 'A'):
                    b_key, _ = AnswerKey.objects.get_or_create(
                        exam=exam, booklet='B',
                        defaults={'is_primary': False},
                    )
                    b_key.items.all().delete()

                    # Aynı global B soru numarası birden fazla A sorusuna
                    # eşlenmiş olabilir → son gelen kazanır (dict ile dedup)
                    unique_b = {}
                    for brow in b_items:
                        unique_b[brow['question_number']] = brow
                    b_items_dedup = sorted(unique_b.values(), key=lambda r: r['question_number'])

                    for brow in b_items_dedup:
                        AnswerKeyItem.objects.create(
                            answer_key=b_key,
                            section=brow['section'],
                            question_number=brow['question_number'],
                            correct_answer=brow['correct_answer'],
                            is_cancelled=brow['is_cancelled'],
                            outcome_id=brow['outcome_id'],
                        )
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
        exam_type = exam.exam_type

        subjects = Subject.objects.all().order_by('order', 'name')
        # Sınav türü filtresi
        subjects = subjects.filter(
            exam_type_filter__in=['ALL', exam_type],
        )

        result = []
        for subj in subjects:
            topics_data = []
            for topic in subj.topics.order_by('order'):
                outcomes_data = []
                for outcome in topic.outcomes.filter(is_active=True).order_by('order'):
                    sub_outcomes = list(
                        outcome.sub_outcomes
                        .filter(is_active=True)
                        .order_by('order')
                        .values('id', 'code', 'text')
                    )
                    outcomes_data.append({
                        'id': outcome.id,
                        'code': outcome.code,
                        'text': outcome.text,
                        'sub_outcomes': sub_outcomes,
                    })
                if outcomes_data:
                    topics_data.append({
                        'id': topic.id,
                        'code': topic.code,
                        'name': topic.name,
                        'outcomes': outcomes_data,
                    })
            if topics_data:
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
        if 'is_cancelled' in request.data:
            item.is_cancelled = request.data['is_cancelled']
        if 'imported_outcome_text' in request.data:
            item.imported_outcome_text = request.data['imported_outcome_text']
        item.save()

        return Response(AnswerKeyItemSerializer(item).data)

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
    def _find_section(section_map: list, question_number: int) -> ExamSection:
        """Soru numarasına göre hangi bölüme ait olduğunu bul."""
        for start, end, section in section_map:
            if start <= question_number <= end:
                return section
        # Bölüm bulunamazsa son bölümü döndür
        if section_map:
            return section_map[-1][2]
        raise ValueError(f'Soru {question_number} için bölüm bulunamadı.')
