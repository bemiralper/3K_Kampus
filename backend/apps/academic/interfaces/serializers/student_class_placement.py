"""
StudentClassPlacement Serializers
"""
from rest_framework import serializers

from apps.academic.domain.student_class_placement import StudentClassPlacement, PlacementType


class PlacementTypeSerializer(serializers.Serializer):
    """Yerleşim türü seçenekleri"""
    value = serializers.CharField()
    label = serializers.CharField()


class StudentClassPlacementListSerializer(serializers.ModelSerializer):
    """Liste görünümü için serializer"""
    academic_year_str = serializers.CharField(source='academic_year.yil_str', read_only=True)
    term_ad = serializers.CharField(source='term.name', read_only=True)
    student_ad = serializers.SerializerMethodField()
    student_no = serializers.SerializerMethodField()
    classroom_ad = serializers.CharField(source='classroom.ad', read_only=True)
    group_ad = serializers.SerializerMethodField()
    placement_type_display = serializers.CharField(read_only=True)
    
    class Meta:
        model = StudentClassPlacement
        fields = [
            'id',
            'academic_year',
            'academic_year_str',
            'term',
            'term_ad',
            'student',
            'student_ad',
            'student_no',
            'classroom',
            'classroom_ad',
            'group',
            'group_ad',
            'placement_type',
            'placement_type_display',
            'start_date',
            'end_date',
            'is_active',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'academic_year', 'created_at', 'updated_at']
    
    def get_student_ad(self, obj):
        return f"{obj.student.ad} {obj.student.soyad}"
    
    def get_student_no(self, obj):
        # Öğrenci numarası varsa döndür
        return getattr(obj.student, 'ogrenci_no', None)
    
    def get_group_ad(self, obj):
        return obj.group.name if obj.group else None


class StudentClassPlacementCreateSerializer(serializers.Serializer):
    """Oluşturma için serializer"""
    term_id = serializers.IntegerField(required=True)
    student_id = serializers.IntegerField(required=True)
    classroom_id = serializers.IntegerField(required=True)
    group_id = serializers.IntegerField(required=False, allow_null=True)
    placement_type = serializers.ChoiceField(
        choices=PlacementType.choices,
        default=PlacementType.PRIMARY
    )
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class StudentClassPlacementUpdateSerializer(serializers.Serializer):
    """Güncelleme için serializer"""
    classroom_id = serializers.IntegerField(required=False)
    group_id = serializers.IntegerField(required=False, allow_null=True)
    placement_type = serializers.ChoiceField(
        choices=PlacementType.choices,
        required=False
    )
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class StudentClassPlacementDetailSerializer(serializers.ModelSerializer):
    """Detay görünümü için serializer"""
    academic_year_str = serializers.CharField(source='academic_year.yil_str', read_only=True)
    term_ad = serializers.CharField(source='term.name', read_only=True)
    student_ad = serializers.SerializerMethodField()
    student_no = serializers.SerializerMethodField()
    classroom_ad = serializers.CharField(source='classroom.ad', read_only=True)
    group_ad = serializers.SerializerMethodField()
    placement_type_display = serializers.CharField(read_only=True)
    student_full_name = serializers.CharField(read_only=True)
    
    class Meta:
        model = StudentClassPlacement
        fields = [
            'id',
            'academic_year',
            'academic_year_str',
            'term',
            'term_ad',
            'student',
            'student_ad',
            'student_no',
            'student_full_name',
            'classroom',
            'classroom_ad',
            'group',
            'group_ad',
            'placement_type',
            'placement_type_display',
            'start_date',
            'end_date',
            'is_active',
            'notes',
            'created_at',
            'updated_at',
        ]
    
    def get_student_ad(self, obj):
        return f"{obj.student.ad} {obj.student.soyad}"
    
    def get_student_no(self, obj):
        return getattr(obj.student, 'ogrenci_no', None)
    
    def get_group_ad(self, obj):
        return obj.group.name if obj.group else None


class BulkAssignSerializer(serializers.Serializer):
    """Toplu yerleşim için serializer"""
    term_id = serializers.IntegerField(required=True)
    classroom_id = serializers.IntegerField(required=True)
    group_id = serializers.IntegerField(required=False, allow_null=True)
    student_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=True,
        min_length=1
    )
    placement_type = serializers.ChoiceField(
        choices=PlacementType.choices,
        default=PlacementType.PRIMARY
    )


class BulkAssignResultSerializer(serializers.Serializer):
    """Toplu yerleşim sonuç serializer"""
    created = serializers.ListField(child=serializers.IntegerField())
    updated = serializers.ListField(child=serializers.IntegerField())
    skipped = serializers.ListField(child=serializers.ListField())
    errors = serializers.ListField(child=serializers.ListField())
    summary = serializers.DictField()
