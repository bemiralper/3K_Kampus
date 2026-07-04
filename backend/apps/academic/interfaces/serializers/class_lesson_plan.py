"""
ClassLessonPlan Serializers
"""
from rest_framework import serializers

from apps.academic.domain.class_lesson_plan import ClassLessonPlan


class ClassLessonPlanListSerializer(serializers.ModelSerializer):
    """
    Liste görünümü için serializer
    İlişkili alanların adlarını içerir
    """
    ders_ad = serializers.CharField(source='ders.ad', read_only=True)
    ders_kod = serializers.CharField(source='ders.kod', read_only=True)
    sinif_ad = serializers.CharField(source='sinif.ad', read_only=True)
    ogretmen_ad = serializers.SerializerMethodField()
    term_ad = serializers.CharField(source='term.name', read_only=True)
    egitim_yili_str = serializers.CharField(source='egitim_yili.yil_str', read_only=True)
    lesson_type_display = serializers.CharField(read_only=True)
    block_type_display = serializers.CharField(read_only=True)
    
    class Meta:
        model = ClassLessonPlan
        fields = [
            'id',
            'egitim_yili',
            'egitim_yili_str',
            'term',
            'term_ad',
            'sinif',
            'sinif_ad',
            'ders',
            'ders_ad',
            'ders_kod',
            'ogretmen',
            'ogretmen_ad',
            'weekly_hours',
            'credit',
            'is_mandatory',
            'lesson_type_display',
            'is_double_block',
            'block_type_display',
            'priority',
            'preferred_room_type',
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


class ClassLessonPlanCreateSerializer(serializers.ModelSerializer):
    """
    Oluşturma için serializer
    egitim_yili otomatik atanır
    """
    class Meta:
        model = ClassLessonPlan
        fields = [
            'term',
            'sinif',
            'ders',
            'ogretmen',
            'weekly_hours',
            'credit',
            'is_mandatory',
            'is_double_block',
            'priority',
            'preferred_room_type',
            'notes',
        ]
    
    def validate(self, data):
        """
        Çift blok kontrolü
        """
        is_double_block = data.get('is_double_block', False)
        weekly_hours = data.get('weekly_hours', 0)
        
        if is_double_block and weekly_hours < 2:
            raise serializers.ValidationError({
                'weekly_hours': 'Çift blok dersler için haftalık saat en az 2 olmalıdır.'
            })
        
        return data


class ClassLessonPlanUpdateSerializer(serializers.ModelSerializer):
    """
    Güncelleme için serializer
    Sadece güncellenebilir alanlar
    """
    class Meta:
        model = ClassLessonPlan
        fields = [
            'ogretmen',
            'weekly_hours',
            'credit',
            'is_mandatory',
            'is_double_block',
            'priority',
            'preferred_room_type',
            'notes',
        ]
    
    def validate(self, data):
        """
        Çift blok kontrolü
        """
        instance = self.instance
        is_double_block = data.get('is_double_block', instance.is_double_block if instance else False)
        weekly_hours = data.get('weekly_hours', instance.weekly_hours if instance else 0)
        
        if is_double_block and weekly_hours < 2:
            raise serializers.ValidationError({
                'weekly_hours': 'Çift blok dersler için haftalık saat en az 2 olmalıdır.'
            })
        
        return data


class ClassLessonPlanDetailSerializer(serializers.ModelSerializer):
    """
    Detay görünümü için serializer
    Tüm ilişkili verileri içerir
    """
    ders_detail = serializers.SerializerMethodField()
    sinif_detail = serializers.SerializerMethodField()
    ogretmen_detail = serializers.SerializerMethodField()
    term_detail = serializers.SerializerMethodField()
    egitim_yili_detail = serializers.SerializerMethodField()
    lesson_type_display = serializers.CharField(read_only=True)
    block_type_display = serializers.CharField(read_only=True)
    
    class Meta:
        model = ClassLessonPlan
        fields = [
            'id',
            'egitim_yili',
            'egitim_yili_detail',
            'term',
            'term_detail',
            'sinif',
            'sinif_detail',
            'ders',
            'ders_detail',
            'ogretmen',
            'ogretmen_detail',
            'weekly_hours',
            'credit',
            'is_mandatory',
            'lesson_type_display',
            'is_double_block',
            'block_type_display',
            'priority',
            'preferred_room_type',
            'notes',
            'is_active',
            'created_at',
            'updated_at',
        ]
    
    def get_ders_detail(self, obj):
        return {
            'id': obj.ders.id,
            'ad': obj.ders.ad,
            'kod': obj.ders.kod,
        }
    
    def get_sinif_detail(self, obj):
        return {
            'id': obj.sinif.id,
            'ad': obj.sinif.ad,
            'kod': obj.sinif.kod if obj.sinif.kod else None,
        }
    
    def get_ogretmen_detail(self, obj):
        if obj.ogretmen:
            return {
                'id': obj.ogretmen.id,
                'ad': obj.ogretmen.ad,
                'soyad': obj.ogretmen.soyad,
                'tam_ad': f"{obj.ogretmen.ad} {obj.ogretmen.soyad}",
            }
        return None
    
    def get_term_detail(self, obj):
        return {
            'id': obj.term.id,
            'name': obj.term.name,
            'code': obj.term.code,
        }
    
    def get_egitim_yili_detail(self, obj):
        return {
            'id': obj.egitim_yili.id,
            'yil_str': str(obj.egitim_yili),
        }


class ActiveAcademicYearSerializer(serializers.Serializer):
    """
    Aktif eğitim yılı bilgisi
    """
    id = serializers.IntegerField()
    yil_str = serializers.CharField()
    baslangic_yil = serializers.IntegerField()
    bitis_yil = serializers.IntegerField()


class ClassLessonPlanSummarySerializer(serializers.Serializer):
    """
    Sınıf ders planı özeti
    """
    classroom_id = serializers.IntegerField()
    classroom_name = serializers.CharField()
    term_id = serializers.IntegerField()
    term_name = serializers.CharField()
    total_lessons = serializers.IntegerField()
    total_weekly_hours = serializers.IntegerField()
    lessons_with_teacher = serializers.IntegerField()
    lessons_without_teacher = serializers.IntegerField()
