"""
Sonuç Yükleme Serializer'ları
"""
from rest_framework import serializers
from ..models import ExamSession, StudentAnswer, StudentSectionScore


class ExamSessionListSerializer(serializers.ModelSerializer):
    """DAT yükleme oturumu (liste)."""
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = ExamSession
        fields = [
            'id', 'exam', 'original_filename', 'status', 'status_display',
            'total_rows', 'matched_count', 'unmatched_count', 'error_count',
            'field_mappings', 'student_id_field',
            'created_at', 'updated_at',
        ]


class StudentSectionScoreSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source='section.name', read_only=True)

    class Meta:
        model = StudentSectionScore
        fields = [
            'id', 'section', 'section_name',
            'correct', 'wrong', 'empty', 'net',
        ]


class StudentAnswerSerializer(serializers.ModelSerializer):
    """Öğrenci cevabı (detay)."""
    student_name = serializers.SerializerMethodField()
    section_scores = StudentSectionScoreSerializer(many=True, read_only=True)

    class Meta:
        model = StudentAnswer
        fields = [
            'id', 'session', 'student', 'student_name',
            'raw_student_id', 'raw_student_name', 'booklet',
            'booklet_auto_detected',
            'answers', 'comparison',
            'total_correct', 'total_wrong', 'total_empty', 'total_net',
            'is_processed', 'created_at',
            'section_scores',
        ]

    def get_student_name(self, obj):
        if obj.student:
            return f'{obj.student.ad} {obj.student.soyad}'
        return obj.raw_student_name or obj.raw_student_id or '—'
