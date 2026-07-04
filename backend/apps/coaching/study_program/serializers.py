"""
Çalışma Programı - Serializers
"""
from rest_framework import serializers
from .models import (
    WeeklyProgram, ProgramDay, ProgramBlock,
    DailyFeedback, Badge,
    BlockType, GoalType, LoadLevel, EnergyLevel, BadgeCode,
)


# ─────────────────────────
# Block
# ─────────────────────────

class ProgramBlockSerializer(serializers.ModelSerializer):
    block_type_display = serializers.CharField(source='get_block_type_display', read_only=True)
    goal_type_display  = serializers.CharField(source='get_goal_type_display', read_only=True)
    priority_display   = serializers.CharField(source='get_priority_display', read_only=True)
    lesson_name        = serializers.CharField(source='lesson.ad', read_only=True, allow_null=True)

    class Meta:
        model = ProgramBlock
        fields = [
            'id', 'day', 'source_assignment', 'source_task', 'source_lesson',
            'lesson', 'lesson_name',
            'title', 'topic_name', 'resource_name',
            'block_type', 'block_type_display',
            'goal_type', 'goal_type_display',
            'question_count', 'estimated_duration_minutes',
            'priority', 'priority_display', 'order',
            'is_completed', 'completed_at', 'actual_duration',
            'color', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ProgramBlockCreateSerializer(serializers.ModelSerializer):
    """Blok oluşturma / güncelleme."""
    class Meta:
        model = ProgramBlock
        fields = [
            'day', 'source_assignment', 'source_task', 'source_lesson',
            'lesson', 'title', 'topic_name', 'resource_name',
            'block_type', 'goal_type',
            'question_count', 'estimated_duration_minutes',
            'priority', 'order', 'color',
        ]


# ─────────────────────────
# Daily Feedback
# ─────────────────────────

class DailyFeedbackSerializer(serializers.ModelSerializer):
    energy_level_display = serializers.CharField(source='get_energy_level_display', read_only=True)

    class Meta:
        model = DailyFeedback
        fields = [
            'id', 'day',
            'struggled', 'time_enough', 'unclear_topic', 'comment',
            'energy_level', 'energy_level_display',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['energy_level', 'created_at', 'updated_at']


# ─────────────────────────
# Program Day
# ─────────────────────────

class ProgramDaySerializer(serializers.ModelSerializer):
    blocks   = ProgramBlockSerializer(many=True, read_only=True)
    feedback = DailyFeedbackSerializer(read_only=True)
    weekday_display  = serializers.CharField(source='get_weekday_display', read_only=True)
    load_level_display = serializers.CharField(source='get_load_level_display', read_only=True)

    class Meta:
        model = ProgramDay
        fields = [
            'id', 'program', 'day_date', 'weekday', 'weekday_display',
            'total_question_count', 'total_block_count', 'completion_percent',
            'load_level', 'load_level_display', 'coach_note',
            'blocks', 'feedback',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'total_question_count', 'total_block_count',
            'completion_percent', 'load_level',
            'created_at', 'updated_at',
        ]


# ─────────────────────────
# Badge
# ─────────────────────────

class BadgeSerializer(serializers.ModelSerializer):
    code_display = serializers.CharField(source='get_code_display', read_only=True)

    class Meta:
        model = Badge
        fields = [
            'id', 'student', 'program',
            'code', 'code_display', 'title', 'description',
            'icon', 'earned_date', 'created_at',
        ]
        read_only_fields = ['created_at']


# ─────────────────────────
# Weekly Program
# ─────────────────────────

class WeeklyProgramListSerializer(serializers.ModelSerializer):
    """Haftalık program listesi (hafif)."""
    student_name  = serializers.SerializerMethodField()
    student_photo = serializers.SerializerMethodField()
    student_class = serializers.SerializerMethodField()
    coach_name    = serializers.SerializerMethodField()
    badge_count   = serializers.SerializerMethodField()

    class Meta:
        model = WeeklyProgram
        fields = [
            'id', 'student', 'student_name', 'student_photo', 'student_class',
            'coach', 'coach_name',
            'week_start', 'week_end',
            'total_question_count', 'total_block_count', 'completion_percent',
            'is_template', 'template_name', 'badge_count',
            'created_at', 'updated_at',
        ]

    def get_student_name(self, obj):
        return f"{obj.student.ad} {obj.student.soyad}" if obj.student else None

    def get_student_photo(self, obj):
        if obj.student and obj.student.profil_foto:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.student.profil_foto.url)
            return obj.student.profil_foto.url
        return None

    def get_student_class(self, obj):
        if obj.student:
            return getattr(obj.student, 'sinif_adi', None) or getattr(obj.student, 'sinif', None) or None
        return None

    def get_coach_name(self, obj):
        return obj.coach.get_full_name() if obj.coach else None

    def get_badge_count(self, obj):
        return obj.badges.count()


class WeeklyProgramDetailSerializer(serializers.ModelSerializer):
    """Haftalık program detay (tüm günler, bloklar, feedback, rozetler)."""
    days          = ProgramDaySerializer(many=True, read_only=True)
    badges        = BadgeSerializer(many=True, read_only=True)
    student_name  = serializers.SerializerMethodField()
    student_photo = serializers.SerializerMethodField()
    student_class = serializers.SerializerMethodField()
    coach_name    = serializers.SerializerMethodField()

    class Meta:
        model = WeeklyProgram
        fields = [
            'id', 'student', 'student_name', 'student_photo', 'student_class',
            'coach', 'coach_name',
            'week_start', 'week_end',
            'total_question_count', 'total_block_count', 'completion_percent',
            'is_template', 'template_name', 'coach_note',
            'days', 'badges',
            'created_at', 'updated_at',
        ]

    def get_student_name(self, obj):
        return f"{obj.student.ad} {obj.student.soyad}" if obj.student else None

    def get_student_photo(self, obj):
        if obj.student and obj.student.profil_foto:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.student.profil_foto.url)
            return obj.student.profil_foto.url
        return None

    def get_student_class(self, obj):
        if obj.student:
            return getattr(obj.student, 'sinif_adi', None) or getattr(obj.student, 'sinif', None) or None
        return None

    def get_coach_name(self, obj):
        return obj.coach.get_full_name() if obj.coach else None


class WeeklyProgramCreateSerializer(serializers.ModelSerializer):
    """
    Program oluşturma — week_start ve week_end arasındaki günleri otomatik üretir.
    Artık Pazartesi zorunluluğu yok; ödev tarih aralığına göre esnektir.
    """
    week_end = serializers.DateField(required=False)

    class Meta:
        model = WeeklyProgram
        fields = ['student', 'week_start', 'week_end', 'coach_note', 'is_template', 'template_name']

    def validate(self, data):
        from datetime import timedelta
        ws = data['week_start']
        we = data.get('week_end')

        if we:
            if we < ws:
                raise serializers.ValidationError({'week_end': 'Bitiş tarihi başlangıçtan önce olamaz.'})
            delta = (we - ws).days
            if delta > 30:
                raise serializers.ValidationError({'week_end': 'Program süresi en fazla 30 gün olabilir.'})
        else:
            # week_end verilmediyse, 6 gün ekle (toplam 7 gün)
            data['week_end'] = ws + timedelta(days=6)

        return data

    def create(self, validated_data):
        from datetime import timedelta

        week_start = validated_data['week_start']
        week_end = validated_data['week_end']
        validated_data.setdefault('coach', self.context['request'].user)

        program = super().create(validated_data)

        # week_start → week_end arasındaki günleri oluştur
        day_count = (week_end - week_start).days + 1
        for i in range(day_count):
            day_date = week_start + timedelta(days=i)
            ProgramDay.objects.create(
                program=program,
                day_date=day_date,
                weekday=day_date.weekday(),  # 0=Pazartesi ... 6=Pazar
            )

        return program


# ─────────────────────────
# Ödev Havuzu (read-only)
# ─────────────────────────

class HomeworkPoolItemSerializer(serializers.Serializer):
    """Sol paneldeki ödev havuzu kartı — ManualAssignment'tan beslenir."""
    id             = serializers.IntegerField()
    title          = serializers.CharField()
    status         = serializers.CharField()
    status_display = serializers.CharField()
    priority       = serializers.CharField()
    priority_display = serializers.CharField()
    lesson_name    = serializers.CharField(allow_null=True)
    topic_name     = serializers.CharField(allow_blank=True)
    resource_name  = serializers.CharField(allow_blank=True)
    question_count = serializers.IntegerField()
    due_date       = serializers.DateTimeField()
    coach_name     = serializers.CharField(allow_null=True, required=False)
    is_planned     = serializers.BooleanField(help_text='Bu ödev programa atanmış mı?')
    lesson_id      = serializers.IntegerField(allow_null=True, required=False)


# ─────────────────────────
# Dengeli Dağıt (request)
# ─────────────────────────

class AutoDistributeRequestSerializer(serializers.Serializer):
    """'Dengeli Dağıt' özelliği için request body."""
    program_id     = serializers.IntegerField()
    assignment_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=True)


class SplitBlockRequestSerializer(serializers.Serializer):
    """
    Bir ödevi birden fazla güne bölmek için request body.
    day_ids: hedef gün id listesi (2-7 arası)
    question_counts: her güne düşecek soru sayıları (opsiyonel — verilmezse eşit dağıtır)
    titles: her parça için özel başlık (opsiyonel — verilmezse otomatik numaralanır)
    """
    day_ids         = serializers.ListField(child=serializers.IntegerField(), min_length=2, max_length=7)
    question_counts = serializers.ListField(child=serializers.IntegerField(min_value=0), required=False)
    titles          = serializers.ListField(child=serializers.CharField(max_length=255), required=False)

    def validate(self, data):
        day_ids = data['day_ids']
        q_counts = data.get('question_counts')
        titles = data.get('titles')

        if q_counts and len(q_counts) != len(day_ids):
            raise serializers.ValidationError('question_counts uzunluğu day_ids ile aynı olmalıdır.')
        if titles and len(titles) != len(day_ids):
            raise serializers.ValidationError('titles uzunluğu day_ids ile aynı olmalıdır.')

        return data
