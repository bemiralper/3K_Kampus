from django.contrib import admin
from .models import StudentResourceAssignment


@admin.register(StudentResourceAssignment)
class StudentResourceAssignmentAdmin(admin.ModelAdmin):
    list_display = ['student', 'resource_book', 'lesson', 'coach', 'status', 'progress_percent', 'assigned_at', 'due_date']
    list_filter = ['status', 'lesson', 'is_active']
    search_fields = ['student__ad', 'student__soyad', 'resource_book__ad']
    raw_id_fields = ['student', 'coach', 'lesson', 'resource_book']
    date_hierarchy = 'assigned_at'
