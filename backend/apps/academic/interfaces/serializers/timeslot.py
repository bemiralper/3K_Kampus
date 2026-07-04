"""
TimeSlot Serializers
"""

from rest_framework import serializers
from apps.academic.domain.timeslot import TimeSlot, SlotType
from datetime import datetime


class TimeSlotSerializer(serializers.ModelSerializer):
    """
    TimeSlot liste ve detay için serializer
    """
    duration = serializers.SerializerMethodField()
    duration_display = serializers.SerializerMethodField()
    template_name = serializers.CharField(source='schedule_template.name', read_only=True)
    start_time_display = serializers.SerializerMethodField()
    end_time_display = serializers.SerializerMethodField()
    slot_type_display = serializers.SerializerMethodField()

    class Meta:
        model = TimeSlot
        fields = [
            'id', 'schedule_template', 'template_name',
            'name', 'start_time', 'end_time', 'order',
            'slot_type', 'slot_type_display', 'is_break', 'is_active',
            'duration', 'duration_display',
            'start_time_display', 'end_time_display',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'is_break', 'created_at', 'updated_at']

    def get_slot_type_display(self, obj):
        """Slot tipini Türkçe olarak döndür"""
        return obj.get_slot_type_display()

    def get_duration(self, obj):
        """Süreyi dakika olarak döndür"""
        return obj.duration

    def get_duration_display(self, obj):
        """Süreyi formatlanmış string olarak döndür"""
        duration = obj.duration
        if duration >= 60:
            hours = duration // 60
            minutes = duration % 60
            if minutes > 0:
                return f"{hours} saat {minutes} dk"
            return f"{hours} saat"
        return f"{duration} dk"

    def get_start_time_display(self, obj):
        """Başlangıç saatini HH:MM formatında döndür"""
        if obj.start_time:
            return obj.start_time.strftime('%H:%M')
        return None

    def get_end_time_display(self, obj):
        """Bitiş saatini HH:MM formatında döndür"""
        if obj.end_time:
            return obj.end_time.strftime('%H:%M')
        return None


class TimeSlotCreateSerializer(serializers.ModelSerializer):
    """
    TimeSlot oluşturma için serializer
    """
    class Meta:
        model = TimeSlot
        fields = ['schedule_template', 'name', 'start_time', 'end_time', 'order', 'slot_type', 'is_active']
        extra_kwargs = {
            'slot_type': {'required': False},
            'is_active': {'required': False}
        }

    def validate_name(self, value):
        """İsim validasyonu"""
        if not value or len(value.strip()) < 1:
            raise serializers.ValidationError("Ders saati adı boş olamaz.")
        return value.strip()

    def validate(self, attrs):
        """
        TimeSlot validasyonu:
        - Başlangıç < Bitiş kontrolü
        - Aynı şablonda sıra çakışması kontrolü
        - Zaman çakışması kontrolü
        """
        start_time = attrs.get('start_time')
        end_time = attrs.get('end_time')
        schedule_template = attrs.get('schedule_template')
        order = attrs.get('order')

        # Başlangıç < Bitiş kontrolü
        if start_time and end_time:
            if start_time >= end_time:
                raise serializers.ValidationError({
                    'end_time': 'Bitiş saati başlangıç saatinden sonra olmalıdır.'
                })

        # Şablon aktif mi kontrolü
        if schedule_template and not schedule_template.is_active:
            raise serializers.ValidationError({
                'schedule_template': 'Seçilen zaman şablonu aktif değil.'
            })

        # Sıra çakışması kontrolü
        if schedule_template and order is not None:
            existing_order = TimeSlot.objects.filter(
                schedule_template=schedule_template,
                order=order,
                is_active=True
            )
            
            # Update durumunda kendisini hariç tut
            if self.instance:
                existing_order = existing_order.exclude(pk=self.instance.pk)
            
            if existing_order.exists():
                raise serializers.ValidationError({
                    'order': f'Bu şablonda {order}. sırada bir ders saati zaten mevcut.'
                })

        # Zaman çakışması kontrolü
        if schedule_template and start_time and end_time:
            from apps.academic.domain.timeslot import TimeSlot as TimeSlotModel
            
            # Geçici nesne oluştur kontrolü için
            temp_slot = TimeSlot(
                schedule_template=schedule_template,
                start_time=start_time,
                end_time=end_time,
                order=order or 0
            )
            
            # Mevcut slot'ları al
            existing_slots = TimeSlot.objects.filter(
                schedule_template=schedule_template,
                is_active=True
            )
            
            # Update durumunda kendisini hariç tut
            if self.instance:
                existing_slots = existing_slots.exclude(pk=self.instance.pk)
            
            for existing in existing_slots:
                # Zaman çakışması kontrolü
                if not (end_time <= existing.start_time or start_time >= existing.end_time):
                    raise serializers.ValidationError({
                        'start_time': f'"{existing.name}" ({existing.start_time.strftime("%H:%M")} - {existing.end_time.strftime("%H:%M")}) ile zaman çakışması var.'
                    })

        return attrs


class TimeSlotUpdateSerializer(TimeSlotCreateSerializer):
    """
    TimeSlot güncelleme için serializer
    """
    class Meta(TimeSlotCreateSerializer.Meta):
        extra_kwargs = {
            'schedule_template': {'required': False},
            'slot_type': {'required': False},
            'is_active': {'required': False}
        }


class TimeSlotBulkCreateSerializer(serializers.Serializer):
    """
    Toplu TimeSlot oluşturma için serializer
    Örnek: Varsayılan ders saatleri şablonu oluşturma
    """
    schedule_template_id = serializers.IntegerField()
    time_slots = serializers.ListField(
        child=serializers.DictField(),
        min_length=1
    )

    def validate_schedule_template_id(self, value):
        from apps.academic.domain.schedule_template import ScheduleTemplate
        try:
            template = ScheduleTemplate.objects.get(pk=value, is_active=True)
        except ScheduleTemplate.DoesNotExist:
            raise serializers.ValidationError("Geçerli bir zaman şablonu bulunamadı.")
        return value

    def validate_time_slots(self, value):
        """Her slot için temel validasyon"""
        required_fields = ['name', 'start_time', 'end_time', 'order']
        
        for idx, slot in enumerate(value):
            for field in required_fields:
                if field not in slot:
                    raise serializers.ValidationError(
                        f"Slot {idx + 1}: '{field}' alanı zorunludur."
                    )
        
        return value

    def create(self, validated_data):
        from apps.academic.domain.schedule_template import ScheduleTemplate
        
        template = ScheduleTemplate.objects.get(pk=validated_data['schedule_template_id'])
        created_slots = []
        
        for slot_data in validated_data['time_slots']:
            # Zaman parse et
            start_time = slot_data['start_time']
            end_time = slot_data['end_time']
            
            # String ise parse et
            if isinstance(start_time, str):
                start_time = datetime.strptime(start_time, '%H:%M').time()
            if isinstance(end_time, str):
                end_time = datetime.strptime(end_time, '%H:%M').time()
            
            slot = TimeSlot.objects.create(
                schedule_template=template,
                name=slot_data['name'],
                start_time=start_time,
                end_time=end_time,
                order=slot_data['order'],
                slot_type=slot_data.get('slot_type', SlotType.LESSON),
                is_active=slot_data.get('is_active', True)
            )
            created_slots.append(slot)
        
        return created_slots


class SlotGeneratorConfigSerializer(serializers.Serializer):
    """
    Toplu slot üretici konfigürasyon serializer
    """
    schedule_template_id = serializers.IntegerField(help_text="Hedef şablon ID")
    start_time = serializers.TimeField(help_text="İlk dersin başlangıç saati")
    lesson_duration = serializers.IntegerField(min_value=10, max_value=120, default=40, help_text="Ders süresi (dakika)")
    short_break_duration = serializers.IntegerField(min_value=5, max_value=30, default=10, help_text="Kısa teneffüs süresi (dakika)")
    lesson_count = serializers.IntegerField(min_value=1, max_value=16, default=8, help_text="Toplam ders sayısı")
    
    # Öğle arası
    lunch_break_enabled = serializers.BooleanField(default=True, help_text="Öğle arası eklensin mi?")
    lunch_break_after_lesson = serializers.IntegerField(min_value=1, max_value=16, default=4, help_text="Kaçıncı dersten sonra öğle arası")
    lunch_break_duration = serializers.IntegerField(min_value=15, max_value=120, default=60, help_text="Öğle arası süresi (dakika)")
    
    # Akşam arası (ikili öğretim için)
    evening_break_enabled = serializers.BooleanField(default=False, help_text="Akşam arası eklensin mi?")
    evening_break_after_lesson = serializers.IntegerField(min_value=1, max_value=16, default=8, required=False, help_text="Kaçıncı dersten sonra akşam arası")
    evening_break_duration = serializers.IntegerField(min_value=15, max_value=120, default=30, required=False, help_text="Akşam arası süresi (dakika)")
    
    # Üzerine yazma
    overwrite_existing = serializers.BooleanField(default=False, help_text="Mevcut slotları sil ve yeniden oluştur")

    def validate_schedule_template_id(self, value):
        from apps.academic.domain.schedule_template import ScheduleTemplate
        try:
            template = ScheduleTemplate.objects.get(pk=value, is_active=True)
        except ScheduleTemplate.DoesNotExist:
            raise serializers.ValidationError("Geçerli bir zaman şablonu bulunamadı.")
        return value

    def validate(self, attrs):
        # Öğle arası kontrolü
        if attrs.get('lunch_break_enabled'):
            if attrs.get('lunch_break_after_lesson', 4) > attrs.get('lesson_count', 8):
                raise serializers.ValidationError({
                    'lunch_break_after_lesson': 'Öğle arası, toplam ders sayısından sonra olamaz.'
                })
        
        # Akşam arası kontrolü
        if attrs.get('evening_break_enabled'):
            evening_after = attrs.get('evening_break_after_lesson', 8)
            if evening_after > attrs.get('lesson_count', 8):
                raise serializers.ValidationError({
                    'evening_break_after_lesson': 'Akşam arası, toplam ders sayısından sonra olamaz.'
                })
            # Akşam arası, öğle arasından sonra olmalı
            if attrs.get('lunch_break_enabled') and evening_after <= attrs.get('lunch_break_after_lesson', 4):
                raise serializers.ValidationError({
                    'evening_break_after_lesson': 'Akşam arası, öğle arasından sonra olmalıdır.'
                })
        
        return attrs


class GeneratedSlotSerializer(serializers.Serializer):
    """
    Üretilen slot önizleme serializer
    """
    order = serializers.IntegerField()
    name = serializers.CharField()
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()
    slot_type = serializers.CharField()
    slot_type_display = serializers.CharField()
    duration = serializers.IntegerField()
    is_break = serializers.BooleanField()
