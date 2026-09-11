"""
Cevap Anahtarı Serializer'ları

AnswerKeySerializer         → Cevap anahtarı başlık CRUD
AnswerKeyItemSerializer     → Tekil soru cevabı
BulkAnswerKeyImportSerializer → Toplu içe aktarma (sütun yapıştır + Excel)
"""
from rest_framework import serializers
from ..models import AnswerKey, AnswerKeyItem


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ITEM
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class AnswerKeyItemSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source='section.name', read_only=True)
    outcome_code = serializers.SerializerMethodField()
    outcome_text = serializers.SerializerMethodField()
    topic_name = serializers.SerializerMethodField()

    class Meta:
        model = AnswerKeyItem
        fields = [
            'id', 'question_number', 'correct_answer',
            'is_cancelled', 'section', 'section_name',
            'outcome', 'sub_outcome',
            'outcome_code', 'outcome_text', 'topic_name',
            'imported_outcome_text',
            'b_question_number',
        ]
        read_only_fields = ['id']

    def _topic_title(self, obj):
        """Satırın konu başlığı — kazanım bağı yoksa girilen koddan çözülür.

        Konu taraması ders başına bir kez yapılır: 120 soruluk anahtarda her
        satır için ayrı tarama yapmak sekmeyi gözle görülür biçimde yavaşlatır.
        """
        from ..services.curriculum_band import topic_display_name
        from ..views.curriculum_views import (
            _resolve_topic_for_import,
            topic_is_bulk_dump,
        )

        topic = getattr(getattr(obj, 'outcome', None), 'topic', None)
        if topic and not topic_is_bulk_dump(topic):
            return topic_display_name(topic.name or '')

        text = (obj.imported_outcome_text or obj.display_outcome_code() or '').strip()
        subject = getattr(getattr(obj, 'section', None), 'subject', None)
        if subject and not subject.topics.exists():
            from ..services.exam_templates import _resolve_curriculum_subject
            code = getattr(subject, 'code', '') or ''
            subject = _resolve_curriculum_subject(
                code, getattr(subject, 'name', '') or '', 'YKS_TYT',
            )
        if not text or not subject:
            return ''

        cache = getattr(self, '_topic_title_cache', None)
        if cache is None:
            cache = self._topic_title_cache = {}
        key = (subject.id, text.lower())
        if key not in cache:
            resolved = _resolve_topic_for_import(subject, text)
            cache[key] = (
                topic_display_name(resolved.name or '')
                if resolved and not topic_is_bulk_dump(resolved)
                else ''
            )
        return cache[key]

    def get_outcome_code(self, obj):
        return obj.display_outcome_code()

    def get_outcome_text(self, obj):
        text = obj.display_outcome_text()
        if text:
            return text
        # Başlık kodu (21.5) bilerek bir kazanıma bağlanmaz; açıklaması konu
        # başlığıdır. Boş dönersek satır "Kazanım atanmamış" görünüyordu.
        if obj.is_heading_row():
            return self._topic_title(obj)
        return ''

    def get_topic_name(self, obj):
        return self._topic_title(obj)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ANSWER KEY (başlık + items nested)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class AnswerKeySerializer(serializers.ModelSerializer):
    items = AnswerKeyItemSerializer(many=True, read_only=True)
    booklet_display = serializers.CharField(
        source='get_booklet_display', read_only=True,
    )

    class Meta:
        model = AnswerKey
        fields = [
            'id', 'exam', 'booklet', 'booklet_display',
            'is_primary', 'items',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  BULK IMPORT — Sütun yapıştır / Excel toplu aktarım
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class BulkAnswerKeyItemRow(serializers.Serializer):
    """Tek bir soru satırı."""
    question_number = serializers.IntegerField(min_value=1)
    # '' → doğru cevabı henüz girilmemiş satır (yalnız kazanım işaretlenmiş
    # olabilir). Skorlamada bu sorular değerlendirme dışı bırakılır.
    correct_answer  = serializers.ChoiceField(
        choices=['', 'A', 'B', 'C', 'D', 'E', 'EMPTY', 'INVALID'],
        allow_blank=True,
    )
    is_cancelled    = serializers.BooleanField(default=False)
    outcome_id      = serializers.IntegerField(required=False, allow_null=True, default=None)
    sub_outcome_id  = serializers.IntegerField(required=False, allow_null=True, default=None)
    imported_outcome_text = serializers.CharField(
        required=False, allow_blank=True, default='',
        help_text='Cevap anahtarı import edilirken yapıştırılan orijinal kazanım kodu veya metni',
    )
    # B kitapçığı dönüşümü
    b_question_number = serializers.IntegerField(
        required=False, allow_null=True, default=None,
        help_text='B kitapçığında bu sorunun karşılık geldiği soru numarası',
    )


class BulkAnswerKeyImportSerializer(serializers.Serializer):
    """
    Toplu cevap anahtarı aktarımı.

    İki senaryo:
    1. Sadece A (veya kitapçıksız) → items gönder
    2. A + B kitapçığı → items içinde b_question_number da gönder
       → B kitapçığı otomatik oluşturulur

    Gelen veri:
    {
      "booklet": "A",        // veya ""
      "items": [
        { "question_number": 1, "correct_answer": "B", "outcome_id": 42, "b_question_number": 5 },
        { "question_number": 2, "correct_answer": "A", "outcome_id": null, "b_question_number": 3 },
        ...
      ]
    }
    """
    booklet = serializers.ChoiceField(
        choices=['', 'A', 'B', 'C', 'D'],
        default='',
        required=False,
    )
    items = BulkAnswerKeyItemRow(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('En az bir soru gönderilmeli.')
        # soru numarası tekrarı kontrolü
        nums = [r['question_number'] for r in value]
        if len(nums) != len(set(nums)):
            raise serializers.ValidationError('Soru numaraları tekrarsız olmalıdır.')
        return value
