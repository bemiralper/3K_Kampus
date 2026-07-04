"""
Academic Serializers
"""

from .schedule_template import (
    ScheduleTemplateListSerializer,
    ScheduleTemplateDetailSerializer,
    ScheduleTemplateCreateSerializer,
    ScheduleTemplateUpdateSerializer,
)
from .timeslot import (
    TimeSlotSerializer,
    TimeSlotCreateSerializer,
    TimeSlotUpdateSerializer,
    TimeSlotBulkCreateSerializer,
)
from .weekly_cycle import (
    WeeklyCycleListSerializer,
    WeeklyCycleDetailSerializer,
    WeeklyCycleCreateSerializer,
    WeeklyCycleUpdateSerializer,
    WeeklyDaySerializer,
    WeeklyDayCreateSerializer,
    WeeklyDayUpdateSerializer,
)
from .program_grid import (
    ProgramGridCellSerializer,
    ProgramGridCellListSerializer,
    GridPreviewSerializer,
    GridGenerateInputSerializer,
)
from .class_lesson_plan import (
    ClassLessonPlanListSerializer,
    ClassLessonPlanCreateSerializer,
    ClassLessonPlanUpdateSerializer,
    ClassLessonPlanDetailSerializer,
)
from .lesson_teacher_pool import (
    LessonTeacherPoolListSerializer,
    LessonTeacherPoolCreateSerializer,
    LessonTeacherPoolUpdateSerializer,
    LessonTeacherPoolDetailSerializer,
)
from .class_lesson_teacher_assignment import (
    ClassLessonTeacherAssignmentListSerializer,
    ClassLessonTeacherAssignmentCreateSerializer,
    ClassLessonTeacherAssignmentUpdateSerializer,
    ClassLessonTeacherAssignmentDetailSerializer,
    TeacherRoleSerializer,
)

__all__ = [
    # Schedule Template
    'ScheduleTemplateListSerializer',
    'ScheduleTemplateDetailSerializer',
    'ScheduleTemplateCreateSerializer',
    'ScheduleTemplateUpdateSerializer',
    # TimeSlot
    'TimeSlotSerializer',
    'TimeSlotCreateSerializer',
    'TimeSlotUpdateSerializer',
    'TimeSlotBulkCreateSerializer',
    # Weekly Cycle
    'WeeklyCycleListSerializer',
    'WeeklyCycleDetailSerializer',
    'WeeklyCycleCreateSerializer',
    'WeeklyCycleUpdateSerializer',
    'WeeklyDaySerializer',
    'WeeklyDayCreateSerializer',
    'WeeklyDayUpdateSerializer',
    # Program Grid
    'ProgramGridCellSerializer',
    'ProgramGridCellListSerializer',
    'GridPreviewSerializer',
    'GridGenerateInputSerializer',
    # Class Lesson Plan
    'ClassLessonPlanListSerializer',
    'ClassLessonPlanCreateSerializer',
    'ClassLessonPlanUpdateSerializer',
    'ClassLessonPlanDetailSerializer',
    # Lesson Teacher Pool
    'LessonTeacherPoolListSerializer',
    'LessonTeacherPoolCreateSerializer',
    'LessonTeacherPoolUpdateSerializer',
    'LessonTeacherPoolDetailSerializer',
    # Class Lesson Teacher Assignment
    'ClassLessonTeacherAssignmentListSerializer',
    'ClassLessonTeacherAssignmentCreateSerializer',
    'ClassLessonTeacherAssignmentUpdateSerializer',
    'ClassLessonTeacherAssignmentDetailSerializer',
    'TeacherRoleSerializer',
]
