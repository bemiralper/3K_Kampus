"""
Müfredat Serializer'ları (Ders / Konu / Kazanım / Alt Kazanım)

Hiyerarşi:
  Subject → Topic → Outcome → SubOutcome
"""
from rest_framework import serializers
from ..models.curriculum import Subject, Topic, Outcome, SubOutcome


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SUB-OUTCOME
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class SubOutcomeSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubOutcome
        fields = ['id', 'outcome', 'code', 'text', 'order', 'is_active']
        read_only_fields = ['id']


class SubOutcomeCreateSerializer(serializers.Serializer):
    """Tek alt kazanım ekleme."""
    code = serializers.CharField(max_length=50, required=False, default='')
    text = serializers.CharField()
    order = serializers.IntegerField(required=False, default=0)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  OUTCOME
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class OutcomeSerializer(serializers.ModelSerializer):
    sub_outcomes = SubOutcomeSerializer(many=True, read_only=True)
    sub_outcome_count = serializers.SerializerMethodField()

    class Meta:
        model = Outcome
        fields = [
            'id', 'topic', 'code', 'text', 'order', 'is_active',
            'sub_outcomes', 'sub_outcome_count',
        ]
        read_only_fields = ['id']

    def get_sub_outcome_count(self, obj):
        cache = getattr(obj, '_prefetched_objects_cache', None)
        if cache and 'sub_outcomes' in cache:
            return len(obj.sub_outcomes.all())
        return obj.sub_outcomes.filter(is_active=True).count()


class OutcomeCreateSerializer(serializers.Serializer):
    """Tek kazanım ekleme (alt kazanımlarıyla birlikte)."""
    code = serializers.CharField(max_length=50, required=False, default='')
    text = serializers.CharField()
    order = serializers.IntegerField(required=False, default=0)
    sub_outcomes = SubOutcomeCreateSerializer(many=True, required=False, default=[])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TOPIC
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class TopicSerializer(serializers.ModelSerializer):
    outcomes = OutcomeSerializer(many=True, read_only=True)
    outcome_count = serializers.SerializerMethodField()

    class Meta:
        model = Topic
        fields = [
            'id', 'subject', 'code', 'name', 'order',
            'outcomes', 'outcome_count',
        ]
        read_only_fields = ['id']

    def get_outcome_count(self, obj):
        cache = getattr(obj, '_prefetched_objects_cache', None)
        if cache and 'outcomes' in cache:
            return len(obj.outcomes.all())
        return obj.outcomes.filter(is_active=True).count()


class TopicCreateSerializer(serializers.Serializer):
    """Tek konu ekleme (kazanımlar ve alt kazanımlarıyla)."""
    code = serializers.CharField(max_length=30, required=False, default='')
    name = serializers.CharField(max_length=200)
    order = serializers.IntegerField(required=False, default=0)
    outcomes = OutcomeCreateSerializer(many=True, required=False, default=[])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SUBJECT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class SubjectListSerializer(serializers.ModelSerializer):
    """Ders listesi — özet."""
    topic_count = serializers.SerializerMethodField()
    outcome_count = serializers.SerializerMethodField()
    linked_sections = serializers.SerializerMethodField()

    class Meta:
        model = Subject
        fields = [
            'id', 'code', 'name', 'display_name',
            'exam_type_filter', 'order',
            'topic_count', 'outcome_count', 'linked_sections',
        ]

    def get_topic_count(self, obj):
        value = getattr(obj, 'topic_count', None)
        if isinstance(value, int):
            return value
        return obj.topics.count()

    def get_outcome_count(self, obj):
        value = getattr(obj, 'outcome_count', None)
        if isinstance(value, int):
            return value
        return Outcome.objects.filter(topic__subject=obj, is_active=True).count()

    def get_linked_sections(self, obj):
        """Bu derse bağlı sınav bölümlerini döndürür."""
        cache = getattr(obj, '_prefetched_objects_cache', None)
        if cache and 'exam_sections' in cache:
            sections = list(obj.exam_sections.all())[:5]
        else:
            from ..models.exam import ExamSection
            sections = list(
                ExamSection.objects.filter(subject=obj)
                .select_related('exam').order_by('-exam__exam_date')[:5]
            )
        return [
            {
                'id': s.id,
                'exam_name': s.exam.name,
                'section_name': s.name,
            }
            for s in sections
        ]


class SubjectDetailSerializer(serializers.ModelSerializer):
    """Ders detayı — topic → outcome → sub_outcome ağacı dahil."""
    topics = TopicSerializer(many=True, read_only=True)
    topic_count = serializers.SerializerMethodField()
    total_outcomes = serializers.SerializerMethodField()
    total_sub_outcomes = serializers.SerializerMethodField()
    linked_sections = serializers.SerializerMethodField()

    class Meta:
        model = Subject
        fields = [
            'id', 'code', 'name', 'display_name',
            'exam_type_filter', 'order',
            'topics', 'topic_count',
            'total_outcomes', 'total_sub_outcomes',
            'linked_sections',
        ]

    def get_topic_count(self, obj):
        value = getattr(obj, 'topic_count', None)
        if isinstance(value, int):
            return value
        cache = getattr(obj, '_prefetched_objects_cache', None)
        if cache and 'topics' in cache:
            return len(obj.topics.all())
        return obj.topics.count()

    def get_total_outcomes(self, obj):
        cache = getattr(obj, '_prefetched_objects_cache', None)
        if cache and 'topics' in cache:
            return sum(len(topic.outcomes.all()) for topic in obj.topics.all())
        return Outcome.objects.filter(
            topic__subject=obj, is_active=True,
        ).count()

    def get_total_sub_outcomes(self, obj):
        cache = getattr(obj, '_prefetched_objects_cache', None)
        if cache and 'topics' in cache:
            return sum(
                len(outcome.sub_outcomes.all())
                for topic in obj.topics.all()
                for outcome in topic.outcomes.all()
            )
        return SubOutcome.objects.filter(
            outcome__topic__subject=obj, is_active=True,
        ).count()

    def get_linked_sections(self, obj):
        """Bu derse bağlı sınav bölümlerini döndürür."""
        cache = getattr(obj, '_prefetched_objects_cache', None)
        if cache and 'exam_sections' in cache:
            sections = list(obj.exam_sections.all())[:5]
        else:
            from ..models.exam import ExamSection
            sections = list(
                ExamSection.objects.filter(subject=obj)
                .select_related('exam').order_by('-exam__exam_date')[:5]
            )
        return [
            {
                'id': s.id,
                'exam_name': s.exam.name,
                'section_name': s.name,
            }
            for s in sections
        ]


class SubjectCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['code', 'name', 'display_name', 'exam_type_filter', 'order']


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  BULK (Toplu İçe Aktarım)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class BulkCurriculumImportSerializer(serializers.Serializer):
    """
    Toplu müfredat içe aktarımı — Yapıştır ile toplu ekleme.

    Beklenen format:
    {
      "subject_id": 1,           # Mevcut derse ekle
      "topics": [
        {
          "code": "9.1",
          "name": "MANTIK",
          "outcomes": [
            {
              "code": "9.1.1",
              "text": "Mantıksal önermeleri tanır ...",
              "sub_outcomes": [
                { "code": "9.1.1.1", "text": "..." },
                ...
              ]
            }
          ]
        }
      ]
    }
    """
    subject_id = serializers.IntegerField()
    topics = TopicCreateSerializer(many=True)


class BulkTextImportSerializer(serializers.Serializer):
    """
    Metin tabanlı toplu içe aktarım — kopyala-yapıştır ile.
    Kullanıcı doğrudan MEB kazanım metnini yapıştırır.
    """
    subject_id = serializers.IntegerField()
    text = serializers.CharField(
        help_text='Yapıştırılan kazanım metni. Satır satır ayrıştırılır.',
    )
