"""
Ölçme & Değerlendirme — Serializers
"""
from django.db import transaction
from rest_framework import serializers
from ..models import Exam, ExamSection, ExamSessionModel
from ..services.exam_templates import (
    create_sections_from_payload,
    create_sections_from_template,
    get_default_duration,
)
from ..models.scoring_settings import MANAGED_PUAN_YILLARI
from ..services.curriculum_band import normalize_band, resolved_band


def _validate_puan_yili(value):
    if value is None:
        return value
    if value not in MANAGED_PUAN_YILLARI:
        raise serializers.ValidationError('Puan yılı 2024, 2025 veya 2026 olmalıdır.')
    return value


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
    # Liste sorgusu bu değerleri ann_* olarak annotate eder; annotation yoksa
    # (ör. tekil kullanım) model property'sine düşülür.
    section_count = serializers.SerializerMethodField()
    total_questions = serializers.SerializerMethodField()
    session_count = serializers.SerializerMethodField()
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

    @staticmethod
    def _counted(obj, annotation, fallback):
        value = getattr(obj, annotation, None)
        if value is not None:
            return value
        return fallback()

    def get_section_count(self, obj):
        return self._counted(obj, 'ann_section_count', lambda: obj.section_count)

    def get_total_questions(self, obj):
        return self._counted(obj, 'ann_total_questions', lambda: obj.total_questions)

    def get_session_count(self, obj):
        return self._counted(obj, 'ann_session_count', lambda: obj.session_count)

    def get_linked_tyt_exam_name(self, obj):
        return obj.linked_tyt_exam.name if obj.linked_tyt_exam else None

    def get_linked_ayt_exam_name(self, obj):
        # Ters yön: Bu TYT sınavına bağlı AYT sınavı var mı?
        ayt = getattr(obj, 'linked_ayt_exam', None)
        return ayt.name if ayt else None

    def _answer_totals(self, obj):
        total = getattr(obj, 'ann_answer_count', None)
        matched = getattr(obj, 'ann_matched_count', None)
        if total is None or matched is None:
            from ..models import StudentAnswer
            answers = StudentAnswer.objects.filter(session__exam=obj)
            total = answers.count()
            matched = answers.filter(student__isnull=False).count()
        return total, matched

    def get_answer_count(self, obj):
        return self._answer_totals(obj)[0]

    def get_matched_count(self, obj):
        return self._answer_totals(obj)[1]

    def get_unmatched_count(self, obj):
        total, matched = self._answer_totals(obj)
        return total - matched

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not data.get('exam_date'):
            extra = getattr(instance, 'ann_list_date', None)
            if extra:
                data['exam_date'] = extra.isoformat() if hasattr(extra, 'isoformat') else str(extra)
        return data


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
            'curriculum_band',
            'status', 'status_display', 'description',
            'is_active', 'is_locked', 'is_template',
            'kurum', 'sube', 'egitim_yili',
            'kurum_adi', 'sube_adi', 'egitim_yili_str',
            'sinif_ids', 'sinif_display',
            'deneme_hizmeti', 'deneme_paketi',
            'exam_date', 'duration_minutes',
            'result_publish_date', 'answer_key_publish_date',
            'wrong_answer_count', 'per_section_penalty', 'score_coefficients',
            'puan_yili',
            'booklet_type', 'booklet_type_display', 'booklet_auto_detect',
            'linked_tyt_exam', 'linked_tyt_exam_name',
            'section_count', 'total_questions', 'session_count',
            'sections', 'exam_sessions',
            'participant_count', 'sinif_seviyesi_ids', 'deneme_paketi_ids',
            'rooms',
            'created_at', 'updated_at',
        ]

    participant_count = serializers.SerializerMethodField()
    sinif_seviyesi_ids = serializers.SerializerMethodField()
    deneme_paketi_ids = serializers.SerializerMethodField()
    rooms = serializers.SerializerMethodField()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['curriculum_band'] = resolved_band(instance)
        return data

    def get_linked_tyt_exam_name(self, obj):
        return obj.linked_tyt_exam.name if obj.linked_tyt_exam else None

    def get_participant_count(self, obj):
        return obj.participants.count()

    def get_sinif_seviyesi_ids(self, obj):
        return list(dict.fromkeys(
            a.sinif_seviyesi_id for a in obj.audiences.all() if a.sinif_seviyesi_id
        ))

    def get_deneme_paketi_ids(self, obj):
        return list(dict.fromkeys(
            a.deneme_paketi_id for a in obj.audiences.all() if a.deneme_paketi_id
        ))

    def get_rooms(self, obj):
        return [
            {'id': r.id, 'name': r.name, 'capacity': r.capacity, 'order': r.order}
            for r in obj.rooms.order_by('order', 'id')
        ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CREATE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ExamSectionWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    question_start = serializers.IntegerField(required=False, min_value=1)
    question_end = serializers.IntegerField(required=False, min_value=1)
    question_count = serializers.IntegerField(required=False, min_value=1)
    order = serializers.IntegerField(required=False, min_value=0)
    subject = serializers.IntegerField(required=False, allow_null=True)
    sub_sections = serializers.ListField(
        child=serializers.DictField(), required=False, default=list,
    )


class ExamCreateSerializer(serializers.ModelSerializer):
    apply_template = serializers.BooleanField(write_only=True, default=True)
    sinif_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False,
    )
    sections = ExamSectionWriteSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = Exam
        fields = [
            'name', 'exam_type', 'description',
            'exam_date', 'duration_minutes',
            'result_publish_date', 'answer_key_publish_date',
            'sinif_ids',
            'deneme_hizmeti', 'deneme_paketi',
            'wrong_answer_count', 'per_section_penalty',
            'puan_yili',
            'booklet_type', 'booklet_auto_detect',
            'apply_template',
            'curriculum_band',
            'sections',
        ]
        extra_kwargs = {
            'puan_yili': {'required': False, 'allow_null': True},
            'curriculum_band': {'required': False, 'allow_blank': True},
        }

    def validate_puan_yili(self, value):
        return _validate_puan_yili(value)

    def validate(self, attrs):
        attrs['curriculum_band'] = normalize_band(
            attrs.get('curriculum_band'), attrs.get('exam_type'),
        )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        apply_template = validated_data.pop('apply_template', True)
        sinif_ids = validated_data.pop('sinif_ids', [])
        sections_payload = validated_data.pop('sections', None)

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

        if sections_payload:
            create_sections_from_payload(exam, sections_payload)
        elif apply_template:
            create_sections_from_template(exam)

        extra = {}
        request = self.context.get('request')
        if request is not None:
            extra = request.data if hasattr(request, 'data') else {}
        roster_keys = (
            'audience', 'sinif_seviyesi_ids', 'deneme_paketi_ids',
            'rooms', 'manual_student_ids', 'removed_auto_ids', 'seating_mode',
            'seat_assignments', 'sessions',
        )
        if any(k in extra for k in roster_keys) or sinif_ids:
            from ..views.roster_views import apply_roster_payload
            payload = {k: extra.get(k) for k in roster_keys if k in extra}
            payload['sinif_ids'] = sinif_ids
            result = apply_roster_payload(exam, payload)
            if not result.get('ok'):
                raise serializers.ValidationError({'roster': result.get('error')})

        return exam


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  UPDATE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ExamUpdateSerializer(serializers.ModelSerializer):
    sinif_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False,
    )
    sinif_seviyesi_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False,
    )
    deneme_paketi_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False,
    )

    class Meta:
        model = Exam
        fields = [
            'name', 'description', 'status',
            'exam_date', 'duration_minutes',
            'result_publish_date', 'answer_key_publish_date',
            'wrong_answer_count', 'per_section_penalty', 'score_coefficients',
            'puan_yili',
            'booklet_type', 'booklet_auto_detect',
            'linked_tyt_exam', 'is_active', 'is_template',
            'sinif_ids',
            'sinif_seviyesi_ids', 'deneme_paketi_ids',
            'deneme_hizmeti', 'deneme_paketi',
            'curriculum_band',
        ]
        extra_kwargs = {
            'puan_yili': {'required': False, 'allow_null': True},
            'curriculum_band': {'required': False, 'allow_blank': True},
        }

    def validate_puan_yili(self, value):
        return _validate_puan_yili(value)

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
        exam_type = attrs.get('exam_type') or (self.instance.exam_type if self.instance else None)
        if 'curriculum_band' in attrs:
            attrs['curriculum_band'] = normalize_band(attrs.get('curriculum_band'), exam_type)
        return attrs

    def update(self, instance, validated_data):
        sinif_ids = validated_data.pop('sinif_ids', None)
        validated_data.pop('sinif_seviyesi_ids', None)
        validated_data.pop('deneme_paketi_ids', None)
        instance = super().update(instance, validated_data)
        if sinif_ids is not None:
            instance.siniflar.set(sinif_ids)
        request = self.context.get('request')
        extra = request.data if request is not None and hasattr(request, 'data') else {}
        roster_keys = (
            'audience', 'sinif_seviyesi_ids', 'deneme_paketi_ids',
            'rooms', 'manual_student_ids', 'removed_auto_ids', 'seating_mode',
            'seat_assignments', 'refresh_roster',
        )
        if any(k in extra for k in roster_keys):
            from ..views.roster_views import apply_roster_payload
            payload = {k: extra.get(k) for k in roster_keys if k in extra}
            if sinif_ids is not None:
                payload['sinif_ids'] = sinif_ids
            result = apply_roster_payload(instance, payload)
            if not result.get('ok'):
                raise serializers.ValidationError({'roster': result.get('error')})
        return instance
