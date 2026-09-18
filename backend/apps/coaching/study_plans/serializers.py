from rest_framework import serializers

from .models import (
    StudyDay,
    StudyLeftover,
    StudyProgram,
    StudySlot,
    StudyTemplate,
)
from .services import build_summary


class StudyTemplateSerializer(serializers.ModelSerializer):
    scenario_display = serializers.CharField(source='get_scenario_display', read_only=True)
    strategy_display = serializers.CharField(source='get_strategy_display', read_only=True)
    usage_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = StudyTemplate
        fields = (
            'id', 'name', 'scenario', 'scenario_display', 'scope', 'is_builtin', 'is_active',
            'active_weekdays', 'day_weights', 'weekend_policy', 'intensify_weekdays',
            'strategy', 'strategy_display', 'unit_priority',
            'max_questions_per_day', 'max_tests_per_day', 'max_minutes_per_day', 'max_slots_per_day',
            'overflow', 'lock_past_days', 'respect_due_date', 'honor_calendar',
            'usage_count', 'created_at', 'updated_at',
        )
        read_only_fields = ('is_builtin', 'created_at', 'updated_at')


class StudySlotSerializer(serializers.ModelSerializer):
    lesson_name = serializers.SerializerMethodField()
    assignment_title = serializers.SerializerMethodField()

    class Meta:
        model = StudySlot
        fields = (
            'id', 'source_assignment', 'source_lesson', 'source_task', 'source_kind',
            'lesson', 'lesson_name', 'title', 'topic_name', 'resource_name',
            'planned_tests', 'planned_questions', 'planned_minutes',
            'completed_tests', 'completed_questions', 'completed_minutes',
            'is_done', 'is_locked', 'is_orphaned', 'order', 'assignment_title',
        )

    def get_lesson_name(self, obj):
        return obj.lesson.ad if obj.lesson else ''

    def get_assignment_title(self, obj):
        if obj.source_assignment:
            return obj.source_assignment.title
        return ''


class StudyDaySerializer(serializers.ModelSerializer):
    slots = StudySlotSerializer(many=True, read_only=True)
    label = serializers.SerializerMethodField()
    chip = serializers.SerializerMethodField()

    class Meta:
        model = StudyDay
        fields = (
            'id', 'day_date', 'weekday', 'label', 'chip', 'is_locked',
            'target_minutes', 'planned_tests', 'planned_questions', 'planned_minutes',
            'planned_slots', 'completed_tests', 'completed_questions', 'completed_minutes',
            'completed_slots', 'load_level', 'cap_tests', 'cap_questions', 'cap_minutes',
            'cap_slots', 'slots',
        )

    def get_label(self, obj):
        from .engine import WEEKDAY_LABELS
        return WEEKDAY_LABELS[obj.weekday]

    def get_chip(self, obj):
        from .engine import WEEKDAY_LABELS
        mins = obj.planned_minutes or obj.target_minutes
        return f'{WEEKDAY_LABELS[obj.weekday]} {obj.completed_slots}/{obj.planned_slots} · {obj.completed_minutes}/{mins}'


class StudyLeftoverSerializer(serializers.ModelSerializer):
    reason_display = serializers.CharField(source='get_reason_display', read_only=True)

    class Meta:
        model = StudyLeftover
        fields = (
            'id', 'source_assignment', 'source_lesson', 'source_task', 'source_kind',
            'title', 'lesson_name', 'remaining_tests', 'remaining_questions',
            'remaining_minutes', 'reason', 'reason_display',
        )


class StudyProgramListSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    template_name = serializers.CharField(source='template.name', read_only=True, default='')
    coach_name = serializers.SerializerMethodField()
    is_readonly = serializers.SerializerMethodField()

    class Meta:
        model = StudyProgram
        fields = (
            'id', 'student', 'student_name', 'coach', 'coach_name', 'template',
            'template_name', 'week_start', 'week_end', 'generation_version',
            'status', 'is_readonly', 'created_at', 'updated_at',
        )

    def get_student_name(self, obj):
        return f'{obj.student.ad} {obj.student.soyad}'.strip()

    def get_coach_name(self, obj):
        if not obj.coach:
            return ''
        full = obj.coach.get_full_name()
        return full or obj.coach.username

    def get_is_readonly(self, obj):
        from django.utils import timezone
        return obj.week_end < timezone.localdate()


class StudyProgramDetailSerializer(StudyProgramListSerializer):
    days = StudyDaySerializer(many=True, read_only=True)
    leftovers = StudyLeftoverSerializer(many=True, read_only=True)
    summary = serializers.SerializerMethodField()
    template_detail = StudyTemplateSerializer(source='template', read_only=True)

    class Meta(StudyProgramListSerializer.Meta):
        fields = StudyProgramListSerializer.Meta.fields + (
            'days', 'leftovers', 'summary', 'template_detail',
        )

    def get_summary(self, obj):
        return build_summary(obj)


class GenerateRequestSerializer(serializers.Serializer):
    student_id = serializers.IntegerField()
    week_start = serializers.DateField()
    template_id = serializers.IntegerField()
    include_homework = serializers.BooleanField(default=True)
    honor_availability = serializers.BooleanField(default=True)
    extra_goals = serializers.ListField(child=serializers.DictField(), required=False, default=list)
