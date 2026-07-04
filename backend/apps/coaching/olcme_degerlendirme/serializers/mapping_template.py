"""
Eşleştirme Şablonu Serializer'ları
"""
from rest_framework import serializers
from ..models import MappingTemplate


class MappingTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MappingTemplate
        fields = [
            'id', 'name', 'exam_type', 'mappings',
            'first_line_is_header', 'student_id_field',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
