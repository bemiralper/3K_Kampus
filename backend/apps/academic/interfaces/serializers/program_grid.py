"""
ProgramGridCell Serializers
"""

from rest_framework import serializers
from apps.academic.domain.program_grid_cell import ProgramGridCell, CellStatus


class ProgramGridCellSerializer(serializers.ModelSerializer):
    """
    ProgramGridCell liste/detay serializer
    """
    template_name = serializers.CharField(source='schedule_template.name', read_only=True)
    cycle_name = serializers.CharField(source='weekly_cycle.name', read_only=True)
    day_name = serializers.CharField(source='weekly_day.name', read_only=True)
    day_of_week = serializers.IntegerField(source='weekly_day.day_of_week', read_only=True)
    day_order = serializers.IntegerField(source='weekly_day.order', read_only=True)
    slot_name = serializers.CharField(source='timeslot.name', read_only=True)
    slot_order = serializers.IntegerField(source='timeslot.order', read_only=True)
    slot_start = serializers.TimeField(source='timeslot.start_time', read_only=True)
    slot_end = serializers.TimeField(source='timeslot.end_time', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    time_range = serializers.CharField(read_only=True)
    cell_key = serializers.CharField(read_only=True)
    is_empty = serializers.BooleanField(read_only=True)
    is_available = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProgramGridCell
        fields = [
            'id', 'schedule_template', 'template_name',
            'weekly_cycle', 'cycle_name',
            'weekly_day', 'day_name', 'day_of_week', 'day_order',
            'timeslot', 'slot_name', 'slot_order', 'slot_start', 'slot_end',
            'status', 'status_display', 'notes',
            'time_range', 'cell_key', 'is_empty', 'is_available',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# Alias - Liste için aynı serializer
ProgramGridCellListSerializer = ProgramGridCellSerializer


class ProgramGridCellUpdateSerializer(serializers.ModelSerializer):
    """
    ProgramGridCell güncelleme serializer
    """
    class Meta:
        model = ProgramGridCell
        fields = ['status', 'notes', 'is_active']


class GridPreviewItemSerializer(serializers.Serializer):
    """
    Grid önizleme öğesi serializer
    """
    day_of_week = serializers.IntegerField()
    day_name = serializers.CharField()
    day_order = serializers.IntegerField()
    slot_order = serializers.IntegerField()
    slot_name = serializers.CharField()
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()
    slot_type = serializers.CharField()
    slot_type_display = serializers.CharField()
    cell_key = serializers.CharField()


class GridGeneratorConfigSerializer(serializers.Serializer):
    """
    Grid oluşturucu konfigürasyon serializer
    """
    schedule_template_id = serializers.IntegerField(help_text='Zaman şablonu ID')
    weekly_cycle_id = serializers.IntegerField(help_text='Haftalık döngü ID')
    overwrite_existing = serializers.BooleanField(
        default=False,
        help_text='Mevcut grid hücrelerini sil ve yeniden oluştur'
    )

    def validate_schedule_template_id(self, value):
        from apps.academic.domain.schedule_template import ScheduleTemplate
        try:
            ScheduleTemplate.objects.get(pk=value, is_active=True)
        except ScheduleTemplate.DoesNotExist:
            raise serializers.ValidationError("Geçerli bir zaman şablonu bulunamadı.")
        return value

    def validate_weekly_cycle_id(self, value):
        from apps.academic.domain.weekly_cycle import WeeklyCycle
        try:
            WeeklyCycle.objects.get(pk=value, is_active=True)
        except WeeklyCycle.DoesNotExist:
            raise serializers.ValidationError("Geçerli bir haftalık döngü bulunamadı.")
        return value

    def validate(self, attrs):
        from apps.academic.domain.weekly_cycle import WeeklyCycle
        
        template_id = attrs.get('schedule_template_id')
        cycle_id = attrs.get('weekly_cycle_id')

        # Döngü şablona bağlı mı kontrolü
        try:
            cycle = WeeklyCycle.objects.get(pk=cycle_id, is_active=True)
            if cycle.schedule_template_id != template_id:
                raise serializers.ValidationError({
                    'weekly_cycle_id': 'Haftalık döngü seçilen şablona ait değil.'
                })
        except WeeklyCycle.DoesNotExist:
            raise serializers.ValidationError({
                'weekly_cycle_id': 'Haftalık döngü bulunamadı.'
            })

        return attrs


# Alias'lar - view'larda kullanılan isimler
GridPreviewSerializer = GridPreviewItemSerializer
GridGenerateInputSerializer = GridGeneratorConfigSerializer
