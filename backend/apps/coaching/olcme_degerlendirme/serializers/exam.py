"""
Ölçme & Değerlendirme — Serializers
"""
from rest_framework import serializers
from ..models import Exam, ExamSection, ExamSessionModel
from ..services.exam_templates import (
    create_sections_from_template,
    get_default_duration,
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SECTION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ExamSectionSerializer(serializers.ModelSerializer):
    sub_sections = serializers.SerializerMethodField()

    class Meta:
        model = ExamSection
        fields = [
            'id', 'name', 'order',
            'question_start', 'question_end', 'question_count',
            'is_sub_section', 'parent_section', 'subject',
            'sub_sections',
        ]

    def get_sub_sections(self, obj):
        if obj.is_sub_section:
            return []
        children = obj.sub_sections.all().order_by('order')
        return ExamSectionSerializer(children, many=True).data


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SESSION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ExamSessionSerializer(serializers.ModelSerializer):
    question_count = serializers.IntegerField(read_only=True)
    section_ids = serializers.PrimaryKeyRelatedField(
        queryset=ExamSection.objects.all(),
        many=True, write_only=True, required=False, source='sections',
    )
    sections_detail = ExamSectionSerializer(
        source='sections', many=True, read_only=True,
    )
    schedule_preference_display = serializers.CharField(
        source='get_schedule_preference_display', read_only=True,
    )

    class Meta:
        model = ExamSessionModel
        fields = [
            'id', 'name', 'order',
            'session_date', 'start_time', 'end_time', 'duration_minutes',
            'schedule_preference', 'schedule_preference_display',
            'description', 'question_count',
            'section_ids', 'sections_detail',
        ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  LIST (lightweight)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ExamListSerializer(serializers.ModelSerializer):
    exam_type_display = serializers.CharField(
        source='get_exam_type_display', read_only=True,
    )
    status_display = serializers.CharField(
        source='get_status_display', read_only=True,
    )
    section_count = serializers.IntegerField(read_only=True)
    total_questions = serializers.IntegerField(read_only=True)
    session_count = serializers.IntegerField(read_only=True)
    sinif_display = serializers.CharField(read_only=True)
                                            
    # TYT-AYT bağlantı bilgileri
    linked_tyt_exam = serializers.PrimaryKeyRelatedField(read_only=True)
    linked_tyt_exam_name = serializers.SerializerMethodField()
    linked_ayt_exam_name = serializers.SerializerMethodField()
    answer_count = serializers.SerializerMethodField()
    matched_count = serializers.SerializerMethodField()
    unmatched_count = serializers.SerializerMethodField()

    # Tenant display
    kurum_adi = serializers.CharField(source='kurum.ad', read_only=True, default='')
    sube_adi = serializers.CharField(source='sube.ad', read_only=True, default='')
    egitim_yili_str = serializers.CharField(
        source='egitim_yili.yil_str', read_only=True, default='',
    )

    class Meta:
        model = Exam
        fields = [
            'id', 'name', 'exam_type', 'exam_type_display',
            'status', 'status_display',
            'exam_date', 'duration_minutes',
            'is_active', 'is_locked', 'is_template',
            'section_count', 'total_questions', 'session_count',
            'sinif_display',
            'linked_tyt_exam', 'linked_tyt_exam_name', 'linked_ayt_exam_name',
            'answer_count', 'matched_count', 'unmatched_count',
            'kurum_adi', 'sube_adi', 'egitim_yili_str',
            'created_at',
        ]

    def get_linked_tyt_exam_name(self, obj):
        return obj.linked_tyt_exam.name if obj.linked_tyt_exam else None

    def get_linked_ayt_exam_name(self, obj):
        # Ters yön: Bu TYT sınavına bağlı AYT sınavı var mı?
        ayt = getattr(obj, 'linked_ayt_exam', None)
        return ayt.name if ayt else None

    def get_answer_count(self, obj):
        from ..models import StudentAnswer
        return StudentAnswer.objects.filter(session__exam=obj).count()

    def get_matched_count(self, obj):
        from ..models import StudentAnswer
        return StudentAnswer.objects.filter(session__exam=obj, student__isnull=False).count()

    def get_unmatched_count(self, obj):
        from ..models import StudentAnswer
        return StudentAnswer.objects.filter(session__exam=obj, student__isnull=True).count()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DETAIL
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ExamDetailSerializer(serializers.ModelSerializer):
    exam_type_display = serializers.CharField(
        source='get_exam_type_display', read_only=True,
    )
    status_display = serializers.CharField(
        source='get_status_display', read_only=True,
    )
    booklet_type_display = serializers.CharField(
        source='get_booklet_type_display', read_only=True,
    )
    section_count = serializers.IntegerField(read_only=True)
    total_questions = serializers.IntegerField(read_only=True)
    session_count = serializers.IntegerField(read_only=True)
    sinif_display = serializers.CharField(read_only=True)

    sections = ExamSectionSerializer(many=True, read_only=True)
    exam_sessions = ExamSessionSerializer(many=True, read_only=True)

    linked_tyt_exam_name = serializers.SerializerMethodField()

    # Tenant display
    kurum_adi = serializers.CharField(source='kurum.ad', read_only=True, default='')
    sube_adi = serializers.CharField(source='sube.ad', read_only=True, default='')
    egitim_yili_str = serializers.CharField(
        source='egitim_yili.yil_str', read_only=True, default='',
    )

    # M2M ids
    sinif_ids = serializers.PrimaryKeyRelatedField(
        source='siniflar', many=True, read_only=True,
    )

    class Meta:
        model = Exam
        fields = [
            'id', 'name', 'exam_type', 'exam_type_display',
            'status', 'status_display', 'description',
            'is_active', 'is_locked', 'is_template',
            'kurum', 'sube', 'egitim_yili',
            'kurum_adi', 'sube_adi', 'egitim_yili_str',
            'sinif_ids', 'sinif_display',
            'deneme_hizmeti', 'deneme_paketi',
            'exam_date', 'duration_minutes',
            'result_publish_date', 'answer_key_publish_date',
            'wrong_answer_count', 'per_section_penalty', 'score_coefficients',
            'booklet_type', 'booklet_type_display', 'booklet_auto_detect',
            'linked_tyt_exam', 'linked_tyt_exam_name',
            'section_count', 'total_questions', 'session_count',
            'sections', 'exam_sessions',
            'created_at', 'updated_at',
        ]

    def get_linked_tyt_exam_name(self, obj):
        return obj.linked_tyt_exam.name if obj.linked_tyt_exam else None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CREATE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ExamCreateSerializer(serializers.ModelSerializer):
    apply_template = serializers.BooleanField(write_only=True, default=True)
    sinif_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False,
    )

    class Meta:
        model = Exam
        fields = [
            'name', 'exam_type', 'description',
            'exam_date', 'duration_minutes',
            'result_publish_date', 'answer_key_publish_date',
            'sinif_ids',
            'deneme_hizmeti', 'deneme_paketi',
            'wrong_answer_count', 'per_section_penalty',
            'booklet_type', 'booklet_auto_detect',
            'apply_template',
        ]

    def create(self, validated_data):
        apply_template = validated_data.pop('apply_template', True)
        sinif_ids = validated_data.pop('sinif_ids', [])

        request = self.context.get('request')
        if request:
            from ..interfaces.sube_context import mandatory_olcme_context

            ctx, err = mandatory_olcme_context(request)
            if err:
                raise serializers.ValidationError({'sube': err.data.get('error', 'Şube bağlamı zorunludur.')})

            from shared.context import get_secili_egitim_yili_id

            validated_data['kurum_id'] = ctx['kurum_id']
            validated_data['sube_id'] = ctx['sube_id']
            ey_id = get_secili_egitim_yili_id(request)
            if ey_id:
                validated_data['egitim_yili_id'] = ey_id

        # Duration otomatik
        if not validated_data.get('duration_minutes'):
            validated_data['duration_minutes'] = get_default_duration(
                validated_data['exam_type'],
            )

        exam = Exam.objects.create(**validated_data)

        # Sınıf ataması
        if sinif_ids:
            exam.siniflar.set(sinif_ids)

        # Şablon bölümleri
        if apply_template:
            create_sections_from_template(exam)

        return exam


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  UPDATE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ExamUpdateSerializer(serializers.ModelSerializer):
    sinif_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False,
    )

    class Meta:
        model = Exam
        fields = [
            'name', 'description', 'status',
            'exam_date', 'duration_minutes',
            'result_publish_date', 'answer_key_publish_date',
            'wrong_answer_count', 'per_section_penalty', 'score_coefficients',
            'booklet_type', 'booklet_auto_detect',
            'linked_tyt_exam', 'is_active', 'is_template',
            'sinif_ids',
            'deneme_hizmeti', 'deneme_paketi',
        ]

    def validate(self, attrs):
        if self.instance and self.instance.is_locked:
            locked_fields = {
                'wrong_answer_count', 'per_section_penalty',
                'score_coefficients', 'exam_type',
            }
            for f in locked_fields:
                if f in attrs and attrs[f] != getattr(self.instance, f):
                    raise serializers.ValidationError(
                        {f: 'Sınav kilitli — bu alan değiştirilemez.'},
                    )
        return attrs

    def update(self, instance, validated_data):
        sinif_ids = validated_data.pop('sinif_ids', None)
        instance = super().update(instance, validated_data)
        if sinif_ids is not None:
            instance.siniflar.set(sinif_ids)
        return instance
