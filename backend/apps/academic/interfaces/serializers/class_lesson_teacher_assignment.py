"""
ClassLessonTeacherAssignment Serializers

Sınıf Ders Çoklu Öğretmen Ataması için serializer'lar.
"""
from rest_framework import serializers

from apps.academic.domain.class_lesson_teacher_assignment import (
    ClassLessonTeacherAssignment,
    TeacherRole
)


class ClassLessonTeacherAssignmentListSerializer(serializers.ModelSerializer):
    """
    Liste görünümü için serializer
    İlişkili alanların adlarını içerir
    """
    sinif_ad = serializers.CharField(source='class_lesson_plan.sinif.ad', read_only=True)
    ders_ad = serializers.CharField(source='class_lesson_plan.ders.ad', read_only=True)
    ders_kod = serializers.CharField(source='class_lesson_plan.ders.kod', read_only=True)
    ogretmen_ad = serializers.SerializerMethodField()
    egitim_yili_str = serializers.CharField(source='egitim_yili.yil_str', read_only=True)
    role_display = serializers.CharField(read_only=True)
    weekly_hours = serializers.IntegerField(source='class_lesson_plan.weekly_hours', read_only=True)
    term_ad = serializers.CharField(source='class_lesson_plan.term.name', read_only=True)
    
    class Meta:
        model = ClassLessonTeacherAssignment
        fields = [
            'id',
            'egitim_yili',
            'egitim_yili_str',
            'class_lesson_plan',
            'sinif_ad',
            'ders_ad',
            'ders_kod',
            'term_ad',
            'weekly_hours',
            'ogretmen',
            'ogretmen_ad',
            'role',
            'role_display',
            'priority',
            'max_hours_for_class',
            'notes',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'egitim_yili', 'created_at', 'updated_at']
    
    def get_ogretmen_ad(self, obj):
        if obj.ogretmen:
            return f"{obj.ogretmen.ad} {obj.ogretmen.soyad}"
        return None


class ClassLessonTeacherAssignmentCreateSerializer(serializers.ModelSerializer):
    """
    Oluşturma için serializer
    egitim_yili otomatik atanır
    """
    class_lesson_plan_id = serializers.IntegerField(write_only=True)
    ogretmen_id = serializers.IntegerField(write_only=True)
    role = serializers.ChoiceField(
        choices=TeacherRole.choices,
        default=TeacherRole.PRIMARY
    )
    
    class Meta:
        model = ClassLessonTeacherAssignment
        fields = [
            'class_lesson_plan_id',
            'ogretmen_id',
            'role',
            'priority',
            'max_hours_for_class',
            'notes',
        ]
    
    def validate_priority(self, value):
        """priority validasyonu"""
        if value is not None and (value < 1 or value > 10):
            raise serializers.ValidationError(
                'Öncelik 1 ile 10 arasında olmalıdır.'
            )
        return value
    
    def validate_max_hours_for_class(self, value):
        """max_hours_for_class validasyonu"""
        if value is not None and (value < 1 or value > 40):
            raise serializers.ValidationError(
                'Maksimum saat 1 ile 40 arasında olmalıdır.'
            )
        return value


class ClassLessonTeacherAssignmentUpdateSerializer(serializers.ModelSerializer):
    """
    Güncelleme için serializer
    Sadece güncellenebilir alanlar
    """
    role = serializers.ChoiceField(
        choices=TeacherRole.choices,
        required=False
    )
    
    class Meta:
        model = ClassLessonTeacherAssignment
        fields = [
            'role',
            'priority',
            'max_hours_for_class',
            'notes',
        ]
    
    def validate_priority(self, value):
        """priority validasyonu"""
        if value is not None and (value < 1 or value > 10):
            raise serializers.ValidationError(
                'Öncelik 1 ile 10 arasında olmalıdır.'
            )
        return value
    
    def validate_max_hours_for_class(self, value):
        """max_hours_for_class validasyonu"""
        if value is not None and (value < 1 or value > 40):
            raise serializers.ValidationError(
                'Maksimum saat 1 ile 40 arasında olmalıdır.'
            )
        return value


class ClassLessonTeacherAssignmentDetailSerializer(serializers.ModelSerializer):
    """
    Detay görünümü için serializer
    Tüm ilişkili bilgileri içerir
    """
    sinif_id = serializers.IntegerField(source='class_lesson_plan.sinif.id', read_only=True)
    sinif_ad = serializers.CharField(source='class_lesson_plan.sinif.ad', read_only=True)
    ders_id = serializers.IntegerField(source='class_lesson_plan.ders.id', read_only=True)
    ders_ad = serializers.CharField(source='class_lesson_plan.ders.ad', read_only=True)
    ders_kod = serializers.CharField(source='class_lesson_plan.ders.kod', read_only=True)
    ogretmen_ad = serializers.SerializerMethodField()
    ogretmen_brans = serializers.CharField(source='ogretmen.brans', read_only=True)
    egitim_yili_str = serializers.CharField(source='egitim_yili.yil_str', read_only=True)
    role_display = serializers.CharField(read_only=True)
    weekly_hours = serializers.IntegerField(source='class_lesson_plan.weekly_hours', read_only=True)
    term_id = serializers.IntegerField(source='class_lesson_plan.term.id', read_only=True)
    term_ad = serializers.CharField(source='class_lesson_plan.term.name', read_only=True)
    
    class Meta:
        model = ClassLessonTeacherAssignment
        fields = [
            'id',
            'egitim_yili',
            'egitim_yili_str',
            'class_lesson_plan',
            'sinif_id',
            'sinif_ad',
            'ders_id',
            'ders_ad',
            'ders_kod',
            'term_id',
            'term_ad',
            'weekly_hours',
            'ogretmen',
            'ogretmen_ad',
            'ogretmen_brans',
            'role',
            'role_display',
            'priority',
            'max_hours_for_class',
            'notes',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'egitim_yili', 'created_at', 'updated_at']
    
    def get_ogretmen_ad(self, obj):
        if obj.ogretmen:
            return f"{obj.ogretmen.ad} {obj.ogretmen.soyad}"
        return None


class TeacherRoleSerializer(serializers.Serializer):
    """
    Rol seçenekleri için serializer
    """
    value = serializers.CharField()
    label = serializers.CharField()
    
    @staticmethod
    def get_roles():
        """Tüm rol seçeneklerini döndür"""
        return [
            {'value': choice[0], 'label': choice[1]}
            for choice in TeacherRole.choices
        ]
