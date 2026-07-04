"""
WeeklyCycle Serializers
"""

from rest_framework import serializers
from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.academic.domain.weekly_day import WeeklyDay, DayOfWeek


class WeeklyDaySerializer(serializers.ModelSerializer):
    """
    WeeklyDay liste/detay serializer
    """
    day_name_short = serializers.CharField(read_only=True)
    is_weekend = serializers.BooleanField(read_only=True)
    day_of_week_display = serializers.CharField(source='get_day_of_week_display', read_only=True)

    class Meta:
        model = WeeklyDay
        fields = [
            'id', 'weekly_cycle', 'day_of_week', 'day_of_week_display',
            'name', 'order', 'is_active',
            'day_name_short', 'is_weekend',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class WeeklyDayCreateSerializer(serializers.ModelSerializer):
    """
    WeeklyDay oluşturma serializer
    """
    class Meta:
        model = WeeklyDay
        fields = ['weekly_cycle', 'day_of_week', 'name', 'order', 'is_active']

    def validate(self, attrs):
        weekly_cycle = attrs.get('weekly_cycle')
        day_of_week = attrs.get('day_of_week')

        # Aynı döngüde aynı gün var mı kontrolü
        existing = WeeklyDay.objects.filter(
            weekly_cycle=weekly_cycle,
            day_of_week=day_of_week
        )
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        
        if existing.exists():
            raise serializers.ValidationError({
                'day_of_week': 'Bu gün zaten bu döngüde tanımlı.'
            })

        return attrs


class WeeklyDayUpdateSerializer(serializers.ModelSerializer):
    """
    WeeklyDay güncelleme serializer
    """
    class Meta:
        model = WeeklyDay
        fields = ['name', 'order', 'is_active']


class WeeklyCycleSerializer(serializers.ModelSerializer):
    """
    WeeklyCycle liste/detay serializer
    """
    template_name = serializers.CharField(source='schedule_template.name', read_only=True)
    active_day_count = serializers.IntegerField(read_only=True)
    days = WeeklyDaySerializer(source='weekly_days', many=True, read_only=True)

    class Meta:
        model = WeeklyCycle
        fields = [
            'id', 'schedule_template', 'template_name',
            'name', 'description', 'is_active',
            'active_day_count', 'days',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# Alias'lar - view'larda kullanılan isimler için
WeeklyCycleListSerializer = WeeklyCycleSerializer
WeeklyCycleDetailSerializer = WeeklyCycleSerializer


class WeeklyCycleCreateSerializer(serializers.ModelSerializer):
    """
    WeeklyCycle oluşturma serializer
    """
    create_default_days = serializers.BooleanField(
        default=True,
        write_only=True,
        help_text='Varsayılan günleri otomatik oluştur'
    )

    class Meta:
        model = WeeklyCycle
        fields = ['schedule_template', 'name', 'description', 'is_active', 'create_default_days']

    def validate_name(self, value):
        if not value or len(value.strip()) < 1:
            raise serializers.ValidationError("Döngü adı boş olamaz.")
        return value.strip()

    def validate(self, attrs):
        schedule_template = attrs.get('schedule_template')
        name = attrs.get('name')

        # Aynı şablonda aynı isimde aktif döngü var mı kontrolü
        existing = WeeklyCycle.objects.filter(
            schedule_template=schedule_template,
            name=name,
            is_active=True
        )
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        
        if existing.exists():
            raise serializers.ValidationError({
                'name': 'Bu şablonda aynı isimde bir döngü zaten mevcut.'
            })

        return attrs

    def create(self, validated_data):
        create_default_days = validated_data.pop('create_default_days', True)
        cycle = WeeklyCycle.objects.create(**validated_data)
        
        if create_default_days:
            cycle.create_default_days()
        
        return cycle


class WeeklyCycleUpdateSerializer(serializers.ModelSerializer):
    """
    WeeklyCycle güncelleme serializer
    """
    class Meta:
        model = WeeklyCycle
        fields = ['name', 'description', 'is_active']
