"""
ClassroomGroup Serializers
"""
from rest_framework import serializers

from apps.academic.domain.classroom_group import ClassroomGroup


class ClassroomGroupListSerializer(serializers.ModelSerializer):
    """Liste görünümü için serializer"""
    classroom_ad = serializers.CharField(source='classroom.ad', read_only=True)
    student_count = serializers.IntegerField(read_only=True, default=0)
    
    class Meta:
        model = ClassroomGroup
        fields = [
            'id',
            'classroom',
            'classroom_ad',
            'name',
            'capacity',
            'student_count',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ClassroomGroupCreateSerializer(serializers.Serializer):
    """Oluşturma için serializer"""
    classroom_id = serializers.IntegerField(required=True)
    name = serializers.CharField(max_length=50, required=True)
    capacity = serializers.IntegerField(required=False, allow_null=True)


class ClassroomGroupUpdateSerializer(serializers.Serializer):
    """Güncelleme için serializer"""
    name = serializers.CharField(max_length=50, required=False)
    capacity = serializers.IntegerField(required=False, allow_null=True)


class ClassroomGroupDetailSerializer(serializers.ModelSerializer):
    """Detay görünümü için serializer"""
    classroom_ad = serializers.CharField(source='classroom.ad', read_only=True)
    current_count = serializers.IntegerField(read_only=True)
    available_capacity = serializers.IntegerField(read_only=True)
    is_full = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = ClassroomGroup
        fields = [
            'id',
            'classroom',
            'classroom_ad',
            'name',
            'capacity',
            'current_count',
            'available_capacity',
            'is_full',
            'is_active',
            'created_at',
            'updated_at',
        ]
