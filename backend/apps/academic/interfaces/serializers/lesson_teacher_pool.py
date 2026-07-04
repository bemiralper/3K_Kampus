"""
LessonTeacherPool Serializers

Branş Öğretmen Havuzu için serializer'lar.
"""
from rest_framework import serializers

from apps.academic.domain.lesson_teacher_pool import LessonTeacherPool


class LessonTeacherPoolListSerializer(serializers.ModelSerializer):
    """
    Liste görünümü için serializer
    İlişkili alanların adlarını içerir
    """
    ders_ad = serializers.CharField(source='ders.ad', read_only=True)
    ders_kod = serializers.CharField(source='ders.kod', read_only=True)
    ogretmen_ad = serializers.SerializerMethodField()
    egitim_yili_str = serializers.CharField(source='egitim_yili.yil_str', read_only=True)
    
    class Meta:
        model = LessonTeacherPool
        fields = [
            'id',
            'egitim_yili',
            'egitim_yili_str',
            'ders',
            'ders_ad',
            'ders_kod',
            'ogretmen',
            'ogretmen_ad',
            'is_primary',
            'max_weekly_load',
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


class LessonTeacherPoolCreateSerializer(serializers.ModelSerializer):
    """
    Oluşturma için serializer
    egitim_yili otomatik atanır
    """
    ders_id = serializers.IntegerField(write_only=True)
    ogretmen_id = serializers.IntegerField(write_only=True)
    
    class Meta:
        model = LessonTeacherPool
        fields = [
            'ders_id',
            'ogretmen_id',
            'is_primary',
            'max_weekly_load',
            'notes',
        ]
    
    def validate_max_weekly_load(self, value):
        """max_weekly_load validasyonu"""
        if value is not None and (value < 1 or value > 40):
            raise serializers.ValidationError(
                'Maksimum haftalık yük 1 ile 40 arasında olmalıdır.'
            )
        return value


class LessonTeacherPoolUpdateSerializer(serializers.ModelSerializer):
    """
    Güncelleme için serializer
    Sadece güncellenebilir alanlar
    """
    class Meta:
        model = LessonTeacherPool
        fields = [
            'is_primary',
            'max_weekly_load',
            'notes',
        ]
    
    def validate_max_weekly_load(self, value):
        """max_weekly_load validasyonu"""
        if value is not None and (value < 1 or value > 40):
            raise serializers.ValidationError(
                'Maksimum haftalık yük 1 ile 40 arasında olmalıdır.'
            )
        return value


class LessonTeacherPoolDetailSerializer(serializers.ModelSerializer):
    """
    Detay görünümü için serializer
    Tüm ilişkili bilgileri içerir
    """
    ders_ad = serializers.CharField(source='ders.ad', read_only=True)
    ders_kod = serializers.CharField(source='ders.kod', read_only=True)
    ogretmen_ad = serializers.SerializerMethodField()
    ogretmen_brans = serializers.CharField(source='ogretmen.brans', read_only=True)
    egitim_yili_str = serializers.CharField(source='egitim_yili.yil_str', read_only=True)
    
    class Meta:
        model = LessonTeacherPool
        fields = [
            'id',
            'egitim_yili',
            'egitim_yili_str',
            'ders',
            'ders_ad',
            'ders_kod',
            'ogretmen',
            'ogretmen_ad',
            'ogretmen_brans',
            'is_primary',
            'max_weekly_load',
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
