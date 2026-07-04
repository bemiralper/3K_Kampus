"""
Müfredat (Kazanım) View'ları

CRUD İşlemleri:
  - Subject  (Ders)         → list / create / update / delete
  - Topic    (Konu)         → list / create / update / delete
  - Outcome  (Kazanım)      → list / create / update / delete
  - SubOutcome (Alt Kazanım) → list / create / update / delete

Toplu İşlemler:
  - bulk_import  → JSON formatında toplu ekleme
  - bulk_text_import → Kopyala-yapıştır metin formatında toplu ekleme

Eşleştirme:
  - match_outcomes → Girilen metinleri konu/kazanım/alt kazanım ile eşleştir

Bağlama:
  - link_subject_to_section → Dersi sınav bölümüne bağla
"""
import logging
import re
import unicodedata

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models.curriculum import Subject, Topic, Outcome, SubOutcome
from ..models.exam import ExamSection
from ..serializers.curriculum import (
    SubjectListSerializer,
    SubjectDetailSerializer,
    SubjectCreateSerializer,
    TopicSerializer,
    TopicCreateSerializer,
    OutcomeSerializer,
    OutcomeCreateSerializer,
    SubOutcomeSerializer,
    SubOutcomeCreateSerializer,
    BulkCurriculumImportSerializer,
    BulkTextImportSerializer,
)
from . import CsrfExemptSessionAuthentication

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  OTOMATİK KOD OLUŞTURMA YARDIMCILARI
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _detect_code_prefix(subject: Subject) -> str:
    """Ders kodundan sayısal prefix belirle (ör: MAT_TYT → '9', FIZ_AYT → '11' vb.)"""
    # Mevcut konulardan prefix algıla
    first_topic = subject.topics.exclude(code='').order_by('order').first()
    if first_topic and first_topic.code:
        parts = first_topic.code.split('.')
        if parts:
            return parts[0]
    # Varsayılan: '9'
    return '9'


def _next_topic_code(subject: Subject) -> str:
    """Ders altındaki bir sonraki konu kodunu hesapla (ör: 9.3)."""
    prefix = _detect_code_prefix(subject)
    existing = list(
        subject.topics.exclude(code='')
        .values_list('code', flat=True)
    )
    max_num = 0
    for code in existing:
        parts = code.split('.')
        if len(parts) >= 2:
            try:
                max_num = max(max_num, int(parts[1]))
            except ValueError:
                pass
    return f'{prefix}.{max_num + 1}'


def _next_topic_order(subject: Subject) -> int:
    """Ders altındaki bir sonraki sıra numarasını hesapla."""
    last = subject.topics.order_by('-order').first()
    return (last.order + 1) if last else 0


def _next_outcome_code(topic: Topic) -> str:
    """Konu altındaki bir sonraki kazanım kodunu hesapla (ör: 9.1.3)."""
    topic_code = topic.code or ''
    existing = list(
        topic.outcomes.exclude(code='')
        .values_list('code', flat=True)
    )
    max_num = 0
    for code in existing:
        parts = code.split('.')
        if len(parts) >= 3:
            try:
                max_num = max(max_num, int(parts[2]))
            except ValueError:
                pass
    if topic_code:
        return f'{topic_code}.{max_num + 1}'
    return ''


def _next_outcome_order(topic: Topic) -> int:
    last = topic.outcomes.order_by('-order').first()
    return (last.order + 1) if last else 0


def _next_sub_outcome_code(outcome: Outcome) -> str:
    """Kazanım altındaki bir sonraki alt kazanım kodunu hesapla (ör: 9.1.1.3)."""
    outcome_code = outcome.code or ''
    existing = list(
        outcome.sub_outcomes.exclude(code='')
        .values_list('code', flat=True)
    )
    max_num = 0
    for code in existing:
        parts = code.split('.')
        if len(parts) >= 4:
            try:
                max_num = max(max_num, int(parts[3]))
            except ValueError:
                pass
    if outcome_code:
        return f'{outcome_code}.{max_num + 1}'
    return ''


def _next_sub_outcome_order(outcome: Outcome) -> int:
    last = outcome.sub_outcomes.order_by('-order').first()
    return (last.order + 1) if last else 0


def _renumber_all_codes(subject: Subject, prefix: str | None = None):
    """
    Bir derse ait tüm konu, kazanım, alt kazanım kodlarını
    mevcut sıralarına (order) göre yeniden numaralar.

    9.1, 9.2, 9.3 ... şeklinde konular
    9.1.1, 9.1.2 ... şeklinde kazanımlar
    9.1.1.1, 9.1.1.2 ... şeklinde alt kazanımlar
    """
    if prefix is None:
        prefix = _detect_code_prefix(subject)

    topics = subject.topics.order_by('order')
    for t_idx, topic in enumerate(topics, start=1):
        new_topic_code = f'{prefix}.{t_idx}'
        topic.code = new_topic_code
        topic.order = t_idx - 1
        topic.save(update_fields=['code', 'order'])

        outcomes = topic.outcomes.order_by('order')
        for o_idx, outcome in enumerate(outcomes, start=1):
            new_outcome_code = f'{new_topic_code}.{o_idx}'
            outcome.code = new_outcome_code
            outcome.order = o_idx - 1
            outcome.save(update_fields=['code', 'order'])

            sub_outcomes = outcome.sub_outcomes.order_by('order')
            for s_idx, sub in enumerate(sub_outcomes, start=1):
                sub.code = f'{new_outcome_code}.{s_idx}'
                sub.order = s_idx - 1
                sub.save(update_fields=['code', 'order'])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SUBJECT (Ders)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET', 'POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def subject_list(request):
    """
    GET  → Ders listesi (özet)
    POST → Yeni ders oluştur
    """
    if request.method == 'GET':
        exam_type = request.query_params.get('exam_type', None)
        qs = Subject.objects.all().order_by('order', 'name')
        if exam_type:
            qs = qs.filter(exam_type_filter__in=['ALL', exam_type])
        serializer = SubjectListSerializer(qs, many=True)
        return Response(serializer.data)

    # POST
    serializer = SubjectCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    subject = serializer.save()
    return Response(
        SubjectDetailSerializer(subject).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET', 'PUT', 'DELETE'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def subject_detail(request, subject_pk):
    """
    GET    → Ders detayı (tüm konu/kazanım ağacı)
    PUT    → Ders güncelle
    DELETE → Ders sil
    """
    subject = get_object_or_404(Subject, pk=subject_pk)

    if request.method == 'GET':
        serializer = SubjectDetailSerializer(subject)
        return Response(serializer.data)

    if request.method == 'PUT':
        serializer = SubjectCreateSerializer(subject, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SubjectDetailSerializer(subject).data)

    # DELETE
    subject.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TOPIC (Konu)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET', 'POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def topic_list(request, subject_pk):
    """
    GET  → Derse ait konu listesi
    POST → Yeni konu oluştur
    """
    subject = get_object_or_404(Subject, pk=subject_pk)

    if request.method == 'GET':
        qs = subject.topics.order_by('order')
        serializer = TopicSerializer(qs, many=True)
        return Response(serializer.data)

    # POST
    data = request.data.copy()
    # Otomatik kod ve sıra ataması
    auto_code = data.get('code', '') or _next_topic_code(subject)
    auto_order = data.get('order', None)
    if auto_order is None:
        auto_order = _next_topic_order(subject)
    topic = Topic.objects.create(
        subject=subject,
        code=auto_code,
        name=data.get('name', ''),
        order=auto_order,
    )
    # Eğer kazanımlar da geldiyse (alt kazanımlarıyla birlikte)
    outcomes_data = data.get('outcomes', [])
    _create_outcomes_for_topic(topic, outcomes_data)

    serializer = TopicSerializer(topic)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'DELETE'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def topic_detail(request, subject_pk, topic_pk):
    """
    GET    → Konu detayı (kazanımlar dahil)
    PUT    → Konu güncelle
    DELETE → Konu sil
    """
    topic = get_object_or_404(Topic, pk=topic_pk, subject_id=subject_pk)

    if request.method == 'GET':
        serializer = TopicSerializer(topic)
        return Response(serializer.data)

    if request.method == 'PUT':
        data = request.data
        if 'code' in data:
            topic.code = data['code']
        if 'name' in data:
            topic.name = data['name']
        if 'order' in data:
            topic.order = data['order']
        topic.save()
        return Response(TopicSerializer(topic).data)

    # DELETE
    topic.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  OUTCOME (Kazanım)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET', 'POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def outcome_list(request, subject_pk, topic_pk):
    """
    GET  → Konuya ait kazanım listesi
    POST → Yeni kazanım oluştur
    """
    topic = get_object_or_404(Topic, pk=topic_pk, subject_id=subject_pk)

    if request.method == 'GET':
        qs = topic.outcomes.filter(is_active=True).order_by('order')
        serializer = OutcomeSerializer(qs, many=True)
        return Response(serializer.data)

    # POST
    data = request.data
    # Otomatik kod ve sıra ataması
    auto_code = data.get('code', '') or _next_outcome_code(topic)
    auto_order = data.get('order', None)
    if auto_order is None:
        auto_order = _next_outcome_order(topic)
    outcome = Outcome.objects.create(
        topic=topic,
        code=auto_code,
        text=data.get('text', ''),
        order=auto_order,
    )
    # Alt kazanımlar
    sub_outcomes_data = data.get('sub_outcomes', [])
    for idx, so_data in enumerate(sub_outcomes_data):
        SubOutcome.objects.create(
            outcome=outcome,
            code=so_data.get('code', ''),
            text=so_data.get('text', ''),
            order=so_data.get('order', idx),
        )

    serializer = OutcomeSerializer(outcome)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'DELETE'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def outcome_detail(request, subject_pk, topic_pk, outcome_pk):
    """
    GET    → Kazanım detayı (alt kazanımlar dahil)
    PUT    → Kazanım güncelle
    DELETE → Kazanım sil
    """
    outcome = get_object_or_404(
        Outcome, pk=outcome_pk, topic_id=topic_pk, topic__subject_id=subject_pk,
    )

    if request.method == 'GET':
        serializer = OutcomeSerializer(outcome)
        return Response(serializer.data)

    if request.method == 'PUT':
        data = request.data
        if 'code' in data:
            outcome.code = data['code']
        if 'text' in data:
            outcome.text = data['text']
        if 'order' in data:
            outcome.order = data['order']
        if 'is_active' in data:
            outcome.is_active = data['is_active']
        outcome.save()
        return Response(OutcomeSerializer(outcome).data)

    # DELETE
    outcome.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SUB-OUTCOME (Alt Kazanım)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def sub_outcome_create(request, subject_pk, topic_pk, outcome_pk):
    """Alt kazanım ekle."""
    outcome = get_object_or_404(
        Outcome, pk=outcome_pk, topic_id=topic_pk, topic__subject_id=subject_pk,
    )
    data = request.data
    # Otomatik kod ve sıra ataması
    auto_code = data.get('code', '') or _next_sub_outcome_code(outcome)
    auto_order = data.get('order', None)
    if auto_order is None:
        auto_order = _next_sub_outcome_order(outcome)
    sub = SubOutcome.objects.create(
        outcome=outcome,
        code=auto_code,
        text=data.get('text', ''),
        order=auto_order,
    )
    return Response(SubOutcomeSerializer(sub).data, status=status.HTTP_201_CREATED)


@api_view(['PUT', 'DELETE'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def sub_outcome_detail(request, subject_pk, topic_pk, outcome_pk, sub_outcome_pk):
    """
    PUT    → Alt kazanım güncelle
    DELETE → Alt kazanım sil
    """
    sub = get_object_or_404(
        SubOutcome,
        pk=sub_outcome_pk,
        outcome_id=outcome_pk,
        outcome__topic_id=topic_pk,
        outcome__topic__subject_id=subject_pk,
    )

    if request.method == 'PUT':
        data = request.data
        if 'code' in data:
            sub.code = data['code']
        if 'text' in data:
            sub.text = data['text']
        if 'order' in data:
            sub.order = data['order']
        if 'is_active' in data:
            sub.is_active = data['is_active']
        sub.save()
        return Response(SubOutcomeSerializer(sub).data)

    # DELETE
    sub.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TOPLU İÇE AKTARIM
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def bulk_import(request):
    """
    JSON formatında toplu müfredat içe aktarımı.

    POST /curriculum/bulk-import/
    {
      "subject_id": 1,
      "topics": [
        {
          "code": "9.1",
          "name": "MANTIK",
          "outcomes": [
            {
              "code": "9.1.1",
              "text": "Mantıksal önermeleri tanır ve değerlendirir.",
              "sub_outcomes": [
                { "code": "9.1.1.1", "text": "Önermeleri doğru/yanlış değerleri ile belirler." }
              ]
            }
          ]
        }
      ]
    }
    """
    ser = BulkCurriculumImportSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    subject_id = ser.validated_data['subject_id']
    topics_data = ser.validated_data['topics']

    try:
        subject = Subject.objects.get(pk=subject_id)
    except Subject.DoesNotExist:
        return Response(
            {'error': f'Ders bulunamadı (id={subject_id}).'},
            status=status.HTTP_404_NOT_FOUND,
        )

    stats = {'topics': 0, 'outcomes': 0, 'sub_outcomes': 0}

    try:
        with transaction.atomic():
            existing_topic_count = subject.topics.count()
            for t_idx, t_data in enumerate(topics_data):
                topic = Topic.objects.create(
                    subject=subject,
                    code=t_data.get('code', ''),
                    name=t_data['name'],
                    order=t_data.get('order', existing_topic_count + t_idx),
                )
                stats['topics'] += 1
                _create_outcomes_for_topic(topic, t_data.get('outcomes', []), stats)

    except Exception as e:
        logger.exception('Bulk curriculum import error')
        return Response(
            {'error': f'İçe aktarım hatası: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response({
        'message': (
            f"Başarıyla eklendi: {stats['topics']} konu, "
            f"{stats['outcomes']} kazanım, "
            f"{stats['sub_outcomes']} alt kazanım"
        ),
        'stats': stats,
        'subject': SubjectDetailSerializer(subject).data,
    })


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def bulk_text_import(request):
    """
    Metin formatında toplu müfredat içe aktarımı (kopyala-yapıştır).

    POST /curriculum/bulk-text-import/
    {
      "subject_id": 1,
      "text": "9.1. MANTIK\n9.1.1. Mantıksal önermeleri tanır...\n9.1.1.1 Önermeleri..."
    }

    Ayrıştırma kuralları:
      - X.Y.  → Konu  (2 parçalı numara + nokta)
      - X.Y.Z.  → Kazanım  (3 parçalı numara)
      - X.Y.Z.W  → Alt Kazanım  (4 parçalı numara)
    """
    ser = BulkTextImportSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    subject_id = ser.validated_data['subject_id']
    text = ser.validated_data['text']

    try:
        subject = Subject.objects.get(pk=subject_id)
    except Subject.DoesNotExist:
        return Response(
            {'error': f'Ders bulunamadı (id={subject_id}).'},
            status=status.HTTP_404_NOT_FOUND,
        )

    topics_data = _parse_curriculum_text(text)

    stats = {'topics': 0, 'outcomes': 0, 'sub_outcomes': 0}

    try:
        with transaction.atomic():
            existing_topic_count = subject.topics.count()
            for t_idx, t_data in enumerate(topics_data):
                topic = Topic.objects.create(
                    subject=subject,
                    code=t_data['code'],
                    name=t_data['name'],
                    order=t_data.get('order', existing_topic_count + t_idx),
                )
                stats['topics'] += 1
                _create_outcomes_for_topic(topic, t_data.get('outcomes', []), stats)

    except Exception as e:
        logger.exception('Bulk text import error')
        return Response(
            {'error': f'Metin ayrıştırma/aktarım hatası: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response({
        'message': (
            f"Başarıyla eklendi: {stats['topics']} konu, "
            f"{stats['outcomes']} kazanım, "
            f"{stats['sub_outcomes']} alt kazanım"
        ),
        'stats': stats,
        'subject': SubjectDetailSerializer(subject).data,
    })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  KONU SIRALAMA (Drag & Drop)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def reorder_topics(request, subject_pk):
    """
    Konuları yeniden sırala ve tüm kodları otomatik yeniden numarala.

    POST /curriculum/subjects/{subject_pk}/reorder-topics/
    { "topic_ids": [5, 3, 7, 1, ...] }

    topic_ids: istenen sıradaki konu ID listesi.
    Tüm konu, kazanım ve alt kazanım kodları yeni sıraya göre yeniden numaralanır.
    """
    subject = get_object_or_404(Subject, pk=subject_pk)
    topic_ids = request.data.get('topic_ids', [])

    if not topic_ids:
        return Response(
            {'error': 'topic_ids listesi gerekli.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Geçerlilik kontrolü
    existing_ids = set(subject.topics.values_list('id', flat=True))
    given_ids = set(topic_ids)
    if given_ids != existing_ids:
        return Response(
            {'error': 'topic_ids listesi mevcut konularla eşleşmiyor.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with transaction.atomic():
            # Önce order değerlerini güncelle
            for idx, tid in enumerate(topic_ids):
                Topic.objects.filter(pk=tid).update(order=idx)

            # Tüm kodları yeniden numarala
            subject.refresh_from_db()
            _renumber_all_codes(subject)

    except Exception as e:
        logger.exception('Reorder topics error')
        return Response(
            {'error': f'Sıralama hatası: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(SubjectDetailSerializer(subject).data)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DERS ↔ SINAV BÖLÜMÜ BAĞLAMA
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def link_subject_to_section(request):
    """
    Dersi sınav bölümüne bağla.

    POST /curriculum/link-section/
    { "subject_id": 1, "section_id": 5 }
    """
    subject_id = request.data.get('subject_id')
    section_id = request.data.get('section_id')

    subject = get_object_or_404(Subject, pk=subject_id)
    section = get_object_or_404(ExamSection, pk=section_id)

    section.subject = subject
    section.save(update_fields=['subject'])

    return Response({
        'message': f'"{subject.name}" dersi "{section}" bölümüne bağlandı.',
        'section_id': section.id,
        'subject_id': subject.id,
    })


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def unlink_subject_from_section(request):
    """
    Sınav bölümünden ders bağlantısını kaldır.

    POST /curriculum/unlink-section/
    { "section_id": 5 }
    """
    section_id = request.data.get('section_id')
    section = get_object_or_404(ExamSection, pk=section_id)

    old_subject = section.subject
    section.subject = None
    section.save(update_fields=['subject'])

    return Response({
        'message': f'"{section}" bölümünden ders bağlantısı kaldırıldı.',
        'section_id': section.id,
        'old_subject': str(old_subject) if old_subject else None,
    })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  YARDIMCI FONKSİYONLAR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _create_outcomes_for_topic(topic, outcomes_data, stats=None):
    """Kazanım ve alt kazanımları toplu oluştur."""
    for o_idx, o_data in enumerate(outcomes_data):
        outcome = Outcome.objects.create(
            topic=topic,
            code=o_data.get('code', ''),
            text=o_data.get('text', ''),
            order=o_data.get('order', o_idx),
        )
        if stats:
            stats['outcomes'] += 1

        sub_outcomes_data = o_data.get('sub_outcomes', [])
        for s_idx, s_data in enumerate(sub_outcomes_data):
            SubOutcome.objects.create(
                outcome=outcome,
                code=s_data.get('code', ''),
                text=s_data.get('text', ''),
                order=s_data.get('order', s_idx),
            )
            if stats:
                stats['sub_outcomes'] += 1


def _parse_curriculum_text(text: str) -> list[dict]:
    """
    Metin formatındaki müfredatı yapılandırılmış veriye dönüştürür.

    Ayrıştırma kuralları:
      - Satır "X.Y." ile başlıyorsa → Konu (ör: 9.1. MANTIK)
      - Satır "X.Y.Z." ile başlıyorsa → Kazanım (ör: 9.1.1. Mantıksal önermeleri...)
      - Satır "X.Y.Z.W" ile başlıyorsa → Alt Kazanım (ör: 9.1.1.1 Önermeleri...)
      - Büyük harfle başlayan ama numara olmayan satırlar → Konu başlığı olabilir

    Kodlama desenleri:
      Konu:        \d+\.\d+\.?\s
      Kazanım:     \d+\.\d+\.\d+\.?\s
      Alt Kazanım: \d+\.\d+\.\d+\.\d+\s
    """
    lines = text.strip().split('\n')
    topics = []
    current_topic = None
    current_outcome = None

    # Regex desenleri
    # Konu: 9.2. KÜMELER veya 9.2 KÜMELER
    topic_pattern = re.compile(
        r'^\s*(\d+\.\d+)\.?\s+(.+)$'
    )
    # Kazanım: 9.2.1. Küme kavramını...
    outcome_pattern = re.compile(
        r'^\s*(\d+\.\d+\.\d+)\.?\s+(.+)$'
    )
    # Alt Kazanım: 9.2.1.1 Küme elemanlarını...
    sub_outcome_pattern = re.compile(
        r'^\s*(\d+\.\d+\.\d+\.\d+)\s+(.+)$'
    )
    # Başlık satırı (büyük harf, numarasız) — ör: "RUTİN OLMAYAN PROBLEMLER"
    heading_pattern = re.compile(r'^\s*[A-ZÇĞİÖŞÜ\s–\-]+$')

    pending_heading = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Alt kazanım mı? (4 parçalı numara)
        m_sub = sub_outcome_pattern.match(line)
        if m_sub:
            code = m_sub.group(1)
            text_val = m_sub.group(2).strip()
            if current_outcome is not None:
                current_outcome['sub_outcomes'].append({
                    'code': code,
                    'text': text_val,
                })
            continue

        # Kazanım mı? (3 parçalı numara)
        m_out = outcome_pattern.match(line)
        if m_out:
            code = m_out.group(1)
            text_val = m_out.group(2).strip()
            current_outcome = {
                'code': code,
                'text': text_val,
                'sub_outcomes': [],
            }
            if current_topic is not None:
                current_topic['outcomes'].append(current_outcome)
            continue

        # Konu mu? (2 parçalı numara)
        m_topic = topic_pattern.match(line)
        if m_topic:
            code = m_topic.group(1)
            name = m_topic.group(2).strip()
            current_topic = {
                'code': code,
                'name': name,
                'outcomes': [],
            }
            current_outcome = None
            topics.append(current_topic)
            pending_heading = None
            continue

        # Numarasız büyük harf başlığı (ör: "RUTİN OLMAYAN PROBLEMLER")
        if heading_pattern.match(line):
            pending_heading = line
            continue

        # Hiçbirine uymayan satır — önceki heading varsa konu başlığı olarak kullan
        if pending_heading and not current_topic:
            # Tek başına heading → konu başlığı olarak oluştur
            current_topic = {
                'code': '',
                'name': pending_heading,
                'outcomes': [],
            }
            current_outcome = None
            topics.append(current_topic)
            pending_heading = None

    return topics


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  KAZANIM EŞLEŞTİRME
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ── Türkçe metin normalizasyonu ──────────────────────────────────────────────

_TR_MAP = str.maketrans({
    'ç': 'c', 'Ç': 'c',
    'ğ': 'g', 'Ğ': 'g',
    'ı': 'i', 'I': 'i',
    'İ': 'i',
    'ö': 'o', 'Ö': 'o',
    'ş': 's', 'Ş': 's',
    'ü': 'u', 'Ü': 'u',
    'â': 'a', 'Â': 'a',
    'î': 'i', 'Î': 'i',
    'û': 'u', 'Û': 'u',
})

_STOP_WORDS = frozenset({
    've', 'ile', 'icin', 'bir', 'de', 'da', 'den', 'dan',
    'ki', 'mi', 'mu', 'nin', 'nun', 'ya', 'ye',
    'bu', 'su', 'o', 'her', 'en', 'daha', 'cok',
})

# Yaygın Türkçe çoğul/hal ekleri (basit stemming için, uzundan kısaya sıralı)
_TR_SUFFIXES = [
    'liklari', 'luklari', 'likleri', 'lukleri',  # çoğul isim yapım
    'larini', 'lerini', 'larina', 'lerine',       # çoğul belirtme/yönelme
    'lari', 'leri', 'lar', 'ler',                 # çoğul
    'ndan', 'nden', 'nda', 'nde',                 # bulunma/ayrılma
    'dan', 'den',                                  # ayrılma
    'daki', 'deki',                                # sıfat eki
    'ini', 'unu', 'inu',                           # belirtme
    'nin', 'nun',                                  # genitif
    'na', 'ne',                                    # yönelme
    'yi', 'yu',                                    # belirtme
    'si', 'su',                                    # iyelik
    'dir', 'dur',                                  # bildirme
    'sel', 'sal',                                  # sıfat yapım
]


def _normalize_turkish(text: str) -> str:
    """Türkçe metni normalize et: küçük harf + ASCII benzeri + noktalama temizle."""
    s = text.lower().translate(_TR_MAP)
    # NFD normalizasyonu ile aksan/diyakritik işaretlerini kaldır
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    # Noktalama ve özel karakterleri boşlukla değiştir
    s = re.sub(r'[^\w\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def _simple_stem(word: str) -> str:
    """Basit Türkçe stemming: en uzun eşleşen eki kaldır (min 4 karakter kök)."""
    for suffix in _TR_SUFFIXES:  # zaten uzundan kısaya sıralı
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[:-len(suffix)]
    return word


def _extract_keywords(text: str) -> set:
    """Metinden anahtar kelimeleri çıkar (stop words hariç, 2+ karakter)."""
    words = _normalize_turkish(text).split()
    return {w for w in words if w not in _STOP_WORDS and len(w) > 2}


def _extract_stems(text: str) -> set:
    """Metinden kelime köklerini çıkar."""
    keywords = _extract_keywords(text)
    return {_simple_stem(w) for w in keywords}


def _keyword_score(input_keywords: set, target_keywords: set) -> float:
    """İki kelime seti arasındaki benzerlik skoru (0.0 - 1.0).
    Hem tam kelime hem de kök eşleşmesini dikkate alır."""
    if not input_keywords or not target_keywords:
        return 0.0
    
    # Önce tam kelime eşleşmesi
    common = input_keywords & target_keywords
    if common:
        union = input_keywords | target_keywords
        return len(common) / len(union)
    
    # Kök eşleşmesi dene
    input_stems = {_simple_stem(w) for w in input_keywords}
    target_stems = {_simple_stem(w) for w in target_keywords}
    common_stems = input_stems & target_stems
    if common_stems:
        union_stems = input_stems | target_stems
        return len(common_stems) / len(union_stems) * 0.85  # Kök eşleşmesi biraz düşük
    
    return 0.0


def _partial_keyword_score(input_keywords: set, target_keywords: set) -> float:
    """Kısmi kelime eşleşme skoru — kelimelerin başlangıçları eşleşiyor mu?"""
    if not input_keywords or not target_keywords:
        return 0.0
    matches = 0
    for ik in input_keywords:
        for tk in target_keywords:
            # Kelime başı eşleşme (min 3 karakter)
            min_len = min(len(ik), len(tk))
            if min_len >= 3 and (ik.startswith(tk[:3]) or tk.startswith(ik[:3])):
                # Daha uzun eşleşme daha iyi
                common_prefix = 0
                for i in range(min_len):
                    if ik[i] == tk[i]:
                        common_prefix += 1
                    else:
                        break
                if common_prefix >= 3:
                    matches += common_prefix / max(len(ik), len(tk))
                    break
    return matches / max(len(input_keywords), len(target_keywords))


def _match_single_text(query: str, subject: Subject):
    """
    Tek bir metin girdisini Subject'in tüm konu/kazanım/alt kazanımlarıyla eşleştir.
    
    Arama sırası:
      1. Outcome code ile tam eşleşme (en yüksek öncelik)
      2. Alt kazanım text ile eşleşme
      3. Kazanım text ile eşleşme
      4. Konu başlığı ile eşleşme → konunun son kazanımını ata
    
    Birden fazla eşleşme → en yüksek skorlu, eşit skorda en son (order) kazanım.
    
    Returns: dict { outcome_id, outcome_code, outcome_text, topic_name, match_score, match_type }
    """
    query_stripped = query.strip()
    if not query_stripped:
        return None

    query_lower = query_stripped.lower()
    query_norm = _normalize_turkish(query_stripped)
    query_kw = _extract_keywords(query_stripped)
    query_stems = _extract_stems(query_stripped)

    topics = Topic.objects.filter(subject=subject).order_by('order')
    
    candidates = []  # [(score, order_key, outcome, match_type)]
    
    for topic in topics:
        topic_norm = _normalize_turkish(topic.name)
        topic_kw = _extract_keywords(topic.name)
        
        outcomes = Outcome.objects.filter(topic=topic).order_by('order')
        
        # ── 1. Konu başlığı eşleşmesi ──
        # Konu başlığı eşleşirse → o konunun son kazanımını ata
        topic_score = 0
        
        # Tam eşleşme
        if query_norm == topic_norm:
            topic_score = 85
        else:
            # Kelime bazlı eşleşme (tam + kök)
            kw_score = _keyword_score(query_kw, topic_kw)
            if kw_score > 0:
                topic_score = max(topic_score, int(kw_score * 80))
            
            # Kök bazlı ek kontrol — çift yönlü kapsama oranı (F1 benzeri)
            topic_stems = _extract_stems(topic.name)
            common_stems = query_stems & topic_stems
            if common_stems and topic_stems and query_stems:
                # Precision: sorgu köklerinin ne kadarı konu köklerinde var?
                precision = len(common_stems) / len(query_stems)
                # Recall: konu köklerinin ne kadarı sorgu köklerinde var?
                recall = len(common_stems) / len(topic_stems)
                # F1 skoru (harmonic mean)
                if precision + recall > 0:
                    f1 = 2 * precision * recall / (precision + recall)
                    topic_score = max(topic_score, int(f1 * 80))
            
            # Kısmi kelime eşleşme
            partial = _partial_keyword_score(query_kw, topic_kw)
            if partial > 0:
                topic_score = max(topic_score, int(partial * 70))
            
            # İçerme kontrolü (normalize edilmiş)
            if query_norm in topic_norm or topic_norm in query_norm:
                overlap = min(len(query_norm), len(topic_norm)) / max(len(query_norm), len(topic_norm))
                topic_score = max(topic_score, int(overlap * 80))
        
        if topic_score >= 30 and outcomes.exists():
            # Konu eşleşmesi → konunun SON kazanımını ata
            last_outcome = outcomes.last()
            candidates.append((
                topic_score,
                (topic.order, last_outcome.order),
                last_outcome,
                'topic',
            ))
        
        # ── 2. Kazanım eşleşmesi ──
        for outcome in outcomes:
            outcome_code_lower = outcome.code.lower()
            outcome_norm = _normalize_turkish(outcome.text)
            outcome_kw = _extract_keywords(outcome.text)
            
            out_score = 0
            match_type = 'outcome'
            
            # Code tam eşleşme
            if query_lower == outcome_code_lower:
                out_score = 100
            elif query_lower.replace('.', '') == outcome_code_lower.replace('.', ''):
                out_score = 98
            # Text tam eşleşme (normalize)
            elif query_norm == outcome_norm:
                out_score = 95
            else:
                # Code kısmi eşleşme
                if outcome_code_lower in query_lower or query_lower in outcome_code_lower:
                    out_score = max(out_score, 75)
                
                # Kelime bazlı eşleşme (tam + kök)
                kw_score = _keyword_score(query_kw, outcome_kw)
                if kw_score > 0:
                    out_score = max(out_score, int(kw_score * 90))
                
                # Kök bazlı kapsama
                outcome_stems = _extract_stems(outcome.text)
                common_stems = query_stems & outcome_stems
                if common_stems and outcome_stems:
                    coverage = len(common_stems) / len(outcome_stems)
                    out_score = max(out_score, int(coverage * 85))
                
                # Kısmi kelime eşleşme
                partial = _partial_keyword_score(query_kw, outcome_kw)
                if partial > 0:
                    out_score = max(out_score, int(partial * 75))
                
                # İçerme kontrolü
                if query_norm in outcome_norm:
                    overlap = len(query_norm) / len(outcome_norm) if outcome_norm else 0
                    out_score = max(out_score, int(overlap * 85))
                elif outcome_norm in query_norm:
                    overlap = len(outcome_norm) / len(query_norm) if query_norm else 0
                    out_score = max(out_score, int(overlap * 80))
            
            if out_score >= 30:
                candidates.append((
                    out_score,
                    (topic.order, outcome.order),
                    outcome,
                    match_type,
                ))
            
            # ── 3. Alt kazanım eşleşmesi ──
            sub_outcomes = SubOutcome.objects.filter(outcome=outcome).order_by('order')
            for sub in sub_outcomes:
                sub_code_lower = sub.code.lower()
                sub_norm = _normalize_turkish(sub.text)
                sub_kw = _extract_keywords(sub.text)
                
                sub_score = 0
                
                # Code tam eşleşme
                if query_lower == sub_code_lower:
                    sub_score = 100
                elif query_lower.replace('.', '') == sub_code_lower.replace('.', ''):
                    sub_score = 98
                # Text tam eşleşme
                elif query_norm == sub_norm:
                    sub_score = 95
                else:
                    # Kelime bazlı (tam + kök)
                    kw_score = _keyword_score(query_kw, sub_kw)
                    if kw_score > 0:
                        sub_score = max(sub_score, int(kw_score * 90))
                    
                    # Kök bazlı kapsama
                    sub_stems = _extract_stems(sub.text)
                    common_stems = query_stems & sub_stems
                    if common_stems and sub_stems:
                        coverage = len(common_stems) / len(sub_stems)
                        sub_score = max(sub_score, int(coverage * 85))
                    
                    # Kısmi kelime
                    partial = _partial_keyword_score(query_kw, sub_kw)
                    if partial > 0:
                        sub_score = max(sub_score, int(partial * 75))
                    
                    # İçerme
                    if query_norm in sub_norm:
                        overlap = len(query_norm) / len(sub_norm) if sub_norm else 0
                        sub_score = max(sub_score, int(overlap * 85))
                    elif sub_norm in query_norm:
                        overlap = len(sub_norm) / len(query_norm) if query_norm else 0
                        sub_score = max(sub_score, int(overlap * 80))
                
                if sub_score >= 30:
                    # Alt kazanım eşleşmesi → üst outcome'a ata
                    candidates.append((
                        sub_score,
                        (topic.order, outcome.order),
                        outcome,
                        'sub_outcome',
                    ))
    
    if not candidates:
        return None
    
    # Eşleşme tipi önceliği: sub_outcome > outcome > topic (spesifik > genel)
    _type_priority = {'sub_outcome': 2, 'outcome': 1, 'topic': 0}
    
    # Sıralama: skor (büyük), tip önceliği (büyük), order_key (büyük → en son kazanım)
    candidates.sort(
        key=lambda c: (c[0], _type_priority.get(c[3], 0), c[1]),
        reverse=True,
    )
    best_score, _, best_outcome, match_type = candidates[0]
    
    # Konu adını bul
    topic_name = ''
    try:
        topic_name = best_outcome.topic.name
    except Exception:
        pass
    
    return {
        'outcome_id': best_outcome.id,
        'outcome_code': best_outcome.code,
        'outcome_text': best_outcome.text,
        'topic_name': topic_name,
        'match_score': best_score,
        'match_type': match_type,  # 'topic' | 'outcome' | 'sub_outcome'
    }


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def match_outcomes(request, subject_pk):
    """
    Toplu kazanım eşleştirme.
    
    POST /curriculum/subjects/<subject_pk>/match-outcomes/
    Body: { "texts": ["Sayı Problemleri", "Mutlak Değer", ...] }
    
    Response: {
      "results": [
        {
          "input_text": "Sayı Problemleri",
          "outcome_id": 42,
          "outcome_code": "9.15.1",
          "outcome_text": "Sayı ve kesir problemlerini çözer.",
          "topic_name": "SAYI VE KESİR PROBLEMLERİ",
          "match_score": 85,
          "match_type": "topic"
        },
        {
          "input_text": "Bilinmeyen Konu",
          "outcome_id": null,
          "outcome_code": null,
          "outcome_text": null,
          "topic_name": null,
          "match_score": 0,
          "match_type": null
        }
      ]
    }
    """
    subject = get_object_or_404(Subject, pk=subject_pk)
    texts = request.data.get('texts', [])
    
    if not isinstance(texts, list):
        return Response(
            {'error': 'texts alanı bir liste olmalıdır.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    results = []
    for text in texts:
        text_str = str(text).strip() if text else ''
        if not text_str:
            results.append({
                'input_text': text_str,
                'outcome_id': None,
                'outcome_code': None,
                'outcome_text': None,
                'topic_name': None,
                'match_score': 0,
                'match_type': None,
            })
            continue
        
        match = _match_single_text(text_str, subject)
        if match:
            results.append({
                'input_text': text_str,
                **match,
            })
        else:
            results.append({
                'input_text': text_str,
                'outcome_id': None,
                'outcome_code': None,
                'outcome_text': None,
                'topic_name': None,
                'match_score': 0,
                'match_type': None,
            })
    
    return Response({'results': results})
