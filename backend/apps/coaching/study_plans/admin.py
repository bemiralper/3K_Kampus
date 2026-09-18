from django.contrib import admin

from .models import (
    StudentStudyWindow,
    StudyDay,
    StudyGenerationRun,
    StudyLeftover,
    StudyProgram,
    StudySlot,
    StudyTemplate,
)


@admin.register(StudyTemplate)
class StudyTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'scenario', 'kurum', 'strategy', 'is_builtin', 'is_active')
    list_filter = ('scenario', 'is_builtin', 'is_active')
    search_fields = ('name',)


class StudyDayInline(admin.TabularInline):
    model = StudyDay
    extra = 0


class StudyLeftoverInline(admin.TabularInline):
    model = StudyLeftover
    extra = 0


@admin.register(StudyProgram)
class StudyProgramAdmin(admin.ModelAdmin):
    list_display = ('id', 'student', 'week_start', 'template', 'status', 'generation_version')
    list_filter = ('status',)
    inlines = [StudyDayInline, StudyLeftoverInline]


@admin.register(StudySlot)
class StudySlotAdmin(admin.ModelAdmin):
    list_display = ('title', 'day', 'planned_tests', 'planned_questions', 'planned_minutes', 'is_done')


@admin.register(StudentStudyWindow)
class StudentStudyWindowAdmin(admin.ModelAdmin):
    list_display = ('student', 'weekday', 'available_minutes', 'is_available')


@admin.register(StudyGenerationRun)
class StudyGenerationRunAdmin(admin.ModelAdmin):
    list_display = ('id', 'program', 'template', 'created_at')
