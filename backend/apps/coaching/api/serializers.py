"""
Coaching API Serializers
"""
from rest_framework import serializers
from apps.coaching.models import CoachProfile, CoachStudentAssignment, CoachingEvent


class CoachProfileSerializer(serializers.ModelSerializer):
    """Koç Profili Serializer - Listeleme ve Detay için"""
    
    # Teacher bilgileri
    teacher_id = serializers.IntegerField(source='teacher.id', read_only=True)
    teacher_ad = serializers.CharField(source='teacher.ad', read_only=True)
    teacher_soyad = serializers.CharField(source='teacher.soyad', read_only=True)
    teacher_full_name = serializers.SerializerMethodField()
    teacher_fotograf = serializers.SerializerMethodField()
    
    # Computed fields (model property'lerinden)
    current_student_count = serializers.IntegerField(read_only=True)
    available_capacity = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = CoachProfile
        fields = [
            'id',
            'teacher',
            'teacher_id',
            'teacher_ad',
            'teacher_soyad',
            'teacher_full_name',
            'teacher_fotograf',
            'capacity',
            'is_active',
            'is_coach',
            'current_student_count',
            'available_capacity',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_teacher_full_name(self, obj):
        """Öğretmenin tam adını döndür"""
        return f"{obj.teacher.ad} {obj.teacher.soyad}"

    def get_teacher_fotograf(self, obj):
        """Personel profil fotoğrafı URL'si"""
        if not obj.teacher or not obj.teacher.fotograf:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.teacher.fotograf.url)
        return obj.teacher.fotograf.url


class CoachCreateUpdateSerializer(serializers.ModelSerializer):
    """Koç Profili Oluşturma ve Güncelleme Serializer"""
    
    class Meta:
        model = CoachProfile
        fields = [
            'teacher',
            'capacity',
            'is_active',
            'is_coach',
        ]
    
    def validate_teacher(self, value):
        """
        Öğretmenin zaten başka bir CoachProfile'a bağlı olmadığını kontrol et.
        Update durumunda mevcut kaydı hariç tut.
        """
        instance = self.instance
        existing = CoachProfile.objects.filter(teacher=value)
        
        if instance:
            existing = existing.exclude(pk=instance.pk)
        
        if existing.exists():
            raise serializers.ValidationError(
                f"Bu öğretmen ({value.ad} {value.soyad}) zaten bir koç profiliyle ilişkilendirilmiş."
            )
        
        return value
    
    def validate_capacity(self, value):
        """Kapasite değerini doğrula"""
        if value < 1:
            raise serializers.ValidationError("Kapasite en az 1 olmalıdır.")
        if value > 100:
            raise serializers.ValidationError("Kapasite en fazla 100 olabilir.")
        return value


class CoachMeUpdateSerializer(serializers.Serializer):
    """Koçun kendi iletişim bilgilerini güncellemesi."""

    telefon = serializers.CharField(max_length=20, required=False, allow_blank=True)
    cep_telefon = serializers.CharField(max_length=20, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)


class CoachStudentAssignmentSerializer(serializers.ModelSerializer):
    """Koç-Öğrenci Ataması Serializer"""
    
    student_id = serializers.IntegerField(source='student.id', read_only=True)
    student_ad = serializers.CharField(source='student.ad', read_only=True)
    student_soyad = serializers.CharField(source='student.soyad', read_only=True)
    student_full_name = serializers.SerializerMethodField()
    student_sinif = serializers.SerializerMethodField()
    
    class Meta:
        model = CoachStudentAssignment
        fields = [
            'id',
            'student',
            'student_id',
            'student_ad',
            'student_soyad',
            'student_full_name',
            'student_sinif',
            'start_date',
            'end_date',
            'is_primary',
            'created_at',
        ]
    
    def get_student_full_name(self, obj):
        """Öğrencinin tam adını döndür"""
        return f"{obj.student.ad} {obj.student.soyad}"
    
    def get_student_sinif(self, obj):
        """Öğrencinin aktif sınıf bilgisini döndür"""
        try:
            # OgrenciKayit tablosundan aktif kaydı al
            aktif_kayit = obj.student.kayitlar.select_related('sinif').filter(
                aktif_mi=True
            ).first()
            if aktif_kayit and aktif_kayit.sinif:
                return aktif_kayit.sinif.ad
        except Exception:
            pass
        return None


class CoachStatsSerializer(serializers.Serializer):
    """Koç İstatistikleri Serializer"""
    
    current_student_count = serializers.IntegerField()
    available_capacity = serializers.IntegerField()
    active_assignments = serializers.IntegerField()
    pending_events = serializers.IntegerField()
    completed_events = serializers.IntegerField()
    total_events = serializers.IntegerField()
    gorev_bekleyen = serializers.IntegerField()
    gorev_geciken = serializers.IntegerField()
    gorev_tamamlanan = serializers.IntegerField()


class CoachPeriodCountSerializer(serializers.Serializer):
    toplam = serializers.IntegerField()
    bu_hafta = serializers.IntegerField()
    bu_ay = serializers.IntegerField()


class CoachSelfStatsOgrencilerSerializer(serializers.Serializer):
    aktif_ogrenci = serializers.IntegerField()
    kapasite = serializers.IntegerField()
    bos_kapasite = serializers.IntegerField()
    riskli_ogrenci = serializers.IntegerField()
    gorusme_bekleyen = serializers.IntegerField()


class CoachSelfStatsOdevlerSerializer(serializers.Serializer):
    verilen = CoachPeriodCountSerializer()
    tamamlanan = serializers.IntegerField()
    devam_eden = serializers.IntegerField()
    geciken = serializers.IntegerField()
    bekleyen_kontrol = serializers.IntegerField()


class CoachSelfStatsGorusmelerSerializer(serializers.Serializer):
    ogrenci = CoachPeriodCountSerializer()
    veli = CoachPeriodCountSerializer()
    tamamlanan_toplam = serializers.IntegerField()
    bugun_planli = serializers.IntegerField()


class CoachSelfStatsGorevlerSerializer(serializers.Serializer):
    bekleyen = serializers.IntegerField()
    bugun = serializers.IntegerField()
    geciken = serializers.IntegerField()
    tamamlanan = serializers.IntegerField()
    tamamlanamayan = serializers.IntegerField()


class CoachSelfStatsSerializer(serializers.Serializer):
    """Koçun kendi performans istatistikleri — GET coaches/me/stats/"""

    ogrenciler = CoachSelfStatsOgrencilerSerializer()
    odevler = CoachSelfStatsOdevlerSerializer()
    gorusmeler = CoachSelfStatsGorusmelerSerializer()
    gorevler = CoachSelfStatsGorevlerSerializer()


# ==================== ASSIGNMENT SERIALIZERS ====================

class AssignmentListSerializer(serializers.ModelSerializer):
    """Assignment listesi için serializer (read-only)"""
    
    # Coach bilgileri
    coach_id = serializers.IntegerField(source='coach.id', read_only=True)
    coach_full_name = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()
    coach_capacity = serializers.IntegerField(source='coach.capacity', read_only=True)
    coach_current_count = serializers.IntegerField(source='coach.current_student_count', read_only=True)
    
    # Student bilgileri
    student_id = serializers.IntegerField(source='student.id', read_only=True)
    student_ad = serializers.CharField(source='student.ad', read_only=True)
    student_soyad = serializers.CharField(source='student.soyad', read_only=True)
    student_full_name = serializers.SerializerMethodField()
    student_sinif = serializers.SerializerMethodField()
    
    class Meta:
        model = CoachStudentAssignment
        fields = [
            'id',
            'coach', 'coach_id', 'coach_full_name', 'coach_capacity', 'coach_current_count',
            'student', 'student_id', 'student_ad', 'student_soyad', 'student_full_name', 'student_sinif',
            'start_date', 'end_date', 'is_primary', 'is_active',
            'created_at', 'updated_at',
        ]
    
    def get_is_active(self, obj):
        return obj.end_date is None

    def get_coach_full_name(self, obj):
        return f"{obj.coach.teacher.ad} {obj.coach.teacher.soyad}"
    
    def get_student_full_name(self, obj):
        return f"{obj.student.ad} {obj.student.soyad}"
    
    def get_student_sinif(self, obj):
        """Öğrencinin aktif sınıf bilgisini döndür"""
        try:
            # OgrenciKayit tablosundan aktif kaydı al
            aktif_kayit = obj.student.kayitlar.select_related('sinif').filter(
                aktif_mi=True
            ).first()
            if aktif_kayit and aktif_kayit.sinif:
                return aktif_kayit.sinif.ad
        except Exception:
            pass
        return None


class AssignmentCreateSerializer(serializers.ModelSerializer):
    """Yeni assignment oluşturma serializer"""

    start_date = serializers.DateField(required=False)
    
    class Meta:
        model = CoachStudentAssignment
        fields = ['coach', 'student', 'start_date', 'is_primary']
    
    def validate(self, attrs):
        from datetime import date

        if not attrs.get('start_date'):
            attrs['start_date'] = date.today()

        coach = attrs.get('coach')
        student = attrs.get('student')
        is_primary = attrs.get('is_primary', True)
        
        # Kapasite kontrolü
        if coach.available_capacity <= 0:
            raise serializers.ValidationError({
                'coach': f"Koç kapasitesi dolu ({coach.capacity}/{coach.capacity})"
            })
        
        # Aktif assignment kontrolü
        existing = CoachStudentAssignment.objects.filter(
            student=student,
            end_date__isnull=True,
            is_primary=True
        ).exists()
        
        if existing and is_primary:
            raise serializers.ValidationError({
                'student': "Bu öğrencinin zaten aktif bir birincil koçu var"
            })
        
        return attrs


class AssignmentUpdateSerializer(serializers.ModelSerializer):
    """Assignment güncelleme serializer"""
    
    class Meta:
        model = CoachStudentAssignment
        fields = ['end_date', 'is_primary']


class CoachChangeSerializer(serializers.Serializer):
    """Koç değişikliği serializer"""

    student_id = serializers.IntegerField()
    new_coach_id = serializers.IntegerField()
    transfer_date = serializers.DateField(required=False)

    def validate_student_id(self, value):
        from apps.ogrenci.domain.models import Ogrenci
        if not Ogrenci.objects.filter(pk=value).exists():
            raise serializers.ValidationError('Öğrenci bulunamadı')
        return value

    def validate_new_coach_id(self, value):
        try:
            CoachProfile.objects.get(id=value, is_active=True)
        except CoachProfile.DoesNotExist:
            raise serializers.ValidationError('Koç bulunamadı veya aktif değil')
        return value


class BulkAssignSerializer(serializers.Serializer):
    """Toplu atama serializer"""
    
    coach_id = serializers.IntegerField()
    student_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        max_length=50
    )
    start_date = serializers.DateField(required=False)
    is_primary = serializers.BooleanField(default=True)
    
    def validate_coach_id(self, value):
        try:
            coach = CoachProfile.objects.get(id=value, is_active=True)
        except CoachProfile.DoesNotExist:
            raise serializers.ValidationError("Koç bulunamadı veya aktif değil")
        return value
    
    def validate(self, attrs):
        coach_id = attrs.get('coach_id')
        student_ids = attrs.get('student_ids')
        
        coach = CoachProfile.objects.get(id=coach_id)
        
        # Kapasite kontrolü
        if coach.available_capacity < len(student_ids):
            raise serializers.ValidationError({
                'student_ids': f"Koç kapasitesi yetersiz. Müsait: {coach.available_capacity}, İstenen: {len(student_ids)}"
            })
        
        # Zaten atanmış öğrenci kontrolü
        existing = CoachStudentAssignment.objects.filter(
            student_id__in=student_ids,
            end_date__isnull=True,
            is_primary=True
        ).values_list('student_id', flat=True)
        
        if existing:
            raise serializers.ValidationError({
                'student_ids': f"Bazı öğrencilerin zaten aktif koçu var: {list(existing)}"
            })
        
        return attrs


class AvailableStudentSerializer(serializers.Serializer):
    """Atanabilir öğrenci serializer"""
    
    id = serializers.IntegerField()
    ad = serializers.CharField()
    soyad = serializers.CharField()
    full_name = serializers.SerializerMethodField()
    sinif = serializers.CharField(allow_null=True)
    seviye = serializers.CharField(allow_null=True)
    
    def get_full_name(self, obj):
        return f"{obj.get('ad', '')} {obj.get('soyad', '')}"
