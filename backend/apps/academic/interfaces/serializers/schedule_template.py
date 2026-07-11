"""
ScheduleTemplate Serializers
"""

from rest_framework import serializers
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.timeslot import SlotType


def _resolve_gun_yapisi_label(obj):
    if getattr(obj, 'gun_yapisi_label', None):
        return obj.gun_yapisi_label
    if obj.primary_weekly_cycle_id and obj.primary_weekly_cycle:
        return obj.primary_weekly_cycle.name
    cycle = obj.weekly_cycles.filter(is_active=True).order_by('name').first()
    return cycle.name if cycle else None


class ScheduleTemplateListSerializer(serializers.ModelSerializer):
    """Şablon listesi için serializer"""

    kurum_name = serializers.CharField(source='kurum.ad', read_only=True)
    sube_name = serializers.CharField(source='sube.ad', read_only=True, allow_null=True)
    timeslot_count = serializers.SerializerMethodField()
    lesson_count = serializers.SerializerMethodField()
    weekly_cycle_name = serializers.SerializerMethodField()
    usage_count = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleTemplate
        fields = [
            'id', 'name', 'description', 'is_active', 'is_default',
            'kurum', 'kurum_name', 'sube', 'sube_name',
            'primary_weekly_cycle', 'weekly_cycle_name', 'gun_yapisi_label',
            'timeslot_count', 'lesson_count', 'usage_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_timeslot_count(self, obj):
        return obj.time_slots.filter(is_active=True).count()

    def get_lesson_count(self, obj):
        return obj.time_slots.filter(is_active=True, slot_type=SlotType.LESSON).count()

    def get_weekly_cycle_name(self, obj):
        return _resolve_gun_yapisi_label(obj)

    def get_usage_count(self, obj):
        return obj.schedule_versions.count()


class ScheduleTemplateDetailSerializer(serializers.ModelSerializer):
    """Şablon detayı — TimeSlot listesi dahil"""

    kurum_name = serializers.CharField(source='kurum.ad', read_only=True)
    sube_name = serializers.CharField(source='sube.ad', read_only=True, allow_null=True)
    weekly_cycle_name = serializers.SerializerMethodField()
    time_slots = serializers.SerializerMethodField()
    usage_count = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleTemplate
        fields = [
            'id', 'name', 'description', 'is_active', 'is_default',
            'kurum', 'kurum_name', 'sube', 'sube_name',
            'primary_weekly_cycle', 'weekly_cycle_name', 'gun_yapisi_label', 'usage_count',
            'time_slots', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_weekly_cycle_name(self, obj):
        return _resolve_gun_yapisi_label(obj)

    def get_usage_count(self, obj):
        return obj.schedule_versions.count()

    def get_time_slots(self, obj):
        from apps.academic.interfaces.serializers.timeslot import TimeSlotSerializer
        qs = obj.time_slots.all().order_by('order')
        if obj.is_active:
            qs = qs.filter(is_active=True)
        return TimeSlotSerializer(qs, many=True).data


class ScheduleTemplateCreateSerializer(serializers.ModelSerializer):
    """Şablon oluşturma"""

    weekly_cycle_name = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
        help_text='Gün yapısı etiketi (ör. Hafta İçi) — çalışma takvimi oluşturmaz',
    )

    class Meta:
        model = ScheduleTemplate
        fields = [
            'name', 'description', 'kurum', 'sube', 'is_active', 'is_default',
            'weekly_cycle_name', 'gun_yapisi_label',
        ]
        extra_kwargs = {
            'sube': {'required': False, 'allow_null': True},
            'description': {'required': False, 'allow_blank': True},
            'is_default': {'required': False},
            'gun_yapisi_label': {'required': False, 'allow_blank': True},
        }

    def validate_name(self, value):
        if not value or len(value.strip()) < 2:
            raise serializers.ValidationError('Şablon adı en az 2 karakter olmalıdır.')
        return value.strip()

    def validate(self, attrs):
        name = attrs.get('name')
        kurum = attrs.get('kurum')
        sube = attrs.get('sube')

        existing = ScheduleTemplate.objects.filter(
            kurum=kurum,
            sube=sube,
            name__iexact=name,
            is_active=True,
        )
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        conflict = existing.first()
        if conflict:
            raise serializers.ValidationError({
                'name': (
                    f'"{conflict.name}" adında aktif bir şablon zaten var '
                    f'(listeden düzenleyebilir veya farklı bir ad kullanabilirsiniz).'
                ),
            })
        return attrs

    def _ensure_default_unique(self, template):
        if not template.is_default:
            return
        ScheduleTemplate.objects.filter(
            kurum_id=template.kurum_id,
            sube_id=template.sube_id,
            is_default=True,
        ).exclude(pk=template.pk).update(is_default=False)

    def create(self, validated_data):
        cycle_label = validated_data.pop('weekly_cycle_name', '')
        if cycle_label and not validated_data.get('gun_yapisi_label'):
            validated_data['gun_yapisi_label'] = cycle_label.strip()
        template = ScheduleTemplate.objects.create(**validated_data)
        self._ensure_default_unique(template)
        return template

    def update(self, instance, validated_data):
        validated_data.pop('weekly_cycle_name', None)
        template = super().update(instance, validated_data)
        self._ensure_default_unique(template)
        return template


class ScheduleTemplateUpdateSerializer(ScheduleTemplateCreateSerializer):
    """Şablon güncelleme"""

    weekly_cycle_name = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
    )

    class Meta(ScheduleTemplateCreateSerializer.Meta):
        fields = ScheduleTemplateCreateSerializer.Meta.fields + ['primary_weekly_cycle']

    def update(self, instance, validated_data):
        cycle_label = validated_data.pop('weekly_cycle_name', None)
        was_active = instance.is_active

        if cycle_label is not None and cycle_label.strip():
            validated_data['gun_yapisi_label'] = cycle_label.strip()

        template = super().update(instance, validated_data)

        if not was_active and template.is_active:
            template.reactivate()
        elif was_active and not template.is_active:
            template.time_slots.update(is_active=False)
            if template.is_default:
                ScheduleTemplate.objects.filter(pk=template.pk).update(is_default=False)

        return template


class ScheduleVersionUsageSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    is_active_version = serializers.BooleanField()
    term_name = serializers.CharField(allow_null=True)
    egitim_yili_name = serializers.CharField(allow_null=True)
