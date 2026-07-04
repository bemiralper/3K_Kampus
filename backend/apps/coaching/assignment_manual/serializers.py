"""
Manuel Ödev Atama - Serializers
"""
from django.utils import timezone
from rest_framework import serializers
from .models import (
    ManualAssignment,
    AssignmentLesson,
    AssignmentTask,
    AssignmentPackage,
    AssignmentPackageItem,
)


class AssignmentTaskSerializer(serializers.ModelSerializer):
    """Görev Serializer"""
    task_type_display = serializers.CharField(source='get_task_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    completion_status_display = serializers.CharField(source='get_completion_status_display', read_only=True)
    content_topic_name = serializers.SerializerMethodField()

    class Meta:
        model = AssignmentTask
        fields = [
            'id', 'lesson_block', 'content', 'content_topic_name',
            'task_type', 'task_type_display',
            'title', 'description', 'is_required',
            'question_count', 'page_count',
            'estimated_duration_minutes', 'order', 'status', 'status_display',
            'completion_status', 'completion_status_display',
            'task_completion_percent', 'completed_question_count', 'completed_page_count',
            'coach_evaluation_note', 'evaluated_at',
            'actual_duration_minutes', 'completed_at', 'student_feedback',
            'is_completion_task', 'previous_task_completion_percent', 'previous_assignment_title',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'completed_question_count', 'completed_page_count']

    def get_content_topic_name(self, obj):
        """İçerik kaynağının konu adını döndür (ResourceContent.topic.ad)"""
        if obj.content and hasattr(obj.content, 'topic') and obj.content.topic:
            return obj.content.topic.ad
        return None


class AssignmentLessonSerializer(serializers.ModelSerializer):
    """Ders Bloğu Serializer"""
    tasks = AssignmentTaskSerializer(many=True, read_only=True)
    content_mode_display = serializers.CharField(source='get_content_mode_display', read_only=True)
    lesson_name = serializers.SerializerMethodField()
    resource_book_name = serializers.CharField(source='resource_book.ad', read_only=True, allow_null=True)
    
    class Meta:
        model = AssignmentLesson
        fields = [
            'id', 'assignment', 'lesson', 'lesson_name', 'order',
            'resource_book', 'resource_book_name',
            'content_mode', 'content_mode_display',
            'topic_name', 'page_start', 'page_end', 'test_number',
            'notes', 'tasks', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_lesson_name(self, obj):
        """Ders adını lesson veya resource_book.ders'ten çek"""
        if obj.lesson:
            return obj.lesson.ad
        if obj.resource_book and obj.resource_book.ders:
            return obj.resource_book.ders.ad
        return None


class ManualAssignmentListSerializer(serializers.ModelSerializer):
    """Ödev Liste Serializer (hafif)"""
    coach_name = serializers.SerializerMethodField()
    student_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    risk_status_display = serializers.CharField(source='get_risk_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    lesson_count = serializers.SerializerMethodField()
    task_count = serializers.SerializerMethodField()
    pending_task_count = serializers.SerializerMethodField()
    evaluated_task_count = serializers.SerializerMethodField()
    non_submission_reason_display = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    is_due_today = serializers.SerializerMethodField()
    is_control_locked = serializers.SerializerMethodField()
    
    class Meta:
        model = ManualAssignment
        fields = [
            'id', 'coach', 'coach_name', 'student', 'student_name',
            'title', 'description', 'status', 'status_display',
            'risk_status', 'risk_status_display', 'priority', 'priority_display',
            'assigned_date', 'due_date', 'completion_percent',
            'lesson_count', 'task_count', 'pending_task_count', 'evaluated_task_count',
            'postpone_count', 'non_submission_reason', 'non_submission_reason_display',
            'is_overdue', 'is_due_today', 'is_control_locked', 'created_at'
        ]
    
    def get_coach_name(self, obj):
        return obj.coach.get_full_name() if obj.coach else None
    
    def get_student_name(self, obj):
        return f"{obj.student.ad} {obj.student.soyad}" if obj.student else None
    
    def get_lesson_count(self, obj):
        return obj.lessons.count()
    
    def get_task_count(self, obj):
        return AssignmentTask.objects.filter(lesson_block__assignment=obj).count()

    def get_pending_task_count(self, obj):
        return AssignmentTask.objects.filter(
            lesson_block__assignment=obj,
            completion_status=AssignmentTask.CompletionStatus.PENDING,
        ).count()

    def get_evaluated_task_count(self, obj):
        return AssignmentTask.objects.filter(
            lesson_block__assignment=obj,
        ).exclude(
            completion_status=AssignmentTask.CompletionStatus.PENDING,
        ).count()

    def get_non_submission_reason_display(self, obj):
        if not obj.non_submission_reason:
            return None
        return obj.get_non_submission_reason_display()

    def _due_local_date(self, obj):
        if not obj.due_date:
            return None
        if timezone.is_aware(obj.due_date):
            return timezone.localtime(obj.due_date).date()
        return obj.due_date.date()

    def get_is_overdue(self, obj):
        if obj.status in (ManualAssignment.Status.COMPLETED, ManualAssignment.Status.CANCELLED):
            return False
        if obj.status == ManualAssignment.Status.OVERDUE:
            return True
        due = self._due_local_date(obj)
        if not due:
            return False
        return due < timezone.localdate()

    def get_is_due_today(self, obj):
        if obj.status in (
            ManualAssignment.Status.COMPLETED,
            ManualAssignment.Status.CANCELLED,
            ManualAssignment.Status.DRAFT,
        ):
            return False
        due = self._due_local_date(obj)
        if not due:
            return False
        return due == timezone.localdate()

    def get_is_control_locked(self, obj):
        from .lock_utils import is_assignment_control_locked
        return is_assignment_control_locked(obj)


class ManualAssignmentDeletedSerializer(serializers.ModelSerializer):
    """Silinmiş ödev arşiv kaydı (admin)."""
    student_name = serializers.SerializerMethodField()
    coach_name = serializers.SerializerMethodField()
    deleted_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ManualAssignment
        fields = [
            'id', 'student', 'student_name', 'title',
            'coach', 'coach_name',
            'deleted_by', 'deleted_by_name', 'deleted_at', 'deletion_reason',
        ]

    def get_student_name(self, obj):
        return f"{obj.student.ad} {obj.student.soyad}" if obj.student else None

    def get_coach_name(self, obj):
        return obj.coach.get_full_name() if obj.coach else None

    def get_deleted_by_name(self, obj):
        if not obj.deleted_by:
            return None
        return obj.deleted_by.get_full_name() or obj.deleted_by.username


class ManualAssignmentDetailSerializer(serializers.ModelSerializer):
    """Ödev Detay Serializer (tüm ilişkilerle)"""
    lessons = AssignmentLessonSerializer(many=True, read_only=True)
    coach_name = serializers.SerializerMethodField()
    student_name = serializers.SerializerMethodField()
    student_info = serializers.SerializerMethodField()
    report_summary = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    risk_status_display = serializers.CharField(source='get_risk_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    is_late_submission = serializers.BooleanField(read_only=True)
    late_days = serializers.IntegerField(read_only=True)
    is_control_locked = serializers.SerializerMethodField()
    
    class Meta:
        model = ManualAssignment
        fields = [
            'id', 'coach', 'coach_name', 'student', 'student_name', 'student_info',
            'title', 'description', 'status', 'status_display',
            'risk_status', 'risk_status_display', 'priority', 'priority_display',
            'assigned_date', 'due_date', 'reminder_date', 'completed_date',
            'expected_accuracy_percent', 'minimum_completion_percent',
            'estimated_duration_minutes', 'difficulty_level',
            'actual_accuracy_percent', 'completion_percent', 'actual_duration_minutes',
            'postpone_count', 'original_due_date', 'postpone_reason', 'max_postpone',
            'late_submission_note', 'is_late_submission', 'late_days',
            'non_submission_reason', 'non_submission_note',
            'template_id', 'coach_notes', 'student_notes', 'lessons',
            'report_summary', 'is_control_locked',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'assigned_date', 'completed_date']
    
    def get_coach_name(self, obj):
        return obj.coach.get_full_name() if obj.coach else None
    
    def get_student_name(self, obj):
        return f"{obj.student.ad} {obj.student.soyad}" if obj.student else None
    
    def get_student_info(self, obj):
        """Öğrenci bilgileri"""
        foto_url = None
        if obj.student.profil_foto:
            foto_url = obj.student.profil_foto.url
        return {
            'id': obj.student.id,
            'ad': obj.student.ad,
            'soyad': obj.student.soyad,
            'tc_kimlik_no': obj.student.tc_kimlik_no,
            'profil_foto': foto_url,
        }
    
    def get_report_summary(self, obj):
        """Ödev sonuç raporu için özet veriler"""
        from .completion_utils import build_report_summary_counts

        tasks = AssignmentTask.objects.filter(lesson_block__assignment=obj)
        summary = build_report_summary_counts(tasks)
        summary['overall_completion_percent'] = obj.completion_percent
        return summary

    def get_is_control_locked(self, obj):
        from .lock_utils import is_assignment_control_locked
        return is_assignment_control_locked(obj)


class ManualAssignmentCreateSerializer(serializers.ModelSerializer):
    """Ödev Oluşturma Serializer"""
    # Yazma için özel nested serializer kullan
    lessons = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        write_only=True
    )
    template_id = serializers.PrimaryKeyRelatedField(
        queryset=AssignmentPackage.objects.filter(is_active=True),
        source='template',
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = ManualAssignment
        fields = [
            'student', 'title', 'description', 'priority', 'status',
            'due_date', 'reminder_date',
            'expected_accuracy_percent', 'minimum_completion_percent',
            'estimated_duration_minutes', 'difficulty_level',
            'coach_notes', 'source_assignment', 'template_id', 'lessons'
        ]
    
    def create(self, validated_data):
        from django.utils import timezone
        
        lessons_data = validated_data.pop('lessons', [])
        
        # Coach otomatik set edilir (anonim kullanıcı için None)
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['coach'] = request.user
        else:
            validated_data['coach'] = None
        
        # Eğer status ASSIGNED olarak geldiyse assigned_date'i set et
        if validated_data.get('status') == 'ASSIGNED':
            validated_data['assigned_date'] = timezone.now()
        
        # Ödev oluştur
        assignment = ManualAssignment.objects.create(**validated_data)
        
        # Dersleri oluştur
        for lesson_data in lessons_data:
            tasks_data = lesson_data.pop('tasks', [])
            
            # lesson alanı null olabilir
            lesson_id = lesson_data.pop('lesson', None)
            if lesson_id:
                lesson_data['lesson_id'] = lesson_id
            
            # resource_book alanını kontrol et
            resource_book_id = lesson_data.pop('resource_book', None)
            if resource_book_id:
                lesson_data['resource_book_id'] = resource_book_id
            
            lesson = AssignmentLesson.objects.create(
                assignment=assignment,
                **lesson_data
            )
            
            # Görevleri oluştur
            for task_data in tasks_data:
                # lesson_block alanını kaldır (otomatik set edilecek)
                task_data.pop('lesson_block', None)
                # content_id alanını FK olarak set et
                content_id = task_data.pop('content_id', None)
                if content_id:
                    task_data['content_id'] = content_id
                    # Content'ten soru/sayfa sayısını otomatik çek (yoksa veya 0 ise)
                    try:
                        from apps.resources.models import ResourceContent
                        content = ResourceContent.objects.get(id=content_id)
                        if not task_data.get('question_count'):
                            task_data['question_count'] = content.question_count
                        if not task_data.get('page_count') and content.page_start and content.page_end:
                            task_data['page_count'] = content.page_end - content.page_start + 1
                    except Exception:
                        pass
                AssignmentTask.objects.create(
                    lesson_block=lesson,
                    **task_data
                )
        
        return assignment


class AssignmentPackageItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssignmentPackageItem
        fields = [
            'id', 'book_id', 'book_name', 'content_id', 'content_name',
            'content_type', 'topic_name', 'unit_name',
            'question_count', 'page_start', 'page_end', 'order',
        ]
        read_only_fields = ['id']


class AssignmentPackageListSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AssignmentPackage
        fields = [
            'id', 'name', 'description', 'ders_ad', 'sinif_seviyesi',
            'usage_count', 'is_active', 'item_count',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]

    def get_item_count(self, obj):
        return obj.items.count()

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None


class AssignmentPackageDetailSerializer(serializers.ModelSerializer):
    items = AssignmentPackageItemSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AssignmentPackage
        fields = [
            'id', 'name', 'description', 'ders_ad', 'sinif_seviyesi',
            'usage_count', 'is_active', 'items',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None


class AssignmentPackageWriteSerializer(serializers.ModelSerializer):
    items = AssignmentPackageItemSerializer(many=True, required=False)

    class Meta:
        model = AssignmentPackage
        fields = [
            'name', 'description', 'ders_ad', 'sinif_seviyesi', 'items',
        ]

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['created_by'] = request.user
        package = AssignmentPackage.objects.create(**validated_data)
        self._sync_items(package, items_data)
        return package

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            self._sync_items(instance, items_data)
        return instance

    def _sync_items(self, package, items_data):
        for index, item_data in enumerate(items_data):
            if 'order' not in item_data:
                item_data['order'] = index
            AssignmentPackageItem.objects.create(package=package, **item_data)


class StudentResourceFilterSerializer(serializers.Serializer):
    """
    Öğrenci Kaynak Filtreleme Serializer (manual-assignments POST student_resources).

    resource_type and publisher use the same semantics as GET query params on
    /api/student-resources/assignments/ (list, available_resources, student_detail):
    resource_type → book_type kod (iexact) or ad (icontains); publisher → yayinevi (icontains).
    """
    student_id = serializers.IntegerField(required=True)
    lesson_id = serializers.IntegerField(required=False)
    resource_type = serializers.CharField(required=False)
    publisher = serializers.CharField(required=False)
