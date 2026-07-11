"""
WeeklyCycle (Çalışma Takvimi) Serializers
"""

from rest_framework import serializers

from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.academic.domain.weekly_day import WeeklyDay, DayOfWeek
from apps.academic.domain.schedule_template import ScheduleTemplate


class WeeklyDaySerializer(serializers.ModelSerializer):
    day_name_short = serializers.CharField(read_only=True)
    is_weekend = serializers.BooleanField(read_only=True)
    day_of_week_display = serializers.CharField(source='get_day_of_week_display', read_only=True)
    schedule_template_name = serializers.CharField(
        source='schedule_template.name', read_only=True, allow_null=True,
    )

    class Meta:
        model = WeeklyDay
        fields = [
            'id', 'weekly_cycle', 'day_of_week', 'day_of_week_display',
            'name', 'order', 'is_active',
            'schedule_template', 'schedule_template_name', 'note',
            'day_name_short', 'is_weekend',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class WeeklyDayPlanInputSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    day_of_week = serializers.IntegerField(min_value=0, max_value=6)
    name = serializers.CharField(required=False, allow_blank=True)
    order = serializers.IntegerField(required=False, min_value=1)
    is_active = serializers.BooleanField()
    schedule_template = serializers.IntegerField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, max_length=200)


class WeeklyCycleSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source='schedule_template.name', read_only=True, allow_null=True)
    program_tipi_display = serializers.CharField(source='get_program_tipi_display', read_only=True)
    active_day_count = serializers.IntegerField(read_only=True)
    usage_count = serializers.SerializerMethodField()
    used_templates = serializers.SerializerMethodField()
    total_lesson_count = serializers.SerializerMethodField()
    days = WeeklyDaySerializer(source='weekly_days', many=True, read_only=True)

    class Meta:
        model = WeeklyCycle
        fields = [
            'id', 'kurum', 'sube', 'schedule_template', 'template_name',
            'name', 'description', 'is_active', 'is_default', 'color', 'icon',
            'program_tipi', 'program_tipi_display',
            'active_day_count', 'usage_count', 'used_templates', 'total_lesson_count',
            'days', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_usage_count(self, obj):
        return obj.schedule_versions.count()

    def get_used_templates(self, obj):
        return [
            {'id': t.id, 'name': t.name}
            for t in obj.used_schedule_templates()
        ]

    def get_total_lesson_count(self, obj):
        return obj.total_lesson_count()


WeeklyCycleListSerializer = WeeklyCycleSerializer
WeeklyCycleDetailSerializer = WeeklyCycleSerializer


def _validate_unique_calendar_name(*, kurum, sube, name, instance=None):
    qs = WeeklyCycle.objects.filter(kurum=kurum, sube=sube, name__iexact=name, is_active=True)
    if instance:
        qs = qs.exclude(pk=instance.pk)
    conflict = qs.first()
    if conflict:
        raise serializers.ValidationError({
            'name': (
                f'"{conflict.name}" adında aktif bir çalışma takvimi zaten var '
                f'(listeden düzenleyebilir veya farklı bir ad kullanabilirsiniz).'
            ),
        })


class WeeklyCycleCreateSerializer(serializers.ModelSerializer):
    create_default_days = serializers.BooleanField(default=True, write_only=True)

    class Meta:
        model = WeeklyCycle
        fields = [
            'name', 'description', 'is_active', 'is_default', 'color', 'icon', 'program_tipi',
            'kurum', 'sube', 'create_default_days',
        ]
        extra_kwargs = {
            'kurum': {'required': False},
            'sube': {'required': False},
            'description': {'required': False, 'allow_blank': True},
            'color': {'required': False},
            'icon': {'required': False},
            'is_default': {'required': False},
        }

    def validate_name(self, value):
        if not value or len(value.strip()) < 2:
            raise serializers.ValidationError('Takvim adı en az 2 karakter olmalıdır.')
        return value.strip()

    def validate(self, attrs):
        kurum = attrs.get('kurum')
        sube = attrs.get('sube')
        name = attrs.get('name')
        if kurum and sube and name:
            _validate_unique_calendar_name(kurum=kurum, sube=sube, name=name, instance=self.instance)
        return attrs

    def create(self, validated_data):
        create_days = validated_data.pop('create_default_days', True)
        cycle = WeeklyCycle.objects.create(**validated_data)
        cycle.ensure_default_unique()
        if create_days:
            cycle.create_default_days()
        return cycle


class WeeklyCycleUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklyCycle
        fields = ['name', 'description', 'is_active', 'is_default', 'color', 'icon', 'program_tipi']

    def validate_name(self, value):
        if not value or len(value.strip()) < 2:
            raise serializers.ValidationError('Takvim adı en az 2 karakter olmalıdır.')
        return value.strip()

    def validate(self, attrs):
        name = attrs.get('name', self.instance.name if self.instance else None)
        if self.instance and name:
            _validate_unique_calendar_name(
                kurum=self.instance.kurum_id,
                sube=self.instance.sube_id,
                name=name,
                instance=self.instance,
            )
        return attrs

    def update(self, instance, validated_data):
        was_active = instance.is_active
        cycle = super().update(instance, validated_data)
        cycle.ensure_default_unique()
        if was_active and not cycle.is_active:
            cycle.weekly_days.update(is_active=False, schedule_template_id=None)
            if cycle.is_default:
                WeeklyCycle.objects.filter(pk=cycle.pk).update(is_default=False)
        return cycle


class WeeklyDayUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklyDay
        fields = ['name', 'order', 'is_active', 'schedule_template', 'note']

    def validate(self, attrs):
        is_active = attrs.get('is_active', self.instance.is_active if self.instance else False)
        schedule_template = attrs.get('schedule_template', getattr(self.instance, 'schedule_template', None))
        if is_active and not schedule_template:
            raise serializers.ValidationError({
                'schedule_template': 'Aktif günlerde ders saati şablonu zorunludur.',
            })
        if not is_active:
            attrs['schedule_template'] = None
        return attrs


class WeeklyDayCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklyDay
        fields = ['weekly_cycle', 'day_of_week', 'name', 'order', 'is_active', 'schedule_template', 'note']

    def validate(self, attrs):
        weekly_cycle = attrs.get('weekly_cycle')
        day_of_week = attrs.get('day_of_week')
        existing = WeeklyDay.objects.filter(weekly_cycle=weekly_cycle, day_of_week=day_of_week)
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError({'day_of_week': 'Bu gün zaten tanımlı.'})
        return attrs


def validate_weekly_plan(days_data, *, sube_id):
    """Haftalık plan doğrulama."""
    if not days_data:
        raise serializers.ValidationError({'days': 'Haftalık plan boş olamaz.'})

    active = [d for d in days_data if d.get('is_active')]
    if not active:
        raise serializers.ValidationError({'days': 'En az bir gün aktif olmalıdır.'})

    for day in active:
        tpl_id = day.get('schedule_template')
        if not tpl_id:
            label = day.get('name') or DayOfWeek(day.get('day_of_week', 0)).label
            raise serializers.ValidationError({
                'days': f'{label} için ders saati şablonu seçilmelidir.',
            })
        try:
            tpl = ScheduleTemplate.objects.get(pk=tpl_id, is_active=True, sube_id=sube_id)
        except ScheduleTemplate.DoesNotExist:
            raise serializers.ValidationError({
                'days': 'Seçilen ders saati şablonu bulunamadı veya pasif.',
            })
        day['_template'] = tpl


def save_weekly_plan(cycle, days_data, *, sube_id):
    validate_weekly_plan(days_data, sube_id=sube_id)

    existing = {d.day_of_week: d for d in cycle.weekly_days.all()}
    touched_ids = []

    for item in days_data:
        day_of_week = item['day_of_week']
        is_active = item.get('is_active', False)
        tpl_id = item.get('schedule_template') if is_active else None
        note = (item.get('note') or '').strip()
        name = item.get('name') or DayOfWeek(day_of_week).label
        order = item.get('order', day_of_week + 1)

        if day_of_week in existing:
            day = existing[day_of_week]
            day.name = name
            day.order = order
            day.is_active = is_active
            day.schedule_template_id = tpl_id
            day.note = note
            day.save()
            touched_ids.append(day.id)
        else:
            day = WeeklyDay.objects.create(
                weekly_cycle=cycle,
                day_of_week=day_of_week,
                name=name,
                order=order,
                is_active=is_active,
                schedule_template_id=tpl_id,
                note=note,
            )
            touched_ids.append(day.id)

    return cycle.weekly_days.filter(id__in=touched_ids).order_by('order')
