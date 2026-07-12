"""Akademik — yalnızca kaynak tanımı."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='academic.schedule',
        name='Akademik Planlama',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Ders saatleri, çalışma takvimi, program ve öğretmen uygunlukları.',
        config={
            'models': [
                'academic.ScheduleTemplate',
                'academic.TimeSlot',
                'academic.WeeklyCycle',
                'academic.WeeklyDay',
                'academic.ScheduleVersion',
                'academic.ProgramGridCell',
                'academic.ClassLessonPlan',
                'academic.LessonTeacherPool',
                'academic.ClassLessonTeacherAssignment',
                'academic.ClassroomGroup',
                'academic.StudentClassPlacement',
                'academic.ScheduleRun',
                'academic.TeacherAvailabilitySet',
                'academic.TeacherAvailabilityCalendar',
                'academic.TeacherAvailabilityCell',
            ],
        },
        is_default=False,
        priority=80,
    ),
]
