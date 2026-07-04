"""
ScheduleTemplate Serializers
"""

from rest_framework import serializers
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.timeslot import TimeSlot


class ScheduleTemplateListSerializer(serializers.ModelSerializer):
    """
    Şablon listesi için serializer
    """
    kurum_name = serializers.CharField(source='kurum.ad', read_only=True)
    sube_name = serializers.CharField(source='sube.ad', read_only=True, allow_null=True)
    timeslot_count = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleTemplate
        fields = [
            'id', 'name', 'description', 'is_active',
            'kurum', 'kurum_name', 'sube', 'sube_name',
            'timeslot_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_timeslot_count(self, obj):
        """Aktif ders saati sayısını döndür"""
        return obj.time_slots.filter(is_active=True).count()


class ScheduleTemplateDetailSerializer(serializers.ModelSerializer):
    """
    Şablon detayı için serializer - TimeSlot'ları da içerir
    """
    kurum_name = serializers.CharField(source='kurum.ad', read_only=True)
    sube_name = serializers.CharField(source='sube.ad', read_only=True, allow_null=True)
    time_slots = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleTemplate
        fields = [
            'id', 'name', 'description', 'is_active',
            'kurum', 'kurum_name', 'sube', 'sube_name',
            'time_slots', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_time_slots(self, obj):
        """Aktif TimeSlot'ları sıralı şekilde döndür"""
        from apps.academic.interfaces.serializers.timeslot import TimeSlotSerializer
        slots = obj.time_slots.filter(is_active=True).order_by('order')
        return TimeSlotSerializer(slots, many=True).data


class ScheduleTemplateCreateSerializer(serializers.ModelSerializer):
    """
    Şablon oluşturma için serializer
    """
    class Meta:
        model = ScheduleTemplate
        fields = ['name', 'description', 'kurum', 'sube', 'is_active']
        extra_kwargs = {
            'sube': {'required': False, 'allow_null': True},
            'description': {'required': False, 'allow_blank': True}
        }

    def validate_name(self, value):
        """İsim validasyonu"""
        if not value or len(value.strip()) < 2:
            raise serializers.ValidationError("Şablon adı en az 2 karakter olmalıdır.")
        return value.strip()

    def validate(self, attrs):
        """
        Aynı kurum/şube için aynı isimde şablon kontrolü
        """
        name = attrs.get('name')
        kurum = attrs.get('kurum')
        sube = attrs.get('sube')
        
        # Aynı isimde aktif şablon var mı kontrol et
        existing = ScheduleTemplate.objects.filter(
            kurum=kurum,
            sube=sube,
            name__iexact=name,
            is_active=True
        )
        
        # Update durumunda kendisini hariç tut
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        
        if existing.exists():
            raise serializers.ValidationError({
                'name': 'Bu isimde bir zaman şablonu zaten mevcut.'
            })
        
        return attrs


class ScheduleTemplateUpdateSerializer(ScheduleTemplateCreateSerializer):
    """
    Şablon güncelleme için serializer
    """
    class Meta(ScheduleTemplateCreateSerializer.Meta):
        pass
