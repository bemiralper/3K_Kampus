"""
Cevap Anahtarı Serializer'ları

AnswerKeySerializer         → Cevap anahtarı başlık CRUD
AnswerKeyItemSerializer     → Tekil soru cevabı
BulkAnswerKeyImportSerializer → Toplu içe aktarma (sütun yapıştır + Excel)
"""
from rest_framework import serializers
from ..models import AnswerKey, AnswerKeyItem, ExamSection, Outcome


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ITEM
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class AnswerKeyItemSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source='section.name', read_only=True)
    outcome_code = serializers.CharField(source='outcome.code', read_only=True, default='')
    outcome_text = serializers.CharField(source='outcome.text', read_only=True, default='')

    class Meta:
        model = AnswerKeyItem
        fields = [
            'id', 'question_number', 'correct_answer',
            'is_cancelled', 'section', 'section_name',
            'outcome', 'outcome_code', 'outcome_text',
            'imported_outcome_text',
            'b_question_number',
        ]
        read_only_fields = ['id']


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
    correct_answer  = serializers.ChoiceField(
        choices=['A', 'B', 'C', 'D', 'E', 'EMPTY', 'INVALID'],
    )
    is_cancelled    = serializers.BooleanField(default=False)
    outcome_id      = serializers.IntegerField(required=False, allow_null=True, default=None)
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
