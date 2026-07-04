"""
Coaching Admin Configuration
"""
from django.contrib import admin
from .models import CoachProfile, CoachStudentAssignment, CoachingEvent


@admin.register(CoachProfile)
class CoachProfileAdmin(admin.ModelAdmin):
    """Koç Profili Admin"""
    
    list_display = [
        'teacher',
        'capacity',
        'current_student_count',
        'available_capacity',
        'is_active',
        'created_at',
    ]
    
    list_filter = [
        'is_active',
        'created_at',
    ]
    
    search_fields = [
        'teacher__ad',
        'teacher__soyad',
        'teacher__tc_kimlik_no',
    ]
    
    readonly_fields = [
        'created_at',
        'updated_at',
        'current_student_count',
        'available_capacity',
    ]
    
    fieldsets = (
        ('Koç Bilgileri', {
            'fields': ('teacher', 'capacity', 'is_active')
        }),
        ('Kapasite Durumu', {
            'fields': ('current_student_count', 'available_capacity'),
            'classes': ('collapse',)
        }),
        ('Sistem Bilgileri', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def current_student_count(self, obj):
        return obj.current_student_count
    current_student_count.short_description = 'Mevcut Öğrenci'
    
    def available_capacity(self, obj):
        return obj.available_capacity
    available_capacity.short_description = 'Boş Kapasite'


@admin.register(CoachStudentAssignment)
class CoachStudentAssignmentAdmin(admin.ModelAdmin):
    """Koç-Öğrenci Ataması Admin"""
    
    list_display = [
        'student',
        'coach',
        'start_date',
        'end_date',
        'is_primary',
        'created_by',
        'created_at',
    ]
    
    list_filter = [
        'is_primary',
        'start_date',
        'end_date',
        'coach',
    ]
    
    search_fields = [
        'student__ad',
        'student__soyad',
        'coach__teacher__ad',
        'coach__teacher__soyad',
    ]
    
    readonly_fields = [
        'created_at',
        'updated_at',
    ]
    
    autocomplete_fields = [
        'student',
        'coach',
    ]
    
    fieldsets = (
        ('Atama Bilgileri', {
            'fields': ('coach', 'student', 'is_primary')
        }),
        ('Tarih Bilgileri', {
            'fields': ('start_date', 'end_date')
        }),
        ('Sistem Bilgileri', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def save_model(self, request, obj, form, change):
        if not change:  # Yeni kayıt
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(CoachingEvent)
class CoachingEventAdmin(admin.ModelAdmin):
    """Koçluk Etkinliği Admin"""
    
    list_display = [
        'title',
        'event_type',
        'student',
        'coach',
        'event_date',
        'status',
        'created_at',
    ]
    
    list_filter = [
        'event_type',
        'status',
        'event_date',
        'coach',
    ]
    
    search_fields = [
        'title',
        'description',
        'student__ad',
        'student__soyad',
        'coach__teacher__ad',
        'coach__teacher__soyad',
    ]
    
    readonly_fields = [
        'created_at',
        'updated_at',
    ]
    
    autocomplete_fields = [
        'student',
        'coach',
    ]
    
    date_hierarchy = 'event_date'
    
    fieldsets = (
        ('Etkinlik Bilgileri', {
            'fields': ('title', 'event_type', 'status', 'event_date')
        }),
        ('İlişkiler', {
            'fields': ('coach', 'student')
        }),
        ('Detaylar', {
            'fields': ('description',),
            'classes': ('wide',)
        }),
        ('Sistem Bilgileri', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    list_per_page = 25
