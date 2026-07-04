"""
Öğrenci Kaynak Havuzu - Serializers
"""

from rest_framework import serializers
from .models import StudentResourceAssignment, ResourcePurchaseList, ResourcePurchaseListItem


class StudentResourceAssignmentSerializer(serializers.ModelSerializer):
    """Öğrenci Kaynak Ataması Listesi Serializer"""
    student_ad = serializers.CharField(source='student.ad', read_only=True)
    student_soyad = serializers.CharField(source='student.soyad', read_only=True)
    student_full_name = serializers.SerializerMethodField()
    coach_name = serializers.SerializerMethodField()
    lesson_name = serializers.CharField(source='lesson.ad', read_only=True)
    resource_name = serializers.CharField(source='resource_book.ad', read_only=True)
    resource_type = serializers.CharField(source='resource_book.book_type.ad', read_only=True)
    resource_yayin_yili = serializers.IntegerField(source='resource_book.yayin_yili', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    ownership_type_display = serializers.CharField(source='get_ownership_type_display', read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = StudentResourceAssignment
        fields = [
            'id', 'student', 'student_ad', 'student_soyad', 'student_full_name',
            'coach', 'coach_name',
            'lesson', 'lesson_name',
            'resource_book', 'resource_name', 'resource_type', 'resource_yayin_yili',
            'difficulty_level_snapshot',
            'status', 'status_display',
            'ownership_type', 'ownership_type_display',
            'progress_percent',
            'assigned_at', 'due_date', 'completed_at',
            'notes', 'is_active', 'is_overdue',
            'created_at', 'updated_at'
        ]
    
    def get_student_full_name(self, obj):
        return f"{obj.student.ad} {obj.student.soyad}"
    
    def get_coach_name(self, obj):
        if obj.coach:
            return f"{obj.coach.first_name} {obj.coach.last_name}".strip() or obj.coach.username
        return None


class StudentResourceAssignmentWriteSerializer(serializers.ModelSerializer):
    """Öğrenci Kaynak Ataması Oluşturma/Güncelleme Serializer"""
    
    class Meta:
        model = StudentResourceAssignment
        fields = [
            'id', 'student', 'coach', 'lesson', 'resource_book',
            'status', 'ownership_type', 'progress_percent', 'due_date', 'notes'
        ]
    
    def validate(self, data):
        # Aynı öğrenciye aynı kaynak tekrar atanamaz
        student = data.get('student')
        resource_book = data.get('resource_book')
        
        if self.instance:
            # Update durumunda
            if student and resource_book:
                existing = StudentResourceAssignment.objects.filter(
                    student=student,
                    resource_book=resource_book,
                    is_active=True
                ).exclude(pk=self.instance.pk).exists()
                if existing:
                    raise serializers.ValidationError({
                        'resource_book': 'Bu kaynak zaten bu öğrenciye atanmış.'
                    })
        else:
            # Create durumunda
            if student and resource_book:
                existing = StudentResourceAssignment.objects.filter(
                    student=student,
                    resource_book=resource_book,
                    is_active=True
                ).exists()
                if existing:
                    raise serializers.ValidationError({
                        'resource_book': 'Bu kaynak zaten bu öğrenciye atanmış.'
                    })
        
        # Kaynak aktif mi kontrol
        if resource_book and not resource_book.aktif_mi:
            raise serializers.ValidationError({
                'resource_book': 'Pasif kaynak atanamaz.'
            })
        
        return data

    def create(self, validated_data):
        inactive = StudentResourceAssignment.objects.filter(
            student=validated_data['student'],
            resource_book=validated_data['resource_book'],
            is_active=False,
        ).first()
        if inactive:
            inactive.is_active = True
            inactive.deleted_at = None
            inactive.coach = validated_data.get('coach')
            inactive.lesson = validated_data.get('lesson', inactive.resource_book.ders)
            inactive.ownership_type = validated_data.get(
                'ownership_type',
                StudentResourceAssignment.OwnershipType.TO_PURCHASE,
            )
            inactive.due_date = validated_data.get('due_date')
            inactive.notes = validated_data.get('notes', '')
            inactive.status = StudentResourceAssignment.Status.ASSIGNED
            inactive.progress_percent = validated_data.get('progress_percent', 0)
            inactive.completed_at = None
            inactive.difficulty_level_snapshot = ''
            inactive.save()
            return inactive
        return super().create(validated_data)


class BulkAssignmentSerializer(serializers.Serializer):
    """Toplu Atama Serializer"""
    student_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text='Öğrenci ID listesi'
    )
    resource_book_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text='Kaynak Kitap ID listesi'
    )
    ownership_type = serializers.ChoiceField(
        choices=StudentResourceAssignment.OwnershipType.choices,
        default=StudentResourceAssignment.OwnershipType.TO_PURCHASE,
        required=False
    )
    due_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class BulkUpdateSerializer(serializers.Serializer):
    """Toplu Güncelleme Serializer"""
    assignment_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text='Atama ID listesi'
    )
    status = serializers.ChoiceField(
        choices=StudentResourceAssignment.Status.choices,
        required=False
    )
    coach_id = serializers.IntegerField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class BulkDeleteSerializer(serializers.Serializer):
    """Toplu Silme Serializer"""
    assignment_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text='Atama ID listesi'
    )


# ============ Satın Alma Listesi Serializers ============

class ResourcePurchaseListItemSerializer(serializers.ModelSerializer):
    """Satın Alma Listesi Kalemi Serializer"""
    resource_name = serializers.SerializerMethodField()
    resource_publisher = serializers.SerializerMethodField()
    resource_type = serializers.SerializerMethodField()
    lesson_name = serializers.SerializerMethodField()
    assignment_id = serializers.SerializerMethodField()
    item_status_display = serializers.CharField(source='get_item_status_display', read_only=True)

    class Meta:
        model = ResourcePurchaseListItem
        fields = [
            'id', 'assignment_id', 'quantity', 'source_note',
            'item_status', 'item_status_display',
            'resource_name', 'resource_publisher', 'resource_type', 'lesson_name',
            'book_name_snapshot', 'book_publisher_snapshot', 'lesson_name_snapshot',
            'difficulty_snapshot',
        ]

    def _book(self, obj):
        if obj.assignment_id:
            return obj.assignment.resource_book
        return obj.resource_book

    def get_assignment_id(self, obj):
        return obj.assignment_id

    def get_resource_name(self, obj):
        if obj.book_name_snapshot:
            return obj.book_name_snapshot
        book = self._book(obj)
        return book.ad if book else ''

    def get_resource_publisher(self, obj):
        if obj.book_publisher_snapshot:
            return obj.book_publisher_snapshot
        book = self._book(obj)
        return book.yayinevi if book else ''

    def get_resource_type(self, obj):
        book = self._book(obj)
        return book.book_type.ad if book and book.book_type else ''

    def get_lesson_name(self, obj):
        if obj.lesson_name_snapshot:
            return obj.lesson_name_snapshot
        if obj.lesson_id:
            return obj.lesson.ad
        if obj.assignment_id:
            return obj.assignment.lesson.ad
        book = self._book(obj)
        return book.ders.ad if book and book.ders_id else ''


class ResourcePurchaseListSerializer(serializers.ModelSerializer):
    """Satın Alma Listesi Serializer"""
    student_ad = serializers.CharField(source='student.ad', read_only=True)
    student_soyad = serializers.CharField(source='student.soyad', read_only=True)
    student_full_name = serializers.SerializerMethodField()
    student_tc = serializers.CharField(source='student.tc_kimlik_no', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    list_type_display = serializers.CharField(source='get_list_type_display', read_only=True)
    items = ResourcePurchaseListItemSerializer(many=True, read_only=True)
    total_items = serializers.IntegerField(read_only=True)
    total_books = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = ResourcePurchaseList
        fields = [
            'id', 'student', 'student_ad', 'student_soyad', 'student_full_name', 'student_tc',
            'created_by', 'created_by_name',
            'list_type', 'list_type_display',
            'status', 'status_display',
            'created_at', 'finalized_at', 'delivered_at',
            'title', 'notes', 'stationery_name', 'stationery_address',
            'items', 'total_items', 'total_books'
        ]
    
    def get_student_full_name(self, obj):
        return f"{obj.student.ad} {obj.student.soyad}"
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None


class ResourcePurchaseListCreateSerializer(serializers.Serializer):
    """Satın Alma Listesi Oluşturma Serializer (mevcut atamalardan)"""
    student_id = serializers.IntegerField(help_text='Öğrenci ID')
    ownership_type = serializers.ChoiceField(
        choices=StudentResourceAssignment.OwnershipType.choices,
        default=StudentResourceAssignment.OwnershipType.TO_PURCHASE,
        required=False,
        help_text='Hangi sahiplik türündeki kaynaklar listelenecek'
    )
    assignment_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text='Eklenecek atama ID listesi (boş ise ownership_type filtresiyle otomatik eklenir)'
    )
    title = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    stationery_name = serializers.CharField(required=False, allow_blank=True, default='')
    stationery_address = serializers.CharField(required=False, allow_blank=True, default='')


class ResourcePurchaseListBookItemSerializer(serializers.Serializer):
    resource_book_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, default=1, required=False)
    source_note = serializers.CharField(required=False, allow_blank=True, default='')


class ResourcePurchaseListCreateFromLibrarySerializer(serializers.Serializer):
    """Kaynak kütüphanesinden liste oluşturma"""
    student_id = serializers.IntegerField()
    list_type = serializers.ChoiceField(choices=ResourcePurchaseList.ListType.choices)
    title = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    stationery_name = serializers.CharField(required=False, allow_blank=True, default='')
    stationery_address = serializers.CharField(required=False, allow_blank=True, default='')
    default_source_note = serializers.CharField(
        required=False,
        allow_blank=True,
        default='',
        help_text='Tüm kalemlere uygulanacak varsayılan temin yeri',
    )
    items = ResourcePurchaseListBookItemSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('En az bir kaynak seçin.')
        return value


class ResourcePurchaseListUpdateSerializer(serializers.ModelSerializer):
    """Satın Alma Listesi Güncelleme Serializer"""
    
    class Meta:
        model = ResourcePurchaseList
        fields = ['status', 'notes', 'stationery_name', 'stationery_address']


class PurchaseListItemStatusSerializer(serializers.Serializer):
    item_status = serializers.ChoiceField(
        choices=[
            ResourcePurchaseListItem.ItemStatus.RECEIVED,
            ResourcePurchaseListItem.ItemStatus.NOT_RECEIVED,
            ResourcePurchaseListItem.ItemStatus.CANCELLED,
        ],
    )
