"""
Çalışma Programı - Admin
"""
from django.contrib import admin
from .models import WeeklyProgram, ProgramDay, ProgramBlock, DailyFeedback, Badge


class ProgramBlockInline(admin.TabularInline):
    model = ProgramBlock
    extra = 0
    fields = ('title', 'lesson', 'block_type', 'question_count', 'priority', 'order', 'is_completed')


class ProgramDayInline(admin.TabularInline):
    model = ProgramDay
    extra = 0
    fields = ('weekday', 'day_date', 'total_question_count', 'total_block_count', 'completion_percent', 'load_level')
    readonly_fields = ('total_question_count', 'total_block_count', 'completion_percent', 'load_level')


@admin.register(WeeklyProgram)
class WeeklyProgramAdmin(admin.ModelAdmin):
    list_display = ('id', 'student', 'coach', 'week_start', 'week_end', 'completion_percent', 'is_template')
    list_filter = ('is_template', 'week_start')
    search_fields = ('student__ad', 'student__soyad', 'template_name')
    inlines = [ProgramDayInline]


@admin.register(ProgramDay)
class ProgramDayAdmin(admin.ModelAdmin):
    list_display = ('id', 'program', 'weekday', 'day_date', 'total_question_count', 'completion_percent', 'load_level')
    list_filter = ('load_level', 'weekday')
    inlines = [ProgramBlockInline]


@admin.register(ProgramBlock)
class ProgramBlockAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'lesson', 'block_type', 'question_count', 'priority', 'is_completed')
    list_filter = ('block_type', 'priority', 'is_completed')
    search_fields = ('title', 'topic_name')


@admin.register(DailyFeedback)
class DailyFeedbackAdmin(admin.ModelAdmin):
    list_display = ('id', 'day', 'struggled', 'time_enough', 'energy_level')
    list_filter = ('energy_level', 'struggled')


@admin.register(Badge)
class BadgeAdmin(admin.ModelAdmin):
    list_display = ('id', 'student', 'code', 'title', 'icon', 'earned_date')
    list_filter = ('code',)
    search_fields = ('student__ad', 'student__soyad')
