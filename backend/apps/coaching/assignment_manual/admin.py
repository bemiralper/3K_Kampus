"""
Manuel Ödev Atama - Admin
"""
from django.contrib import admin
from .models import (
    ManualAssignment,
    AssignmentLesson,
    AssignmentTask,
    AssignmentPackage,
    AssignmentPackageItem,
)


class AssignmentTaskInline(admin.TabularInline):
    model = AssignmentTask
    extra = 1
    fields = ['task_type', 'title', 'is_required', 'estimated_duration_minutes', 'order', 'status']


class AssignmentLessonInline(admin.TabularInline):
    model = AssignmentLesson
    extra = 1
    fields = ['lesson', 'resource_book', 'content_mode', 'topic_name', 'order']


@admin.register(ManualAssignment)
class ManualAssignmentAdmin(admin.ModelAdmin):
    list_display = ['title', 'student', 'coach', 'status', 'risk_status', 'priority', 'due_date', 'created_at']
    list_filter = ['status', 'risk_status', 'priority', 'assigned_date', 'due_date']
    search_fields = ['title', 'student__ad', 'student__soyad', 'coach__username']
    readonly_fields = ['created_at', 'updated_at', 'assigned_date', 'completed_date']
    
    fieldsets = [
        ('Temel Bilgiler', {
            'fields': ['coach', 'student', 'title', 'description']
        }),
        ('Durum', {
            'fields': ['status', 'risk_status', 'priority']
        }),
        ('Tarihler', {
            'fields': ['assigned_date', 'due_date', 'reminder_date', 'completed_date', 'created_at', 'updated_at']
        }),
        ('Performans Beklentileri', {
            'fields': [
                'expected_accuracy_percent',
                'minimum_completion_percent',
                'estimated_duration_minutes',
                'difficulty_level'
            ]
        }),
        ('Gerçek Performans', {
            'fields': [
                'actual_accuracy_percent',
                'completion_percent',
                'actual_duration_minutes'
            ]
        }),
        ('Notlar', {
            'fields': ['coach_notes', 'student_notes']
        }),
        ('Gelişmiş', {
            'fields': ['template', 'is_active'],
            'classes': ['collapse']
        })
    ]
    
    inlines = [AssignmentLessonInline]


@admin.register(AssignmentLesson)
class AssignmentLessonAdmin(admin.ModelAdmin):
    list_display = ['assignment', 'lesson', 'content_mode', 'order', 'created_at']
    list_filter = ['content_mode', 'lesson']
    search_fields = ['assignment__title', 'lesson__ad']
    
    inlines = [AssignmentTaskInline]


@admin.register(AssignmentTask)
class AssignmentTaskAdmin(admin.ModelAdmin):
    list_display = ['lesson_block', 'task_type', 'title', 'is_required', 'status', 'created_at']
    list_filter = ['task_type', 'status', 'is_required']
    search_fields = ['title', 'description']


class AssignmentPackageItemInline(admin.TabularInline):
    model = AssignmentPackageItem
    extra = 0
    fields = [
        'book_name', 'content_name', 'content_type',
        'topic_name', 'unit_name', 'question_count', 'order',
    ]


@admin.register(AssignmentPackage)
class AssignmentPackageAdmin(admin.ModelAdmin):
    list_display = ['name', 'ders_ad', 'sinif_seviyesi', 'usage_count', 'created_by', 'is_active', 'updated_at']
    list_filter = ['is_active', 'ders_ad']
    search_fields = ['name', 'description', 'ders_ad']
    readonly_fields = ['created_at', 'updated_at', 'usage_count']
    inlines = [AssignmentPackageItemInline]
